import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, addItem, updateItem, deleteItem, stockIn, stockOut, adjustStock,
  summarize, filterItems, categories, isLowStock,
  itemsToCsv, parseCsv, importItemsCsv, TX_IN, TX_OUT, TX_ADJUST,
} from '../src/inventory.js';

const NOW = '2026-01-01T00:00:00.000Z';

function sample() {
  const s = createState();
  addItem(s, { sku: 'A-001', name: '볼펜', category: '문구', price: 500, minStock: 10 }, 20, NOW);
  addItem(s, { sku: 'B-001', name: 'A4 용지', category: '사무용품', price: 5000, minStock: 5 }, 3, NOW);
  return s;
}

test('품목 등록 시 초기 재고가 입고 이력으로 기록된다', () => {
  const s = sample();
  assert.equal(s.items.length, 2);
  assert.equal(s.items[0].quantity, 20);
  assert.equal(s.transactions.length, 2);
  assert.equal(s.transactions[0].type, TX_IN);
  assert.equal(s.transactions[0].memo, '초기 재고');
});

test('필수값 누락과 SKU 중복을 막는다', () => {
  const s = sample();
  assert.throws(() => addItem(s, { sku: '', name: 'x' }), /품목코드/);
  assert.throws(() => addItem(s, { sku: 'x', name: '' }), /품목명/);
  assert.throws(() => addItem(s, { sku: 'a-001', name: '중복' }), /이미 등록/);
  assert.throws(() => updateItem(s, 2, { sku: 'A-001' }), /이미 등록/);
});

test('입고/출고가 재고와 잔량을 갱신한다', () => {
  const s = sample();
  const tin = stockIn(s, 1, 5, '구매', NOW);
  assert.equal(s.items[0].quantity, 25);
  assert.equal(tin.balance, 25);
  const tout = stockOut(s, 1, 10, '판매', NOW);
  assert.equal(s.items[0].quantity, 15);
  assert.equal(tout.type, TX_OUT);
  assert.equal(tout.balance, 15);
});

test('재고보다 많은 출고와 잘못된 수량은 거부된다', () => {
  const s = sample();
  assert.throws(() => stockOut(s, 2, 4), /재고가 부족/);
  assert.throws(() => stockIn(s, 1, 0), /1 이상/);
  assert.throws(() => stockIn(s, 1, 1.5), /정수/);
  assert.throws(() => stockIn(s, 99, 1), /존재하지 않는/);
  assert.equal(s.items[1].quantity, 3);
});

test('실사 조정은 증감량을 기록하고 변화가 없으면 기록하지 않는다', () => {
  const s = sample();
  const tx = adjustStock(s, 1, 17, '', NOW);
  assert.equal(tx.type, TX_ADJUST);
  assert.equal(tx.qty, -3);
  assert.equal(s.items[0].quantity, 17);
  assert.equal(adjustStock(s, 1, 17, '', NOW), null);
});

test('요약·필터·분류', () => {
  const s = sample();
  assert.deepEqual(summarize(s), {
    itemCount: 2, totalQuantity: 23, totalValue: 20 * 500 + 3 * 5000, lowStockCount: 1, outOfStockCount: 0,
  });
  assert.ok(isLowStock(s.items[1]));
  assert.equal(filterItems(s.items, { query: '볼' }).length, 1);
  assert.equal(filterItems(s.items, { lowOnly: true })[0].sku, 'B-001');
  assert.equal(filterItems(s.items, { category: '문구' }).length, 1);
  assert.deepEqual(categories(s.items), ['문구', '사무용품']);
});

test('품목 삭제 후에도 이력은 남는다', () => {
  const s = sample();
  deleteItem(s, 1);
  assert.equal(s.items.length, 1);
  assert.equal(s.transactions.length, 2);
});

test('CSV 내보내기/파싱 왕복 (쉼표·따옴표 포함)', () => {
  const s = createState();
  addItem(s, { sku: 'C-1', name: '케이블, "USB-C"', price: 1000 }, 2, NOW);
  const rows = parseCsv(itemsToCsv(s.items));
  assert.equal(rows[1][1], '케이블, "USB-C"');
});

test('CSV 가져오기: 신규 추가, 기존 갱신, 오류 행 보고', () => {
  const s = sample();
  const csv = [
    'sku,name,category,quantity,price',
    'A-001,볼펜(흑),문구,30,600',
    'C-001,지우개,문구,7,300',
    ',이름만,,1,',
    'D-001,음수,,-1,',
  ].join('\n');
  const r = importItemsCsv(s, csv, NOW);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 1);
  assert.equal(r.errors.length, 2);
  const a = s.items.find((i) => i.sku === 'A-001');
  assert.equal(a.name, '볼펜(흑)');
  assert.equal(a.quantity, 30);
  assert.equal(a.minStock, 10);
  assert.equal(s.items.find((i) => i.sku === 'C-001').quantity, 7);
  assert.ok(!s.items.some((i) => i.sku === 'D-001'));
});
