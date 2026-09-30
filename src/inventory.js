// 재고관리 핵심 로직 (UI와 저장소에 의존하지 않는 순수 함수 모음)

export const TX_IN = 'IN';
export const TX_OUT = 'OUT';
export const TX_ADJUST = 'ADJUST';

export function createState() {
  return { items: [], transactions: [], nextItemId: 1, nextTxId: 1 };
}

function assertValidQty(qty, { allowZero = false } = {}) {
  if (!Number.isInteger(qty) || qty < 0 || (!allowZero && qty === 0)) {
    throw new Error(allowZero ? '수량은 0 이상의 정수여야 합니다.' : '수량은 1 이상의 정수여야 합니다.');
  }
}

function normalizeItemFields(fields) {
  const sku = String(fields.sku ?? '').trim();
  const name = String(fields.name ?? '').trim();
  if (!sku) throw new Error('품목코드(SKU)를 입력하세요.');
  if (!name) throw new Error('품목명을 입력하세요.');
  const minStock = Number(fields.minStock ?? 0);
  const price = Number(fields.price ?? 0);
  assertValidQty(minStock, { allowZero: true });
  if (!Number.isFinite(price) || price < 0) throw new Error('단가는 0 이상이어야 합니다.');
  return {
    sku,
    name,
    category: String(fields.category ?? '').trim(),
    location: String(fields.location ?? '').trim(),
    unit: String(fields.unit ?? '').trim() || '개',
    minStock,
    price,
  };
}

export function findItem(state, id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) throw new Error('존재하지 않는 품목입니다.');
  return item;
}

function assertUniqueSku(state, sku, exceptId) {
  const lower = sku.toLowerCase();
  if (state.items.some((i) => i.id !== exceptId && i.sku.toLowerCase() === lower)) {
    throw new Error(`이미 등록된 품목코드입니다: ${sku}`);
  }
}

function recordTx(state, item, type, qty, memo, now) {
  const tx = {
    id: state.nextTxId++,
    itemId: item.id,
    sku: item.sku,
    name: item.name,
    type,
    qty,
    balance: item.quantity,
    memo: String(memo ?? '').trim(),
    at: now,
  };
  state.transactions.push(tx);
  return tx;
}

export function addItem(state, fields, initialQty = 0, now = new Date().toISOString()) {
  const data = normalizeItemFields(fields);
  assertUniqueSku(state, data.sku);
  assertValidQty(initialQty, { allowZero: true });
  const item = { id: state.nextItemId++, ...data, quantity: 0, createdAt: now, updatedAt: now };
  state.items.push(item);
  if (initialQty > 0) {
    item.quantity = initialQty;
    recordTx(state, item, TX_IN, initialQty, '초기 재고', now);
  }
  return item;
}

export function updateItem(state, id, fields, now = new Date().toISOString()) {
  const item = findItem(state, id);
  const data = normalizeItemFields({ ...item, ...fields });
  assertUniqueSku(state, data.sku, id);
  Object.assign(item, data, { updatedAt: now });
  return item;
}

export function deleteItem(state, id) {
  const idx = state.items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error('존재하지 않는 품목입니다.');
  const [removed] = state.items.splice(idx, 1);
  return removed;
}

export function stockIn(state, id, qty, memo, now = new Date().toISOString()) {
  assertValidQty(qty);
  const item = findItem(state, id);
  item.quantity += qty;
  item.updatedAt = now;
  return recordTx(state, item, TX_IN, qty, memo, now);
}

export function stockOut(state, id, qty, memo, now = new Date().toISOString()) {
  assertValidQty(qty);
  const item = findItem(state, id);
  if (qty > item.quantity) {
    throw new Error(`재고가 부족합니다. (현재 ${item.quantity}${item.unit}, 요청 ${qty}${item.unit})`);
  }
  item.quantity -= qty;
  item.updatedAt = now;
  return recordTx(state, item, TX_OUT, qty, memo, now);
}

// 실사 결과로 재고를 특정 수량에 맞춤. 기록되는 qty는 증감량(부호 포함).
export function adjustStock(state, id, newQty, memo, now = new Date().toISOString()) {
  assertValidQty(newQty, { allowZero: true });
  const item = findItem(state, id);
  const diff = newQty - item.quantity;
  if (diff === 0) return null;
  item.quantity = newQty;
  item.updatedAt = now;
  return recordTx(state, item, TX_ADJUST, diff, memo || '재고 실사 조정', now);
}

export function isLowStock(item) {
  return item.quantity <= item.minStock;
}

export function summarize(state) {
  return {
    itemCount: state.items.length,
    totalQuantity: state.items.reduce((s, i) => s + i.quantity, 0),
    totalValue: state.items.reduce((s, i) => s + i.quantity * i.price, 0),
    lowStockCount: state.items.filter(isLowStock).length,
    outOfStockCount: state.items.filter((i) => i.quantity === 0).length,
  };
}

export function filterItems(items, { query = '', category = '', lowOnly = false } = {}) {
  const q = query.trim().toLowerCase();
  return items.filter((i) => {
    if (category && i.category !== category) return false;
    if (lowOnly && !isLowStock(i)) return false;
    if (!q) return true;
    return [i.sku, i.name, i.category, i.location].some((v) => v.toLowerCase().includes(q));
  });
}

export function categories(items) {
  return [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}

// ---- CSV ----

const CSV_HEADERS = ['sku', 'name', 'category', 'location', 'unit', 'quantity', 'minStock', 'price'];

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function itemsToCsv(items) {
  const rows = items.map((i) => CSV_HEADERS.map((h) => csvEscape(i[h])).join(','));
  return [CSV_HEADERS.join(','), ...rows].join('\n');
}

export function transactionsToCsv(transactions) {
  const headers = ['at', 'type', 'sku', 'name', 'qty', 'balance', 'memo'];
  const rows = transactions.map((t) => headers.map((h) => csvEscape(t[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// CSV로 품목을 일괄 등록/갱신. 기존 SKU는 정보 갱신 후 수량 차이를 조정 이력으로 남김.
export function importItemsCsv(state, text, now = new Date().toISOString()) {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('CSV 내용이 비어 있습니다.');
  const cols = header.map((h) => h.trim());
  for (const required of ['sku', 'name']) {
    if (!cols.includes(required)) throw new Error(`CSV 헤더에 '${required}' 열이 필요합니다.`);
  }
  const result = { added: 0, updated: 0, errors: [] };
  rows.forEach((r, idx) => {
    const rec = Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()]));
    try {
      const qty = rec.quantity === undefined || rec.quantity === '' ? null : Number(rec.quantity);
      if (qty !== null) assertValidQty(qty, { allowZero: true });
      const fields = {
        sku: rec.sku,
        name: rec.name,
        category: rec.category,
        location: rec.location,
        unit: rec.unit,
        minStock: rec.minStock === undefined || rec.minStock === '' ? undefined : Number(rec.minStock),
        price: rec.price === undefined || rec.price === '' ? undefined : Number(rec.price),
      };
      Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
      const existing = state.items.find((i) => i.sku.toLowerCase() === rec.sku.toLowerCase());
      if (existing) {
        updateItem(state, existing.id, fields, now);
        if (qty !== null) adjustStock(state, existing.id, qty, 'CSV 가져오기', now);
        result.updated++;
      } else {
        addItem(state, fields, qty ?? 0, now);
        result.added++;
      }
    } catch (e) {
      result.errors.push(`${idx + 2}행: ${e.message}`);
    }
  });
  return result;
}
