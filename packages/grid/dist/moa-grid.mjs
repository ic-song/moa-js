/*! Moa JS Grid v0.1.0 | MIT License | See LICENSE */
export function parseTSV(text) {
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
      rows[rows.length - 1].push(value); value = '';
      if (char !== '\t') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        rows.push([]);
      }
    } else value += char;
  }
  if (quoted) throw new Error('닫히지 않은 따옴표가 있습니다.');
  rows[rows.length - 1].push(value);
  if (rows.length > 1 && /(?:\r\n|\r|\n)$/.test(text)) rows.pop();
  return rows;
}

export function toTSV(rows) {
  return rows.map(row => row.map(value => {
    const text = value == null ? '' : String(value);
    return /[\t\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join('\t')).join('\r\n');
}

export class GridModel {
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
      if (typeof value === 'boolean' || !String(value).trim() || !Number.isFinite(Number(value))) throw new Error(`${column.header || column.field}: 숫자를 입력하세요.`);
      value = Number(value);
    } else if (column.type === 'boolean') {
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
    for (const change of transaction) this.rows[change.row][change.field] = change.value;
    this.past.push({ changes: transaction, reason });
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
    return transaction.map(change => ({ ...change }));
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return [];
    for (const change of entry.changes) this.rows[change.row][change.field] = change.previous;
    this.future.push(entry);
    return entry.changes.map(change => ({ ...change, value: change.previous, previous: change.value }));
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return [];
    for (const change of entry.changes) this.rows[change.row][change.field] = change.value;
    this.past.push(entry);
    return entry.changes.map(change => ({ ...change }));
  }
}


function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text != null) result.textContent = text;
  if (className) result.className = className;
  return result;
}

export class Grid {
  constructor(target, options) {
    this.host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.host || this.host.childNodes.length) throw new Error('비어 있는 그리드 컨테이너가 필요합니다.');
    this.options = options;
    this.model = new GridModel(options.columns, options.data || [], options);
    this.columns = this.model.columns;
    this.anchor = { row: 0, col: 0 }; this.current = { ...this.anchor };
    this.query = ''; this.sort = null; this.editor = null; this.destroyed = false;
    this.events = new AbortController();
    const signal = this.events.signal;
    this.root = node('div', null, 'moa-grid');
    this.toolbar = node('div', null, 'moa-grid__toolbar');
    const searchLabel = node('label', '검색 ', 'moa-grid__search');
    this.search = node('input'); this.search.type = 'search'; this.search.placeholder = '전체 데이터 검색';
    this.search.addEventListener('input', () => { this.query = this.search.value; this.resetSelection(); this.render(); }, { signal });
    searchLabel.append(this.search);
    const button = (text, action) => {
      const control = node('button', text); control.type = 'button';
      control.addEventListener('click', action, { signal }); this.toolbar.append(control); return control;
    };
    this.toolbar.append(searchLabel);
    this.undoButton = button('되돌리기', () => this.undo());
    this.redoButton = button('다시 실행', () => this.redo());
    button('선택 지우기', () => this.clearSelection());
    button('CSV 내보내기', () => this.downloadCSV());
    this.coordinate = node('span', '', 'moa-grid__coordinate'); this.toolbar.append(this.coordinate);
    this.viewport = node('div', null, 'moa-grid__viewport');
    this.table = node('table'); this.table.setAttribute('role', 'grid'); this.table.setAttribute('aria-label', options.label || '데이터 편집 그리드');
    this.table.setAttribute('aria-multiselectable', 'true');
    this.viewport.append(this.table);
    this.status = node('div', '', 'moa-grid__status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    this.root.append(this.toolbar, this.viewport, this.status); this.host.append(this.root);
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
    this.table.addEventListener('copy', event => {
      if (this.editor || !event.clipboardData || !this.view.length) return;
      event.clipboardData.setData('text/plain', this.copySelection()); event.preventDefault();
      this.message('선택 영역을 복사했습니다. 엑셀에 붙여넣을 수 있습니다.');
    }, { signal });
    this.table.addEventListener('paste', event => {
      if (this.editor || !event.clipboardData) return;
      event.preventDefault(); this.paste(event.clipboardData.getData('text/plain'));
    }, { signal });
    this.render();
  }

  cellAt(target) {
    const cell = target.closest?.('td[data-row]');
    return cell && this.table.contains(cell) ? { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } : null;
  }

  resetSelection() { this.anchor = { row: 0, col: 0 }; this.current = { ...this.anchor }; }
  getSelection() {
    return { top: Math.min(this.anchor.row, this.current.row), bottom: Math.max(this.anchor.row, this.current.row), left: Math.min(this.anchor.col, this.current.col), right: Math.max(this.anchor.col, this.current.col) };
  }

  select(cell, extend = false, focus = true) {
    if (!this.view.length) return;
    this.current = { row: Math.max(0, Math.min(this.view.length - 1, cell.row)), col: Math.max(0, Math.min(this.columns.length - 1, cell.col)) };
    if (!extend) this.anchor = { ...this.current };
    this.paintSelection();
    if (focus) this.focusCell();
    this.options.onSelectionChange?.(this.getSelection());
  }

  focusCell() {
    this.table.querySelector(`td[data-row="${this.current.row}"][data-col="${this.current.col}"]`)?.focus({ preventScroll: true });
    this.table.querySelector('td[tabindex="0"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  paintSelection() {
    const range = this.getSelection();
    for (const cell of this.table.querySelectorAll('td[data-row]')) {
      const row = Number(cell.dataset.row), col = Number(cell.dataset.col);
      const selected = row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
      const active = row === this.current.row && col === this.current.col;
      cell.classList.toggle('is-selected', selected); cell.classList.toggle('is-active', active);
      cell.setAttribute('aria-selected', String(selected)); cell.tabIndex = active ? 0 : -1;
    }
    this.coordinate.textContent = this.view.length ? `${this.current.row + 1}행 ${this.current.col + 1}열 · ${(range.bottom - range.top + 1) * (range.right - range.left + 1)}셀 선택` : '선택 없음';
  }

  render() {
    const query = this.query.trim().toLocaleLowerCase();
    this.view = this.model.rows.map((row, index) => ({ row, index })).filter(({ row }) => !query || this.columns.some(column => String(row[column.field] ?? '').toLocaleLowerCase().includes(query)));
    if (this.sort) {
      const { field, direction } = this.sort;
      this.view.sort((a, b) => {
        const x = a.row[field], y = b.row[field];
        if (x == null || x === '') return y == null || y === '' ? a.index - b.index : 1;
        if (y == null || y === '') return -1;
        return direction * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko', { numeric: true })) || a.index - b.index;
      });
    }
    this.table.replaceChildren();
    this.table.setAttribute('aria-rowcount', String(this.view.length + 1)); this.table.setAttribute('aria-colcount', String(this.columns.length + 1));
    const head = node('thead'), heading = node('tr'), corner = node('th', '#'); corner.scope = 'col'; heading.append(corner);
    this.columns.forEach((column, col) => {
      const th = node('th'); th.scope = 'col';
      const sorted = this.sort?.field === column.field;
      th.setAttribute('aria-sort', sorted ? this.sort.direction === 1 ? 'ascending' : 'descending' : 'none');
      const control = node('button', `${column.header || column.field}${column.editable === false ? ' (읽기 전용)' : ''}${sorted ? this.sort.direction === 1 ? ' ↑' : ' ↓' : ''}`);
      control.type = 'button'; control.addEventListener('click', () => {
        if (this.editor && !this.finishEdit()) return;
        this.sort = { field: column.field, direction: sorted ? -this.sort.direction : 1 }; this.resetSelection(); this.render();
      });
      if (column.width) th.style.minWidth = `${Math.max(64, Number(column.width) || 120)}px`;
      th.append(control); heading.append(th);
    });
    head.append(heading); this.table.append(head);
    const body = node('tbody');
    this.view.forEach(({ row }, rowIndex) => {
      const tr = node('tr'), index = node('th', String(rowIndex + 1)); index.scope = 'row'; tr.append(index);
      this.columns.forEach((column, col) => {
        const td = node('td', row[column.field] == null ? '' : String(row[column.field]));
        td.dataset.row = rowIndex; td.dataset.col = col;
        td.setAttribute('aria-label', `${rowIndex + 1}행 ${column.header || column.field}`);
        const readonly = !this.model.editable || column.editable === false;
        td.setAttribute('aria-readonly', String(readonly)); td.classList.toggle('is-readonly', readonly);
        if (column.type === 'number') td.classList.add('is-number');
        tr.append(td);
      }); body.append(tr);
    });
    if (!this.view.length) {
      const tr = node('tr'), td = node('td', '표시할 데이터가 없습니다. 검색어를 지워보세요.', 'moa-grid__empty'); td.colSpan = this.columns.length + 1; tr.append(td); body.append(tr);
    }
    this.table.append(body);
    this.current.row = Math.max(0, Math.min(this.current.row, this.view.length - 1)); this.anchor.row = Math.max(0, Math.min(this.anchor.row, this.view.length - 1));
    this.undoButton.disabled = !this.model.canUndo; this.redoButton.disabled = !this.model.canRedo;
    this.paintSelection(); this.message(`${this.view.length}행 · 셀 더블클릭 또는 F2로 편집`);
  }

  message(text, error = false) { this.status.textContent = text; this.status.classList.toggle('is-error', error); }

  onKey(event) {
    if (this.editor || event.isComposing || event.keyCode === 229) return;
    const modifier = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (modifier && (key === 'z' || key === 'y')) {
      event.preventDefault(); if (key === 'y' || event.shiftKey) this.redo(); else this.undo(); return;
    }
    if (modifier && key === 'a') {
      if (!this.view.length) return;
      event.preventDefault(); this.anchor = { row: 0, col: 0 }; this.select({ row: this.view.length - 1, col: this.columns.length - 1 }, true); return;
    }
    if (!this.cellAt(event.target) || !this.view.length) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.clearSelection(); return; }
    const destination = { ...this.current };
    if (event.key === 'ArrowDown') destination.row++;
    else if (event.key === 'ArrowUp') destination.row--;
    else if (event.key === 'ArrowLeft') destination.col--;
    else if (event.key === 'ArrowRight') destination.col++;
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
    if (this.editor || !this.model.editable || this.columns[cell.col].editable === false || !this.view[cell.row]) return;
    this.select(cell);
    const column = this.columns[cell.col], dataRow = this.view[cell.row].index;
    const td = this.table.querySelector('td[tabindex="0"]'), input = node('input');
    input.type = 'text'; input.setAttribute('aria-label', `${column.header || column.field} 편집`);
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
          if (event.key === 'Enter') location.row += event.shiftKey ? -1 : 1;
          else { location.col += event.shiftKey ? -1 : 1; if (location.col >= this.columns.length) { location.col = 0; location.row++; } else if (location.col < 0) { location.col = this.columns.length - 1; location.row--; } }
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
    catch (error) { input.setAttribute('aria-invalid', 'true'); this.message(error.message, true); return false; }
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
    if (this.editor || !this.view.length) return false;
    let applied, range, height, width;
    try {
      const matrix = parseTSV(text), changes = [];
      range = this.getSelection(); height = matrix.length; width = Math.max(...matrix.map(row => row.length));
      if (range.top + height > this.view.length || range.left + width > this.columns.length) throw new Error('붙여넣을 데이터가 그리드 범위를 벗어납니다.');
      matrix.forEach((row, y) => row.forEach((value, x) => changes.push({ row: this.view[range.top + y].index, field: this.columns[range.left + x].field, value })));
      applied = this.model.apply(changes, 'paste');
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
    this.render(); this.focusCell();
    this.message(changes.length ? `${changes.length}셀 ${reason === 'undo' ? '되돌림' : reason === 'redo' ? '다시 적용' : '변경'} · ${this.model.canUndo ? 'Ctrl+Z로 되돌리기' : '되돌릴 작업 없음'}` : '변경된 셀이 없습니다.');
    if (changes.length) this.options.onChange?.({ reason, changes, data: this.getData() });
  }
  getData() { return this.model.getData(); }
  setSearch(query) { if (this.editor) this.cancelEdit(); this.query = String(query); this.search.value = this.query; this.resetSelection(); this.render(); }
  setData(rows) { if (this.editor) this.editor = null; this.model.setData(rows); this.resetSelection(); this.render(); }
  downloadCSV() {
    if (this.editor && !this.finishEdit()) return;
    const quote = value => {
      let text = value == null ? '' : String(value);
      if (typeof value !== 'number' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [this.columns.map(column => column.header || column.field), ...this.view.map(({ row }) => this.columns.map(column => row[column.field]))];
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = 'moa-grid.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); this.message('검색·정렬된 데이터를 CSV로 내보냈습니다.');
  }
  destroy() { this.destroyed = true; this.editor = null; this.events.abort(); this.root.remove(); }
}

export default Grid;
