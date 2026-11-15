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
