(function () {
  'use strict';

  const SETTINGS_KEY = 'inventory-system:consent-settings:v1';
  const DEFAULTS = {
    bizName: '', owner: '', bizNo: '', bizPhone: '', bizAddress: '',
    refundDays: '7', refundProcessDays: '3', retention: '거래 종료 후 5년',
    serviceName: '', extraUsage: '', extraRefund: '',
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let settings = loadSettings();
  let current = 'usage';

  // ---- 설정 저장 ----

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (parsed && typeof parsed === 'object') return { ...DEFAULTS, ...parsed };
    } catch { /* 저장소를 쓸 수 없으면 기본값 사용 */ }
    return { ...DEFAULTS };
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      toast('브라우저 저장소에 설정을 저장하지 못했습니다.');
    }
  }

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ---- 문서 템플릿 ----
  // <s data-s="키"> 는 설정값으로, <ul data-lines="키"> 는 여러 줄 설정값으로 채워진다.

  const S = (key) => `<span data-s="${key}"></span>`;
  const field = (label, name, type = 'text') =>
    `<tr><th>${label}</th><td><input name="${name}" type="${type}" autocomplete="off"></td></tr>`;
  const agree = (name) => `
    <div class="agree">
      <label><input type="radio" name="${name}" value="yes"> 동의함</label>
      <label><input type="radio" name="${name}" value="no"> 동의하지 않음</label>
    </div>`;

  const signArea = () => `
    <div class="sign-area">
      <div class="date"><input class="date-input" name="signDate" aria-label="작성일"></div>
      <div class="sign-row">
        <span>동의자(고객)</span>
        <div class="sign-box"><canvas></canvas><span class="hint">여기에 서명하세요</span></div>
        <span>(서명)</span>
        <button type="button" class="small sign-clear">서명 지우기</button>
      </div>
    </div>
    <div class="biz-footer">
      <strong>${S('bizName')}</strong><br>
      대표 ${S('owner')} · 사업자등록번호 ${S('bizNo')}<br>
      ${S('bizAddress')} · ${S('bizPhone')}
    </div>`;

  const DOCS = {
    usage: () => `
      <h2>이용동의서</h2>
      <p class="intro">본인은 ${S('bizName')}(이하 "회사")가 제공하는 ${S('serviceName')}을(를) 이용함에 있어
        아래 내용에 대하여 충분히 설명을 듣고 이해하였으며, 이에 동의합니다.</p>

      <h3>■ 이용자 정보</h3>
      <table>
        ${field('성명', 'name')}
        ${field('생년월일', 'birth')}
        ${field('연락처', 'phone', 'tel')}
        ${field('주소', 'address')}
        ${field('이용 내용', 'item')}
        ${field('이용 기간 / 금액', 'period')}
      </table>

      <h3>1. 이용 규정 (필수)</h3>
      <ol>
        <li>이용자는 회사가 안내한 이용 방법과 주의사항을 준수합니다.</li>
        <li>이용 요금은 계약 시 안내된 금액으로 하며, 결제가 완료된 후 이용이 개시됩니다.</li>
        <li>이용자의 고의 또는 과실로 상품·시설이 훼손되거나 분실된 경우 이용자가 그 손해를 배상합니다.</li>
        <li>천재지변 등 회사의 책임 없는 사유로 이용이 불가능한 경우 회사는 그에 대한 책임을 지지 않으며, 이 경우 이용 일정 조정 또는 환불 규정에 따라 처리합니다.</li>
        <li>이용자는 연락처 등 계약 정보가 변경된 경우 회사에 알려야 합니다.</li>
        <li>환불에 관한 사항은 별도의 환불동의서 및 관계 법령에 따릅니다.</li>
      </ol>
      <ul data-lines="extraUsage"></ul>
      ${agree('agreeTerms')}

      <h3>2. 개인정보 수집·이용 동의 (필수)</h3>
      <table>
        <tr><th>수집 항목</th><td>성명, 생년월일, 연락처, 주소</td></tr>
        <tr><th>수집·이용 목적</th><td>계약 체결 및 이행, 본인 확인, 결제·환불 처리, 이용 관련 안내</td></tr>
        <tr><th>보유·이용 기간</th><td>${S('retention')} (관계 법령에 따라 보존이 필요한 경우 해당 기간)</td></tr>
      </table>
      <p class="note">※ 개인정보 수집·이용에 동의하지 않을 권리가 있으나, 동의하지 않을 경우 서비스 이용 계약이 제한될 수 있습니다.</p>
      ${agree('agreePrivacy')}

      <h3>3. 마케팅·광고성 정보 수신 동의 (선택)</h3>
      <p>이벤트, 할인 등 혜택 안내를 문자·전화로 받는 것에 동의합니다. 동의하지 않아도 서비스 이용에 제한이 없으며, 언제든지 철회할 수 있습니다.</p>
      ${agree('agreeMarketing')}

      ${signArea()}`,

    refund: () => `
      <h2>환불동의서</h2>
      <p class="intro">본인은 ${S('bizName')}(이하 "회사")의 ${S('serviceName')} 환불 규정에 대하여
        아래와 같이 충분히 설명을 듣고 이해하였으며, 이에 동의합니다.</p>

      <h3>■ 거래 정보</h3>
      <table>
        ${field('성명', 'name')}
        ${field('연락처', 'phone', 'tel')}
        ${field('상품 / 서비스명', 'item')}
        ${field('구매(계약)일', 'buyDate')}
        ${field('결제 금액', 'amount')}
        ${field('결제 수단', 'payMethod')}
      </table>

      <h3>1. 환불(청약철회) 기준</h3>
      <ol>
        <li>상품을 받은 날(또는 계약일)로부터 <strong>${S('refundDays')}일 이내</strong>에 환불을 요청할 수 있습니다.</li>
        <li>상품이 표시·광고 내용과 다르거나 계약 내용과 다르게 이행된 경우, 받은 날부터 3개월 이내 또는 그 사실을 안 날(알 수 있었던 날)부터 30일 이내에 환불을 요청할 수 있습니다.</li>
      </ol>

      <h3>2. 환불이 제한되는 경우</h3>
      <ol>
        <li>이용자의 책임 있는 사유로 상품이 멸실 또는 훼손된 경우 (내용 확인을 위한 포장 훼손은 제외)</li>
        <li>이용자의 사용 또는 일부 소비로 상품의 가치가 현저히 감소한 경우</li>
        <li>시간이 지나 다시 판매하기 곤란할 정도로 상품의 가치가 현저히 감소한 경우</li>
        <li>복제가 가능한 상품의 포장을 훼손한 경우</li>
        <li>주문 제작 상품 등 환불 제한을 사전에 고지하고 이용자의 동의를 받은 경우</li>
      </ol>

      <h3>3. 환불 방법 및 비용</h3>
      <ol>
        <li>회사는 상품을 반환받은 날(서비스는 환불 요청일)부터 <strong>${S('refundProcessDays')}영업일 이내</strong>에 결제 수단으로 환불합니다. 카드 결제 취소는 카드사 일정에 따라 반영 시기가 달라질 수 있습니다.</li>
        <li>단순 변심에 의한 반품 배송비는 이용자가, 상품 하자·오배송에 의한 반품 배송비는 회사가 부담합니다.</li>
        <li>서비스를 일부 이용한 경우 이용분과 사전에 안내된 수수료를 공제한 금액을 환불합니다.</li>
      </ol>
      <ul data-lines="extraRefund"></ul>
      ${agree('agreeRefund')}

      <h3>■ 환불 계좌 (현금 결제 시)</h3>
      <table>
        ${field('은행', 'bank')}
        ${field('계좌번호', 'account')}
        ${field('예금주', 'holder')}
      </table>

      ${signArea()}`,
  };

  // ---- 렌더링 ----

  function renderDoc() {
    const doc = $('#doc');
    doc.innerHTML = DOCS[current]();
    $('.date-input', doc).value = todayKo();
    applySettings();
    setupSignature(doc);
  }

  function applySettings() {
    $$('[data-s]').forEach((el) => {
      const value = String(settings[el.dataset.s] ?? '').trim();
      el.textContent = value || '______';
    });
    $$('[data-lines]').forEach((ul) => {
      const lines = String(settings[ul.dataset.lines] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      ul.replaceChildren(...lines.map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }));
      ul.hidden = lines.length === 0;
    });
  }

  function todayKo() {
    const d = new Date();
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  // ---- 서명 ----

  function setupSignature(root) {
    const box = $('.sign-box', root);
    const canvas = $('canvas', box);
    const ctx = canvas.getContext('2d');
    let drawing = false;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';
      box.classList.remove('signed');
    }

    function point(e) {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    }

    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      ctx.beginPath();
      ctx.moveTo(...point(e));
      ctx.lineTo(...point(e));
      ctx.stroke();
      box.classList.add('signed');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      ctx.lineTo(...point(e));
      ctx.stroke();
    });
    const stop = () => { drawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    $('.sign-clear', root).addEventListener('click', resize);
    resize();
  }

  // ---- 이벤트 ----

  $$('.tab[data-doc]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.doc === current) return;
      current = tab.dataset.doc;
      $$('.tab[data-doc]').forEach((t) => t.classList.toggle('active', t === tab));
      renderDoc();
    });
  });

  const form = $('#settings-form');
  Object.entries(settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  form.addEventListener('input', (e) => {
    if (!e.target.name) return;
    settings[e.target.name] = e.target.value;
    saveSettings();
    applySettings();
  });
  if (!settings.bizName) $('#settings-panel').open = true;

  $('#btn-clear').addEventListener('click', () => {
    if (!confirm('입력한 고객 정보와 서명을 지울까요?')) return;
    renderDoc();
  });
  $('#btn-print').addEventListener('click', () => window.print());

  renderDoc();
})();
