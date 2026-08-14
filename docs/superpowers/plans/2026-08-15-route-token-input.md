# 경로 토큰 입력 (ForeFlight식 알약) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경로 문자열 입력칸을 토큰(알약) 입력으로 바꾼다 — 스페이스/엔터로 토큰이 확정되고, 종류별 색이 붙고, 그 순간 지도와 요약이 같이 갱신된다.

**Architecture:** 토큰 판정은 화면과 분리된 순수 모듈(`lib/routeTokens.js`)이 맡는다. 입력칸(`RouteTokenField.jsx`)은 알약을 그리고, 타이핑은 알약 사이를 옮겨다니는 진짜 `<input>` 하나가 처리한다 — 커서·선택·붙여넣기·모바일 키보드를 직접 다루지 않기 위해서다. 토큰 목록이 경로의 유일한 원본이고, 위쪽 선택기는 그 목록을 고치는 두 번째 편집기다.

**Tech Stack:** React 18, Vite, `node --test` (node:test + node:assert/strict), Fluent UI (`shared/ui/fluent.js`), 순수 CSS

## Global Constraints

- **스펙:** [경로 토큰 입력 설계 스펙](../specs/2026-08-15-route-token-input-design.md). 스펙의 결정 10개를 임의로 바꾸지 않는다
- **Linux 전용.** `npm`, `node`, `bash`만 쓴다. PowerShell·`.cmd`·`C:\` 경로 금지
- **시험 실행:** `cd frontend && node --test <파일경로>`. 전체는 `node --test $(find src -name "*.test.js" | tr '\n' ' ')`
- **빌드 확인:** `cd frontend && npx vite build --mode development`
- **깨뜨리면 안 되는 시험:** `lib/manualRouteInput.test.js` · `lib/routeEditor.test.js` · `lib/routePreview.test.js` · `lib/routePreview.interaction.test.js` · `lib/routeDesigns.test.js` · `useRouteBriefing.selection.test.js` · `RouteBriefing.mobile-alternatives.test.js` · `RouteBriefing.mobile-summary.test.js`
- **색값은 스펙 표 그대로.** 공항 `#d3e3f7`/`#1c3f66` · 절차 `#d7ecd0`/`#2f5d3a` · 항공로 `#cdeaea`/`#14595c` · 지점 `#dcdcf3`/`#3b3a8c` · 오류 `#fee2e2`/`#c0291f`(테두리 `1.5px #c0291f`) · DCT 알약없음 `#64748b`
- **빨강은 오직 오류.** 경로 칸 안에서 빨강은 다른 뜻을 갖지 않는다
- **모션은 [UI 모션 스펙](../specs/2026-08-15-ui-motion-design.md)의 토큰을 쓴다.** `var(--motion-fast)` `var(--motion-enter)`. 요약 숫자는 즉시 교체하며 부드럽게 굴리지 않는다
- **한글·비ASCII 편집 시** [encoding safety](../../policies/encoding-safety.md)를 먼저 읽는다. 이 계획의 파일들은 한글 주석·문구를 포함한다
- 모든 경로는 `frontend/` 기준. 예: `src/features/route-briefing/lib/routeTokens.js`

---

## File Structure

| 파일 | 책임 |
| --- | --- |
| `src/features/route-briefing/lib/routeTokens.js` (신규) | 글자 → 토큰 종류 판정. 순수 계산, 화면 없음 |
| `src/features/route-briefing/lib/routeTokens.test.js` (신규) | 판정기 시험 |
| `src/features/route-briefing/RouteTokenField.jsx` (신규) | 알약 그리기 + 입력칸 이동. 표시 전용, 경로 상태를 모름 |
| `src/features/route-briefing/RouteTokenField.test.js` (신규) | 입력칸 동작 시험 (JSX 소스 검사 방식 — 아래 Task 3 참조) |
| `src/features/route-briefing/RouteTokenField.css` (신규) | 알약 스타일 |
| `src/features/route-briefing/RouteBriefingPanel.jsx` (수정) | 칸 교체, 「경로 적용」 제거, 색깔 줄 제거, 아래 한 줄 추가, `canSearch` 완화 |
| `src/features/route-briefing/useRouteBriefing.js` (수정) | 토큰 목록을 원본으로, 선택기 ↔ 목록 연결, 오류 시 지도 보류 |
| `src/features/route-briefing/lib/routeBriefingModel.js` (수정) | `ROUTE_SEQUENCE_COLORS` 교체 |

판정기를 화면에서 분리하는 이유: 판정은 글자를 받아 종류를 돌려주는 순수한 계산이라 화면 없이 시험할 수 있어야 한다. 이 규칙이 흐려지면 색 하나 고치는 데도 화면을 띄워야 한다.

---

## Task 1: 토큰 판정기

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routeTokens.js`
- Test: `frontend/src/features/route-briefing/lib/routeTokens.test.js`

**Interfaces:**
- Consumes: `parseCoordinateToken` from `./manualRouteInput.js`, `KNOWN_AIRPORTS` from `./procedureData.js`
- Produces:
  - `TOKEN_KINDS` — `{ AIRPORT: 'airport', PROCEDURE: 'procedure', AIRWAY: 'airway', FIX: 'fix', COORDINATE: 'coordinate', DCT: 'dct', ERROR: 'error' }`
  - `classifyToken(text, lookups) -> { kind, text, reason }` — `lookups`는 `{ airports: string[], navpoints: object, routes: object, procedures: string[] }`. `reason`은 `kind === 'error'`일 때만 채워진다
  - `classifyTokens(texts, lookups) -> Array<{ kind, text, reason }>`
  - `errorCount(tokens) -> number`

- [ ] **Step 1: Write the failing test**

`frontend/src/features/route-briefing/lib/routeTokens.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { TOKEN_KINDS, classifyToken, classifyTokens, errorCount } from './routeTokens.js'

const lookups = {
  airports: ['RKSS', 'RKPC'],
  navpoints: { DOTOL: { lat: 33.5, lon: 126.5 }, BULTI: { lat: 37.1, lon: 126.9 } },
  routes: { Y711: {}, Y697: {} },
  procedures: ['32L.BULT2Q.BULTI', 'DOTOL.DOTO2P', 'ILS Y RWY 07'],
}

test('classifies each token kind', () => {
  assert.equal(classifyToken('RKSS', lookups).kind, TOKEN_KINDS.AIRPORT)
  assert.equal(classifyToken('Y711', lookups).kind, TOKEN_KINDS.AIRWAY)
  assert.equal(classifyToken('DOTOL', lookups).kind, TOKEN_KINDS.FIX)
  assert.equal(classifyToken('DCT', lookups).kind, TOKEN_KINDS.DCT)
  assert.equal(classifyToken('32L.BULT2Q.BULTI', lookups).kind, TOKEN_KINDS.PROCEDURE)
  assert.equal(classifyToken('N3721.4E12712.8', lookups).kind, TOKEN_KINDS.COORDINATE)
})

test('lowercase input is accepted and normalized', () => {
  const token = classifyToken('rkss', lookups)
  assert.equal(token.kind, TOKEN_KINDS.AIRPORT)
  assert.equal(token.text, 'RKSS')
})

test('unknown tokens become errors with a kind-specific reason', () => {
  assert.equal(classifyToken('GONXA', lookups).reason, 'GONXA — 그런 지점이 없습니다')
  assert.equal(classifyToken('Y999', lookups).reason, 'Y999 — 그런 항공로가 없습니다')
  assert.equal(classifyToken('RKZZ', lookups).reason, 'RKZZ — 그런 공항이 없습니다')
})

test('counts errors across a token list', () => {
  const tokens = classifyTokens(['RKSS', 'GONXA', 'Y999', 'RKPC'], lookups)
  assert.equal(errorCount(tokens), 2)
  assert.equal(tokens[0].kind, TOKEN_KINDS.AIRPORT)
  assert.equal(tokens[3].kind, TOKEN_KINDS.AIRPORT)
})

test('empty and whitespace input yields no tokens', () => {
  assert.deepEqual(classifyTokens([], lookups), [])
  assert.deepEqual(classifyTokens(['', '   '], lookups), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/lib/routeTokens.test.js`
Expected: FAIL — `Cannot find module './routeTokens.js'`

- [ ] **Step 3: Write minimal implementation**

`frontend/src/features/route-briefing/lib/routeTokens.js`:

```js
import { parseCoordinateToken } from './manualRouteInput.js'

export const TOKEN_KINDS = {
  AIRPORT: 'airport',
  PROCEDURE: 'procedure',
  AIRWAY: 'airway',
  FIX: 'fix',
  COORDINATE: 'coordinate',
  DCT: 'dct',
  ERROR: 'error',
}

// 판정 못 한 글자의 이유는 모양으로 추측한다. 오타인지 우리 자료에 없는 것인지
// 구분되어야 고칠 수 있다 — "알 수 없음" 한 마디로는 어디를 고칠지 알 수 없다.
const AIRPORT_SHAPE = /^[A-Z]{4}$/
const AIRWAY_SHAPE = /^[A-Z]\d{1,4}$/

function reasonFor(text) {
  if (AIRWAY_SHAPE.test(text)) return `${text} — 그런 항공로가 없습니다`
  if (AIRPORT_SHAPE.test(text) && text.startsWith('RK')) return `${text} — 그런 공항이 없습니다`
  return `${text} — 그런 지점이 없습니다`
}

export function classifyToken(text, lookups = {}) {
  const value = String(text ?? '').trim().toUpperCase()
  const { airports = [], navpoints = {}, routes = {}, procedures = [] } = lookups

  if (!value) return null
  if (value === 'DCT') return { kind: TOKEN_KINDS.DCT, text: value }
  if (procedures.includes(value)) return { kind: TOKEN_KINDS.PROCEDURE, text: value }
  if (airports.includes(value)) return { kind: TOKEN_KINDS.AIRPORT, text: value }
  if (Object.prototype.hasOwnProperty.call(routes, value)) return { kind: TOKEN_KINDS.AIRWAY, text: value }
  if (Object.prototype.hasOwnProperty.call(navpoints, value)) return { kind: TOKEN_KINDS.FIX, text: value }

  try {
    if (parseCoordinateToken(value)) return { kind: TOKEN_KINDS.COORDINATE, text: value }
  } catch {
    // 좌표 모양이지만 범위를 벗어난 값 — 아래에서 오류로 떨어진다.
  }

  return { kind: TOKEN_KINDS.ERROR, text: value, reason: reasonFor(value) }
}

export function classifyTokens(texts = [], lookups = {}) {
  return texts.map((text) => classifyToken(text, lookups)).filter(Boolean)
}

export function errorCount(tokens = []) {
  return tokens.filter((token) => token?.kind === TOKEN_KINDS.ERROR).length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/lib/routeTokens.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/route-briefing/lib/routeTokens.js frontend/src/features/route-briefing/lib/routeTokens.test.js
git commit -m "feat(route): add the route token classifier"
```

---

## Task 2: 토큰 색 정의

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeBriefingModel.js:7-15` (`ROUTE_SEQUENCE_COLORS`)
- Modify: `frontend/src/features/route-briefing/lib/routeTokens.js` (색표 추가)
- Test: `frontend/src/features/route-briefing/lib/routeTokens.test.js` (시험 추가)

**Interfaces:**
- Consumes: `TOKEN_KINDS` (Task 1)
- Produces: `TOKEN_COLORS` — `{ [kind]: { bg, fg, border? } }`

기존 `ROUTE_SEQUENCE_COLORS`는 `RouteBriefingPanel.jsx:459`의 색깔 줄에서만 쓰이며, 그 줄은 Task 5에서 없어진다. 이 Task에서는 새 색표만 더하고 기존 것은 건드리지 않는다 — 지우는 것은 쓰는 곳이 사라진 뒤다.

- [ ] **Step 1: Write the failing test**

`routeTokens.test.js`에 덧붙인다:

```js
import { TOKEN_COLORS } from './routeTokens.js'

test('every token kind has a color, and only the error kind has a border', () => {
  for (const kind of Object.values(TOKEN_KINDS)) {
    if (kind === TOKEN_KINDS.DCT) continue
    assert.ok(TOKEN_COLORS[kind], `${kind}에 색이 없습니다`)
    assert.match(TOKEN_COLORS[kind].fg, /^#[0-9a-f]{6}$/i)
  }
  // 색을 못 알아보는 경우에도 오류가 모양으로 구분되어야 한다.
  assert.ok(TOKEN_COLORS[TOKEN_KINDS.ERROR].border)
  assert.equal(TOKEN_COLORS[TOKEN_KINDS.AIRPORT].border, undefined)
})

test('red is reserved for errors', () => {
  const reds = Object.entries(TOKEN_COLORS)
    .filter(([, color]) => color.fg.toLowerCase() === '#c0291f')
    .map(([kind]) => kind)
  assert.deepEqual(reds, [TOKEN_KINDS.ERROR])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/lib/routeTokens.test.js`
Expected: FAIL — `TOKEN_COLORS`가 `undefined`

- [ ] **Step 3: Write minimal implementation**

`routeTokens.js`에 덧붙인다:

```js
// 스펙 표 그대로. ForeFlight 배색을 따르되 주황을 쓰지 않는다 — 주황·황색은 이 앱에서
// 난류·주의 등급이 이미 쓰고 있다. 절차 셋을 한 묶음으로 합쳤으므로 ForeFlight가
// 접근절차에 쓰던 청록 자리가 비고, 항공로가 그 자리를 쓴다.
// 초록은 VFR·"좋음"과 겹치지만, 알약이 연하고 안에 든 것이 절차 이름이라 기상 표시로
// 읽힐 위험은 낮다고 보았다. 혼동이 생기면 청회색 계열로 옮긴다.
export const TOKEN_COLORS = {
  [TOKEN_KINDS.AIRPORT]: { bg: '#d3e3f7', fg: '#1c3f66' },
  [TOKEN_KINDS.PROCEDURE]: { bg: '#d7ecd0', fg: '#2f5d3a' },
  [TOKEN_KINDS.AIRWAY]: { bg: '#cdeaea', fg: '#14595c' },
  [TOKEN_KINDS.FIX]: { bg: '#dcdcf3', fg: '#3b3a8c' },
  // 좌표는 이름 없는 점이다. 색을 하나 더 늘리는 대신 점선 테두리로만 구분한다.
  [TOKEN_KINDS.COORDINATE]: { bg: '#dcdcf3', fg: '#3b3a8c', border: '1px dashed #3b3a8c' },
  [TOKEN_KINDS.ERROR]: { bg: '#fee2e2', fg: '#c0291f', border: '1.5px solid #c0291f' },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/lib/routeTokens.test.js`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/route-briefing/lib/routeTokens.js frontend/src/features/route-briefing/lib/routeTokens.test.js
git commit -m "feat(route): define the token pill palette"
```

---

## Task 3: 토큰 입력칸 부품

**Files:**
- Create: `frontend/src/features/route-briefing/RouteTokenField.jsx`
- Create: `frontend/src/features/route-briefing/RouteTokenField.css`
- Test: `frontend/src/features/route-briefing/RouteTokenField.test.js`

**Interfaces:**
- Consumes: `TOKEN_KINDS`, `TOKEN_COLORS` (Tasks 1-2)
- Produces: `RouteTokenField` 기본 내보내기. props:
  - `tokens: Array<{ kind, text, reason }>` — 그릴 알약들
  - `onChange(nextTexts: string[])` — 알약 글자 목록이 바뀌었을 때. 판정은 부르는 쪽이 한다
  - `label: string` · `placeholder: string` · `disabled: boolean`

이 부품은 **경로를 모른다.** 알약을 그리고 글자 목록의 변경을 알릴 뿐이다. 판정도, 지도도, 서버도 모른다. 그래서 화면 없이 소스 검사만으로 계약을 지킬 수 있다.

이 저장소의 화면 부품 시험은 JSX 소스를 읽어 계약을 검사하는 방식이다(`BriefingView.responsive.test.js` 참조). 브라우저 없이 도는 시험이므로 같은 방식을 따른다. 실제 동작 확인은 Task 7의 브라우저 검증에서 한다.

- [ ] **Step 1: Write the failing test**

`frontend/src/features/route-briefing/RouteTokenField.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const jsx = readFileSync(new URL('./RouteTokenField.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./RouteTokenField.css', import.meta.url), 'utf8')

test('typing happens in a real input element, not a contenteditable', () => {
  // 커서·선택·붙여넣기·모바일 키보드를 직접 다루지 않기 위한 계약이다.
  assert.match(jsx, /<input/)
  assert.doesNotMatch(jsx, /contentEditable/i)
})

test('space and enter confirm a token, backspace removes the previous pill', () => {
  assert.match(jsx, /' '|Spacebar|key === 'Space'|=== ' '/)
  assert.match(jsx, /'Enter'/)
  assert.match(jsx, /'Backspace'/)
})

test('pills are not focusable text — they are drawn', () => {
  assert.doesNotMatch(jsx, /<input[^>]*className="rtf-pill/)
})

test('error pills carry a border so they are distinguishable without color', () => {
  assert.match(jsx, /TOKEN_COLORS/)
  assert.match(css, /\.rtf-pill/)
})

test('the field wraps to multiple lines instead of scrolling sideways', () => {
  // 긴 경로가 가로 스크롤로 숨으면 무엇을 쳤는지 한눈에 볼 수 없다.
  assert.match(css, /flex-wrap:\s*wrap/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/RouteTokenField.test.js`
Expected: FAIL — `ENOENT` (RouteTokenField.jsx 없음)

- [ ] **Step 3: Write minimal implementation**

`frontend/src/features/route-briefing/RouteTokenField.jsx`:

```jsx
import { useRef, useState } from 'react'
import { TOKEN_COLORS, TOKEN_KINDS } from './lib/routeTokens.js'
import './RouteTokenField.css'

// 알약은 그림이고, 타이핑은 알약 사이를 옮겨다니는 진짜 input 하나가 맡는다.
// 편집 영역 전체를 직접 다루면 커서·선택·붙여넣기·모바일 키보드를 전부 떠안게 된다.
export default function RouteTokenField({ tokens = [], onChange, label, placeholder = '', disabled = false }) {
  const inputRef = useRef(null)
  const [draft, setDraft] = useState('')
  // 입력칸이 놓인 자리. tokens.length면 맨 끝이다.
  const [caret, setCaret] = useState(tokens.length)

  const texts = tokens.map((token) => token.text)

  const commit = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const next = [...texts]
    next.splice(caret, 0, trimmed)
    onChange?.(next)
    setCaret(caret + 1)
    setDraft('')
  }

  const removeBefore = () => {
    if (caret === 0) return
    const next = [...texts]
    next.splice(caret - 1, 1)
    onChange?.(next)
    setCaret(caret - 1)
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (!draft.trim()) return
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft === '') {
      event.preventDefault()
      removeBefore()
    }
  }

  // 알약을 눌러도 키보드가 닫히지 않도록 기본 동작을 막고 초점을 입력칸에 유지한다.
  const moveCaret = (index) => (event) => {
    event.preventDefault()
    if (draft.trim()) commit(draft)
    setCaret(index)
    inputRef.current?.focus()
  }

  const renderPill = (token, index) => {
    const color = TOKEN_COLORS[token.kind]
    if (token.kind === TOKEN_KINDS.DCT) {
      return <span key={`${token.text}-${index}`} className="rtf-dct" onMouseDown={moveCaret(index)}>{token.text}</span>
    }
    return (
      <span
        key={`${token.text}-${index}`}
        className={`rtf-pill is-${token.kind}`}
        style={{ background: color?.bg, color: color?.fg, border: color?.border ?? '1px solid transparent' }}
        title={token.reason ?? undefined}
        onMouseDown={moveCaret(index)}
      >
        {token.text}
      </span>
    )
  }

  return (
    <label className="rtf">
      {label && <span className="rtf-label">{label}</span>}
      <div className="rtf-box" onMouseDown={moveCaret(tokens.length)}>
        {tokens.slice(0, caret).map(renderPill)}
        <input
          ref={inputRef}
          className="rtf-input"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={draft}
          placeholder={tokens.length === 0 ? placeholder : ''}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
        />
        {tokens.slice(caret).map((token, index) => renderPill(token, caret + index))}
      </div>
    </label>
  )
}
```

`frontend/src/features/route-briefing/RouteTokenField.css`:

```css
.rtf { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
.rtf-label { color: var(--text-2); }

/* 긴 경로는 접혀서 전부 보여야 한다. 가로 스크롤로 숨으면 무엇을 쳤는지 한눈에 안 보인다. */
.rtf-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 44px; /* iPad 터치 타깃 */
  padding: 6px 8px;
  border: 1px solid var(--stroke-1);
  border-radius: 8px;
  background: var(--bg-1);
  cursor: text;
}
.rtf-box:focus-within { border-color: var(--accent); }

.rtf-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  animation: rtf-pill-in var(--motion-fast) var(--motion-enter);
}

@keyframes rtf-pill-in {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: none; }
}

.rtf-dct { padding: 3px 2px; color: #64748b; font-size: 12.5px; font-weight: 700; }

.rtf-input {
  flex: 1 1 60px;
  min-width: 60px;
  border: 0;
  outline: none;
  background: none;
  font: inherit;
  font-weight: 700;
  text-transform: uppercase;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/RouteTokenField.test.js`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/route-briefing/RouteTokenField.jsx frontend/src/features/route-briefing/RouteTokenField.css frontend/src/features/route-briefing/RouteTokenField.test.js
git commit -m "feat(route): add the token input field component"
```

---

## Task 4: 토큰 목록을 원본으로 (오류 시 지도 보류 포함)

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Test: `frontend/src/features/route-briefing/useRouteBriefing.tokens.test.js` (신규)

**Interfaces:**
- Consumes: `classifyTokens`, `errorCount`, `TOKEN_KINDS` (Task 1), `loadNavdata` from `./lib/routePlanner.js`
- Produces: `useRouteBriefing`이 돌려주는 값에 추가
  - `routeTokens: Array<{ kind, text, reason }>`
  - `routeTokenErrors: Array<string>` — 이유 문구들
  - `setRouteTokenTexts(texts: string[]) -> void`

**핵심 규칙 (스펙 결정 5):** `errorCount > 0`이면 지도용 경로를 갱신하지 않는다. 마지막으로 성립했던 경로가 남는다.

- [ ] **Step 1: Write the failing test**

`frontend/src/features/route-briefing/useRouteBriefing.tokens.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./useRouteBriefing.js', import.meta.url), 'utf8')

test('exposes the token list and its errors', () => {
  assert.match(source, /routeTokens/)
  assert.match(source, /routeTokenErrors/)
  assert.match(source, /setRouteTokenTexts/)
})

test('the map is not updated while any token is in error', () => {
  // 스펙 결정 5. 화면에 보이는 경로는 항상 실제로 성립하는 경로여야 한다.
  // 주석 문구가 아니라 가드 자체를 확인한다 — 주석만 고쳐도 깨지는 시험은 쓸모가 없다.
  assert.match(source, /errorCount\([^)]*\)\s*>\s*0/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/useRouteBriefing.tokens.test.js`
Expected: FAIL — `routeTokens` 없음

- [ ] **Step 3: Write minimal implementation**

`useRouteBriefing.js` 위쪽 import에 더한다:

```js
import { classifyTokens, errorCount } from './lib/routeTokens.js'
```

상태와 판정을 더한다 (`navpointsById` 상태 근처, `:97` 부근):

```js
  const [routeTokenTexts, setRouteTokenTexts] = useState([])
  const [tokenLookups, setTokenLookups] = useState({ airports: [], navpoints: {}, routes: {}, procedures: [] })

  const routeTokens = useMemo(() => classifyTokens(routeTokenTexts, tokenLookups), [routeTokenTexts, tokenLookups])
  const routeTokenErrors = useMemo(
    () => routeTokens.filter((token) => token.reason).map((token) => token.reason),
    [routeTokens],
  )
```

판정 자료를 채운다 (`loadNavpoints`를 쓰던 효과 근처, `:370` 부근에서 같은 `loadNavdata` 결과를 함께 쓴다):

```js
    // 판정은 브라우저 안에서 끝난다 — 공항·항공로·지점 자료가 이미 여기 있다.
    // 서버에 묻는 것은 경로를 실제로 계산할 때뿐이고, 그것은 토큰이 확정된 뒤다.
    const navdata = await loadNavdata()
    if (!cancelled) {
      setTokenLookups((current) => ({
        ...current,
        airports: Object.keys(navdata.airports ?? {}),
        navpoints: navdata.navpoints ?? {},
        routes: navdata.routes ?? {},
      }))
    }
```

절차 목록은 공항에 딸려 있으므로(`getProcedures(airport, type)`) **토큰 목록 안의 공항에서 끌어온다.** 공항 토큰이 확정되면 그 공항의 절차를 불러 판정 자료에 넣는다 — 그래야 절차 토큰이 오류로 잡히지 않는다:

```js
  // 절차는 공항에 딸려 있다. 토큰 목록에 들어온 공항의 절차를 불러 판정 자료에 채운다.
  // 이 순서를 안 지키면 SID를 제대로 쳐도 "그런 지점이 없습니다"로 잡힌다.
  useEffect(() => {
    let cancelled = false
    const icaos = routeTokens.filter((token) => token.kind === TOKEN_KINDS.AIRPORT).map((token) => token.text)
    if (icaos.length === 0) return undefined
    Promise.all(icaos.flatMap((icao) => [getProcedures(icao, 'SID'), getProcedures(icao, 'STAR')]))
      .then((lists) => {
        if (cancelled) return
        setTokenLookups((current) => ({ ...current, procedures: procedureTokenForms(lists.flat()) }))
      })
      .catch(() => { /* 절차를 못 불러오면 그 토큰만 오류로 남는다 — 다른 판정은 계속된다 */ })
    return () => { cancelled = true }
  }, [routeTokens])
```

`getProcedures`와 `TOKEN_KINDS`를 import에 더한다:

```js
import { getProcedures } from './lib/procedureData.js'
import { classifyTokens, errorCount, procedureTokenForms, TOKEN_KINDS } from './lib/routeTokens.js'
```

**`procedureTokenForms`가 이 Task의 핵심이다.** `getProcedures`가 돌려주는 `label`은 `"BULT2Q (RWY 32L)"` 형태인데, 경로 문자열에 치는 절차는 `32L.BULT2Q.BULTI` 형태다. `label`을 그대로 대조하면 **절차를 제대로 쳐도 영원히 오류로 잡힌다.** 부품에서 조합해야 한다.

`lib/routeTokens.js`에 더한다 (Task 1의 파일에 함수 하나 추가):

```js
// 절차가 경로 문자열에 나타나는 형태를 만든다: 활주로.절차ID.연결FIX (예: 32L.BULT2Q.BULTI).
// getProcedures의 label("BULT2Q (RWY 32L)")은 사람이 읽는 이름이라 대조에 쓸 수 없다.
// 활주로를 빼고 치는 경우도 있으므로 절차 ID 단독형도 함께 받는다.
export function procedureTokenForms(procedures = []) {
  const forms = new Set()
  for (const procedure of procedures) {
    const id = procedure?.id
    if (!id) continue
    forms.add(id.toUpperCase())
    const fix = procedure.enrouteFix
    for (const runway of procedure.runways ?? []) {
      forms.add(fix ? `${runway}.${id}.${fix}`.toUpperCase() : `${runway}.${id}`.toUpperCase())
    }
  }
  return [...forms]
}
```

Task 1의 시험 파일에 이 시험을 함께 더한다:

```js
test('procedure token forms are built from parts, not from the human label', () => {
  const forms = procedureTokenForms([
    { id: 'BULT2Q', name: 'BULTI TWO QUEBEC', runways: ['32L', '32R'], enrouteFix: 'BULTI', label: 'BULT2Q (RWY 32L, 32R)' },
  ])
  assert.ok(forms.includes('32L.BULT2Q.BULTI'))
  assert.ok(forms.includes('32R.BULT2Q.BULTI'))
  assert.ok(forms.includes('BULT2Q'), '활주로를 빼고 치는 경우도 받아야 한다')
  assert.ok(!forms.some((form) => form.includes('(')), '사람이 읽는 이름은 대조에 쓰지 않는다')
})
```

지도 갱신을 막는다. 토큰이 바뀌어 경로를 다시 계산하는 자리에 다음 가드를 둔다:

```js
  // 오류가 있으면 지도용 경로를 갱신하지 않는다 — 마지막으로 성립했던 경로가 남는다.
  // "빨간 게 있으면 지도는 내 최신 입력이 아니다"가 이 화면의 한 줄 규칙이다.
  if (errorCount(routeTokens) > 0) return
```

돌려주는 객체에 더한다 (`:1929` 부근의 반환 블록):

```js
      routeTokens,
      routeTokenErrors,
      setRouteTokenTexts,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/useRouteBriefing.tokens.test.js`
Expected: PASS — 2 tests

기존 시험이 안 깨졌는지 함께 확인한다:
Run: `cd frontend && node --test $(find src/features/route-briefing -name "*.test.js" | tr '\n' ' ')`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/useRouteBriefing.tokens.test.js
git commit -m "feat(route): make the token list the route source of truth"
```

---

## Task 5: 패널 교체 — 칸·버튼·색깔 줄

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` — 데스크톱(`:587` 부근)과 모바일(`:715` 부근) 양쪽
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`
- Test: `frontend/src/features/route-briefing/RouteBriefing.tokenfield.test.js` (신규)

**Interfaces:**
- Consumes: `RouteTokenField` (Task 3), `routeTokens` · `routeTokenErrors` · `setRouteTokenTexts` (Task 4)
- Produces: 없음 (화면 배선)

없어지는 것: 「경로 적용」 버튼 · 안내문 「SID/STAR는 절차 선택에 따로 표시됩니다」 · 색깔 줄 `route-check-sequence`(`:459`).
`ROUTE_SEQUENCE_COLORS` import도 쓰는 곳이 없어지므로 함께 지운다.

- [ ] **Step 1: Write the failing test**

`frontend/src/features/route-briefing/RouteBriefing.tokenfield.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const jsx = readFileSync(new URL('./RouteBriefingPanel.jsx', import.meta.url), 'utf8')

test('both desktop and mobile use the shared token field', () => {
  assert.match(jsx, /import RouteTokenField/)
  const uses = jsx.match(/<RouteTokenField/g) ?? []
  assert.equal(uses.length, 2, '데스크톱과 모바일 두 곳에 있어야 한다')
})

test('the apply button and its stale help text are gone from both paths', () => {
  assert.doesNotMatch(jsx, /경로 적용/)
  assert.doesNotMatch(jsx, /SID\/STAR는 절차 선택에 따로 표시됩니다/)
  // 데스크톱 쪽 안내문과 요약 줄. 토큰 알약이 같은 정보를 이미 보여준다.
  assert.doesNotMatch(jsx, /초안을 입력한 뒤 경로 적용으로 확정하세요/)
  assert.doesNotMatch(jsx, /rb-route-plan/)
  // 두 경로 모두 옛 textarea가 남아 있으면 안 된다.
  assert.doesNotMatch(jsx, /routeDraftText/)
})

test('the read-only colored sequence row is gone', () => {
  // 입력칸과 결과 표시를 합쳤으므로 같은 것을 두 번 보여주지 않는다 (스펙 결정 3).
  assert.doesNotMatch(jsx, /route-check-sequence/)
  assert.doesNotMatch(jsx, /ROUTE_SEQUENCE_COLORS/)
})

test('the status and summary line replaces the button', () => {
  assert.match(jsx, /rtf-status/)
  assert.match(jsx, /error/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/RouteBriefing.tokenfield.test.js`
Expected: FAIL — `import RouteTokenField` 없음

- [ ] **Step 3: Write minimal implementation**

`RouteBriefingPanel.jsx` import에 더하고 `ROUTE_SEQUENCE_COLORS`는 뺀다:

```jsx
import RouteTokenField from './RouteTokenField.jsx'
```

`:459` 부근의 `route-check-sequence` 블록을 통째로 지운다.

**두 경로의 구조가 다르다. 각각 다른 덩이를 바꾼다:**

| | 지금 무엇이 있나 | 무엇을 지우나 |
| --- | --- | --- |
| 데스크톱 (`:635` 부근) | Fluent `<Field label={...}>` + `<textarea className={s.routeText}>` | `<Field>` 통째, 그 아래 `<small>` 안내문, `rb-route-plan` 요약 줄, `s.draftApply` 「경로 적용」 버튼 |
| 모바일 (`:752`) | `<label className="rb-route-string">` + `<textarea>` | `<label>` 통째 (안내 `<span>`과 「경로 적용」 버튼 포함) |

데스크톱의 `rb-route-plan` 줄(「적용된 기본 경로 · RKSI · SID 없음 → … 」)도 없앤다. 토큰 입력칸이 같은 정보를 알약으로 이미 보여주므로 두 번 보여주는 것이다.

양쪽 모두 다음으로 바꾼다:

```jsx
<RouteTokenField
  label={isIfr ? '경로' : '경로 (공항 · FIX · DCT · 좌표)'}
  placeholder="예: RKSI DCT GONAX DCT RKPK"
  tokens={routeTokens}
  onChange={setRouteTokenTexts}
/>
<div className="rtf-status">
  <span className="rtf-status-left">
    {routeTokenErrors.length > 0
      ? <button type="button" className="rtf-error-toggle" onClick={() => setErrorsOpen((open) => !open)}>
          {`⚠ ${routeTokenErrors.length} error`}
        </button>
      : (!routeForm.departureAirport
          ? '출발공항 없음 — 절차·공항 기상은 표시되지 않습니다'
          : '')}
  </span>
  <span className="rtf-status-right">{routeSummaryText}</span>
</div>
{errorsOpen && routeTokenErrors.length > 0 && (
  <ul className="rtf-error-list">
    {routeTokenErrors.map((reason) => <li key={reason}>{reason}</li>)}
  </ul>
)}
```

부품 위쪽에 상태와 요약 문구를 더한다:

```jsx
  const [errorsOpen, setErrorsOpen] = useState(false)
  // 요약 숫자는 즉시 교체한다. 중간에 지나가는 값은 어떤 경로에도 해당하지 않는다.
  const routeSummaryText = [
    routeResult?.totalDistanceNm ? `${Math.round(routeResult.totalDistanceNm)} NM` : null,
    etaDisplay || null,
  ].filter(Boolean).join(' · ')
```

`RouteBriefing.css`에 더한다:

```css
.rtf-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-3);
}
.rtf-error-toggle {
  border: 0;
  background: none;
  padding: 0;
  color: #c0291f;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.rtf-status-right { font-variant-numeric: tabular-nums; }
.rtf-error-list {
  margin: 6px 0 0;
  padding: 8px 10px 8px 24px;
  border-radius: 7px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 12px;
  animation: route-check-error-in var(--motion-base) var(--motion-enter);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/RouteBriefing.tokenfield.test.js`
Expected: PASS — 4 tests

Run: `cd frontend && npx vite build --mode development`
Expected: `✓ built`

- [ ] **Step 5: Commit**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/RouteBriefing.css frontend/src/features/route-briefing/RouteBriefing.tokenfield.test.js
git commit -m "feat(route): replace the route string field with token pills"
```

---

## Task 6: 선택기 연결과 공항 없는 경로

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx:274` (`canSearch`)
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js` (선택기 핸들러 → 토큰 목록)
- Test: `frontend/src/features/route-briefing/useRouteBriefing.tokens.test.js` (시험 추가)

**Interfaces:**
- Consumes: `setRouteTokenTexts` (Task 4)
- Produces: 없음

선택기(`handleDepartureAirportChange` · `handleArrivalAirportChange` · `handleSidChange` · `handleStarChange` · `handleIapChange`)는 토큰 목록의 해당 자리를 고친다. 반대 방향으로 서로를 갱신하지 않는다 — 그것이 입력이 튀는 사고를 만든다.

- [ ] **Step 1: Write the failing test**

`useRouteBriefing.tokens.test.js`에 덧붙인다:

```js
const panel = readFileSync(new URL('./RouteBriefingPanel.jsx', import.meta.url), 'utf8')

test('routes without airports are allowed', () => {
  // 경로 계산은 진입·이탈 FIX만 있으면 돌아간다 (routePlanner.js canBuildBriefingRoutePath).
  // 공항을 요구하던 것은 화면 쪽 조건 하나뿐이었다 (스펙 결정 8).
  assert.doesNotMatch(panel, /const canSearch = !!routeForm\.departureAirport && !!routeForm\.arrivalAirport/)
})

test('picking in a picker rewrites the token list, not a parallel copy', () => {
  // 선택기가 자기 상태를 따로 들고 토큰 목록과 서로 맞추면 입력이 튄다.
  // 목록을 고치는 통로가 하나뿐인지 확인한다.
  assert.match(source, /replaceTokenAt/)
  assert.match(source, /const replaceTokenAt = useCallback/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/useRouteBriefing.tokens.test.js`
Expected: FAIL — `canSearch` 줄이 그대로 있음

- [ ] **Step 3: Write minimal implementation**

`RouteBriefingPanel.jsx:274`를 바꾼다:

```jsx
  // 공항은 선택 사항이다. 경로 계산은 진입·이탈 FIX만 있으면 돌아가고, 공항이 없으면
  // 절차·공항 기상·공항 기준 ETD/ETA만 빠진다 — 그 사실은 상태 줄이 알린다.
  const canSearch = routeTokens.length > 0
```

`useRouteBriefing.js`의 선택기 핸들러들이 토큰 목록을 고치도록 바꾼다:

```js
  // 선택기는 토큰 목록을 고치는 두 번째 편집기다. 목록이 유일한 원본이므로
  // 여기서 별도의 상태를 따로 두지 않는다.
  const replaceTokenAt = useCallback((index, text) => {
    setRouteTokenTexts((texts) => {
      const next = [...texts]
      if (text) next[index] = text
      else next.splice(index, 1)
      return next
    })
  }, [])
```

각 핸들러에서 자기 자리를 고친다 — 출발공항은 0번, 목적지는 마지막.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/useRouteBriefing.tokens.test.js`
Expected: PASS — 4 tests

Run: `cd frontend && node --test $(find src -name "*.test.js" | tr '\n' ' ')`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/useRouteBriefing.tokens.test.js
git commit -m "feat(route): wire pickers to the token list and allow airportless routes"
```

---

## Task 7: 브라우저 검증

**Files:**
- 없음 (확인만)

시험이 통과했다는 것은 깨지지 않았다는 뜻이지 보기에 맞다는 증거가 아니다. [browser verification](../../policies/verification/browser-verification.md)과 [dev-server 절차](../../operations/dev-server-and-capture.md)를 따른다.

- [ ] **Step 1: 개발 서버를 띄우고 브리핑 패널을 연다**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: 데스크톱에서 확인한다**

- `RKSI` 치고 스페이스 → 회색 알약. `DCT` → 알약 없이 회색 글자. `GONAX` → 청록 알약
- `GONXA`(오타) → 빨간 알약 + 테두리, 아래 「⚠ 1 error」. 누르면 「GONXA — 그런 지점이 없습니다」
- **오류가 있는 동안 지도가 안 바뀌는지.** 이것이 스펙 결정 5이고 이 기능의 안전 규칙이다
- 오타를 고치면 지도가 즉시 따라오는지
- 빈 칸에서 백스페이스 → 앞 알약이 지워지는지
- 알약 사이를 눌러 중간에 끼워넣기
- 위쪽 SID 선택기에서 고르면 문자열의 그 자리가 바뀌는지
- **순서를 일부러 뒤집어서** 절차를 공항보다 먼저 쳐 본다. 절차가 잠깐 오류로 보였다가 공항을 친 뒤 제 색을 찾으면 정상이다. 공항을 쳤는데도 오류로 남으면 절차 목록을 못 불러온 것이다

- [ ] **Step 3: iPad 실기기에서 확인한다**

**이 설계에서 가장 위험한 지점이며 데스크톱에서는 재현되지 않는다.**

- 알약 사이를 눌러 입력칸이 옮겨갈 때 **키보드가 닫히지 않는지**
- 긴 경로를 쳤을 때 알약 줄이 여러 줄로 접히는 모양
- 밝은 곳에서 네 색이 구분되는지

- [ ] **Step 4: 결과를 상태 문서에 남긴다**

`docs/superpowers/status/2026-08-15-route-token-input.md`에 확인한 것과 남은 것을 적는다.

- [ ] **Step 5: Commit**

```bash
cd /home/john_doe/ProjectAMO
git add docs/superpowers/status/2026-08-15-route-token-input.md
git commit -m "docs(route): record token input browser verification"
```

---

## Self-Review

**스펙 적용 범위** — 결정 1·2는 Task 3(스페이스/엔터 확정)과 Task 4(같은 순간 갱신), 결정 3은 Task 5(색깔 줄 제거), 결정 4는 Task 5(오류 줄), 결정 5는 Task 4(지도 보류)와 Task 7 Step 2, 결정 6은 Task 3(백스페이스), 결정 7은 Task 6(선택기), 결정 8은 Task 6(`canSearch`), 결정 9는 Task 1(좌표 판정)과 Task 5(VFR 라벨), 결정 10은 Task 2(색 네 종류)가 맡는다.

**이름 일관성** — `TOKEN_KINDS` · `TOKEN_COLORS` · `classifyToken` · `classifyTokens` · `errorCount`(Task 1-2)를 Task 3-6이 같은 이름으로 쓴다. `routeTokens` · `routeTokenErrors` · `setRouteTokenTexts`(Task 4)를 Task 5-6이 같은 이름으로 쓴다.

**순서 의존 하나** — 절차 판정은 공항 판정 뒤에만 된다. 절차는 공항에 딸린 자료라 어느 공항인지 모르면 목록을 불러올 수 없다(`getProcedures(airport, type)`). Task 4가 토큰 목록의 공항에서 절차를 끌어오므로, 이용자가 **공항보다 절차를 먼저 치면 그 절차는 잠깐 오류로 보였다가 공항을 친 뒤 제 색을 찾는다.** 경로는 공항부터 치는 것이 자연스러운 순서라 실제로 걸릴 일은 드물지만, Task 7 브라우저 확인에서 이 순서를 일부러 뒤집어 확인한다.
