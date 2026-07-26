# NOTAM 위치 결정과 발효 시간 판정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NOTAM이 실제로 어디에서 언제 발효되는지를 원문 기준으로 확정하고, 확정하지 못한 건은 조용히 빼는 대신 드러낸다.

**Architecture:** 위치 해석을 `backend/src/notam/notam-geometry.js` 한 곳에 모은다. 본문 좌표를 우선 쓰고, Q줄 원으로 검산한 뒤, 실패하면 KML 도형으로 내려가고, 그것도 없으면 `unresolved`를 반환한다. 경로 판정(`notam-briefing.js`)은 이 모듈의 결과만 소비하며 도형 형식을 직접 알지 않는다. 발효 시간은 이미 검증된 `shared/notam-schedule.js`를 브리핑 판정에 연결하는 것으로 끝낸다.

**Tech Stack:** Node.js ESM, `node --test` + `node:assert/strict` (백엔드), Playwright 계약 (프론트), React + Fluent UI.

**Spec:** `docs/superpowers/specs/2026-07-26-notam-geometry-and-schedule-design.md`

## Global Constraints

- Linux 전용. `git`, `npm`, `node`는 Linux 셸에서만 실행한다.
- 백엔드 테스트: `npm --prefix backend test` (내부적으로 `node --test`).
- 한글이 포함된 파일 편집은 `Edit`/`Write` 도구로만 한다. 셸 리다이렉션(`>`)으로 덮어쓰지 않는다.
- **개별 NOTAM을 위한 예외 분기를 넣지 않는다.** 문법 규칙으로 설명되지 않는 건은 4단계(위치 확인 불가) 또는 근사 경로로 보낸다.
- **위치를 확정하지 못한 건을 목록에서 제외하지 않는다.** `positionStatus: 'unresolved'`를 달아 내보낸다.
- **D) 시간표 해석 실패(`null`)는 발효 중으로 남긴다.** 꺼진 것으로 치지 않는다.
- **Q코드 → 분류 매핑(`SUBJECT_CATEGORY`)은 건드리지 않는다.**
- 정답표와 KML 스냅샷은 `backend/test/fixtures/notam-{2026-07-26.kml, geometry-truth-2026-07-26.json}`에 이미 커밋되어 있다. 수정하지 않는다.

## File Structure

| 파일 | 책임 |
| --- | --- |
| `backend/src/notam/notam-position-text.js` (신규) | E) 본문 → 문형·좌표·크기. 순수 문자열 해석만. |
| `backend/src/notam/notam-geometry.js` (신규) | 4단계 위치 결정. 본문 해석 결과와 KML 도형을 받아 최종 도형을 고른다. |
| `backend/src/parsers/notam-parser.js` (수정) | `C)PERM` 통과, 유실 집계, 위치 결정 호출. |
| `backend/src/processors/notam-processor.js` (수정) | 유실 건수 로그. |
| `backend/src/briefing/notam-briefing.js` (수정) | 회랑 판정, `positionStatus`, D) 시간표 반영. |
| `backend/src/briefing/schedule-window.js` (신규) | ETD~ETA 구간에 대한 D) 활성 여부. `isScheduleActiveAt` 위의 얇은 껍데기. |
| `frontend/src/features/route-briefing/BriefingBanner.jsx` (수정) | 저촉 항목 내용 표시, 위치불가 줄. |
| `frontend/src/features/route-briefing/BriefingView.css` (수정) | 위 스타일. |

`notam-position-text.js`와 `notam-geometry.js`를 나눈 이유: 앞은 문자열만 다루고 지오메트리를 모른다. 정답표 대조 테스트가 앞쪽만 때리면 되므로 실패 지점이 좁아진다.

---

### Task 1: E) 본문 해석 — 문형과 좌표

**Files:**
- Create: `backend/src/notam/notam-position-text.js`
- Test: `backend/test/notam-position-text.test.js`

**Interfaces:**
- Produces:
  - `parsePositionText(rawText)` → `{ kind, coords, radiusM, bufferNm, approximated }`
    - `kind`: `'circle' | 'polygon' | 'corridor' | null`
    - `coords`: `Array<{ lat: number, lon: number }>` (십진도)
    - `radiusM`: `number | null` (미터)
    - `bufferNm`: `number | null` (해리)
    - `approximated`: `boolean` — 호·반원·제외구역이 섞여 형상을 그대로 못 그린 경우
  - `extractEBody(rawText)` → `string`
  - `dmsToDecimal(token)` → `{ lat, lon } | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/notam-position-text.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePositionText, extractEBody, dmsToDecimal } from '../src/notam/notam-position-text.js'

test('extractEBody: E)부터 F)/G) 직전까지', () => {
  const raw = 'Q)RKRR/QWMLW/IV/BO/W/000/002/3736N12647E001\nA)RKSS B)2607251000 C)2608291200\nE)FIREWORKS WILL TAKE PLACE\nF)SFC G)200FT AMSL'
  assert.equal(extractEBody(raw).trim(), 'FIREWORKS WILL TAKE PLACE')
})

test('dmsToDecimal: 도분초 고정폭', () => {
  const p = dmsToDecimal('373547N1264720E')
  assert.ok(Math.abs(p.lat - 37.59639) < 1e-4)
  assert.ok(Math.abs(p.lon - 126.78889) < 1e-4)
})

test('dmsToDecimal: 소수 초', () => {
  const p = dmsToDecimal('364254.07N1273014.94E')
  assert.ok(Math.abs(p.lat - 36.71502) < 1e-4)
  assert.ok(Math.abs(p.lon - 127.50415) < 1e-4)
})

test('원: CIRCLE RADIUS ... CENTERED ON', () => {
  const r = parsePositionText('E)A CIRCLE RADIUS 100M CENTERED ON 373547N1264720E')
  assert.equal(r.kind, 'circle')
  assert.equal(r.coords.length, 1)
  assert.equal(r.radiusM, 100)
})

test('원: NM 단위와 소수 반경', () => {
  const r = parsePositionText('E)A CIRCLE RADIUS 1.07NM CENTERED ON 370905N1271906E')
  assert.equal(r.kind, 'circle')
  assert.ok(Math.abs(r.radiusM - 1981.6) < 1)
})

test('원: CIRCLE 단어 없이 PSN + RADIUS', () => {
  const r = parsePositionText('E)TEMPO OBST ERECTED\n1. PSN : 333013N1262923E\n2. RADIUS : 30M')
  assert.equal(r.kind, 'circle')
  assert.equal(r.radiusM, 30)
})

test('다각형: AREA BOUNDED BY', () => {
  const r = parsePositionText('E)AREA BOUNDED BY THE FOLLOWING 372333N1291339E-372500N1291500E-372600N1291200E')
  assert.equal(r.kind, 'polygon')
  assert.equal(r.coords.length, 3)
})

test('회랑: n NM EITHER SIDE OF LINE', () => {
  const r = parsePositionText('E)TEMPO RESTRICTED AREA ACT AS FLW: 1NM EITHER SIDE OF LINE 380836N1283554E-381033N1283630E')
  assert.equal(r.kind, 'corridor')
  assert.equal(r.bufferNm, 1)
  assert.equal(r.coords.length, 2)
})

test('줄바꿈으로 잘린 좌표를 되살린다', () => {
  const r = parsePositionText('E)AREA BOUNDED BY THE FOLLOWING 36242\n4N1262847E-370050N1261446E-365407N1261433E')
  assert.equal(r.kind, 'polygon')
  assert.equal(r.coords.length, 3)
  assert.ok(Math.abs(r.coords[0].lat - 36.40667) < 1e-4)
})

test('문형에 안 걸리면 좌표가 있어도 위치로 쓰지 않는다', () => {
  // Z0479/26: 좌표는 대체 웨이포인트지 이 NOTAM의 위치가 아니다
  const r = parsePositionText('E)SOT VORTAC U/S. USE 370500N1270100E INSTEAD OF SOT')
  assert.equal(r.kind, null)
})

test('꼭짓점이 3개 미만인 다각형은 버린다', () => {
  // E3296/26: 원본에서 꼭짓점이 중복되어 사각형이 3점으로 온다
  const r = parsePositionText('E)AREA BOUNDED BY THE FOLLOWING 355434N1292856E-355434N1292856E-355500N1292900E')
  assert.equal(r.kind, null)
})

test('호·반원·제외구역은 근사 표시', () => {
  const r = parsePositionText('E)A SEMICIRCLE, 360118N1281017E - A CLOCKWISE 3NM ARC CENTERED ON 360243N1281333E EXC A CIRCLE RADIUS 1.5NM CENTERED ON 360243N1281333E')
  assert.equal(r.approximated, true)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- --test-name-pattern="extractEBody"
```

기대: `Cannot find module '../src/notam/notam-position-text.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`backend/src/notam/notam-position-text.js`:

```js
// E) 본문 문자열 → 문형·좌표·크기. 지오메트리는 모른다(notam-geometry.js가 만든다).
// 원문은 일정 폭에서 개행되며 좌표 한가운데가 끊긴다(`36242` + 개행 + `4N1262847E`).
// 그래서 판정 전에 공백을 모두 제거한다 — 이걸 빼면 실측 80건에서 좌표 84개를 놓친다.

const M_PER_NM = 1852
const COORD = /\d{6}(?:\.\d+)?[NS]\d{7}(?:\.\d+)?[EW]/g

export function extractEBody(rawText) {
  const m = String(rawText || '').match(/E\)([\s\S]*?)(?:\n\s*[FG]\)|$)/)
  return m ? m[1] : ''
}

// DDMMSS[.s]N/S DDDMMSS[.s]E/W — 자리수가 고정이라 끊어 읽는 지점이 모호하지 않다.
export function dmsToDecimal(token) {
  const m = String(token || '').match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])$/)
  if (!m) return null
  const lat = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * (m[4] === 'N' ? 1 : -1)
  const lon = (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600) * (m[8] === 'E' ? 1 : -1)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

function toMeters(value, unit) {
  const v = Number(value)
  if (!Number.isFinite(v)) return null
  const u = String(unit).toUpperCase()
  return u === 'NM' ? v * M_PER_NM : u === 'KM' ? v * 1000 : v
}

const none = () => ({ kind: null, coords: [], radiusM: null, bufferNm: null, approximated: false })

export function parsePositionText(rawText) {
  const tight = extractEBody(rawText).replace(/\s+/g, '').toUpperCase()
  const coords = (tight.match(COORD) || []).map(dmsToDecimal).filter(Boolean)
  // 호·반원·제외구역이 섞이면 형상을 그대로 못 그린다 — 넓게 덮되 근사임을 알린다.
  const approximated = /\bARC|SEMICIRCLE|EXC/.test(tight) && coords.length > 0

  // 순서가 중요하다. 넓은 개념부터 걸러야 안쪽에 박힌 단어(EXC A CIRCLE 등)에 낚이지 않는다.
  if (/EITHERSIDE/.test(tight) && coords.length >= 2) {
    const m = tight.match(/(\d+(?:\.\d+)?)(NM|KM|M)EITHERSIDE/)
    return { kind: 'corridor', coords, radiusM: null, bufferNm: m ? toMeters(m[1], m[2]) / M_PER_NM : null, approximated }
  }
  if (/BOUNDEDBY/.test(tight)) {
    // 중복 제거 후 3점 미만이면 면을 이루지 못한다(원본 결함 — 우리가 메울 수 없다).
    const uniq = coords.filter((p, i) => coords.findIndex((q) => q.lat === p.lat && q.lon === p.lon) === i)
    if (uniq.length < 3) return none()
    return { kind: 'polygon', coords: uniq, radiusM: null, bufferNm: null, approximated }
  }
  if (/CIRCLE|RADOF/.test(tight) && coords.length >= 1) {
    const m = tight.match(/RADIUS[:：]?(\d+(?:\.\d+)?)(NM|KM|M)/) || tight.match(/(\d+(?:\.\d+)?)(NM|KM|M)RAD(?:IUS)?OF/)
    return { kind: 'circle', coords, radiusM: m ? toMeters(m[1], m[2]) : null, bufferNm: null, approximated }
  }
  if (/PSN[:：]/.test(tight) && /RADIUS[:：]?\d/.test(tight) && coords.length >= 1) {
    const m = tight.match(/RADIUS[:：]?(\d+(?:\.\d+)?)(NM|KM|M)/)
    return { kind: 'circle', coords, radiusM: m ? toMeters(m[1], m[2]) : null, bufferNm: null, approximated }
  }
  // 좌표가 있어도 위 문형에 안 걸리면 쓰지 않는다.
  // Z0479/26의 좌표는 대체 웨이포인트지 이 NOTAM의 위치가 아니다.
  return none()
}

export default { parsePositionText, extractEBody, dmsToDecimal }
```

- [ ] **Step 4: 테스트 통과를 확인한다**

```bash
npm --prefix backend test
```

기대: 새 테스트 12개 PASS, 기존 테스트 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/notam/notam-position-text.js backend/test/notam-position-text.test.js
git commit -m "feat(notam): E) 본문에서 문형과 좌표를 읽는다"
```

---

### Task 2: 정답표 415건 전수 대조

**Files:**
- Test: `backend/test/notam-position-truth.test.js`
- Read-only: `backend/test/fixtures/notam-2026-07-26.kml`, `backend/test/fixtures/notam-geometry-truth-2026-07-26.json`

**Interfaces:**
- Consumes: Task 1의 `parsePositionText(rawText)`.
- Produces: 없음. 이 과제는 과녁이지 부품이 아니다.

**왜 지금인가:** 코드를 더 쓰기 전에 과녁을 세운다. 구현 후에 테스트를 만들면 내가 짠 것에 맞춰 과녁을 그리게 된다.

- [ ] **Step 1: 대조 테스트를 쓴다**

`backend/test/notam-position-truth.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parsePositionText } from '../src/notam/notam-position-text.js'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const truth = JSON.parse(readFileSync(here('./fixtures/notam-geometry-truth-2026-07-26.json'), 'utf8'))
const kml = readFileSync(here('./fixtures/notam-2026-07-26.kml'), 'utf8').replace(/\r/g, '\n')

// 원문만 뽑는다 — 파서를 거치지 않는다(정답표가 만들어진 방식과 동일한 입력).
const rawById = new Map()
for (const chunk of kml.split('<Placemark').slice(1)) {
  const pm = chunk.split('</Placemark>')[0]
  const cdata = (pm.match(/<!\[CDATA\[([\s\S]*?)\]\]>/) || [, ''])[1]
    .replace(/<br\s*\/?>/gi, '\n').replace(/<h3>[\s\S]*?<\/h3>/i, '').trim()
  const id = (cdata.match(/\(([A-Z]\d{4}\/\d{2})/) || [])[1]
  if (id) rawById.set(id, cdata)
}

// 정답표의 여섯 분류 → 파서가 내야 할 kind.
// point/named_area/none은 "본문에서 도형을 만들 수 없음" = null. KML 도형으로 내려간다.
const expectedKind = (shape) => (['circle', 'polygon', 'corridor'].includes(shape) ? shape : null)

test('정답표: 스냅샷과 정답표 건수가 맞는다', () => {
  assert.equal(truth.items.length, 415)
  assert.equal(rawById.size, 415)
})

test('정답표 전수: 문형 판정이 415건 전부 일치한다', () => {
  const wrong = []
  for (const t of truth.items) {
    const got = parsePositionText(rawById.get(t.id) || '').kind
    if (got !== expectedKind(t.shape)) wrong.push(`${t.id}: 정답 ${t.shape} → ${expectedKind(t.shape)}, 파서 ${got}`)
  }
  assert.deepEqual(wrong, [], `문형 불일치 ${wrong.length}건\n${wrong.join('\n')}`)
})

test('정답표 전수: 좌표 개수가 일치한다 (호·반원·제외구역 9건 제외)', () => {
  const skip = new Set(truth.knownHard.arcOrExclusion.ids)
  const wrong = []
  for (const t of truth.items) {
    if (skip.has(t.id) || !expectedKind(t.shape)) continue
    const got = parsePositionText(rawById.get(t.id) || '')
    // 다각형은 중복 꼭짓점을 제거하므로 정답표보다 적을 수 있다. 그 외는 정확히 같아야 한다.
    if (t.shape === 'polygon') assert.ok(got.coords.length <= t.coordTokens.length, `${t.id}`)
    else if (got.coords.length !== t.coordTokens.length) {
      wrong.push(`${t.id} (${t.shape}): 정답 ${t.coordTokens.length}개, 파서 ${got.coords.length}개`)
    }
  }
  assert.deepEqual(wrong, [], `좌표 개수 불일치 ${wrong.length}건\n${wrong.join('\n')}`)
})

test('정답표 전수: 반경·폭이 일치한다 (호·반원·제외구역 9건 제외)', () => {
  const skip = new Set(truth.knownHard.arcOrExclusion.ids)
  const M = { M: 1, KM: 1000, NM: 1852 }
  const wrong = []
  for (const t of truth.items) {
    if (skip.has(t.id)) continue
    const want = t.radius || t.corridorWidth
    if (!want) continue
    const got = parsePositionText(rawById.get(t.id) || '')
    const gotM = got.kind === 'corridor' ? (got.bufferNm == null ? null : got.bufferNm * 1852) : got.radiusM
    const wantM = Number(want.value) * (M[String(want.unit).toUpperCase()] ?? 1)
    if (gotM == null || Math.abs(gotM - wantM) > 1) {
      wrong.push(`${t.id}: 정답 ${wantM}m, 파서 ${gotM}m`)
    }
  }
  assert.deepEqual(wrong, [], `반경·폭 불일치 ${wrong.length}건\n${wrong.join('\n')}`)
})

test('알려진 어려운 건은 안전한 쪽으로 간다', () => {
  // 좌표가 있어도 위치가 아닌 건 — 본문에서 도형을 만들지 않는다
  for (const id of truth.knownHard.coordinateIsNotPosition.ids) {
    assert.equal(parsePositionText(rawById.get(id)).kind, null, id)
  }
  // 원본 결함(꼭짓점 부족) — 본문에서 도형을 만들지 않는다
  for (const id of truth.knownHard.sourceDefect.ids) {
    assert.equal(parsePositionText(rawById.get(id)).kind, null, id)
  }
  // 호·반원·제외구역 — 근사 표시가 붙는다
  for (const id of truth.knownHard.arcOrExclusion.ids) {
    assert.equal(parsePositionText(rawById.get(id)).approximated, true, id)
  }
})
```

- [ ] **Step 2: 실행해서 결과를 본다**

```bash
npm --prefix backend test -- --test-name-pattern="정답표"
```

기대: 전부 PASS. Task 1의 규칙은 이 정답표로 이미 검증했다(문형 415/415, 반경·폭 236/237이며 제외한 1건이 `E3260/26`).

**실패하면 파서를 정답표에 맞춰 특수분기로 때우지 않는다.** 규칙으로 설명되는 수정인지 먼저 판단하고, 아니면 `knownHard`에 근거를 적고 안전 경로로 보낸다.

- [ ] **Step 3: 커밋**

```bash
git add backend/test/notam-position-truth.test.js
git commit -m "test(notam): 정답표 415건 전수 대조를 과녁으로 세운다"
```

---

### Task 3: 위치 결정 4단계

**Files:**
- Create: `backend/src/notam/notam-geometry.js`
- Test: `backend/test/notam-geometry.test.js`

**Interfaces:**
- Consumes: Task 1의 `parsePositionText(rawText)`.
- Produces:
  - `resolveNotamGeometry({ rawText, kmlGeometry })` → `{ geometry, bufferNm, source, reason, approximated }`
    - `geometry`: GeoJSON `Polygon` 또는 `LineString`, 또는 `null`
    - `source`: `'text' | 'kml' | 'none'`
    - `reason`: `string | null` — `source: 'none'`일 때 이유
  - `qCircleFromRawText(rawText)` → `{ lat, lon, radiusNm } | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/notam-geometry.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveNotamGeometry, qCircleFromRawText } from '../src/notam/notam-geometry.js'

const RUNWAY = { // 김포 활주로 — 원본이 불꽃놀이에 잘못 붙여 준 도형
  type: 'Polygon',
  coordinates: [[[126.77809722, 37.57056527], [126.77845833, 37.57085138],
    [126.80732771, 37.54795088], [126.80696672, 37.54766477], [126.77809722, 37.57056527]]],
}
const FIREWORKS = [
  'Q)RKRR/QWMLW/IV/BO/W/000/002/3736N12647E001',
  'A)RKSS B)2607251000 C)2608291200',
  'E)FIREWORKS WILL TAKE PLACE AS FLW :',
  'A CIRCLE RADIUS 100M CENTERED ON 373547N1264720E',
  'F)SFC G)200FT AMSL',
].join('\n')

test('qCircleFromRawText: Q줄 끝의 좌표+반경', () => {
  const q = qCircleFromRawText(FIREWORKS)
  assert.ok(Math.abs(q.lat - 37.6) < 1e-6)
  assert.ok(Math.abs(q.lon - 126.78333) < 1e-4)
  assert.equal(q.radiusNm, 1)
})

test('본문 좌표가 KML 활주로 도형을 이긴다', () => {
  const r = resolveNotamGeometry({ rawText: FIREWORKS, kmlGeometry: RUNWAY })
  assert.equal(r.source, 'text')
  assert.equal(r.geometry.type, 'Polygon')
  // 공항이 아니라 북쪽 4.2km 지점 부근이어야 한다
  const lats = r.geometry.coordinates[0].map((p) => p[1])
  const mid = (Math.min(...lats) + Math.max(...lats)) / 2
  assert.ok(mid > 37.59 && mid < 37.60, `중심 위도 ${mid}`)
})

test('Q줄 원 밖으로 벗어난 본문 해석은 폐기하고 KML로 내려간다', () => {
  // 본문 좌표를 엉뚱한 곳(제주 남쪽)으로 바꾼다 — Q줄은 그대로 김포 부근
  const tampered = FIREWORKS.replace('373547N1264720E', '330000N1260000E')
  const r = resolveNotamGeometry({ rawText: tampered, kmlGeometry: RUNWAY })
  assert.equal(r.source, 'kml')
})

test('KML LineString이 닫힌 고리면 Polygon으로 닫는다', () => {
  const ring = [[127.0, 37.0], [127.1, 37.0], [127.1, 37.1], [127.0, 37.0]]
  const r = resolveNotamGeometry({
    rawText: 'E)RESTRICTED AREA RK R97E ACT',
    kmlGeometry: { type: 'LineString', coordinates: ring },
  })
  assert.equal(r.source, 'kml')
  assert.equal(r.geometry.type, 'Polygon')
  assert.equal(r.geometry.coordinates[0].length, 4)
})

test('본문도 KML도 없으면 unresolved', () => {
  const r = resolveNotamGeometry({ rawText: 'E)TWY E1 CLSD DUE TO WIP', kmlGeometry: null })
  assert.equal(r.source, 'none')
  assert.equal(r.geometry, null)
  assert.ok(r.reason)
})

test('회랑은 LineString + bufferNm으로 나온다', () => {
  const raw = [
    'Q)RKRR/QRTCA/IV/BO/W/000/100/3808N12836E020',
    'E)TEMPO RESTRICTED AREA ACT AS FLW: 1NM EITHER SIDE OF LINE 380836N1283554E-381033N1283630E',
  ].join('\n')
  const r = resolveNotamGeometry({ rawText: raw, kmlGeometry: null })
  assert.equal(r.geometry.type, 'LineString')
  assert.equal(r.bufferNm, 1)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- --test-name-pattern="qCircleFromRawText"
```

기대: `Cannot find module '../src/notam/notam-geometry.js'`

- [ ] **Step 3: 구현을 쓴다**

`backend/src/notam/notam-geometry.js`:

```js
// NOTAM 위치 결정. 본문 → (Q줄 검산) → KML → 위치 확인 불가.
// spec: docs/superpowers/specs/2026-07-26-notam-geometry-and-schedule-design.md
import { parsePositionText } from './notam-position-text.js'

const M_PER_NM = 1852
const CIRCLE_STEPS = 24 // KML이 원을 그리는 해상도와 같게 맞춘다(25점 = 24 + 닫는 점)
const Q_SLACK_NM = 1 // Q줄 좌표는 분 단위 반올림이라 최대 약 900m 오차가 있다

// Q)…/lower/upper/DDMMN DDDMME RRR — 끝의 좌표+반경(NM)
export function qCircleFromRawText(rawText) {
  const m = String(rawText || '').match(/Q\)[^\n]*?\/(\d{4})([NS])(\d{5})([EW])(\d{3})/)
  if (!m) return null
  const lat = (Number(m[1].slice(0, 2)) + Number(m[1].slice(2)) / 60) * (m[2] === 'N' ? 1 : -1)
  const lon = (Number(m[3].slice(0, 3)) + Number(m[3].slice(3)) / 60) * (m[4] === 'E' ? 1 : -1)
  return { lat, lon, radiusNm: Number(m[5]) }
}

function metersBetween(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function circleRing(center, radiusM) {
  const dLat = (radiusM / 111320)
  const dLon = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180) || 1)
  const ring = []
  for (let i = 0; i < CIRCLE_STEPS; i += 1) {
    const th = (2 * Math.PI * i) / CIRCLE_STEPS
    ring.push([center.lon + dLon * Math.cos(th), center.lat + dLat * Math.sin(th)])
  }
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

function polygonFrom(coords) {
  const ring = coords.map((p) => [p.lon, p.lat])
  const [f] = ring, l = ring[ring.length - 1]
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
  return { type: 'Polygon', coordinates: [ring] }
}

function geometryPoints(geometry) {
  if (!geometry) return []
  const flat = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates
  return flat.map(([lon, lat]) => ({ lon, lat }))
}

// 본문 해석이 Q줄 원을 크게 벗어나면 신뢰하지 않는다(좌표 오독 방지).
function withinQCircle(geometry, q) {
  if (!q) return true
  const limit = (q.radiusNm + Q_SLACK_NM) * M_PER_NM
  return geometryPoints(geometry).every((p) => metersBetween(p, q) <= limit)
}

// KML LineString이 이미 닫힌 고리면 면으로 취급한다(실측 89건).
function closeIfRing(geometry) {
  if (geometry?.type !== 'LineString') return geometry
  const c = geometry.coordinates
  if (c.length < 4) return geometry
  const [f] = c, l = c[c.length - 1]
  return f[0] === l[0] && f[1] === l[1] ? { type: 'Polygon', coordinates: [c] } : geometry
}

export function resolveNotamGeometry({ rawText, kmlGeometry }) {
  const q = qCircleFromRawText(rawText)
  const text = parsePositionText(rawText)

  let fromText = null
  if (text.kind === 'circle' && text.coords.length && text.radiusM != null) fromText = circleRing(text.coords[0], text.radiusM)
  else if (text.kind === 'polygon') fromText = polygonFrom(text.coords)
  else if (text.kind === 'corridor') fromText = { type: 'LineString', coordinates: text.coords.map((p) => [p.lon, p.lat]) }

  // 바깥 형상 자체가 호·반원이면 본문 해석을 버리고 Q줄 원을 쓴다(안전한 상한).
  if (fromText && text.approximated && text.kind === 'circle' && q) {
    return { geometry: circleRing(q, q.radiusNm * M_PER_NM), bufferNm: null, source: 'text', reason: null, approximated: true }
  }
  if (fromText && withinQCircle(fromText, q)) {
    return { geometry: fromText, bufferNm: text.bufferNm ?? null, source: 'text', reason: null, approximated: text.approximated }
  }

  const kml = closeIfRing(kmlGeometry)
  if (kml) return { geometry: kml, bufferNm: null, source: 'kml', reason: null, approximated: false }

  return {
    geometry: null,
    bufferNm: null,
    source: 'none',
    reason: fromText ? 'text_outside_q_circle' : 'no_position_stated',
    approximated: false,
  }
}

export default { resolveNotamGeometry, qCircleFromRawText }
```

- [ ] **Step 4: 테스트 통과를 확인한다**

```bash
npm --prefix backend test
```

기대: 새 테스트 6개 PASS, Task 1·2 테스트 유지, 기존 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/notam/notam-geometry.js backend/test/notam-geometry.test.js
git commit -m "feat(notam): 본문·Q줄·KML 순으로 위치를 결정한다"
```

---

### Task 4: 파서 연결 — `C)PERM` 구제와 유실 집계

**Files:**
- Modify: `backend/src/parsers/notam-parser.js`
- Modify: `backend/src/processors/notam-processor.js`
- Test: `backend/test/notam-parser.test.js` (없으면 생성)

**Interfaces:**
- Consumes: Task 3의 `resolveNotamGeometry`.
- Produces:
  - `parseNotamKml(kml)` → `{ items, placemarks, dropped }` (기존 배열 반환에서 변경)
  - 각 item에 `geometrySource`, `geometryReason`, `bufferNm`, `approximated` 추가

**주의:** `parseNotamKml`의 반환 형태가 바뀐다. 호출부는 `notam-processor.js` 한 곳이다. 먼저 `grep -rn "parseNotamKml" backend/` 로 확인하고 전부 고친다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/notam-parser.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseNotamKml } from '../src/parsers/notam-parser.js'

const kml = readFileSync(fileURLToPath(new URL('./fixtures/notam-2026-07-26.kml', import.meta.url)), 'utf8')

test('C)PERM NOTAM이 살아남는다', () => {
  const { items } = parseNotamKml(kml)
  for (const id of ['A0876/26', 'A0686/26', 'A0800/26', 'C1040/26']) {
    assert.ok(items.find((i) => i.id === id), `${id}가 없다`)
  }
})

test('415개 Placemark가 전부 레코드가 된다', () => {
  const r = parseNotamKml(kml)
  assert.equal(r.placemarks, 415)
  assert.equal(r.items.length, 415)
  assert.equal(r.dropped, 0)
})

test('유실이 생기면 집계에 잡힌다', () => {
  const broken = '<Placemark id=\'X0001/26_1\'><description><![CDATA[<h3>X0001/26</h3>(X0001/26 NOTAMN]]></description></Placemark>'
  const r = parseNotamKml(broken)
  assert.equal(r.placemarks, 1)
  assert.equal(r.dropped, 1)
})

test('불꽃놀이 도형이 본문 좌표에서 나온다', () => {
  const { items } = parseNotamKml(kml)
  const z = items.find((i) => i.id === 'Z0535/26')
  assert.equal(z.geometrySource, 'text')
  const lats = z.geometry.coordinates[0].map((p) => p[1])
  const mid = (Math.min(...lats) + Math.max(...lats)) / 2
  assert.ok(mid > 37.59 && mid < 37.60, `중심 위도 ${mid} — 활주로(37.56)면 안 된다`)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- --test-name-pattern="C\\)PERM"
```

기대: FAIL — `items`가 undefined(현재는 배열을 반환한다).

- [ ] **Step 3: 파서를 고친다**

`backend/src/parsers/notam-parser.js`:

`C)` 필드를 읽는 줄(현재 82행)을 바꾼다:

```js
  const cField = (text.match(/C\)\s*(\d{10})/) || [])[1] || null
  // C)PERM(영구)은 종료시각이 숫자가 아니다. 통째로 버리지 않고 먼 미래로 둔다.
  const permanent = !cField && /C\)\s*PERM\b/i.test(text)
```

`validTo` 계산을 바꾼다:

```js
  const validFrom = dmsToIso(bField)
  const validTo = permanent ? '2099-12-31T23:59:00.000Z' : dmsToIso(cField)
```

레코드에 위치 결정 결과를 붙인다. `geometry: extractGeometry(xml)` 을 다음으로 바꾼다:

```js
  const kmlGeometry = extractGeometry(xml)
  const resolved = resolveNotamGeometry({ rawText: text, kmlGeometry })
```

그리고 반환 객체에서:

```js
    geometry: resolved.geometry,
    bufferNm: resolved.bufferNm,
    geometrySource: resolved.source,       // 'text' | 'kml' | 'none'
    geometryReason: resolved.reason,
    approximated: resolved.approximated,
```

파일 상단에 import를 추가한다:

```js
import { resolveNotamGeometry } from '../notam/notam-geometry.js'
```

`parseNotamKml`을 집계까지 내도록 바꾼다:

```js
export function parseNotamKml(kml) {
  const lf = String(kml || '').replace(/\r/g, '\n')
  const placemarks = lf.split('<Placemark').slice(1).map((chunk) => '<Placemark' + chunk.split('</Placemark>')[0] + '</Placemark>')
  const items = []
  for (const pm of placemarks) {
    try {
      const rec = parseOnePlacemark(pm)
      if (rec) items.push(rec)
    } catch { /* skip broken placemark */ }
  }
  // 조용한 유실을 없앤다 — 이전에는 몇 건이 사라졌는지 알 방법이 없었다.
  return { items, placemarks: placemarks.length, dropped: placemarks.length - items.length }
}
```

- [ ] **Step 4: 호출부를 고친다**

호출부는 `backend/src/processors/notam-processor.js:76` 한 곳이다(확인 완료). 76–77행이 이렇다:

```js
  const raw = parseNotamKml(crawled.kml)
  const items = raw.map((r) => ({
```

이렇게 바꾼다:

```js
  const { items: parsed, placemarks, dropped } = parseNotamKml(crawled.kml)
  // 조용한 유실을 없앤다 — 이전에는 몇 건이 사라졌는지 알 방법이 없었다.
  if (dropped > 0) console.warn(`[notam] Placemark ${placemarks}건 중 ${dropped}건이 레코드가 되지 못했습니다`)
  const items = parsed.map((r) => ({
```

같은 `map` 안에 위치 결정 결과를 실어 보낸다(`rawText: r.rawText,` 다음 줄에 추가):

```js
    geometry: r.geometry,
    bufferNm: r.bufferNm,
    geometrySource: r.geometrySource,
    approximated: r.approximated,
```

기존에 `geometry: r.geometry`가 이미 있으면 중복 추가하지 않는다. 다시 확인한다:

```bash
grep -n "geometry" backend/src/processors/notam-processor.js
```

- [ ] **Step 5: 테스트 통과를 확인한다**

```bash
npm --prefix backend test
```

기대: 새 테스트 4개 PASS, 기존 NOTAM 테스트 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/parsers/notam-parser.js backend/src/processors/notam-processor.js backend/test/notam-parser.test.js
git commit -m "fix(notam): C)PERM을 살리고 유실을 집계하며 위치 결정을 연결한다"
```

---

### Task 5: 경로 판정 — 회랑 지원과 `positionStatus`

**Files:**
- Modify: `backend/src/briefing/notam-briefing.js`
- Modify: `backend/test/notam-briefing.test.js`

**Interfaces:**
- Consumes: Task 4가 붙인 `bufferNm`, `geometrySource`.
- Produces: `matchRouteNotams()` 결과의 각 항목에 `positionStatus: 'resolved' | 'unresolved'` 추가.

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`backend/test/notam-briefing.test.js` 끝에 붙인다:

```js
import { routeIntervalInGeometry } from '../src/briefing/geo-time-match.js'

// 닫힌 고리로 들어온 위험구역을 관통하면 걸려야 한다(이전에는 LineString이라 통째로 빠졌다)
test('닫힌 구역을 관통하면 저촉이 잡힌다', () => {
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.9, 37.0], [127.3, 37.0]] })
  const zone = {
    id: 'D9999/26', category: 'danger', summary: 'TEMPO DANGER AREA ACT',
    valid_from: '2026-07-18T00:00:00Z', valid_to: '2026-07-19T00:00:00Z',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry: { type: 'Polygon', coordinates: [[[127.0, 36.9], [127.2, 36.9], [127.2, 37.1], [127.0, 37.1], [127.0, 36.9]]] },
  }
  const { routeConflicts } = matchRouteNotams([zone], {
    axis, etd: '2026-07-18T09:00:00Z', eta: '2026-07-18T10:00:00Z', cruiseAltitudeFt: 9000, airports: [],
  })
  assert.equal(routeConflicts.length, 1)
})

test('회랑은 폭 안쪽을 지나면 저촉이 잡힌다', () => {
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[127.0, 36.99], [127.2, 36.99]] })
  const corridor = {
    id: 'E9999/26', category: 'restricted', summary: 'TEMPO RESTRICTED AREA ACT',
    valid_from: '2026-07-18T00:00:00Z', valid_to: '2026-07-19T00:00:00Z',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry: { type: 'LineString', coordinates: [[127.0, 37.0], [127.2, 37.0]] },
    bufferNm: 5,
  }
  const { routeConflicts } = matchRouteNotams([corridor], {
    axis, etd: '2026-07-18T09:00:00Z', eta: '2026-07-18T10:00:00Z', cruiseAltitudeFt: 9000, airports: [],
  })
  assert.equal(routeConflicts.length, 1)
})

test('위치를 못 정한 건은 목록에서 사라지지 않는다', () => {
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.9, 37.0], [127.3, 37.0]] })
  const unknown = {
    id: 'D8888/26', category: 'restricted', summary: 'RESTRICTED AREA RK R97E ACT',
    valid_from: '2026-07-18T00:00:00Z', valid_to: '2026-07-19T00:00:00Z',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry: null, geometrySource: 'none',
    location: 'RKSS',
  }
  const { routeNotams, routeConflicts } = matchRouteNotams([unknown], {
    axis, etd: '2026-07-18T09:00:00Z', eta: '2026-07-18T10:00:00Z', cruiseAltitudeFt: 9000,
    airports: [{ role: 'departure', icao: 'RKSS' }],
  })
  const row = routeNotams.find((n) => n.id === 'D8888/26')
  assert.ok(row, '목록에서 사라졌다')
  assert.equal(row.positionStatus, 'unresolved')
  assert.equal(routeConflicts.length, 0, '위치 불명을 저촉으로 치면 안 된다')
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- --test-name-pattern="회랑|위치를 못 정한|닫힌 구역"
```

기대: 세 개 FAIL.

- [ ] **Step 3: `matchRouteNotams`를 고친다**

먼저 `backend/src/briefing/geo-time-match.js`의 `routeCorridorInGeometry`가 LineString을 받게 한다.

**이 함수는 지금 `polygonsOf(geometry)`를 쓰는데, 그 함수는 LineString에 빈 배열을 돌려준다**(102–104행). 그대로 두고 회랑을 넘기면 아무것도 안 걸린다. 104행을 바꾼다:

```js
export function routeCorridorInGeometry(axis, geometry, bufferNm) {
  const samples = axis?.samples ?? []
  // 열린 선(회랑 중심선)도 받는다. 거리 계산은 닫힌 링과 동일하고, 안쪽 판정만 건너뛴다.
  const isLine = geometry?.type === 'LineString'
  const rings = isLine ? [geometry.coordinates] : polygonsOf(geometry).map((p) => p[0])
  let startNm = null, endNm = null
  for (const s of samples) {
    let within = false
    for (const ring of rings) {
      if (!ring) continue
      const inside = !isLine && pointInPolygon([s.lon, s.lat], ring)
      if (inside || minDistanceNmToRing([s.lon, s.lat], ring) <= bufferNm) {
        within = true
        break
      }
    }
    if (within) {
      if (startNm == null) startNm = s.distanceNm
      endNm = s.distanceNm
    }
  }
  return { entered: startNm != null, startNm, endNm }
}
```

97–101행의 주석도 고친다 — 이제 위험기상 전용이 아니다:

```js
// bufferNm 이내로 지나가면 "관련 있음"으로 본다. 두 곳에서 쓴다.
//  - 위험기상(SIGMET/AIRMET): 항로 양쪽 30NM(ForeFlight 관행)
//  - NOTAM 회랑: 본문 "n NM EITHER SIDE OF LINE"의 폭. 이때 geometry는 열린 선이다.
// 면을 실제로 침범했는지가 중요한 일반 NOTAM은 routeIntervalInGeometry를 쓴다.
// 정점까지의 최소거리로 근사한다.
```

그다음 `backend/src/briefing/notam-briefing.js`의 import에 회랑 판정을 추가한다:

```js
import { routeIntervalInGeometry, routeCorridorInGeometry, timeWindowsOverlap } from './geo-time-match.js'
```

교차 판정 줄(현재 37행)을 바꾼다:

```js
    // 회랑(선+폭)은 버퍼 판정으로, 면은 기존 판정으로.
    const interval = !it.geometry ? { entered: false }
      : it.bufferNm != null && it.geometry.type === 'LineString'
        ? routeCorridorInGeometry(ctx.axis, it.geometry, it.bufferNm)
        : routeIntervalInGeometry(ctx.axis, it.geometry)
```

레코드에 위치 상태를 붙인다(`conflict` 계산 바로 위):

```js
    // 위치를 못 정했으면 저촉으로 단정하지 않되 목록에서 빼지도 않는다(정책: 상태와 이유를 반환).
    const positionStatus = it.geometry ? 'resolved' : 'unresolved'
```

`conflict` 계산에 위치 확정 조건을 넣는다:

```js
    const conflict = positionStatus === 'resolved' && comparisonStatus === 'warn'
      && RESTRICTION_CATEGORIES.has(it.category) && interval.entered && passesAltitude
```

반환 객체에 추가한다:

```js
      positionStatus,
      geometrySource: it.geometrySource ?? null,
      approximated: it.approximated ?? false,
```

그리고 제외 조건(현재 39행)을 고친다. 위치 불명이면서 대상 공항이면 남겨야 한다:

```js
    if (!interval.entered && !airportRole && positionStatus === 'resolved') continue
```

**주의:** `positionStatus`를 이 줄보다 먼저 계산하도록 순서를 맞춘다.

- [ ] **Step 4: 위험기상 회귀를 확인한다**

`routeCorridorInGeometry`는 SIGMET/AIRMET도 쓴다. 폴리곤 동작이 바뀌지 않았는지 본다.

```bash
npm --prefix backend test -- --test-name-pattern="hazard|exposure|sigmet"
```

기대: 전부 PASS. 폴리곤 경로에서는 `rings`가 이전 `polygon[0]`과 같은 값이고 `inside` 판정도 그대로다.

- [ ] **Step 5: 테스트 통과를 확인한다**

```bash
npm --prefix backend test
```

- [ ] **Step 6: 커밋**

```bash
git add backend/src/briefing/geo-time-match.js backend/src/briefing/notam-briefing.js backend/test/notam-briefing.test.js
git commit -m "fix(notam): 회랑을 판정하고 위치 불명을 조용히 빼지 않는다"
```

---

### Task 6: 발효 시간 — D) 시간표를 판정에 넣는다

**Files:**
- Create: `backend/src/briefing/schedule-window.js`
- Modify: `backend/src/briefing/notam-briefing.js`
- Test: `backend/test/schedule-window.test.js`

**Interfaces:**
- Consumes: `shared/notam-schedule.js`의 `isScheduleActiveAt(scheduleText, validFrom, validTo, nowMs)` → `true | false | null`.
- Produces: `scheduleStateOverWindow({ scheduleText, validFrom, validTo, etd, eta })` → `'active' | 'outside' | 'unknown'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/schedule-window.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleStateOverWindow } from '../src/briefing/schedule-window.js'

const BASE = { validFrom: '2026-07-25T10:00:00Z', validTo: '2026-08-29T12:00:00Z' }
const FIREWORKS = 'JUL 25 1000-1200, AUG 01-02 08 15-16 22 29 1000-1200'

test('시간표 안의 비행 → active', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: '2026-08-01T10:10:00Z', eta: '2026-08-01T11:10:00Z',
  }), 'active')
})

test('시간표 밖의 비행 → outside', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z',
  }), 'outside')
})

test('구간이 시간표에 걸치기만 해도 active', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: '2026-08-01T09:30:00Z', eta: '2026-08-01T10:05:00Z',
  }), 'active')
})

test('시간표가 없으면 unknown이 아니라 active로 둔다', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: null, etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z',
  }), 'active')
})

test('해석 못 하는 표기는 unknown — 꺼진 것으로 치지 않는다', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: 'MON-FRI SR-SS', etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z',
  }), 'unknown')
})

test('비행시각이 없으면 unknown', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: null, eta: null,
  }), 'unknown')
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- --test-name-pattern="시간표"
```

- [ ] **Step 3: 구현을 쓴다**

`backend/src/briefing/schedule-window.js`:

```js
// D) 시간표를 비행 구간(ETD~ETA)에 대해 묻는다.
// shared/notam-schedule.js는 한 시점만 답하므로 구간을 훑는 얇은 껍데기다. 문법 해석은 그쪽 소관.
// ponytail: 5분 간격 표본이라 그보다 짧은 발효 창은 놓친다. 현재 자료의 D)는 모두 시간 단위
// 덩어리라 문제되지 않는다. 더 정밀해져야 하면 notam-schedule.js에 구간 질의를 추가한다.
import { isScheduleActiveAt } from '../../../shared/notam-schedule.js'

const STEP_MS = 5 * 60 * 1000

export function scheduleStateOverWindow({ scheduleText, validFrom, validTo, etd, eta }) {
  if (!scheduleText) return 'active' // D)가 없으면 유효기간 내내 발효
  const from = Date.parse(etd), to = Date.parse(eta)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 'unknown'

  let sawUnknown = false
  for (let t = from; t <= to; t += STEP_MS) {
    const hit = isScheduleActiveAt(scheduleText, validFrom, validTo, t)
    if (hit === true) return 'active'
    if (hit === null) sawUnknown = true
  }
  // 마지막 순간은 반드시 본다(구간 길이가 5분의 배수가 아닐 때 끝점이 빠진다)
  const last = isScheduleActiveAt(scheduleText, validFrom, validTo, to)
  if (last === true) return 'active'
  if (last === null) sawUnknown = true

  return sawUnknown ? 'unknown' : 'outside'
}

export default { scheduleStateOverWindow }
```

**경로 확인:** `backend/src/briefing/`에서 `shared/`까지는 `../../../shared/`다. 기존 `import`가 있는 파일로 확인한다:

```bash
grep -rn "shared/" backend/src/briefing/ | head -3
```

맞지 않으면 그 파일의 상대경로를 따른다.

- [ ] **Step 4: 테스트 통과를 확인한다**

```bash
npm --prefix backend test -- --test-name-pattern="시간표"
```

- [ ] **Step 5: 브리핑 판정에 연결한다**

`backend/src/briefing/notam-briefing.js`에 import를 추가한다:

```js
import { scheduleStateOverWindow } from './schedule-window.js'
```

`timeStatus` 계산 뒤에 시간표 판정을 넣는다:

```js
    // B)~C)는 공지가 살아있는 기간, D)는 그 안에서 실제로 켜지는 시간대다.
    // D)를 안 보면 몇 달 내내 발효 중이 된다(실측 319건).
    const scheduleState = timeStatus === 'matched'
      ? scheduleStateOverWindow({ scheduleText: it.schedule_text, validFrom: it.valid_from, validTo: it.valid_to, etd: ctx.etd, eta: ctx.eta })
      : 'unknown'
```

`conflict` 계산에 넣는다:

```js
    const conflict = positionStatus === 'resolved' && scheduleState !== 'outside'
      && comparisonStatus === 'warn' && RESTRICTION_CATEGORIES.has(it.category)
      && interval.entered && passesAltitude
```

반환 객체에 추가한다:

```js
      scheduleState, // 'active' | 'outside' | 'unknown'
```

- [ ] **Step 6: 저촉 판정 테스트를 추가한다**

`backend/test/notam-briefing.test.js`에 붙인다:

```js
test('D) 시간대 밖 비행이면 저촉이 아니다', () => {
  const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.9, 37.0], [127.3, 37.0]] })
  const zone = {
    id: 'Z9999/26', category: 'firing', summary: 'FIREWORKS WILL TAKE PLACE',
    valid_from: '2026-07-25T10:00:00Z', valid_to: '2026-08-29T12:00:00Z',
    schedule_text: 'AUG 01-02 1000-1200',
    altitude: { lower: 0, upper: 999, unit: 'FL' },
    geometry: { type: 'Polygon', coordinates: [[[127.0, 36.9], [127.2, 36.9], [127.2, 37.1], [127.0, 37.1], [127.0, 36.9]]] },
  }
  const inside = matchRouteNotams([zone], {
    axis, etd: '2026-08-01T10:10:00Z', eta: '2026-08-01T11:10:00Z', cruiseAltitudeFt: 9000, airports: [],
  })
  assert.equal(inside.routeConflicts.length, 1, '시간대 안이면 저촉이어야 한다')

  const outside = matchRouteNotams([zone], {
    axis, etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z', cruiseAltitudeFt: 9000, airports: [],
  })
  assert.equal(outside.routeConflicts.length, 0, '시간대 밖이면 저촉이 아니어야 한다')
  assert.equal(outside.routeNotams[0].scheduleState, 'outside')
})
```

- [ ] **Step 7: 전체 테스트를 돌린다**

```bash
npm --prefix backend test
```

- [ ] **Step 8: 커밋**

```bash
git add backend/src/briefing/schedule-window.js backend/src/briefing/notam-briefing.js backend/test/schedule-window.test.js backend/test/notam-briefing.test.js
git commit -m "fix(notam): D) 시간표를 저촉 판정에 반영한다"
```

---

### Task 7: 배너가 내용을 보여준다

**Files:**
- Modify: `frontend/src/features/route-briefing/BriefingBanner.jsx`
- Modify: `frontend/src/features/route-briefing/BriefingView.css`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`

**Interfaces:**
- Consumes: `routeConflicts[]`의 `summary`, `routeIntervalNm`, `altitude`, `positionStatus`, `approximated`; `briefing.routeNotams[]`의 `positionStatus === 'unresolved'`.
- Produces: 없음(화면 끝단).

- [ ] **Step 1: 배너를 고친다**

`BriefingBanner.jsx` 상단 import를 바꾼다:

```jsx
import { NOTAM_CATEGORIES, formatAltitude } from '../notam/lib/notamViewModel.js'
```

서명에 위치불가 목록과 이동 함수를 추가한다:

```jsx
export default function BriefingBanner({ banner, routeConflicts = [], unresolved = [], onJump }) {
```

`hasConflict` 옆에 추가한다:

```jsx
  const hasUnresolved = unresolved.length > 0
```

렌더 조건을 바꾼다:

```jsx
  if (!worst && !hasConflict && !hasUnresolved) return null
```

저촉 목록(현재 `bv-banner-chain` 블록)을 바꾼다:

```jsx
            {/* 분류 이름과 번호만으로는 무엇인지 알 수 없다 — 내용·구간·고도·시간을 한 항목에. */}
            <ul className="bv-banner-conflicts">
              {routeConflicts.map((n) => {
                const where = n.routeIntervalNm ? `출발 후 ${n.routeIntervalNm.startNm}–${n.routeIntervalNm.endNm}NM` : null
                const alt = formatAltitude(n.altitude)
                const time = n.scheduleState === 'unknown' ? '시간 조건 확인' : null
                const meta = [where, alt, time].filter(Boolean).join(' · ')
                return (
                  <li key={n.id}>
                    <button type="button" className="bv-banner-conflict" onClick={() => onJump?.('notam')} disabled={!onJump}>
                      <span className="bv-banner-conflict-head">
                        <span className="bv-banner-chain-role">{NOTAM_CAT_LABEL[n.category] || n.category}</span>
                        <b>{n.id}</b>
                        {n.approximated && <span className="bv-banner-approx">구역 형태 근사</span>}
                      </span>
                      <span className="bv-banner-conflict-sum">{n.summary || '내용 미상 — 원문 확인'}</span>
                      {meta && <span className="bv-banner-conflict-meta">{meta}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
```

`{hasConflict && (...)}` 블록 뒤에 위치불가 줄을 추가한다:

```jsx
      {hasUnresolved && (
        // 저촉으로 단정하지 않는다. 빨간 목록과 섞지 않고 회색으로 따로 낸다.
        <div className="bv-banner bv-banner-unresolved" data-good="false">
          <div className="bv-banner-cat bv-banner-cat-muted">
            <span className="bv-banner-cat-role">위치 미확인</span>
            <span className="bv-banner-cat-val">{unresolved.length}</span>
          </div>
          <div className="bv-banner-body">
            <div className="bv-banner-reason" style={{ color: 'var(--text-2)' }}>
              위치를 확인하지 못한 제한 — 직접 확인 필요
            </div>
            <ul className="bv-banner-conflicts">
              {unresolved.map((n) => (
                <li key={n.id}>
                  <button type="button" className="bv-banner-conflict" onClick={() => onJump?.('notam')} disabled={!onJump}>
                    <span className="bv-banner-conflict-head">
                      <span className="bv-banner-chain-role">{NOTAM_CAT_LABEL[n.category] || n.category}</span>
                      <b>{n.id}</b>
                    </span>
                    <span className="bv-banner-conflict-sum">{n.summary || n.id}</span>
                    <span className="bv-banner-conflict-meta">구역 좌표 없음</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
```

- [ ] **Step 2: 스타일을 넣는다**

`BriefingView.css`의 `.bv-banner-chain-role` 줄 바로 뒤에 추가한다:

```css
/* 경로 저촉 항목: 분류·번호 / 무슨 내용 / 어디·고도·시간 3단. 누르면 ⑤ NOTAM 섹션으로 이동. */
.bv-banner-conflicts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-xs); }
.bv-banner-conflict {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  background: none; border: none; border-left: 3px solid var(--level-red);
  padding: var(--space-snudge) var(--space-s); border-radius: var(--radius-md);
  font: inherit; color: inherit; cursor: pointer; font-variant-numeric: tabular-nums;
}
.bv-banner-conflict:disabled { cursor: default; }
.bv-banner-conflict:not(:disabled):hover { background: var(--level-red-bg); }
.bv-banner-conflict-head { display: flex; align-items: baseline; gap: var(--space-xs); font-size: var(--fs-300); }
.bv-banner-conflict-sum { font-size: var(--fs-400); font-weight: var(--fw-semibold); }
.bv-banner-conflict-meta { font-size: var(--fs-200); color: var(--text-3); }
.bv-banner-approx { font-size: var(--fs-100); color: var(--text-3); border: 0.5px solid var(--stroke-2); border-radius: 3px; padding: 0 4px; }
/* 위치 미확인은 저촉이 아니다 — 무채색으로 분리 */
.bv-banner-unresolved { margin-top: var(--space-snudge); border-color: var(--stroke-2); }
.bv-banner-cat-muted { background: var(--bg-3); color: var(--text-2); }
.bv-banner-unresolved .bv-banner-conflict { border-left-color: var(--stroke-2); }
.bv-banner-unresolved .bv-banner-conflict:not(:disabled):hover { background: var(--level-gray-bg); }
```

- [ ] **Step 3: 배너에 자료를 넘긴다**

`BriefingView.jsx`의 `routeConflicts` 선언 근처에 추가한다:

```jsx
  const unresolvedNotams = routeNotams.filter((n) => n.positionStatus === 'unresolved')
```

두 곳의 `<BriefingBanner ... />` 호출을 바꾼다(데스크톱·모바일 각 1회):

```jsx
<BriefingBanner banner={briefing.banner} routeConflicts={routeConflicts} unresolved={unresolvedNotams} onJump={jumpTo} />
```

```bash
grep -n "BriefingBanner banner" frontend/src/features/route-briefing/BriefingView.jsx
```

- [ ] **Step 4: 프론트 테스트를 돌린다**

```bash
npm --prefix frontend test
```

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/BriefingBanner.jsx frontend/src/features/route-briefing/BriefingView.css frontend/src/features/route-briefing/BriefingView.jsx
git commit -m "feat(notam): 저촉 배너가 내용·구간·고도를 보여주고 위치 미확인을 분리한다"
```

---

### Task 8: 브라우저 계약과 최종 검증

**Files:**
- Modify: `frontend/verification/route-fixture.mjs`
- Modify: `frontend/verification/contracts/briefing-view.spec.mjs`

**Interfaces:**
- Consumes: Task 7의 화면.
- Produces: 없음.

- [ ] **Step 1: 픽스처에 저촉과 위치불가를 넣는다**

`frontend/verification/route-fixture.mjs`의 `briefingFor()`에서 `return { ...briefing,` 직전에 추가한다:

```js
  // 배너 계약용 고정 NOTAM 2건 — 경로 지오메트리 교차를 픽스처에서 만들기 어려워 결과를 직접 주입한다.
  const conflictNotam = {
    id: 'Z0533/26', category: 'firing', summary: '불꽃놀이 실시 — 해당 공역 진입 금지',
    rawText: 'FIREWORKS DISPLAY WILL TAKE PLACE', altitude: { lower: 0, upper: 200, unit: 'FT', ref: 'AGL' },
    validFrom: '2026-07-18T00:00:00Z', validTo: '2026-07-18T23:59:00Z', scheduleText: null,
    onRoute: true, airportRole: null, airportIcao: null,
    routeIntervalNm: { startNm: 12, endNm: 18 }, bandFt: { lowFt: 0, highFt: 200 },
    verticalKnown: true, activeAtEtd: true, timeStatus: 'matched', comparisonStatus: 'warn',
    positionStatus: 'resolved', scheduleState: 'active', approximated: false, conflict: true,
  }
  const unresolvedNotam = {
    id: 'D2054/26', category: 'restricted', summary: 'RESTRICTED AREA RK R97E ACT',
    rawText: 'RESTRICTED AREA RK R97E ACT', altitude: null,
    validFrom: '2026-07-18T00:00:00Z', validTo: '2026-07-18T23:59:00Z', scheduleText: null,
    onRoute: false, airportRole: 'departure', airportIcao: 'RKSS',
    routeIntervalNm: null, bandFt: null, verticalKnown: false, activeAtEtd: true,
    timeStatus: 'matched', comparisonStatus: 'undetermined',
    positionStatus: 'unresolved', scheduleState: 'active', approximated: false, conflict: false,
  }
```

그리고 반환에 추가한다:

```js
    routeNotams: [conflictNotam, unresolvedNotam],
    routeConflicts: [conflictNotam],
```

- [ ] **Step 2: 계약 테스트를 추가한다**

`frontend/verification/contracts/briefing-view.spec.mjs`의 두 번째 `test(` 앞에 넣는다:

```js
  test('저촉 배너가 내용·구간·고도를 보여주고 위치 미확인을 분리한다', async ({ page }) => {
    await createBriefing(page)

    // 무엇인지가 배너에서 바로 보인다
    await expect(page.getByText('불꽃놀이 실시 — 해당 공역 진입 금지', { exact: true })).toBeVisible()
    await expect(page.getByText('출발 후 12–18NM · SFC–200FT AGL', { exact: true })).toBeVisible()

    // 위치 미확인은 빨간 저촉과 섞이지 않는다
    await expect(page.getByText('위치를 확인하지 못한 제한 — 직접 확인 필요', { exact: true })).toBeVisible()
    await expect(page.getByText('구역 좌표 없음', { exact: true })).toBeVisible()

    // 누르면 ⑤ 섹션으로 이동한다
    await page.getByRole('button', { name: /불꽃놀이 실시/ }).click()
    await expect(page.getByRole('heading', { name: '⑤ 경로·공항 NOTAM', exact: true })).toBeInViewport()
  })
```

- [ ] **Step 3: 계약을 돌린다**

```bash
npm run dev:contract -- --grep briefing-view
```

기대: 새 테스트 PASS, 기존 `briefing-view` 두 개 PASS.

- [ ] **Step 4: 회귀를 확인한다**

```bash
npm --prefix backend test
npm --prefix frontend test
npm run dev:contract -- --grep "moa-activation|notam-and-settings"
```

`moa-activation`은 D) 시간표를 쓰는 기존 계약이다. 반드시 통과해야 한다.

- [ ] **Step 5: 상설 구역과 공항 시설 도형이 그대로인지 확인한다**

```bash
npm --prefix backend test -- --test-name-pattern="정답표"
```

정답표 대조에서 `named_area`·`none` 분류가 전부 `kind: null`(→ KML 도형 사용)로 남는지 본다. 건드리면 안 되는 대상이다.

- [ ] **Step 6: 그래프를 갱신하고 커밋한다**

```bash
graphify update .
git add frontend/verification/route-fixture.mjs frontend/verification/contracts/briefing-view.spec.mjs
git commit -m "test(notam): 저촉 배너와 위치 미확인 분리를 브라우저 계약으로 고정한다"
```

---

## Self-Review

**스펙 대응 확인**

| 스펙 | 과제 |
| --- | --- |
| §2.3 LineString 101건 누락 | Task 3 (`closeIfRing`), Task 5 (회랑 판정) |
| §2.4 활주로 오배치 3건 | Task 3 (본문 우선), Task 4 (불꽃놀이 위치 검증) |
| §2.5 네 문형 + 공백 제거 | Task 1, Task 2 |
| §2.5.1 호·반원·제외구역 9건 | Task 1 (`approximated`), Task 3 (Q줄 원 대체) |
| §2.6 D) 시간표 미반영 | Task 6 |
| §2.7 `C)PERM` 탈락 | Task 4 |
| §2.8 분류 이름만 표시 | Task 7 |
| §3 위치 신뢰 순서 | Task 3 |
| §3 조용한 누락 금지 | Task 4 (집계), Task 5 (`positionStatus`) |
| §4.2 Q줄 검산 | Task 3 (`withinQCircle`) |
| §8 화면 표시 | Task 7 |
| §10.1 정답표 전수 대조 | Task 2 |
| §10.4 브라우저 계약 | Task 8 |

**계획 작성 중 확인해서 고친 것**

- `routeCorridorInGeometry(axis, geometry, bufferNm)`의 세 번째 인자는 맞았으나, **내부가 `polygonsOf()`를 써서 LineString에 빈 배열을 돌려준다.** 회랑을 그대로 넘기면 아무것도 안 걸린다. Task 5에 이 함수를 열린 선까지 받도록 고치는 단계를 넣었고, SIGMET 회귀 확인도 붙였다.
- `shared/` 상대경로는 `backend/src/briefing/` 기준 `../../../shared/`가 맞다(`typhoon-briefing.js:8`, `hazard-exposure.js:6` 확인).
- `parseNotamKml` 호출부는 `notam-processor.js:76` 한 곳이다. 변수명이 `raw`이고 바로 `raw.map(...)`을 쓰므로 Task 4에 정확한 치환을 적었다.

**남은 위험**

- `notam-processor.js`의 `map`에 이미 `geometry: r.geometry`가 있을 수 있다. Task 4 Step 4에서 `grep`으로 확인 후 중복을 피한다.
- Task 3의 `circleRing`은 위도에 따른 경도 축척만 보정하는 평면 근사다. 한반도 위도에서 반경 수 km 원에는 충분하나, 반경이 수십 NM인 원에서는 오차가 커진다. 현재 자료의 최대 반경은 123NM(Q줄 기준)이며 그 크기는 본문 원이 아니라 대부분 상설 구역이라 KML 도형을 쓴다. 문제가 되면 측지 계산으로 바꾼다.
