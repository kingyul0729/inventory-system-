# 재고관리 시스템 — 디자인 시스템 규칙 (Figma 연동용)

Figma 디자인을 이 코드로 옮길 때 지켜야 할 규칙입니다. 코드를 기준으로 정리했습니다.

## 1. 가장 중요한 제약

- **빌드 도구·프레임워크 없음.** 순수 HTML + CSS + 바닐라 JS. React/Vue/Tailwind/번들러를 들여오지 않는다.
- **`index.html` 을 더블클릭(`file://`)해서도 동작해야 한다.**
  - `<script type="module">`, `import`/`export` 금지 → 일반 `<script>` 로 순서대로 로드.
  - 외부 CDN·웹폰트에 의존하지 않는다 (오프라인·파일 실행에서도 같은 모습이어야 함).
- 배포: GitHub Pages (`main` 브랜치 루트). 빌드 단계 없음 — 파일이 그대로 서비스된다.

## 2. 파일 구조

```
index.html          화면 뼈대 전부 (탭 4개 section + dialog 2개 + toast)
src/style.css       스타일 전부 (토큰 + 컴포넌트 + 반응형) — 단일 파일
src/inventory.js    재고 계산 로직 (DOM 없음, 전역 window.Inventory 로 공개)
src/app.js          렌더링·이벤트·저장 (IIFE, 'use strict')
test/*.test.js      로직 테스트 (node --test) — UI 테스트 없음
```

- 로드 순서: `src/inventory.js` → `src/app.js` (`index.html` 맨 아래).
- 새 화면 = `index.html` 에 `<section id="view-이름" class="view">` + 탭 버튼 `<button class="tab" data-view="이름">`.
- 로직(계산·검증)은 `inventory.js`, 화면은 `app.js`. 섞지 않는다.

## 3. 디자인 토큰 (`src/style.css` 맨 위 `:root`)

CSS 사용자 정의 속성이 유일한 토큰 체계다. 변환 도구(Style Dictionary 등) 없음.

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--bg` | `#f5f6f8` | `#0f1115` | 페이지 배경, 활성 탭 배경 |
| `--surface` | `#ffffff` | `#181b21` | 카드·표·입력·대화상자 |
| `--text` | `#1f2328` | `#e6e8eb` | 본문 |
| `--muted` | `#656d76` | `#9aa3ad` | 보조 글자, 표 머리글, 라벨 |
| `--border` | `#d8dee4` | `#2d333b` | 모든 테두리 |
| `--primary` / `--primary-text` | `#2563eb` / `#fff` | `#3b82f6` / `#fff` | 주 버튼 |
| `--warn` / `--warn-bg` | `#b45309` / `#fef3c7` | `#fbbf24` / `#3a2c0a` | 안전재고 미달 |
| `--danger` / `--danger-bg` | `#b91c1c` / `#fee2e2` | `#f87171` / `#3b1414` | 품절·삭제·오류 |
| `--in` / `--out` / `--adjust` | `#047857` / `#b91c1c` / `#6d28d9` | `#34d399` / `#f87171` / `#a78bfa` | 입고·출고·조정 배지 |

```css
:root { --primary: #2563eb; /* … */ }
@media (prefers-color-scheme: dark) { :root { --primary: #3b82f6; /* … */ } }
```

**규칙**
- Figma 변수 → 위 토큰 이름으로 매핑. 새 색이 필요하면 `:root` **와** 다크 블록 **둘 다**에 추가한다.
- 컴포넌트 CSS 에 색 값(hex)을 직접 쓰지 않는다. 예외: `dialog::backdrop` 의 `rgba(0,0,0,.4)`.
- 다크 모드는 OS 설정(`prefers-color-scheme`)만 따른다. 수동 전환 스위치 없음.

**타이포·간격·모서리 (토큰화되지 않은 고정값 — 이 값에 맞춘다)**

| 항목 | 값 |
|---|---|
| 글꼴 | `system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` (웹폰트 없음) |
| 글자 크기 | 본문 14 · 표머리/라벨 13 · 작은 버튼/배지 12 · 패널 제목 15 · 대화상자 제목 17 · 앱 제목 18 · 통계 숫자 22 (px) |
| 숫자 | 금액·수량은 `.num` (오른쪽 정렬 + `tabular-nums`) |
| 간격 | 기본 단계 4 · 8 · 12 · 16 · 20 · 24 px. 예외(현재 코드): 입력·셀렉트 `7px 10px`, 표 셀 `8px 10px`, 토스트 `10px 16px`, 통계 카드 `14px 16px`, 작은 버튼 `3px 8px`, 배지 `1px 8px`, `code` `1px 4px`, 표 안 버튼 사이 `2px` — 새 컴포넌트는 기본 단계를 쓴다 |
| 모서리 | `code` 4 · 입력·버튼 6 · 토스트 8 · 카드/표 10 · 대화상자 12 · 배지 999(알약) |

## 4. 컴포넌트 (CSS 클래스 + 기본 HTML 요소)

컴포넌트 라이브러리·Storybook 없음. **"컴포넌트" = `style.css` 의 클래스 + 기본 요소**다.

| 컴포넌트 | 마크업 | 변형 |
|---|---|---|
| 탭 | `<button class="tab" data-view="items">` | `.active` |
| 화면 | `<section id="view-items" class="view">` | `.active` 만 보임 |
| 통계 카드 | `<div class="stat"><span>라벨</span><strong id>값</strong></div>` | `.warn`, `.danger` |
| 패널(카드) | `<div class="panel"><h2>제목</h2>…</div>` | 목록은 `.panels`(자동 그리드) |
| 툴바 | `<div class="toolbar">` 검색·필터·버튼 한 줄 | — |
| 버튼 | `<button>` / 파일 선택은 `<label class="button">` | `.primary`, `.danger`, `.small` |
| 표 | `<div class="table-wrap"><table>…` | 행 `.low`/`.out`, 셀 `.num`/`.ops`, 정렬 머리글 `th[data-sort]` + `.asc`/`.desc` |
| 배지 | `<span class="badge IN">입고</span>` | `IN`, `OUT`, `ADJUST` (거래 유형 값 그대로) |
| 대화상자 | `<dialog>` + `<form method="dialog">` + `.grid` 라벨 + `.actions` | `.grid.one`(1열) |
| 폼 오류 | `<p class="error">` | — |
| 빈 상태 | `<p class="empty">` / `td.empty` | — |
| 토스트 | `#toast` (하나뿐) | `.show` |

**동적 화면은 `app.js` 의 `el()` 로 만든다** (innerHTML 금지 — 사용자 입력이 글자로만 들어가 XSS 안전):

```js
el('tr', { class: i.quantity === 0 ? 'out' : isLowStock(i) ? 'low' : '' },
  el('td', {}, i.name),
  el('td', { class: 'num' }, fmtNum(i.quantity)),
  el('td', { class: 'ops' },
    el('button', { class: 'small', onclick: () => openTxDialog(i.id, TX_IN) }, '입고')));
```

- 목록 갱신: `$('#items-body').replaceChildren(...rows)`.
- 상태 변경 후에는 항상 `commit(message)` → 저장 + `render()` 전체 재그리기 + 토스트.
- 대화상자 열기 `dialog.showModal()`, 닫기 버튼은 `data-close` 속성.

## 5. 아이콘·에셋

- **아이콘 시스템 없음.** 이미지·SVG·아이콘 폰트 파일이 하나도 없다.
- 현재 쓰는 기호: 정렬 표시 `▲`/`▼` (CSS `::after` 문자), 추가 버튼 `+`.
- Figma 에 아이콘이 있으면 **인라인 SVG** 로 넣고 `fill="currentColor"` 로 토큰 색을 따르게 한다. 외부 아이콘 CDN 금지 (`file://` 동작 규칙).
  - **정적 아이콘**: `index.html` 마크업 안에 `<svg>…</svg>` 를 직접 쓴다 (HTML 파서가 SVG 로 만든다).
  - **동적 아이콘**: `el()` 은 `document.createElement` 로 **HTML 요소만** 만든다 → `el('svg', …)`/`el('path', …)` 는 화면에 안 나온다. `el()` 은 그대로 두고, SVG 는 `document.createElementNS('http://www.w3.org/2000/svg', 'svg')` 로 만든 뒤 `el()` 의 자식으로 넘긴다 (`el()` 은 `Node` 자식을 그대로 붙인다).
    ```js
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', 'M7 2h2v12H7zM2 7h12v2H2z');   // 채움(fill) 도형
    svg.append(path);
    el('button', { class: 'small' }, svg, ' 추가');
    ```
- 이미지가 꼭 필요하면 `assets/` 폴더를 만들고 **상대 경로**(`assets/x.svg`)로 참조. 최적화 파이프라인·CDN 없음 → 올리기 전에 직접 압축.

## 6. 스타일링 방식

- 전역 CSS 한 파일, 평범한 클래스 이름(BEM·CSS Modules·CSS-in-JS 아님). 상태는 `.active`/`.low`/`.show` 같은 수식 클래스로.
- 요소 선택자 기본 스타일 있음: `input, select, button` 공통 모양, `table`, `dialog`, `code`.
- 레이아웃: Flexbox(툴바·탭·행) + Grid(`.stats`, `.panels`, `.grid`). 본문 최대 폭 `1280px` 가운데 정렬.
- **반응형**: 자동 그리드(`repeat(auto-fit, minmax(...))`) 가 기본, 중단점은 **`max-width: 640px` 하나**
  (여백 24→16px, 폼·패널 1열). 넓은 표는 `.table-wrap`/`.panel` 의 가로 스크롤.
- 새 스타일은 `style.css` 의 해당 컴포넌트 근처에 추가. 인라인 `style=""` 쓰지 않는다.

## 7. Figma → 코드 작업 순서

1. Figma 변수/스타일을 3장의 토큰 표와 대조 → 없는 것만 `:root` + 다크 블록에 추가.
2. Figma 컴포넌트를 4장 표의 클래스에 매핑. 맞는 게 없을 때만 새 클래스 추가.
3. 정적 부분은 `index.html`, 데이터에 따라 바뀌는 부분은 `app.js` 의 `render*()` 안에서 `el()` 로.
4. 확인: `index.html` 더블클릭으로 열어 라이트/다크, 폭 375px·1280px 에서 확인. 로직을 바꿨으면 `npm test`.
