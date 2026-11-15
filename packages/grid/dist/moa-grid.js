/*! Moa JS Grid v0.2.0 | MIT License | See LICENSE */
(function () {
'use strict';
function parseTSV(text) {
  const rows = [[]];
  let value = '', quoted = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted) quoted = false;
      else if (value === '') quoted = true;
      else value += char;
    } else if (!quoted && (char === '\t' || char === '\n' || char === '\r')) {
      rows[rows.length - 1].push(value.replace(/\r\n?/g, '\n')); value = '';
      if (char !== '\t') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        rows.push([]);
      }
    } else value += char;
  }
  if (quoted) throw new Error('닫히지 않은 따옴표가 있습니다.');
  rows[rows.length - 1].push(value.replace(/\r\n?/g, '\n'));
  if (rows.length > 1 && /(?:\r\n|\r|\n)$/.test(text)) rows.pop();
  return rows;
}

function toTSV(rows) {
  return rows.map(row => row.map(value => {
    const text = value == null ? '' : String(value);
    return /[\t\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join('\t')).join('\r\n');
}

class GridModel {
  constructor(columns, rows = [], { editable = true, historyLimit = 100 } = {}) {
    if (!Array.isArray(columns) || !columns.length) throw new Error('컬럼이 필요합니다.');
    const keys = columns.map(column => column.field);
    if (keys.some(key => typeof key !== 'string' || !key || ['__proto__', 'constructor', 'prototype'].includes(key)) || new Set(keys).size !== keys.length) {
      throw new Error('컬럼 field는 중복되지 않는 안전한 문자열이어야 합니다.');
    }
    if (!Number.isInteger(historyLimit) || historyLimit < 1) throw new Error('historyLimit은 양의 정수여야 합니다.');
    this.columns = columns.map(column => ({ ...column }));
    this.editable = editable;
    this.historyLimit = historyLimit;
    this.setData(rows);
  }

  setData(rows) {
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('data는 행 객체 배열이어야 합니다.');
    this.validateRows?.(rows);
    this.rows = rows.map(row => ({ ...row }));
    this.past = []; this.future = [];
  }

  getData() { return this.rows.map(row => ({ ...row })); }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  convert(column, value) {
    if (value === '' || value == null) {
      if (column.required) throw new Error(`${column.header || column.field}: 필수 값입니다.`);
      return column.type === 'number' || column.type === 'boolean' ? null : '';
    }
    if (column.type === 'number') {
      let numeric = String(value).trim().replace(/\u2212/g, '-');
      if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numeric)) numeric = numeric.replace(/,/g, '');
      if (typeof value === 'boolean' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(numeric) || !Number.isFinite(Number(numeric))) throw new Error(`${column.header || column.field}: 숫자를 입력하세요.`);
      value = Number(numeric);
    } else if (column.type === 'boolean') {
      if (typeof value === 'string') value = value.trim().toLowerCase();
      if ([true, 'true', '1', 1].includes(value)) value = true;
      else if ([false, 'false', '0', 0].includes(value)) value = false;
      else throw new Error(`${column.header || column.field}: true 또는 false를 입력하세요.`);
    } else value = String(value);
    const error = column.validate?.(value);
    if (error) throw new Error(typeof error === 'string' ? error : `${column.header || column.field}: 유효하지 않은 값입니다.`);
    return value;
  }

  apply(changes, reason = 'edit') {
    if (!this.editable) return [];
    const transaction = [], seen = new Set();
    for (const { row, field, value } of changes) {
      const column = this.columns.find(item => item.field === field);
      if (!column || !Number.isInteger(row) || row < 0 || row >= this.rows.length) throw new Error('변경할 셀의 위치가 올바르지 않습니다.');
      if (column.editable === false) continue;
      const key = `${row}:${field}`;
      if (seen.has(key)) throw new Error('같은 셀을 한 작업에서 중복 변경할 수 없습니다.');
      seen.add(key);
      const next = this.convert(column, value), previous = this.rows[row][field];
      if (!Object.is(previous, next)) transaction.push({ row, field, previous, value: next });
    }
    // Validate the entire transaction before changing any cell.
    if (!transaction.length) return [];
    if (this.validateRows) {
      const candidate = this.getData();
      for (const change of transaction) candidate[change.row][change.field] = change.value;
      this.validateRows(candidate);
    }
    for (const change of transaction) this.rows[change.row][change.field] = change.value;
    this.remember({ changes: transaction, reason });
    return transaction.map(change => ({ ...change }));
  }

  remember(entry) {
    this.past.push(entry);
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
  }

  replaceRows(rows, reason = 'replace', validate = true) {
    if (!this.editable) return [];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('data는 행 객체 배열이어야 합니다.');
    const next = rows.map(row => ({ ...row }));
    if (validate) for (const row of next) for (const column of this.columns) row[column.field] = this.convert(column, row[column.field]);
    this.validateRows?.(next);
    const before = this.getData();
    if (JSON.stringify(before) === JSON.stringify(next)) return [];
    this.rows = next;
    this.remember({ reason, before, after: this.getData() });
    return [{ kind: 'rows', row: -1, field: null, previous: before.map(row => ({ ...row })), value: this.getData() }];
  }

  insertRows(index, rows) {
    if (!Number.isInteger(index) || index < 0 || index > this.rows.length) throw new Error('행 삽입 위치가 올바르지 않습니다.');
    const next = this.getData(); next.splice(index, 0, ...rows);
    return this.replaceRows(next, 'insert', false);
  }

  removeRows(indices) {
    if (indices.some(index => !Number.isInteger(index) || index < 0 || index >= this.rows.length)) throw new Error('행 삭제 위치가 올바르지 않습니다.');
    const removed = new Set(indices);
    return this.replaceRows(this.rows.filter((_, index) => !removed.has(index)), 'delete', false);
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return [];
    if (entry.before) {
      this.rows = entry.before.map(row => ({ ...row })); this.future.push(entry);
      return [{ kind: 'rows', row: -1, field: null, previous: entry.after.map(row => ({ ...row })), value: this.getData() }];
    }
    for (const change of entry.changes) this.rows[change.row][change.field] = change.previous;
    this.future.push(entry);
    return entry.changes.map(change => ({ ...change, value: change.previous, previous: change.value }));
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return [];
    if (entry.after) {
      this.rows = entry.after.map(row => ({ ...row })); this.past.push(entry);
      return [{ kind: 'rows', row: -1, field: null, previous: entry.before.map(row => ({ ...row })), value: this.getData() }];
    }
    for (const change of entry.changes) this.rows[change.row][change.field] = change.value;
    this.past.push(entry);
    return entry.changes.map(change => ({ ...change }));
  }
}

const FILTER_OPERATORS = ['contains', 'startsWith', 'equals', 'notEquals', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'];

function compareCellValues(a, b, direction = 1) {
  const emptyA = a == null || a === '', emptyB = b == null || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  return direction * (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ko', { numeric: true }));
}

function matchesFilters(row, filters, logic = 'and') {
  if (!filters.length) return true;
  return filters[logic === 'or' ? 'some' : 'every'](({ field, operator, value, value2 }) => {
    const current = row[field], text = String(current ?? '').toLocaleLowerCase(), input = String(value ?? '').toLocaleLowerCase();
    if (operator === 'empty') return current == null || current === '';
    if (operator === 'notEmpty') return current != null && current !== '';
    if (operator === 'contains') return text.includes(input);
    if (operator === 'startsWith') return text.startsWith(input);
    if (current == null || current === '') return operator === 'notEquals';
    const a = typeof current === 'number' ? current : text;
    const b = typeof current === 'number' ? Number(value) : input;
    if (operator === 'equals') return a === b;
    if (operator === 'notEquals') return a !== b;
    if (operator === 'gt') return a > b;
    if (operator === 'gte') return a >= b;
    if (operator === 'lt') return a < b;
    if (operator === 'lte') return a <= b;
    if (operator === 'between') return a >= b && a <= (typeof current === 'number' ? Number(value2) : String(value2).toLocaleLowerCase());
    return false;
  });
}

function treeIndex(rows, tree) {
  const byId = new Map(), children = new Map();
  rows.forEach((row, index) => {
    const value = row[tree.idField];
    if (value == null || value === '') throw new Error('트리의 노드 ID가 비어 있습니다.');
    const id = String(value);
    if (byId.has(id)) throw new Error(`중복 트리 ID: ${id}`);
    byId.set(id, { row, index, id });
  });
  for (const item of byId.values()) {
    const raw = item.row[tree.parentField], parent = raw == null || raw === '' ? null : String(raw);
    if (parent != null && !byId.has(parent)) throw new Error(`상위 노드를 찾을 수 없습니다: ${parent}`);
    item.parent = parent;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(item);
  }
  const completed = new Set();
  for (const item of byId.values()) {
    const path = new Set(); let cursor = item;
    while (cursor && !completed.has(cursor.id)) {
      if (path.has(cursor.id)) throw new Error('트리 부모 관계에 순환이 있습니다.');
      path.add(cursor.id); cursor = cursor.parent == null ? null : byId.get(cursor.parent);
    }
    for (const id of path) completed.add(id);
  }
  return { byId, children };
}

function buildDisplay(rows, { columns, query = '', filters = [], filterLogic = 'and', sorts = [], groupBy = [], collapsedGroups = new Set(), tree = null, collapsedNodes = new Set() }) {
  const text = query.trim().toLocaleLowerCase();
  const matches = row => matchesFilters(row, filters, filterLogic) && (!text || columns.some(column => String(row[column.field] ?? '').toLocaleLowerCase().includes(text)));
  const compare = (a, b) => {
    for (const sort of sorts) { const result = compareCellValues(a.row[sort.field], b.row[sort.field], sort.direction); if (result) return result; }
    return a.index - b.index;
  };
  const display = [], view = [];
  const addData = item => { view.push(item); display.push({ type: 'data', item, viewIndex: view.length - 1 }); };
  if (tree) {
    const { byId, children } = treeIndex(rows, tree), allowed = new Set();
    if (text || filters.length) {
      for (const item of byId.values()) if (matches(item.row)) {
        let cursor = item;
        while (cursor && !allowed.has(cursor.id)) { allowed.add(cursor.id); cursor = cursor.parent == null ? null : byId.get(cursor.parent); }
      }
    } else for (const id of byId.keys()) allowed.add(id);
    const stack = [...(children.get(null) || [])].sort(compare).reverse().map(item => ({ ...item, depth: 0 }));
    while (stack.length) {
      const item = stack.pop(); if (!allowed.has(item.id)) continue;
      const descendants = (children.get(item.id) || []).filter(child => allowed.has(child.id));
      const expanded = !collapsedNodes.has(item.id) || Boolean(text || filters.length);
      addData({ ...item, hasChildren: descendants.length > 0, expanded });
      if (expanded) for (const child of [...descendants].sort(compare).reverse()) stack.push({ ...child, depth: item.depth + 1 });
    }
  } else {
    const items = rows.map((row, index) => ({ row, index })).filter(item => matches(item.row)).sort(compare);
    const group = (members, depth, path) => {
      if (depth === groupBy.length) { members.forEach(addData); return; }
      const field = groupBy[depth], buckets = new Map();
      for (const item of members) {
        const value = item.row[field] ?? '', key = JSON.stringify([typeof value, value]);
        if (!buckets.has(key)) buckets.set(key, { value, items: [] }); buckets.get(key).items.push(item);
      }
      for (const bucket of buckets.values()) {
        const key = JSON.stringify([...path, [field, bucket.value]]), expanded = !collapsedGroups.has(key);
        const summary = Object.fromEntries(columns.filter(column => column.type === 'number').map(column => [column.field, bucket.items.reduce((sum, item) => sum + (typeof item.row[column.field] === 'number' ? item.row[column.field] : 0), 0)]));
        const descriptor = { key, field, value: bucket.value, count: bucket.items.length, depth, expanded, summary };
        display.push({ type: 'group', group: descriptor });
        if (expanded) { group(bucket.items, depth + 1, [...path, [field, bucket.value]]); display.push({ type: 'summary', group: descriptor }); }
      }
    };
    group(items, 0, []);
  }
  return { display, view };
}


function parseClipboardData(plain, html, numericColumns = new Set()) {
  const rich = parseClipboardHTML(html, numericColumns);
  const matrix = plain !== '' ? parseTSV(plain) : null;
  if (!rich) return matrix || [['']];
  if (!matrix || matrix.length !== rich.length || Math.max(...matrix.map(row => row.length)) !== rich[0].length) return rich;
  // Excel plain text preserves literal tabs/spaces better; rich numeric cells can carry raw precision.
  return matrix.map((row, y) => rich[y].map((value, x) => numericColumns.has(x) ? value : row[x] ?? ''));
}

function parseClipboardHTML(html, numericColumns = new Set()) {
  if (!html || !/<table[\s>]/i.test(html)) return null;
  // Read in an inert template: never attach pasted HTML or load its resources.
  const template = document.createElement('template'); template.innerHTML = html;
  const table = template.content.querySelector('table'); if (!table) return null;
  const output = [];
  const text = element => {
    if (element.nodeType === 3) return element.nodeValue;
    if (element.nodeType !== 1 || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) return '';
    if (element.tagName === 'BR') return '\n';
    return [...element.childNodes].map(text).join('');
  };
  for (const [y, row] of [...table.rows].entries()) {
    if (!output[y]) output[y] = [];
    let x = 0;
    for (const cell of row.cells) {
      while (output[y][x] !== undefined) x++;
      const height = Math.max(1, cell.rowSpan), width = Math.max(1, cell.colSpan);
      if ((y + height) * (x + width) > 100000 || height > 10000 || width > 1000) throw new Error('복사된 표가 너무 큽니다. 영역을 나누어 붙여넣으세요.');
      const rawNumber = cell.getAttribute('x:num');
      const displayed = text(cell).replace(/\r\n/g, '\n');
      const value = numericColumns.has(x) && rawNumber != null && rawNumber !== '' ? rawNumber : displayed === '\u00a0' ? '' : displayed;
      for (let dy = 0; dy < height; dy++) {
        if (!output[y + dy]) output[y + dy] = [];
        for (let dx = 0; dx < width; dx++) output[y + dy][x + dx] = dy === 0 && dx === 0 ? value : '';
      }
      x += width;
    }
  }
  const width = Math.max(0, ...output.map(row => row.length));
  return width ? output.map(row => Array.from({ length: width }, (_, col) => row[col] ?? '')) : null;
}

function readXLSX(bytes, library, columns, { sheetName, header = true } = {}) {
  if (!library?.read) throw new Error('XLSX 모듈이 준비되지 않았습니다.');
  const signature = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) throw new Error('올바른 XLSX 파일이 아닙니다.');
  const book = library.read(bytes, { type: 'array', cellDates: true });
  const name = sheetName || book.SheetNames[0], sheet = book.Sheets[name];
  if (!sheet) throw new Error('가져올 시트를 찾을 수 없습니다.');
  if (!sheet['!ref']) return [];
  const bounds = library.utils.decode_range(sheet['!ref']);
  if ((bounds.e.r + 1) * (bounds.e.c + 1) > 1000000) throw new Error('시트가 너무 큽니다. 필요한 영역만 별도 파일로 저장하세요.');
  const display = cell => cell ? cell.w ?? library.utils.format_cell(cell) : '';
  const mappings = columns.map((column, index) => {
    if (!header) return bounds.s.c + index;
    const matches = [];
    for (let col = bounds.s.c; col <= bounds.e.c; col++) {
      const label = display(sheet[library.utils.encode_cell({ r: bounds.s.r, c: col })]).trim();
      if (label === column.field || label === (column.header || column.field)) matches.push(col);
    }
    if (matches.length > 1) throw new Error(`중복 시트 헤더: ${column.header || column.field}`);
    return matches[0] ?? -1;
  });
  if (new Set(mappings.filter(index => index >= 0)).size !== mappings.filter(index => index >= 0).length) throw new Error('서로 다른 컬럼이 같은 시트 헤더에 연결됩니다.');
  if (header && mappings.every(index => index === -1)) throw new Error('시트의 첫 행에 일치하는 컬럼명이 없습니다.');
  const rows = [];
  for (let row = bounds.s.r + (header ? 1 : 0); row <= bounds.e.r; row++) {
    const item = {}; let populated = false;
    columns.forEach((column, index) => {
      const cell = mappings[index] < 0 ? null : sheet[library.utils.encode_cell({ r: row, c: mappings[index] })];
      if (cell?.t === 'e') throw new Error(`${row + 1}행 ${column.header || column.field}: Excel 오류 셀입니다.`);
      if (cell?.f && cell.v == null) throw new Error(`${row + 1}행 ${column.header || column.field}: 수식 계산 결과가 없습니다. Excel에서 계산·저장 후 가져오세요.`);
      if (cell && cell.v != null && cell.v !== '') populated = true;
      let value = cell ? (column.type === 'number' || column.type === 'boolean' ? cell.v : display(cell)) : '';
      if (value instanceof Date) value = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      item[column.field] = value;
    });
    if (populated) rows.push(item);
  }
  return rows;
}

function writeXLSX(rows, library, columns, { sheetName = '데이터', merges = [] } = {}) {
  if (!library?.write) throw new Error('XLSX 모듈이 준비되지 않았습니다.');
  const values = [columns.map(column => column.header || column.field), ...rows.map(row => columns.map(column => row[column.field] ?? ''))];
  const sheet = library.utils.aoa_to_sheet(values);
  sheet['!cols'] = columns.map(column => ({ wch: Math.max(10, Math.round((column.width || 140) / 8)) }));
  sheet['!merges'] = merges.map(merge => ({ s: { r: merge.row + 1, c: merge.col }, e: { r: merge.row + merge.rowSpan, c: merge.col + merge.colSpan - 1 } }));
  const book = library.utils.book_new(); library.utils.book_append_sheet(book, sheet, sheetName);
  return library.write(book, { type: 'array', bookType: 'xlsx', compression: true });
}


let gridSequence = 0;

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text != null) result.textContent = text;
  if (className) result.className = className;
  return result;
}

class Grid {
  constructor(target, options) {
    this.host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.host || this.host.childNodes.length) throw new Error('비어 있는 그리드 컨테이너가 필요합니다.');
    this.options = options;
    this.model = new GridModel(options.columns, options.data || [], options);
    this.columns = this.model.columns;
    this.anchor = { row: 0, col: 0 }; this.current = { ...this.anchor };
    this.query = ''; this.sorts = []; this.filters = []; this.filterLogic = 'and'; this.groupBy = []; this.tree = null;
    this.collapsedGroups = new Set(); this.collapsedNodes = new Set(); this.merges = []; this.mergeOwners = new Map();
    this.frozenColumns = 0; this.xlsx = options.xlsx || globalThis.XLSX;
    this.dataRevision = 0; this.importSequence = 0;
    this.editor = null; this.destroyed = false;
    this.events = new AbortController();
    const signal = this.events.signal;
    this.root = node('div', null, 'moa-grid');
    this.toolbar = node('div', null, 'moa-grid__toolbar');
    const searchLabel = node('label', '검색 ', 'moa-grid__search');
    this.search = node('input'); this.search.type = 'search'; this.search.placeholder = '전체 데이터 검색';
    this.search.addEventListener('input', () => { this.query = this.search.value; this.merges = []; this.resetSelection(); this.render(); }, { signal });
    searchLabel.append(this.search);
    const button = (text, action) => {
      const control = node('button', text); control.type = 'button';
      control.addEventListener('click', action, { signal }); this.toolbar.append(control); return control;
    };
    this.toolbar.append(searchLabel);
    this.undoButton = button('되돌리기', () => this.undo());
    this.redoButton = button('다시 실행', () => this.redo());
    button('선택 지우기', () => this.clearSelection());
    this.addButton = button('행 추가', () => this.addRow());
    this.removeButton = button('선택 행 삭제', () => this.deleteSelectedRows());
    this.filterButton = button('필터', () => { this.filterPanel.hidden = !this.filterPanel.hidden; this.filterButton.setAttribute('aria-expanded', String(!this.filterPanel.hidden)); });
    this.filterButton.setAttribute('aria-expanded', 'false');
    button('셀 병합', () => this.mergeSelection()); button('병합 해제', () => this.unmergeSelection());
    button('CSV 내보내기', () => this.downloadCSV());
    this.fileInput = node('input'); this.fileInput.type = 'file'; this.fileInput.accept = '.xlsx'; this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', async () => { const file = this.fileInput.files[0]; if (file) await this.importXLSX(file); this.fileInput.value = ''; }, { signal });
    this.importButton = button('XLSX 가져오기', () => this.fileInput.click());
    this.exportButton = button('XLSX 내보내기', () => this.exportXLSX());
    this.importButton.disabled = !this.xlsx || !this.model.editable; this.exportButton.disabled = !this.xlsx;
    const frozenLabel = node('label', '고정 열 ', 'moa-grid__option'); this.frozenSelect = node('select');
    this.frozenSelect.setAttribute('aria-label', '고정 열');
    for (let count = 0; count <= this.columns.length; count++) { const option = node('option', count ? `${count}열` : '없음'); option.value = count; this.frozenSelect.append(option); }
    this.frozenSelect.addEventListener('change', () => this.setFrozenColumns(Number(this.frozenSelect.value)), { signal }); frozenLabel.append(this.frozenSelect); this.toolbar.append(frozenLabel);
    const groupLabel = node('label', '그룹 ', 'moa-grid__option'); this.groupSelect = node('select');
    this.groupSelect.setAttribute('aria-label', '그룹');
    const noGroup = node('option', '없음'); noGroup.value = ''; this.groupSelect.append(noGroup);
    for (const column of this.columns) { const option = node('option', column.header || column.field); option.value = column.field; this.groupSelect.append(option); }
    this.groupSelect.addEventListener('change', () => this.setGroupBy(this.groupSelect.value ? [this.groupSelect.value] : []), { signal }); groupLabel.append(this.groupSelect); this.toolbar.append(groupLabel);
    this.coordinate = node('span', '', 'moa-grid__coordinate'); this.toolbar.append(this.coordinate);
    this.filterPanel = this.createFilterPanel();
    this.viewport = node('div', null, 'moa-grid__viewport');
    this.table = node('table'); this.table.setAttribute('role', 'grid'); this.table.setAttribute('aria-label', options.label || '데이터 편집 그리드');
    this.table.setAttribute('aria-multiselectable', 'true');
    this.viewport.append(this.table);
    this.status = node('div', '', 'moa-grid__status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    this.status.id = `moa-grid-status-${++gridSequence}`;
    this.root.append(this.toolbar, this.filterPanel, this.viewport, this.status, this.fileInput); this.host.append(this.root);
    this.table.addEventListener('keydown', event => this.onKey(event), { signal });
    this.table.addEventListener('dblclick', event => { const cell = this.cellAt(event.target); if (cell) this.startEdit(cell); }, { signal });
    this.table.addEventListener('compositionstart', event => {
      if (!this.editor) { const cell = this.cellAt(event.target); if (cell) this.startEdit(cell); }
    }, { signal });
    this.table.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.editor?.input.contains(event.target)) return;
      const cell = this.cellAt(event.target); if (!cell) return;
      if (this.editor && !this.finishEdit()) return;
      this.dragging = true; this.select(cell, event.shiftKey); event.preventDefault();
    }, { signal });
    this.table.addEventListener('pointerover', event => {
      if (!this.dragging || !(event.buttons & 1)) return;
      const cell = this.cellAt(event.target); if (cell) this.select(cell, true);
    }, { signal });
    document.addEventListener('pointerup', () => { this.dragging = false; }, { signal });
    document.addEventListener('pointermove', event => {
      if (!this.resizing) return;
      this.setColumnWidth(this.resizing.field, this.resizing.width + event.clientX - this.resizing.x);
    }, { signal });
    document.addEventListener('pointerup', () => { this.resizing = null; }, { signal });
    this.resizeObserver = new ResizeObserver(() => this.updateColumnGeometry()); this.resizeObserver.observe(this.viewport);
    this.table.addEventListener('copy', event => {
      if (this.editor || !event.clipboardData || !this.view.length) return;
      event.clipboardData.setData('text/plain', this.copySelection()); event.preventDefault();
      this.message('선택 영역을 복사했습니다. 엑셀에 붙여넣을 수 있습니다.');
    }, { signal });
    this.table.addEventListener('paste', event => {
      if (this.editor || !event.clipboardData) return;
      const plain = event.clipboardData.getData('text/plain'), html = event.clipboardData.getData('text/html');
      if (![...event.clipboardData.types].includes('text/plain') && !/<table[\s>]/i.test(html)) return;
      event.preventDefault();
      try {
        const left = this.getSelection().left;
        const numeric = new Set(this.columns.slice(left).map((column, index) => column.type === 'number' ? index : -1));
        const matrix = parseClipboardData(plain, html, numeric);
        this.paste(matrix);
      } catch (error) { this.message(error.message, true); }
    }, { signal });
    try {
      this.render();
      if (options.frozenColumns) this.setFrozenColumns(options.frozenColumns);
      if (options.tree) this.setTree(options.tree);
      if (options.groupBy) this.setGroupBy(options.groupBy);
    } catch (error) { this.destroy(); throw error; }
  }

  cellAt(target) {
    const cell = target.closest?.('td[data-row]');
    return cell && this.table.contains(cell) ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } : null;
  }

  resetSelection() { this.anchor = { row: 0, col: 0 }; this.current = { ...this.anchor }; }
  getSelection() {
    const range = { top: Math.min(this.anchor.row, this.current.row), bottom: Math.max(this.anchor.row, this.current.row), left: Math.min(this.anchor.col, this.current.col), right: Math.max(this.anchor.col, this.current.col) };
    let expanded;
    do {
      expanded = false;
      for (const merge of this.merges) if (this.intersects(range, merge)) {
        const bounds = [Math.min(range.top, merge.row), Math.max(range.bottom, merge.row + merge.rowSpan - 1), Math.min(range.left, merge.col), Math.max(range.right, merge.col + merge.colSpan - 1)];
        if (bounds.join() !== [range.top, range.bottom, range.left, range.right].join()) expanded = true;
        [range.top, range.bottom, range.left, range.right] = bounds;
      }
    } while (expanded);
    return range;
  }

  intersects(range, merge) { return range.top < merge.row + merge.rowSpan && range.bottom >= merge.row && range.left < merge.col + merge.colSpan && range.right >= merge.col; }
  cellElement(point) { const owner = this.mergeOwners.get(`${point.row}:${point.col}`) || point; return this.table.querySelector(`td[data-row="${owner.row}"][data-col="${owner.col}"]`); }

  select(cell, extend = false, focus = true) {
    if (!this.view.length) return;
    this.current = { row: Math.max(0, Math.min(this.view.length - 1, cell.row)), col: Math.max(0, Math.min(this.columns.length - 1, cell.col)) };
    if (!extend) this.anchor = { ...this.current };
    this.paintSelection();
    if (focus) this.focusCell();
    this.options.onSelectionChange?.(this.getSelection());
  }

  focusCell() {
    const cell = this.cellElement(this.current);
    if (!cell) { this.table.focus({ preventScroll: true }); return; }
    cell.focus({ preventScroll: true });
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (cell && this.current.col >= this.frozenColumns) {
      const box = this.viewport.getBoundingClientRect(), rect = cell.getBoundingClientRect();
      const headers = [...this.table.querySelectorAll('thead tr:first-child > th')];
      const fixed = headers.slice(0, this.frozenColumns + 1).reduce((sum, header) => sum + header.getBoundingClientRect().width, 0);
      const left = Math.min(box.right - 24, box.left + fixed);
      if (rect.left < left) this.viewport.scrollLeft -= left - rect.left;
      else if (rect.right > box.right) this.viewport.scrollLeft += rect.right - box.right;
    }
  }

  paintSelection() {
    const range = this.getSelection();
    for (const cell of this.table.querySelectorAll('td[data-row]')) {
      const row = Number(cell.dataset.row), col = Number(cell.dataset.col);
      const selected = row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
      const owner = this.mergeOwners.get(`${this.current.row}:${this.current.col}`) || this.current;
      const active = row === owner.row && col === owner.col;
      cell.classList.toggle('is-selected', selected); cell.classList.toggle('is-active', active);
      cell.setAttribute('aria-selected', String(selected)); cell.tabIndex = active ? 0 : -1;
    }
    this.coordinate.textContent = this.view.length ? `${this.current.row + 1}행 ${this.current.col + 1}열 · ${(range.bottom - range.top + 1) * (range.right - range.left + 1)}셀 선택` : '선택 없음';
  }

  render() {
    const result = buildDisplay(this.model.rows, this); this.view = result.view; this.display = result.display;
    this.mergeOwners = new Map();
    for (const merge of this.merges) for (let row = merge.row; row < merge.row + merge.rowSpan; row++) for (let col = merge.col; col < merge.col + merge.colSpan; col++) this.mergeOwners.set(`${row}:${col}`, merge);
    this.table.replaceChildren();
    const colgroup = node('colgroup'); colgroup.append(node('col'));
    for (const column of this.columns) { const col = node('col'); col.dataset.field = column.field; colgroup.append(col); }
    this.table.append(colgroup);
    this.table.setAttribute('aria-rowcount', String(this.view.length + 1)); this.table.setAttribute('aria-colcount', String(this.columns.length + 1));
    const head = node('thead'), heading = node('tr'), corner = node('th', '#'); corner.scope = 'col'; heading.append(corner);
    this.columns.forEach((column, col) => {
      const th = node('th'); th.scope = 'col';
      th.dataset.col = col;
      const sortIndex = this.sorts.findIndex(sort => sort.field === column.field), sorted = this.sorts[sortIndex];
      th.setAttribute('aria-sort', sorted ? sortIndex ? 'other' : sorted.direction === 1 ? 'ascending' : 'descending' : 'none');
      const control = node('button', `${column.header || column.field}${column.editable === false ? ' (읽기 전용)' : ''}${sorted ? `${sorted.direction === 1 ? ' ↑' : ' ↓'}${this.sorts.length > 1 ? ' ' + (sortIndex + 1) : ''}` : ''}`);
      control.title = `${column.header || column.field} · Shift+클릭으로 다중 정렬`;
      control.type = 'button'; control.addEventListener('click', event => {
        if (this.editor && !this.finishEdit()) return;
        let sorts = event.shiftKey ? this.sorts.filter(sort => sort.field !== column.field) : [];
        if (!sorted || sorted.direction === 1) sorts.push({ field: column.field, direction: sorted ? -1 : 1 });
        if (event.shiftKey && sorted && sorted.direction === 1) { sorts = [...this.sorts]; sorts[sortIndex] = { field: column.field, direction: -1 }; }
        this.setSorts(sorts);
      });
      const resize = node('span', null, 'moa-grid__resize'); resize.tabIndex = 0; resize.setAttribute('role', 'separator'); resize.setAttribute('aria-orientation', 'vertical'); resize.setAttribute('aria-label', `${column.header || column.field} 너비`); resize.setAttribute('aria-valuemin', '64'); resize.setAttribute('aria-valuemax', '1000');
      resize.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); this.resizing = { field: column.field, x: event.clientX, width: th.getBoundingClientRect().width }; });
      resize.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); this.setColumnWidth(column.field, (column.width || 140) + (event.key === 'ArrowRight' ? 10 : -10)); } });
      th.append(control, resize); heading.append(th);
    });
    head.append(heading); this.table.append(head);
    const body = node('tbody');
    for (const descriptor of this.display) {
      if (descriptor.type !== 'data') { body.append(this.renderGroup(descriptor)); continue; }
      const { item: { row, ...item }, viewIndex: rowIndex } = descriptor;
      const tr = node('tr'), index = node('th', String(rowIndex + 1)); index.scope = 'row'; tr.append(index);
      this.columns.forEach((column, col) => {
        const owner = this.mergeOwners.get(`${rowIndex}:${col}`);
        if (owner && (owner.row !== rowIndex || owner.col !== col)) return;
        const td = node('td', row[column.field] == null ? '' : String(row[column.field]));
        if (owner) { td.rowSpan = owner.rowSpan; td.colSpan = owner.colSpan; }
        td.dataset.row = rowIndex; td.dataset.col = col;
        td.setAttribute('aria-label', `${rowIndex + 1}행 ${column.header || column.field}`);
        const readonly = !this.model.editable || column.editable === false;
        td.setAttribute('aria-readonly', String(readonly)); td.classList.toggle('is-readonly', readonly);
        if (column.type === 'number') td.classList.add('is-number');
        if (this.tree && column.field === this.tree.labelField) {
          const label = node('span', td.textContent); td.replaceChildren(); td.classList.add('moa-grid__tree-cell');
          const indent = node('span', null, 'moa-grid__tree-indent'); indent.style.width = `${item.depth * 18}px`; td.append(indent);
          if (item.hasChildren) {
            const toggle = node('button', item.expanded ? '−' : '+', 'moa-grid__tree-toggle'); toggle.type = 'button'; toggle.setAttribute('aria-label', `${row[column.field]} ${item.expanded ? '접기' : '펼치기'}`); toggle.setAttribute('aria-expanded', String(item.expanded));
            toggle.addEventListener('pointerdown', event => event.stopPropagation()); toggle.addEventListener('dblclick', event => event.stopPropagation());
            toggle.addEventListener('click', event => { event.stopPropagation(); this.toggleNode(item.id); }); td.append(toggle);
          } else td.append(node('span', '', 'moa-grid__tree-leaf'));
          td.append(label); td.setAttribute('aria-level', String(item.depth + 1));
        }
        tr.append(td);
      }); body.append(tr);
    }
    if (!this.display.length) {
      const tr = node('tr'), td = node('td', '표시할 데이터가 없습니다. 검색어를 지워보세요.', 'moa-grid__empty'); td.colSpan = this.columns.length + 1; tr.append(td); body.append(tr);
    }
    this.table.append(body);
    this.table.tabIndex = this.view.length ? -1 : 0;
    this.updateColumnGeometry();
    this.current.row = Math.max(0, Math.min(this.current.row, this.view.length - 1)); this.anchor.row = Math.max(0, Math.min(this.anchor.row, this.view.length - 1));
    this.undoButton.disabled = !this.model.canUndo; this.redoButton.disabled = !this.model.canRedo;
    this.addButton.disabled = !this.model.editable; this.removeButton.disabled = !this.model.editable || !this.view.length;
    this.paintSelection(); this.message(`${this.view.length}행 · 셀 더블클릭 또는 F2로 편집`);
  }

  message(text, error = false) { this.status.textContent = text; this.status.classList.toggle('is-error', error); }

  createFilterPanel() {
    const panel = node('section', null, 'moa-grid__filters'); panel.hidden = true; panel.setAttribute('aria-label', '조건 필터');
    const form = node('form'), field = node('select'), operator = node('select'), value = node('input'), value2 = node('input');
    const label = (text, control) => { const item = node('label', text); control.setAttribute('aria-label', text.trim()); item.append(control); form.append(item); return item; };
    this.logicSelect = node('select');
    for (const [key, title] of [['and', '모두 만족 (AND)'], ['or', '하나 이상 (OR)']]) { const option = node('option', title); option.value = key; this.logicSelect.append(option); }
    label('조건 연결 ', this.logicSelect); this.logicSelect.addEventListener('change', () => this.setFilters(this.filters, { logic: this.logicSelect.value }));
    for (const column of this.columns) { const option = node('option', column.header || column.field); option.value = column.field; field.append(option); }
    const names = ['포함', '시작', '같음', '다름', '초과', '이상', '미만', '이하', '범위', '빈 값', '값 있음'];
    FILTER_OPERATORS.forEach((name, index) => { const option = node('option', names[index]); option.value = name; operator.append(option); });
    label('컬럼 ', field); label('조건 ', operator); const first = label('기준 값 ', value), second = label('끝 값 ', value2); second.hidden = true;
    operator.addEventListener('change', () => { second.hidden = operator.value !== 'between'; first.hidden = ['empty', 'notEmpty'].includes(operator.value); });
    const add = node('button', '조건 추가'); add.type = 'submit';
    const clear = node('button', '필터 초기화'); clear.type = 'button'; clear.addEventListener('click', () => this.setFilters([])); form.append(add, clear);
    form.addEventListener('submit', event => {
      event.preventDefault();
      try { this.setFilters([...this.filters, { field: field.value, operator: operator.value, value: value.value, value2: value2.value }]); }
      catch (error) { this.message(error.message, true); }
    });
    this.filterList = node('div', null, 'moa-grid__filter-list');
    panel.append(form, node('p', 'AND는 모든 조건, OR는 하나 이상의 조건을 만족하는 행을 표시합니다. 같은 컬럼의 구간은 ‘범위’를 사용하세요.'), this.filterList);
    return panel;
  }

  setFilters(filters, { logic = this.filterLogic } = {}) {
    if (!Array.isArray(filters)) throw new Error('filters는 배열이어야 합니다.');
    if (!['and', 'or'].includes(logic)) throw new Error('필터 연결은 and 또는 or여야 합니다.');
    const prepared = filters.map(filter => {
      const column = this.columns.find(column => column.field === filter.field);
      if (!column || !FILTER_OPERATORS.includes(filter.operator)) throw new Error('지원하지 않는 필터입니다.');
      const item = { ...filter };
      if (column.type === 'number' && !['contains', 'startsWith', 'empty', 'notEmpty'].includes(item.operator)) {
        for (const key of item.operator === 'between' ? ['value', 'value2'] : ['value']) {
          const input = String(item[key] ?? '').trim().replace(/,/g, '');
          if (!input || !Number.isFinite(Number(input))) throw new Error('숫자 필터에는 숫자 기준 값을 입력하세요.');
          item[key] = Number(input);
        }
        if (item.operator === 'between' && item.value > item.value2) throw new Error('시작 값은 끝 값보다 클 수 없습니다.');
      }
      return item;
    });
    if (this.editor && !this.finishEdit()) return false;
    this.filters = prepared; this.filterLogic = logic; this.logicSelect.value = logic; this.merges = []; this.resetSelection(); this.filterList.replaceChildren();
    this.filters.forEach((filter, index) => {
      const column = this.columns.find(column => column.field === filter.field);
      const remove = node('button', `${column.header || column.field}: ${filter.operator} ${filter.value ?? ''}${filter.operator === 'between' ? ' ~ ' + filter.value2 : ''} ×`); remove.type = 'button';
      remove.setAttribute('aria-label', `${index + 1}번 필터 제거`); remove.addEventListener('click', () => this.setFilters(this.filters.filter((_, item) => item !== index))); this.filterList.append(remove);
    });
    this.render(); return true;
  }

  setSorts(sorts) {
    if (!Array.isArray(sorts) || new Set(sorts.map(sort => sort.field)).size !== sorts.length) throw new Error('중복 없는 정렬 배열이 필요합니다.');
    const prepared = sorts.map(sort => {
      if (!this.columns.some(column => column.field === sort.field)) throw new Error('정렬할 컬럼이 없습니다.');
      const direction = [1, 'asc', 'ascending'].includes(sort.direction) ? 1 : [-1, 'desc', 'descending'].includes(sort.direction) ? -1 : null;
      if (!direction) throw new Error('정렬 방향은 asc 또는 desc여야 합니다.');
      return { field: sort.field, direction };
    });
    if (this.editor && !this.finishEdit()) return false;
    this.sorts = prepared; this.merges = []; this.resetSelection(); this.render(); return true;
  }

  setColumnWidth(field, width) {
    const column = this.columns.find(column => column.field === field);
    if (!column || !Number.isFinite(Number(width))) throw new Error('올바른 컬럼과 너비가 필요합니다.');
    column.width = Math.max(64, Math.min(1000, Math.round(Number(width)))); this.updateColumnGeometry();
    this.options.onColumnResize?.({ field, width: column.width });
  }

  setFrozenColumns(count) {
    if (!Number.isInteger(count) || count < 0 || count > this.columns.length) throw new Error('고정 열 수가 올바르지 않습니다.');
    const widths = [...this.table.querySelectorAll('thead tr:first-child > th')].slice(0, count + 1).reduce((sum, header) => sum + header.getBoundingClientRect().width, 0);
    if (count && widths > this.viewport.clientWidth - 64) { this.frozenSelect.value = this.frozenColumns; this.message('고정 영역이 화면보다 큽니다. 고정할 열 수를 줄이세요.', true); return false; }
    if (this.editor && !this.finishEdit()) { this.frozenSelect.value = this.frozenColumns; return false; }
    this.frozenColumns = count; this.frozenSelect.value = count; this.merges = []; this.render(); return true;
  }

  updateColumnGeometry() {
    const cols = this.table.querySelectorAll('colgroup col'); if (!cols.length) return;
    cols[0].style.width = '48px'; let total = 48;
    this.columns.forEach((column, index) => {
      const width = Math.max(64, Math.min(1000, Number(column.width) || 140));
      cols[index + 1].style.width = `${width}px`; total += width;
      this.table.querySelector(`thead th[data-col="${index}"] [role=separator]`)?.setAttribute('aria-valuenow', String(width));
    });
    this.table.style.width = `${total}px`;
    const heads = this.table.querySelectorAll('thead tr:first-child > th'); let offset = heads[0]?.getBoundingClientRect().width || 48;
    for (let col = 0; col < this.columns.length; col++) {
      const elements = this.table.querySelectorAll(`th[data-col="${col}"],td[data-col="${col}"]`);
      for (const cell of elements) {
        cell.classList.toggle('is-frozen', col < this.frozenColumns); cell.style.left = col < this.frozenColumns ? `${offset}px` : '';
      }
      offset += heads[col + 1]?.getBoundingClientRect().width || 0;
    }
  }

  setGroupBy(fields) {
    if (!Array.isArray(fields) || new Set(fields).size !== fields.length || fields.some(field => !this.columns.some(column => column.field === field))) throw new Error('그룹 컬럼 배열이 올바르지 않습니다.');
    if (fields.length && this.tree) throw new Error('트리와 행 그룹은 별도 모드로 사용하세요.');
    if (this.editor && !this.finishEdit()) return false;
    this.groupBy = [...fields]; this.collapsedGroups.clear(); this.merges = []; this.resetSelection();
    this.groupSelect.querySelector('[data-multiple]')?.remove();
    if (fields.length > 1) {
      const option = node('option', fields.map(field => this.columns.find(column => column.field === field).header || field).join(' → ')); option.value = '__multiple'; option.disabled = true; option.dataset.multiple = 'true'; this.groupSelect.append(option); this.groupSelect.value = '__multiple';
    } else this.groupSelect.value = fields[0] || '';
    this.render(); return true;
  }

  renderGroup(descriptor) {
    const row = node('tr', null, descriptor.type === 'group' ? 'moa-grid__group' : 'moa-grid__subtotal'), group = descriptor.group;
    if (descriptor.type === 'group') {
      const cell = node('td'); cell.colSpan = this.columns.length + 1;
      const column = this.columns.find(column => column.field === group.field);
      const toggle = node('button', `${group.expanded ? '−' : '+'} ${column.header || group.field}: ${group.value === '' ? '(빈 값)' : group.value} · ${group.count}행`); toggle.type = 'button'; toggle.dataset.groupKey = group.key; toggle.style.paddingInlineStart = `${12 + group.depth * 18}px`; toggle.setAttribute('aria-expanded', String(group.expanded));
      toggle.addEventListener('click', () => { if (this.collapsedGroups.has(group.key)) this.collapsedGroups.delete(group.key); else this.collapsedGroups.add(group.key); this.resetSelection(); this.render(); [...this.table.querySelectorAll('[data-group-key]')].find(button => button.dataset.groupKey === group.key)?.focus(); });
      cell.append(toggle); row.append(cell);
    } else {
      const index = node('th', 'Σ'); index.scope = 'row'; row.append(index);
      this.columns.forEach((column, col) => { const cell = node('td', column.type === 'number' ? String(group.summary[column.field]) : col === 0 ? '소계' : ''); cell.dataset.col = col; if (column.type === 'number') cell.classList.add('is-number'); row.append(cell); });
    }
    return row;
  }

  setTree(tree) {
    if (this.editor && !this.finishEdit()) return false;
    let prepared = null;
    if (tree) {
      if (this.groupBy.length) throw new Error('행 그룹을 해제한 뒤 트리를 설정하세요.');
      if (![tree.idField, tree.parentField, tree.labelField].every(field => typeof field === 'string' && field && !['__proto__', 'constructor', 'prototype'].includes(field)) || !this.columns.some(column => column.field === tree.labelField)) throw new Error('트리 idField·parentField·labelField가 필요합니다.');
      prepared = { ...tree }; treeIndex(this.model.rows, prepared);
    }
    this.tree = prepared; this.model.validateRows = prepared ? rows => treeIndex(rows, prepared) : null;
    this.model.past = []; this.model.future = [];
    this.collapsedNodes.clear(); this.merges = []; this.resetSelection(); this.groupSelect.disabled = Boolean(prepared); this.render(); return true;
  }

  toggleNode(id) {
    if (!this.tree) return;
    if (this.editor && !this.finishEdit()) return;
    id = String(id); if (this.collapsedNodes.has(id)) this.collapsedNodes.delete(id); else this.collapsedNodes.add(id);
    this.render(); const row = this.view.findIndex(item => item.id === id);
    if (row >= 0) this.select({ row, col: this.columns.findIndex(column => column.field === this.tree.labelField) });
  }

  makeRow(values = {}, offset = 0) {
    const row = Object.fromEntries(this.columns.map(column => [column.field, typeof column.defaultValue === 'function' ? column.defaultValue(this.model.rows.length + offset) : column.defaultValue ?? (['number', 'boolean'].includes(column.type) ? null : '')]));
    Object.assign(row, values);
    if (this.tree && !row[this.tree.idField]) {
      let index = this.model.rows.length + offset + 1;
      do { row[this.tree.idField] = `NEW-${index++}`; } while (this.model.rows.some(item => String(item[this.tree.idField]) === row[this.tree.idField]));
      row[this.tree.parentField] = '';
    }
    return row;
  }

  addRow(values = {}) {
    if (!this.model.editable || this.editor && !this.finishEdit()) return false;
    const row = this.makeRow(values);
    const index = this.model.rows.length; let changes;
    try { changes = this.model.insertRows(index, [row]); }
    catch (error) { this.message(error.message, true); return false; }
    this.query = ''; this.search.value = ''; this.setFilters([]); this.changed(changes, 'insert');
    const visible = this.view.findIndex(item => item.index === index);
    if (visible >= 0) this.select({ row: visible, col: Math.max(0, this.columns.findIndex(column => column.editable !== false)) });
    return true;
  }

  deleteSelectedRows() {
    if (!this.model.editable || !this.view.length || this.editor && !this.finishEdit()) return false;
    const range = this.getSelection(), indices = new Set(this.view.slice(range.top, range.bottom + 1).map(item => item.index));
    if (this.tree) {
      const { byId, children } = treeIndex(this.model.rows, this.tree);
      const pending = [...byId.values()].filter(item => indices.has(item.index));
      while (pending.length) { const item = pending.pop(); indices.add(item.index); pending.push(...(children.get(item.id) || [])); }
    }
    let changes;
    try { changes = this.model.removeRows([...indices]); }
    catch (error) { this.message(error.message, true); return false; }
    this.changed(changes, 'delete'); return true;
  }

  mergeSelection() {
    if (!this.view.length || this.editor && !this.finishEdit()) return false;
    if (this.tree || this.groupBy.length) { this.message('셀 병합은 일반 그리드 모드에서 사용하세요.', true); return false; }
    const range = this.getSelection();
    if (range.top === range.bottom && range.left === range.right) { this.message('병합할 여러 셀을 선택하세요.', true); return false; }
    if (range.left < this.frozenColumns && range.right >= this.frozenColumns) { this.message('고정 열 경계를 넘는 병합은 지원하지 않습니다.', true); return false; }
    this.merges = this.merges.filter(merge => !this.intersects(range, merge));
    this.merges.push({ row: range.top, col: range.left, rowSpan: range.bottom - range.top + 1, colSpan: range.right - range.left + 1 });
    this.current = { row: range.top, col: range.left }; this.anchor = { ...this.current }; this.render(); this.focusCell(); this.message('선택 영역을 병합했습니다. 숨겨진 원본 값은 보존됩니다.'); return true;
  }

  unmergeSelection() {
    const range = this.getSelection(); this.merges = this.merges.filter(merge => !this.intersects(range, merge));
    this.render(); this.focusCell(); this.message('선택 영역의 병합을 해제했습니다.');
  }

  async importXLSX(file, options = {}) {
    if (!this.model.editable || this.editor && !this.finishEdit()) return false;
    const revision = this.dataRevision, sequence = ++this.importSequence;
    let rows, changes;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하의 XLSX 파일을 선택하세요.');
      const bytes = file instanceof ArrayBuffer || ArrayBuffer.isView(file) ? file : await file.arrayBuffer();
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('20MB 이하의 XLSX 파일을 선택하세요.');
      if (this.destroyed || sequence !== this.importSequence) return false;
      if (revision !== this.dataRevision) throw new Error('파일을 읽는 동안 데이터가 변경됐습니다. 다시 가져오세요.');
      rows = readXLSX(bytes, this.xlsx, this.columns, options); changes = this.model.replaceRows(rows, 'import');
    } catch (error) { this.message(error.message, true); return false; }
    this.query = ''; this.search.value = ''; this.setFilters([]); this.changed(changes, 'import'); this.message(`${rows.length}행 XLSX 가져오기 완료 · Ctrl+Z로 원복`); return true;
  }

  exportXLSX({ fileName = 'moa-grid.xlsx', scope = 'view', sheetName = '데이터' } = {}) {
    if (this.editor && !this.finishEdit()) return false;
    try {
      if (!['view', 'all'].includes(scope)) throw new Error('내보내기 scope는 view 또는 all이어야 합니다.');
      const rows = scope === 'all' ? this.getData() : this.view.map(item => item.row);
      const bytes = writeXLSX(rows, this.xlsx, this.columns, { sheetName, merges: scope === 'view' ? this.merges : [] });
      this.downloadFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
      this.message(`${rows.length}행 XLSX 내보내기 완료`); return true;
    } catch (error) { this.message(error.message, true); return false; }
  }

  downloadFile(blob, name) {
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  onKey(event) {
    if (this.editor || event.isComposing || event.keyCode === 229) return;
    if (event.target.closest('button,[role=separator]')) return;
    const modifier = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (modifier && (key === 'z' || key === 'y')) {
      event.preventDefault(); if (key === 'y' || event.shiftKey) this.redo(); else this.undo(); return;
    }
    if (modifier && key === 'a') {
      if (!this.view.length) return;
      event.preventDefault(); this.anchor = { row: 0, col: 0 }; this.select({ row: this.view.length - 1, col: this.columns.length - 1 }, true); return;
    }
    if (!this.cellAt(event.target) || !this.view.length) return;
    if (modifier && event.key === 'Delete') { event.preventDefault(); this.deleteSelectedRows(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.clearSelection(); return; }
    const destination = { ...this.current };
    const merged = this.mergeOwners.get(`${this.current.row}:${this.current.col}`);
    if (event.key === 'ArrowDown') destination.row = merged ? merged.row + merged.rowSpan : destination.row + 1;
    else if (event.key === 'ArrowUp') destination.row = merged ? merged.row - 1 : destination.row - 1;
    else if (event.key === 'ArrowLeft') destination.col = merged ? merged.col - 1 : destination.col - 1;
    else if (event.key === 'ArrowRight') destination.col = merged ? merged.col + merged.colSpan : destination.col + 1;
    else if (event.key === 'Home') { destination.col = 0; if (modifier) destination.row = 0; }
    else if (event.key === 'End') { destination.col = this.columns.length - 1; if (modifier) destination.row = this.view.length - 1; }
    else if (event.key === 'Tab') {
      const position = this.current.row * this.columns.length + this.current.col + (event.shiftKey ? -1 : 1);
      if (position < 0 || position >= this.view.length * this.columns.length) return;
      destination.row = Math.floor(position / this.columns.length); destination.col = position % this.columns.length;
    } else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); this.startEdit(this.current); return; }
    else if (!modifier && !event.altKey && event.key.length === 1) { event.preventDefault(); this.startEdit(this.current, event.key); return; }
    else return;
    event.preventDefault(); this.select(destination, event.shiftKey && event.key !== 'Tab');
  }

  startEdit(cell, initial) {
    cell = this.mergeOwners.get(`${cell.row}:${cell.col}`) || cell;
    if (this.editor || !this.model.editable || this.columns[cell.col].editable === false || !this.view[cell.row]) return;
    this.select(cell);
    const column = this.columns[cell.col], dataRow = this.view[cell.row].index;
    const td = this.table.querySelector('td[tabindex="0"]'), input = node('input');
    input.type = 'text'; input.setAttribute('aria-label', `${column.header || column.field} 편집`);
    input.setAttribute('aria-describedby', this.status.id);
    if (column.type === 'number') input.inputMode = 'decimal';
    input.value = initial ?? this.model.rows[dataRow][column.field] ?? '';
    this.editor = { input, cell: { ...cell }, dataRow, column };
    td.replaceChildren(input); input.focus(); if (initial == null) input.select();
    input.addEventListener('keydown', event => {
      event.stopPropagation(); if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); this.cancelEdit(); }
      else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault(); const location = { ...this.current };
        if (this.finishEdit()) {
          const owner = this.mergeOwners.get(`${location.row}:${location.col}`);
          if (event.key === 'Enter') location.row = owner ? event.shiftKey ? owner.row - 1 : owner.row + owner.rowSpan : location.row + (event.shiftKey ? -1 : 1);
          else { location.col = owner ? event.shiftKey ? owner.col - 1 : owner.col + owner.colSpan : location.col + (event.shiftKey ? -1 : 1); if (location.col >= this.columns.length) { location.col = 0; location.row++; } else if (location.col < 0) { location.col = this.columns.length - 1; location.row--; } }
          this.select(location);
        }
      }
    });
    input.addEventListener('blur', () => {
      // Keep invalid edits intact so the operator can correct or cancel them.
      if (this.editor?.input === input && !this.finishEdit()) queueMicrotask(() => { if (this.editor?.input === input) input.focus(); });
    });
  }

  cancelEdit() { this.editor = null; this.render(); this.focusCell(); this.message('편집을 취소했습니다.'); }
  finishEdit() {
    if (!this.editor) return true;
    const { input, dataRow, column } = this.editor;
    let changes;
    try { changes = this.model.apply([{ row: dataRow, field: column.field, value: input.value }], 'edit'); }
    catch (error) { input.setAttribute('aria-invalid', 'true'); input.title = error.message; this.message(error.message, true); return false; }
    this.editor = null; this.changed(changes, 'edit'); return true;
  }

  selectedChanges(valueFactory) {
    const range = this.getSelection(), changes = [];
    for (let row = range.top; row <= range.bottom && row < this.view.length; row++) {
      for (let col = range.left; col <= range.right; col++) changes.push({ row: this.view[row].index, field: this.columns[col].field, value: valueFactory(row, col) });
    }
    return changes;
  }

  copySelection() {
    const range = this.getSelection(), rows = [];
    for (let row = range.top; row <= range.bottom && row < this.view.length; row++) rows.push(this.columns.slice(range.left, range.right + 1).map(column => this.view[row].row[column.field]));
    return toTSV(rows);
  }

  paste(text) {
    if (this.editor || !this.model.editable) return false;
    let applied, range, height, width;
    try {
      const matrix = Array.isArray(text) ? text : parseTSV(text), changes = [];
      if (!matrix.length || matrix.some(row => !Array.isArray(row))) throw new Error('붙여넣기 데이터가 올바르지 않습니다.');
      range = this.getSelection(); height = matrix.length; width = Math.max(...matrix.map(row => row.length));
      if (this.merges.some(merge => this.intersects({ top: range.top, bottom: range.top + height - 1, left: range.left, right: range.left + width - 1 }, merge))) throw new Error('붙여넣기 전에 대상 셀의 병합을 해제하세요.');
      if (!width || range.left + width > this.columns.length || height * width > 100000) throw new Error('붙여넣을 데이터가 그리드 범위를 벗어나거나 너무 큽니다.');
      const extra = Math.max(0, range.top + height - this.view.length);
      if (extra && !this.columns.slice(range.left, range.left + width).some(column => column.editable !== false)) throw new Error('읽기 전용 셀에는 행을 추가해 붙여넣을 수 없습니다.');
      if (extra && (this.options.pasteAppend === false || this.query.trim() || this.filters.length || this.groupBy.length || this.tree)) throw new Error('행 범위를 넘었습니다. 일반 모드에서 검색·필터를 해제하거나 행을 추가하세요.');
      if (extra) {
        const candidate = this.getData(), originalCount = candidate.length;
        for (let index = 0; index < extra; index++) candidate.push(this.makeRow({}, index));
        matrix.forEach((row, y) => row.forEach((value, x) => {
          const column = this.columns[range.left + x], target = this.view[range.top + y]?.index ?? originalCount + range.top + y - this.view.length;
          if (column.editable !== false) candidate[target][column.field] = this.model.convert(column, value);
        }));
        applied = this.model.replaceRows(candidate, 'paste', false);
      } else {
        matrix.forEach((row, y) => row.forEach((value, x) => changes.push({ row: this.view[range.top + y].index, field: this.columns[range.left + x].field, value })));
        applied = this.model.apply(changes, 'paste');
      }
    } catch (error) { this.message(error.message, true); return false; }
    this.anchor = { row: range.top, col: range.left }; this.current = { row: range.top + height - 1, col: range.left + width - 1 };
    this.changed(applied, 'paste'); return true;
  }

  clearSelection() {
    if (this.editor) return;
    let changes;
    try { changes = this.model.apply(this.selectedChanges(() => ''), 'clear'); }
    catch (error) { this.message(error.message, true); return; }
    this.changed(changes, 'clear');
  }

  undo() { if (this.editor) this.cancelEdit(); else this.changed(this.model.undo(), 'undo'); }
  redo() { if (!this.editor) this.changed(this.model.redo(), 'redo'); }
  changed(changes, reason) {
    if (changes.length) this.dataRevision++;
    if (changes.length && (this.query.trim() || this.filters.length || this.sorts.length)) this.merges = [];
    if (changes.some(change => change.kind === 'rows')) { this.merges = []; this.resetSelection(); }
    this.render(); this.focusCell();
    this.message(changes.length ? `${changes.some(change => change.kind === 'rows') ? '행 데이터' : changes.length + '셀'} ${reason === 'undo' ? '되돌림' : reason === 'redo' ? '다시 적용' : '변경'} · ${this.model.canUndo ? 'Ctrl+Z로 되돌리기' : '되돌릴 작업 없음'}` : '변경된 셀이 없습니다.');
    if (changes.length) this.options.onChange?.({ reason, changes, data: this.getData() });
  }
  getData() { return this.model.getData(); }
  setSearch(query) { if (this.editor) this.cancelEdit(); this.query = String(query); this.search.value = this.query; this.merges = []; this.resetSelection(); this.render(); }
  setData(rows) { this.model.setData(rows); this.dataRevision++; this.editor = null; this.merges = []; this.resetSelection(); this.render(); }
  downloadCSV() {
    if (this.editor && !this.finishEdit()) return;
    const quote = value => {
      let text = value == null ? '' : String(value);
      if (typeof value !== 'number' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [this.columns.map(column => column.header || column.field), ...this.view.map(({ row }) => this.columns.map(column => row[column.field]))];
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    this.downloadFile(blob, 'moa-grid.csv'); this.message('검색·정렬된 데이터를 CSV로 내보냈습니다.');
  }
  destroy() { this.destroyed = true; this.editor = null; this.resizeObserver.disconnect(); this.events.abort(); this.root.remove(); }
}

globalThis.MoaGrid = Grid;
})();
