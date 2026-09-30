(function () {
  'use strict';

  const {
    createState, addItem, updateItem, deleteItem, findItem, stockIn, stockOut, adjustStock,
    summarize, filterItems, categories, isLowStock,
    itemsToCsv, transactionsToCsv, importItemsCsv, TX_IN, TX_OUT, TX_ADJUST,
  } = window.Inventory;

  const STORAGE_KEY = 'inventory-system:v1';
  const TX_LABEL = { [TX_IN]: '입고', [TX_OUT]: '출고', [TX_ADJUST]: '조정' };

  const $ = (sel) => document.querySelector(sel);
  const won = new Intl.NumberFormat('ko-KR');
  const fmtNum = (n) => won.format(n);
  const fmtDate = (iso) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });

  let state = load();
  let sort = { key: 'sku', dir: 1 };

  // ---- 저장 ----

  function isValidState(s) {
    return s && Array.isArray(s.items) && Array.isArray(s.transactions)
      && Number.isInteger(s.nextItemId) && Number.isInteger(s.nextTxId);
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (isValidState(parsed)) return parsed;
    } catch { /* 저장소를 쓸 수 없거나 손상된 경우 빈 상태로 시작 */ }
    return createState();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      toast('브라우저 저장소에 저장하지 못했습니다. 백업 파일을 저장하세요.');
    }
  }

  function commit(message) {
    save();
    render();
    if (message) toast(message);
  }

  // ---- 공통 UI ----

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    node.append(...children.map((c) => (c instanceof Node ? c : String(c ?? ''))));
    return node;
  }

  function download(filename, text, type = 'text/csv') {
    // 엑셀에서 한글이 깨지지 않도록 CSV에는 BOM을 붙임
    const body = type === 'text/csv' ? '﻿' + text : text;
    const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function badge(type) {
    return el('span', { class: `badge ${type}` }, TX_LABEL[type]);
  }

  function signedQty(tx) {
    if (tx.type === TX_IN) return `+${fmtNum(tx.qty)}`;
    if (tx.type === TX_OUT) return `-${fmtNum(tx.qty)}`;
    return tx.qty > 0 ? `+${fmtNum(tx.qty)}` : fmtNum(tx.qty);
  }

  // ---- 탭 ----

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });

  function showView(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  }

  // ---- 렌더링 ----

  function render() {
    renderDashboard();
    renderCategoryOptions();
    renderItems();
    renderHistory();
  }

  function renderDashboard() {
    const s = summarize(state);
    $('#stat-items').textContent = fmtNum(s.itemCount);
    $('#stat-qty').textContent = fmtNum(s.totalQuantity);
    $('#stat-value').textContent = `${fmtNum(Math.round(s.totalValue))}원`;
    $('#stat-low').textContent = fmtNum(s.lowStockCount);
    $('#stat-out').textContent = fmtNum(s.outOfStockCount);

    const low = state.items.filter(isLowStock).sort((a, b) => a.quantity - b.quantity);
    $('#low-stock-body').replaceChildren(
      ...(low.length
        ? low.map((i) => el('tr', { class: i.quantity === 0 ? 'out' : 'low' },
          el('td', {}, i.sku), el('td', {}, i.name),
          el('td', { class: 'num' }, fmtNum(i.quantity)), el('td', { class: 'num' }, fmtNum(i.minStock)),
          el('td', {}, el('button', { class: 'small', onclick: () => openTxDialog(i.id, TX_IN) }, '입고'))))
        : [el('tr', {}, el('td', { colspan: 5, class: 'empty' }, '부족한 품목이 없습니다.'))]),
    );

    const recent = state.transactions.slice(-10).reverse();
    $('#recent-tx-body').replaceChildren(
      ...(recent.length
        ? recent.map((t) => el('tr', {},
          el('td', {}, fmtDate(t.at)), el('td', {}, badge(t.type)),
          el('td', {}, t.name), el('td', { class: 'num' }, signedQty(t))))
        : [el('tr', {}, el('td', { colspan: 4, class: 'empty' }, '입출고 이력이 없습니다.'))]),
    );
  }

  function renderCategoryOptions() {
    const cats = categories(state.items);
    const select = $('#category-filter');
    const current = select.value;
    select.replaceChildren(el('option', { value: '' }, '전체 분류'), ...cats.map((c) => el('option', { value: c }, c)));
    select.value = cats.includes(current) ? current : '';
    $('#category-list').replaceChildren(...cats.map((c) => el('option', { value: c })));
  }

  function renderItems() {
    const items = filterItems(state.items, {
      query: $('#search').value,
      category: $('#category-filter').value,
      lowOnly: $('#low-only').checked,
    }).sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ko')) * sort.dir;
    });

    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.classList.toggle('asc', th.dataset.sort === sort.key && sort.dir === 1);
      th.classList.toggle('desc', th.dataset.sort === sort.key && sort.dir === -1);
    });

    $('#items-body').replaceChildren(...items.map((i) => el('tr',
      { class: i.quantity === 0 ? 'out' : isLowStock(i) ? 'low' : '' },
      el('td', {}, i.sku),
      el('td', {}, i.name),
      el('td', {}, i.category),
      el('td', {}, i.location),
      el('td', { class: 'num' }, `${fmtNum(i.quantity)} ${i.unit}`),
      el('td', { class: 'num' }, fmtNum(i.minStock)),
      el('td', { class: 'num' }, fmtNum(i.price)),
      el('td', { class: 'ops' },
        el('button', { class: 'small', onclick: () => openTxDialog(i.id, TX_IN) }, '입고'),
        el('button', { class: 'small', onclick: () => openTxDialog(i.id, TX_OUT) }, '출고'),
        el('button', { class: 'small', onclick: () => openTxDialog(i.id, TX_ADJUST) }, '조정'),
        el('button', { class: 'small', onclick: () => openItemDialog(i.id) }, '수정'),
        el('button', { class: 'small danger', onclick: () => removeItem(i.id) }, '삭제')),
    )));
    $('#items-empty').hidden = items.length > 0;
  }

  function filteredHistory() {
    const q = $('#history-search').value.trim().toLowerCase();
    const type = $('#history-type').value;
    const from = $('#history-from').value;
    const to = $('#history-to').value;
    return state.transactions.filter((t) => {
      if (type && t.type !== type) return false;
      // 날짜 필터는 사용자의 현지 날짜 기준
      const d = new Date(t.at);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (from && local < from) return false;
      if (to && local > to) return false;
      if (q && ![t.sku, t.name, t.memo].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    }).reverse();
  }

  function renderHistory() {
    const txs = filteredHistory();
    $('#history-body').replaceChildren(...txs.map((t) => el('tr', {},
      el('td', {}, fmtDate(t.at)),
      el('td', {}, badge(t.type)),
      el('td', {}, t.sku),
      el('td', {}, t.name),
      el('td', { class: 'num' }, signedQty(t)),
      el('td', { class: 'num' }, fmtNum(t.balance)),
      el('td', {}, t.memo),
    )));
    $('#history-empty').hidden = txs.length > 0;
  }

  // ---- 품목 등록/수정 ----

  const itemDialog = $('#item-dialog');
  const itemForm = $('#item-form');
  let editingId = null;

  $('#btn-new-item').addEventListener('click', () => openItemDialog(null));

  function openItemDialog(id) {
    editingId = id;
    itemForm.reset();
    $('#item-error').textContent = '';
    $('#item-dialog-title').textContent = id ? '품목 수정' : '품목 등록';
    $('#initial-qty-field').hidden = Boolean(id);
    if (id) {
      const item = findItem(state, id);
      for (const key of ['sku', 'name', 'category', 'location', 'unit', 'price', 'minStock']) {
        itemForm.elements[key].value = item[key];
      }
    }
    itemDialog.showModal();
    itemForm.elements.sku.focus();
  }

  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = itemForm.elements;
    const fields = {
      sku: f.sku.value,
      name: f.name.value,
      category: f.category.value,
      location: f.location.value,
      unit: f.unit.value,
      price: Number(f.price.value || 0),
      minStock: Number(f.minStock.value || 0),
    };
    try {
      if (editingId) {
        updateItem(state, editingId, fields);
      } else {
        addItem(state, fields, Number(f.initialQty.value || 0));
      }
    } catch (err) {
      $('#item-error').textContent = err.message;
      return;
    }
    itemDialog.close();
    commit(editingId ? '품목을 수정했습니다.' : '품목을 등록했습니다.');
  });

  function removeItem(id) {
    const item = findItem(state, id);
    if (!confirm(`'${item.name}' 품목을 삭제할까요?\n입출고 이력은 남습니다.`)) return;
    deleteItem(state, id);
    commit('품목을 삭제했습니다.');
  }

  // ---- 입고/출고/조정 ----

  const txDialog = $('#tx-dialog');
  const txForm = $('#tx-form');
  let txTarget = null;

  function openTxDialog(id, type) {
    const item = findItem(state, id);
    txTarget = { id, type };
    txForm.reset();
    $('#tx-error').textContent = '';
    $('#tx-dialog-title').textContent = TX_LABEL[type];
    $('#tx-item-info').textContent = `${item.sku} · ${item.name} — 현재고 ${fmtNum(item.quantity)}${item.unit}`;
    $('#tx-qty-label').firstChild.textContent = type === TX_ADJUST ? '실사 수량' : '수량';
    txForm.elements.qty.min = type === TX_ADJUST ? 0 : 1;
    if (type === TX_OUT) txForm.elements.qty.max = item.quantity;
    else txForm.elements.qty.removeAttribute('max');
    if (type === TX_ADJUST) txForm.elements.qty.value = item.quantity;
    txDialog.showModal();
    txForm.elements.qty.select();
  }

  txForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const qty = Number(txForm.elements.qty.value);
    const memo = txForm.elements.memo.value;
    const { id, type } = txTarget;
    let message;
    try {
      if (type === TX_IN) { stockIn(state, id, qty, memo); message = '입고 처리했습니다.'; }
      else if (type === TX_OUT) { stockOut(state, id, qty, memo); message = '출고 처리했습니다.'; }
      else message = adjustStock(state, id, qty, memo) ? '재고를 조정했습니다.' : '변경된 수량이 없습니다.';
    } catch (err) {
      $('#tx-error').textContent = err.message;
      return;
    }
    txDialog.close();
    commit(message);
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  });

  // ---- 검색·정렬·필터 ----

  ['#search', '#category-filter', '#low-only'].forEach((s) => $(s).addEventListener('input', renderItems));
  ['#history-search', '#history-type', '#history-from', '#history-to'].forEach((s) => $(s).addEventListener('input', renderHistory));

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      sort = { key, dir: sort.key === key ? -sort.dir : 1 };
      renderItems();
    });
  });

  // ---- 데이터 (CSV / 백업) ----

  $('#btn-export-items').addEventListener('click', () => download(`품목_${today()}.csv`, itemsToCsv(state.items)));
  $('#btn-export-tx').addEventListener('click', () => download(`입출고이력_${today()}.csv`, transactionsToCsv(filteredHistory().reverse())));
  $('#btn-backup').addEventListener('click', () => download(`재고백업_${today()}.json`, JSON.stringify(state, null, 2), 'application/json'));

  $('#import-csv').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = importItemsCsv(state, await file.text());
      commit(`가져오기 완료: 추가 ${r.added}건, 갱신 ${r.updated}건${r.errors.length ? `, 오류 ${r.errors.length}건` : ''}`);
      if (r.errors.length) alert(`다음 행은 가져오지 못했습니다.\n\n${r.errors.slice(0, 20).join('\n')}`);
    } catch (err) {
      alert(err.message);
    }
  });

  $('#restore-json').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!isValidState(data)) throw new Error('올바른 백업 파일이 아닙니다.');
      if (!confirm('현재 데이터를 백업 파일 내용으로 덮어쓸까요?')) return;
      state = data;
      commit('백업을 복원했습니다.');
    } catch (err) {
      alert(err.message);
    }
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('모든 품목과 이력을 삭제할까요? 되돌릴 수 없습니다.')) return;
    state = createState();
    commit('초기화했습니다.');
  });

  $('#btn-sample').addEventListener('click', () => {
    if (state.items.length && !confirm('현재 데이터를 지우고 예시 데이터를 불러올까요?')) return;
    state = createState();
    const samples = [
      [{ sku: 'OF-001', name: 'A4 복사용지 (500매)', category: '사무용품', location: 'A-1', unit: '박스', price: 25000, minStock: 5 }, 12],
      [{ sku: 'OF-002', name: '볼펜 (흑)', category: '문구', location: 'A-2', unit: '자루', price: 500, minStock: 50 }, 30],
      [{ sku: 'OF-003', name: '스테이플러 심', category: '문구', location: 'A-2', unit: '갑', price: 1200, minStock: 10 }, 0],
      [{ sku: 'IT-001', name: 'USB-C 충전 케이블', category: 'IT', location: 'B-1', unit: '개', price: 8900, minStock: 10 }, 25],
      [{ sku: 'IT-002', name: '무선 마우스', category: 'IT', location: 'B-1', unit: '개', price: 19000, minStock: 3 }, 8],
    ];
    for (const [fields, qty] of samples) addItem(state, fields, qty);
    stockOut(state, 1, 4, '총무팀 요청');
    stockIn(state, 2, 20, '문구점 구매');
    stockOut(state, 4, 6, '신규 입사자 지급');
    commit('예시 데이터를 불러왔습니다.');
  });

  render();
})();
