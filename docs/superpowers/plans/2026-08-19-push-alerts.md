# 4단계: 푸시 알림 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록한 비행의 기상이 바뀌면 조종사 폰으로 알림이 간다.

**Architecture:** `diff.js`의 7종 판정을 걷어내고, 새 TAF에서 뽑은 **공항별 4개 불리언(IFR·TS·FG·SN)의 상태 전이 + 경로상 신규 SIGMET**으로 대체한다. 폰과 앱이 같은 규칙을 쓰므로 심각도로 채널을 가르는 층(`shouldPush`)이 사라진다. 발송은 이미 있는 Web Push 배관(`push/send.js`·`me/push.js`·`sw.js`)에 갈래 하나를 잇는다.

**Tech Stack:** Express + better-sqlite3, `web-push`(VAPID), React 18 + Fluent UI, Service Worker, `node --test`.

## Global Constraints

- 스펙: [2026-08-17 저장 경로 브리핑·푸시](../specs/2026-08-17-saved-route-briefing-and-push-design.md)의 **3단계 절** · 감시 대상 변경은 [2026-08-18 스펙](../specs/2026-08-18-saved-briefing-and-account-menu-design.md)
- 선행: [1단계](../status/2026-08-17-saved-route-geometry.status.md) · [2단계](../status/2026-08-18-saved-route-load-without-research.status.md) · [3단계](../status/2026-08-19-saved-briefings-and-account-menu.status.md) — 모두 완료·병합·배포
- **새 임계값을 정의하지 않는다.** 비행범주는 `flight-category.js`의 `categoryFor()`를 그대로 쓴다(공항별 기본 미니마 내장). 운고·시정 수치는 `taf-window.js`의 `metricsAt()`가 준다.
- **폰과 앱 안이 같은 규칙을 쓴다.** 채널별로 규칙을 나누지 않는다.
- **회복·개선 판정을 만들지 않는다.** 악화 방향의 신규 전이만 본다.
- **항목별 on/off 설정을 만들지 않는다.**
- **조용시간(야간 억제)을 두지 않는다.**
- **감시 창은 ETD에서 끝난다.** 이륙 후에는 폰이 비행모드라 연장하지 않는다.
- 감시 시작 선택지는 **6 / 12 / 24시간**, 기본 6시간.
- Linux 전용. 테스트는 `node --test`. 프레임워크 추가 금지.
- **작업 트리 주의:** 여러 세션이 공유한다. 커밋 시 `git add`로 해당 파일만 담는다. **`git add -A` 금지.**

## 이미 있는 것 — 새로 만들지 않는다

| 조각 | 위치 | 상태 |
|---|---|---|
| VAPID 발송 | `backend/src/push/send.js` | 동작. 만료 구독은 404/410을 던져 호출측이 정리 |
| 구독 등록·해지 | `backend/src/me/push.js` | 동작 |
| 만료 구독 정리 | `me/push.js:52-65` | 동작. **이 방식을 재사용한다** |
| 서비스워커 수신 | `frontend/public/sw.js` | 동작. 클릭 시 `/`만 여는 것을 고친다 |
| 비행범주 판정 | `backend/src/briefing/flight-category.js` | `categoryFor({visibilityM, ceilingFt, icao})` |
| 시각별 운고·시정 | `backend/src/briefing/taf-window.js` | `metricsAt(taf, iso)` |
| 감시 창 판정 | `backend/src/me/alerts.js:24` | `pickActiveFlight` — ETD 지나면 자동 종료 |
| 순항고도 | 저장 브리핑 payload | 3단계에서 확정 |

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `backend/src/alerts/taf-conditions.js` | TAF 한 장 → `{ifr, ts, fg, sn}` (순수) | **신규** |
| `backend/test/taf-conditions.test.js` | 위 테스트 | **신규** |
| `backend/src/alerts/diff.js` | 7종 판정 → 상태 전이 + 신규 SIGMET | 전면 교체 |
| `backend/test/alert-diff.test.js` | 위 테스트 | 전면 교체 |
| `backend/src/alerts/scheduler.js` | `buildSnapshot` 축소 | 수정 |
| `backend/test/alert-scheduler.test.js` | 위 테스트 | 수정 |
| `backend/src/alerts/sender.js` | 문구 교체, `shouldPush` 제거, Web Push 갈래 | 수정 |
| `backend/test/alert-sender.test.js` | 위 테스트 | 수정 |
| `backend/src/me/alerts.js` | 감시 시작 6/12/24h | 수정 |
| `frontend/public/sw.js` | 알림 클릭 → 딥링크 | 수정 |
| `frontend/src/features/notifications/notificationFormat.js` | 새 종류 문구 | 수정 |
| `frontend/src/features/personal/PersonalSettingsPanel.jsx` | 감시 선택지, 푸시 스위치, "이상없음" 제거 | 수정 |
| `frontend/src/features/personal/usePersonalSettings.js` | 푸시 구독 상태 | 수정 |
| `frontend/src/features/notifications/FlightAlertDetail.jsx` | 삭제 | **삭제** |

---

### Task 1: TAF 한 장에서 조건 넷을 뽑는다

폰이 울릴 조건의 핵심. 순수 함수라 테스트가 쉽고, 여기가 맞으면 나머지는 배선이다.

**Files:**
- Create: `backend/src/alerts/taf-conditions.js`
- Create: `backend/test/taf-conditions.test.js`

**Interfaces:**
- Consumes: `categoryFor({visibilityM, ceilingFt, icao})` from `../briefing/flight-category.js`; `metricsAt(taf, iso)` from `../briefing/taf-window.js`.
- Produces: `tafConditionsAt(taf, iso, icao) -> { ifr: boolean, ts: boolean, fg: boolean, sn: boolean }`. Task 2가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tafConditionsAt } from '../src/alerts/taf-conditions.js'

const AT = '2026-08-20T02:00:00Z'

// timeline은 metricsAt이 운고·시정을 읽는 곳, base/change_groups는 현상(wx)이 있는 곳이다.
const taf = ({ vis = 9999, ceil = 3000, baseWx = [], groups = [] } = {}) => ({
  header: { icao: 'RKSI' },
  base: { wx: baseWx },
  change_groups: groups,
  timeline: [{ time: AT, visibility: { value: vis, cavok: false }, clouds: [{ amount: 'BKN', base: ceil, raw: `BKN${ceil}` }] }],
})

test('운고·시정이 좋으면 아무 조건도 안 걸린다', () => {
  assert.deepEqual(tafConditionsAt(taf(), AT, 'RKSI'), { ifr: false, ts: false, fg: false, sn: false })
})

test('시정이 5000m 미만이면 IFR', () => {
  assert.equal(tafConditionsAt(taf({ vis: 3000 }), AT, 'RKSI').ifr, true)
})

test('운고가 1500ft 미만이면 IFR', () => {
  assert.equal(tafConditionsAt(taf({ ceil: 800 }), AT, 'RKSI').ifr, true)
})

test('지속 그룹(base)의 현상을 읽는다', () => {
  const c = tafConditionsAt(taf({ baseWx: [{ raw: 'TSRA' }] }), AT, 'RKSI')
  assert.equal(c.ts, true)
  assert.equal(c.fg, false)
})

test('변화 그룹은 그 시각에 걸칠 때만 본다', () => {
  const inside = [{ start: '2026-08-20T01:00:00Z', end: '2026-08-20T03:00:00Z', wx_touched: true, wx: [{ raw: 'FG' }] }]
  const outside = [{ start: '2026-08-20T05:00:00Z', end: '2026-08-20T07:00:00Z', wx_touched: true, wx: [{ raw: 'FG' }] }]
  assert.equal(tafConditionsAt(taf({ groups: inside }), AT, 'RKSI').fg, true)
  assert.equal(tafConditionsAt(taf({ groups: outside }), AT, 'RKSI').fg, false)
})

test('눈과 뇌전을 가려낸다', () => {
  const c = tafConditionsAt(taf({ baseWx: [{ raw: '-SN' }] }), AT, 'RKSI')
  assert.equal(c.sn, true)
  assert.equal(c.ts, false)
})

test('TAF가 없으면 아무것도 안 걸린다 — 없는 것을 위험으로 읽지 않는다', () => {
  assert.deepEqual(tafConditionsAt(null, AT, 'RKSI'), { ifr: false, ts: false, fg: false, sn: false })
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/taf-conditions.test.js
```

Expected: FAIL — `Cannot find module '../src/alerts/taf-conditions.js'`

- [ ] **Step 3: 최소 구현**

```js
// 폰이 울릴 조건 — 새 TAF 한 장에서 내 시각의 상태 넷을 뽑는다.
// 임계값을 새로 정의하지 않는다: 비행범주는 flight-category.js가(공항별 기본 미니마 내장),
// 시각별 운고·시정은 taf-window.js가 이미 판정한다. 여기서는 그것을 조합만 한다.
import { categoryFor } from '../briefing/flight-category.js'
import { metricsAt } from '../briefing/taf-window.js'

// 현상 코드. TAF 원문 토큰에 이 글자가 들어 있는지로 본다.
// 세기 접두(+/-)와 소나기(SH) 같은 수식이 붙어도 잡히도록 포함 검사를 쓴다.
const MATCHERS = {
  ts: /TS/,
  fg: /FG/,
  sn: /SN/,
}

const wxText = (wx) => (wx ?? []).map((w) => w?.raw ?? w ?? '').join(' ')

// timeline에는 wx가 없다. 현상은 지속 그룹(base)과 그 시각에 걸치는 변화 그룹에서 읽는다.
function phenomenaTextAt(taf, iso) {
  const at = Date.parse(iso)
  let text = wxText(taf?.base?.wx)
  for (const g of taf?.change_groups ?? []) {
    const start = Date.parse(g?.start)
    const end = Date.parse(g?.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (at >= start && at < end && g.wx_touched) text += ` ${wxText(g.wx)}`
  }
  return text
}

export function tafConditionsAt(taf, iso, icao = null) {
  if (!taf) return { ifr: false, ts: false, fg: false, sn: false }
  const metrics = metricsAt(taf, iso)
  // 수치를 못 뽑으면 판정하지 않는다 — 없는 것을 위험으로 읽으면 오탐이 쌓인다.
  const category = metrics ? categoryFor({ visibilityM: metrics.visibilityM, ceilingFt: metrics.ceilingFt, icao }) : 'VFR'
  const text = phenomenaTextAt(taf, iso)
  return {
    ifr: category === 'IFR' || category === 'LIFR',
    ts: MATCHERS.ts.test(text),
    fg: MATCHERS.fg.test(text),
    sn: MATCHERS.sn.test(text),
  }
}

export default { tafConditionsAt }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix backend test -- test/taf-conditions.test.js
```

Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git status --short
git add backend/src/alerts/taf-conditions.js backend/test/taf-conditions.test.js
git commit -m "feat(alerts): read the four push conditions from a TAF"
```

---

### Task 2: 스냅샷을 조건 넷으로 줄인다

**Files:**
- Modify: `backend/src/alerts/scheduler.js` (`buildSnapshot` 및 그 보조 함수들)
- Modify: `backend/test/alert-scheduler.test.js`

**Interfaces:**
- Consumes: `tafConditionsAt` (Task 1).
- Produces: `buildSnapshot(briefing, tafByIcao, request)`가 아래를 낸다. Task 3이 쓴다.

```js
{
  airports: [{ icao, role: 'dep'|'dest'|'altn', ifr, ts, fg, sn }],
  sigmets: [{ key, label }],   // 경로상 SIGMET만. AIRMET은 담지 않는다
}
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`alert-scheduler.test.js`의 `buildSnapshot` 테스트를 아래로 **교체**한다(옛 형태를 기대하는 단언은 지운다).

```js
test('buildSnapshot: 공항별 조건 넷과 경로 SIGMET만 낸다', () => {
  const request = { departureAirport: 'RKSI', arrivalAirport: 'RKPC', alternateAirport: 'RKPK', etd: ETD, eta: ETA }
  const briefing = { sections: { adverse: { hazards: [
    { source: 'SIGMET', code: 'WS01', validFrom: ETD, encounter: 'on', label: 'SIGMET WS01' },
    { source: 'AIRMET', code: 'WA01', validFrom: ETD, encounter: 'on', label: 'AIRMET WA01' },
    { source: 'SIGMET', code: 'WS02', validFrom: ETD, encounter: 'nearby', label: '옆으로 스침' },
  ] } } }
  const snap = buildSnapshot(briefing, { RKPC: tafFor(800) }, request)

  assert.deepEqual(snap.airports.map((a) => a.role), ['dep', 'dest', 'altn'])
  assert.equal(snap.airports.find((a) => a.role === 'dest').ifr, true, '운고 800ft면 IFR')
  assert.equal(snap.airports.find((a) => a.role === 'dep').ifr, false, 'TAF 없으면 판정하지 않는다')
  // AIRMET은 폰까지 가지 않는다. 경로에 안 걸친 SIGMET도 아니다.
  assert.deepEqual(snap.sigmets.map((s) => s.label), ['SIGMET WS01'])
})

test('buildSnapshot: 교체공항이 없으면 두 곳만 낸다', () => {
  const request = { departureAirport: 'RKSI', arrivalAirport: 'RKPC', alternateAirport: null, etd: ETD, eta: ETA }
  const snap = buildSnapshot({ sections: { adverse: { hazards: [] } } }, {}, request)
  assert.deepEqual(snap.airports.map((a) => a.role), ['dep', 'dest'])
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/alert-scheduler.test.js
```

Expected: FAIL — `snap.airports`가 `undefined`

- [ ] **Step 3: 최소 구현**

`scheduler.js`에서 `buildSnapshot`과 그 보조를 교체한다. `RANK`·`maxLevel`·`enrouteLevels`·`departureTs`·`airportSnap`은 **더 이상 쓰이지 않으므로 지운다**(`metricsAt` import도 함께).

```js
import { tafConditionsAt } from './taf-conditions.js'

// composeBriefing 결과 + TAF payload(icao별) + 요청 → diff가 먹는 최소 스냅샷.
// 공항별로 조건 넷만 들고, 경로 위험은 SIGMET만 담는다(AIRMET은 폰까지 가지 않는다).
export function buildSnapshot(briefing, tafByIcao, request) {
  const taf = (icao) => (icao ? tafByIcao?.[icao] ?? null : null)
  const at = [
    { icao: request.departureAirport, role: 'dep', iso: request.etd },
    { icao: request.arrivalAirport, role: 'dest', iso: request.eta },
    { icao: request.alternateAirport, role: 'altn', iso: request.eta },
  ].filter((entry) => entry.icao)

  const airports = at.map(({ icao, role, iso }) => ({
    icao, role, ...tafConditionsAt(taf(icao), iso, icao),
  }))

  // 경로에 실제로 걸치는 SIGMET만(공항경보 제외). hazard-section이 고도·시간 겹침을 이미 적용했다.
  const sigmets = (briefing?.sections?.adverse?.hazards ?? [])
    .filter((h) => h.source === 'SIGMET' && h.encounter === 'on' && !h.airportScope)
    .map((h) => ({ key: `${h.source}:${h.code}:${h.validFrom}`, label: h.label ?? h.code }))

  return { airports, sigmets }
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix backend test -- test/alert-scheduler.test.js
```

Expected: PASS. `evaluateFlight` 테스트가 옛 스냅샷 모양을 쓰면 새 모양으로 고친다.

- [ ] **Step 5: 커밋**

```bash
git status --short
git add backend/src/alerts/scheduler.js backend/test/alert-scheduler.test.js
git commit -m "feat(alerts): reduce the watch snapshot to four conditions per airport"
```

---

### Task 3: 판정을 상태 전이로 바꾼다

**Files:**
- Modify: `backend/src/alerts/diff.js` (전면 교체)
- Modify: `backend/test/alert-diff.test.js` (전면 교체)

**Interfaces:**
- Consumes: Task 2의 스냅샷.
- Produces: `detectChanges(prev, curr)` — 배열. 각 항목:

```js
{ type: 'IFR'|'TS'|'FG'|'SN'|'SIGMET', target: '<ICAO>'|'<label>', role: 'dep'|'dest'|'altn'|null, dedupKey: string }
```

`severity`·`from`·`to`는 더 이상 만들지 않는다. `plan` 인자(사용자 미니마)도 받지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`alert-diff.test.js`를 아래로 통째로 바꾼다.

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectChanges } from '../src/alerts/diff.js'

const airport = (over = {}) => ({ icao: 'RKPC', role: 'dest', ifr: false, ts: false, fg: false, sn: false, ...over })
const snap = (airports = [airport()], sigmets = []) => ({ airports, sigmets })

test('없던 조건이 새로 생기면 발화한다', () => {
  const changes = detectChanges(snap(), snap([airport({ ifr: true })]))
  assert.equal(changes.length, 1)
  assert.equal(changes[0].type, 'IFR')
  assert.equal(changes[0].target, 'RKPC')
  assert.equal(changes[0].role, 'dest')
})

test('이미 있던 조건은 다시 발화하지 않는다 — 정시 TAF마다 울리면 안 된다', () => {
  assert.deepEqual(detectChanges(snap([airport({ ifr: true })]), snap([airport({ ifr: true })])), [])
})

test('조건이 풀리면 아무 말도 하지 않는다 — 회복 알림은 만들지 않는다', () => {
  assert.deepEqual(detectChanges(snap([airport({ ifr: true })]), snap()), [])
})

test('풀렸다가 다시 걸리면 그때 다시 발화한다', () => {
  assert.equal(detectChanges(snap(), snap([airport({ ifr: true })])).length, 1)
})

test('네 조건을 각각 본다', () => {
  const changes = detectChanges(snap(), snap([airport({ ts: true, fg: true, sn: true })]))
  assert.deepEqual(changes.map((c) => c.type).sort(), ['FG', 'SN', 'TS'])
})

test('공항이 다르면 따로 발화한다', () => {
  const before = snap([airport({ icao: 'RKSI', role: 'dep' }), airport()])
  const after = snap([airport({ icao: 'RKSI', role: 'dep', fg: true }), airport({ fg: true })])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 2)
  assert.notEqual(changes[0].dedupKey, changes[1].dedupKey)
})

test('새 SIGMET만 발화한다', () => {
  const before = snap([airport()], [{ key: 'S:1', label: '기존' }])
  const after = snap([airport()], [{ key: 'S:1', label: '기존' }, { key: 'S:2', label: '새 것' }])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].type, 'SIGMET')
  assert.equal(changes[0].target, '새 것')
})

test('직전 상태가 없으면 아무것도 내지 않는다 — 첫 평가는 기준점이다', () => {
  assert.deepEqual(detectChanges(null, snap([airport({ ifr: true })])), [])
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/alert-diff.test.js
```

Expected: FAIL

- [ ] **Step 3: 최소 구현**

`diff.js`를 통째로 바꾼다.

```js
// 경로 예보변화 판정 — 순수 함수. 스케줄러가 만든 스냅샷 둘을 비교해 알림 후보를 낸다.
//
// 규칙은 다섯 가지뿐이다: 공항별 IFR·TS·FG·SN, 그리고 경로상 신규 SIGMET.
// 폰 알림과 앱 안 알림센터가 **같은 규칙**을 쓴다 — 채널마다 규칙을 나누면
// "왜 앱에는 있는데 폰에는 안 왔지"를 설명해야 하고, 그 시점에 이미 신뢰를 잃는다.
//
// 없던 것이 새로 생겼을 때만 발화한다. 정시 TAF는 6시간마다 나오므로 상태를 비교하지 않으면
// 같은 뇌전 예보로 하루 네 번 울린다. 회복은 알리지 않는다 — 조용하면 이상없다는 것이 계약이다.

const CONDITIONS = ['ifr', 'ts', 'fg', 'sn']
const TYPE_OF = { ifr: 'IFR', ts: 'TS', fg: 'FG', sn: 'SN' }

function airportChanges(prev, curr) {
  const before = new Map((prev?.airports ?? []).map((a) => [a.icao, a]))
  const out = []
  for (const now of curr?.airports ?? []) {
    const then = before.get(now.icao)
    if (!then) continue // 이 공항의 직전 상태가 없다 — 기준점이 없으므로 판정하지 않는다
    for (const key of CONDITIONS) {
      if (now[key] && !then[key]) {
        out.push({ type: TYPE_OF[key], target: now.icao, role: now.role ?? null, dedupKey: `${TYPE_OF[key]}:${now.icao}` })
      }
    }
  }
  return out
}

function sigmetChanges(prev, curr) {
  const seen = new Set((prev?.sigmets ?? []).map((s) => s.key))
  return (curr?.sigmets ?? [])
    .filter((s) => !seen.has(s.key))
    .map((s) => ({ type: 'SIGMET', target: s.label ?? s.key, role: null, dedupKey: `SIGMET:${s.key}` }))
}

export function detectChanges(prev, curr) {
  if (!prev) return [] // 첫 평가는 기준점만 잡는다
  return [...airportChanges(prev, curr), ...sigmetChanges(prev, curr)]
}

export default { detectChanges }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix backend test -- test/alert-diff.test.js
npm --prefix backend test
```

Expected: 앞의 것 PASS. 전체에서는 `evaluateFlight`가 아직 옛 인자(`{ minima }`)를 넘기고 `severity`를 저장하므로 실패할 수 있다 — Task 4에서 고친다.

- [ ] **Step 5: 커밋**

```bash
git status --short
git add backend/src/alerts/diff.js backend/test/alert-diff.test.js
git commit -m "feat(alerts): fire on condition transitions instead of seven judgements"
```

---

### Task 4: 적재를 새 판정에 맞춘다

**Files:**
- Modify: `backend/src/alerts/scheduler.js` (`evaluateFlight`, `insertAlert`, `userMinima` 제거)
- Modify: `backend/test/alert-scheduler.test.js`

**Interfaces:**
- Consumes: Task 3의 `detectChanges(prev, curr)`.
- Produces: `triggered_alerts` 행에 `type`·`target`·`dedup_key`가 새 어휘로 들어간다. `severity`는 컬럼을 남기되 고정값 `'ALERT'`를 넣는다 — 다섯 가지가 전부 "울릴 만한 것"이라 등급 구분의 쓸모가 없다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test('evaluateFlight: 새로 걸린 조건만 적재하고 같은 조건은 다시 넣지 않는다', () => {
  const db = createDb(':memory:')
  try {
    const route = seed(db)
    const cache = new Map()
    const clear = { sections: { adverse: { hazards: [] } } }

    // 1회차 = 기준점, 무발화
    const first = evaluateFlight({ db, route, briefing: clear, tafByIcao: { RKPC: tafFor(3000) }, cache })
    assert.equal(first.baseline, true)
    assert.equal(first.changes.length, 0)

    // 2회차 = 목적지가 IFR로 떨어짐
    const second = evaluateFlight({ db, route, briefing: clear, tafByIcao: { RKPC: tafFor(800) }, cache })
    assert.equal(second.changes.length, 1)
    assert.equal(second.changes[0].type, 'IFR')

    // 3회차 = 그대로 IFR — 다시 넣지 않는다
    const third = evaluateFlight({ db, route, briefing: clear, tafByIcao: { RKPC: tafFor(800) }, cache })
    assert.equal(third.changes.length, 0)

    const rows = db.prepare('SELECT type, target, severity FROM triggered_alerts WHERE route_id=?').all(route.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, 'IFR')
    assert.equal(rows[0].severity, 'ALERT')
  } finally { db.close() }
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/alert-scheduler.test.js
```

Expected: FAIL

- [ ] **Step 3: 최소 구현**

`scheduler.js`에서:

1. `userMinima` 함수를 **지운다**(사용자 미니마는 알림 판정에서 빠진다 — 브리핑 화면에서는 계속 쓰이므로 `users` 컬럼은 남긴다).
2. `insertAlert`의 값 부분을 새 어휘로 바꾼다.
3. `evaluateFlight`의 `detectChanges` 호출에서 인자를 뺀다.

```js
// 다섯 가지가 전부 "울릴 만한 것"이라 등급 구분의 쓸모가 없다. 컬럼은 남기되 고정값을 넣는다.
const ALERT_SEVERITY = 'ALERT'

function insertAlert(db, route, change, nowIso) {
  return db.prepare(`
    INSERT INTO triggered_alerts (user_id, route_id, type, severity, target, from_val, to_val, source_id, dedup_key, detected_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(route.user_id, route.id, change.type, ALERT_SEVERITY, change.target ?? null,
    null, null, change.role ?? null, change.dedupKey, nowIso).lastInsertRowid
}
```

`evaluateFlight` 안:

```js
    const changes = detectChanges(prev, curr)
    for (const c of changes) {
      if (alreadyFired(db, route.id, c.dedupKey)) continue
      const id = insertAlert(db, route, c, nowIso)
      inserted.push({ ...c, id })
    }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix backend test
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git status --short
git add backend/src/alerts/scheduler.js backend/test/alert-scheduler.test.js
git commit -m "feat(alerts): store transitions without severity tiers"
```

---

### Task 5: 문구와 발송 — Web Push 갈래

**Files:**
- Modify: `backend/src/alerts/sender.js`
- Modify: `backend/test/alert-sender.test.js`

**Interfaces:**
- Consumes: Task 3의 변화 객체, `sendPush(subscription, payload)` from `../push/send.js`.
- Produces: `formatAlert(alert, route)` — 한 줄 문구. `dispatchFlightAlerts(db, alerts, route, deps)` — 텔레그램(관리자)과 **Web Push(경로 소유자)** 둘 다.
- **`shouldPush`는 제거한다.**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test('formatAlert: 다섯 종류를 사람 말로 낸다', () => {
  const route = { dep: 'RKSI', dest: 'RKPC', altn: 'RKPK' }
  assert.match(formatAlert({ type: 'IFR', target: 'RKPC', role: 'dest' }, route), /도착 RKPC.*IFR/)
  assert.match(formatAlert({ type: 'TS', target: 'RKSI', role: 'dep' }, route), /출발 RKSI.*뇌전/)
  assert.match(formatAlert({ type: 'FG', target: 'RKPK', role: 'altn' }, route), /교체 RKPK.*안개/)
  assert.match(formatAlert({ type: 'SN', target: 'RKPC', role: 'dest' }, route), /눈/)
  assert.match(formatAlert({ type: 'SIGMET', target: 'SIGMET WS01' }, route), /SIGMET WS01/)
})

test('dispatchFlightAlerts: 경로 소유자의 구독으로 푸시한다', async () => {
  const db = createDb(':memory:')
  try {
    const uid = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)')
      .run('pilot', 'x', new Date().toISOString()).lastInsertRowid
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)')
      .run(uid, 'https://push.example/1', 'p', 'a', new Date().toISOString())

    const sent = []
    const result = await dispatchFlightAlerts(
      db,
      [{ id: 1, type: 'IFR', target: 'RKPC', role: 'dest' }],
      { id: 7, user_id: uid, dep: 'RKSI', dest: 'RKPC' },
      { now: Date.now(), sendPushImpl: async (sub, payload) => { sent.push({ sub, payload }) } },
    )

    assert.equal(result.push.sent, 1)
    assert.equal(sent[0].sub.endpoint, 'https://push.example/1')
    assert.match(sent[0].payload.body, /RKPC/)
    // 탭했을 때 그 비행으로 착지해야 한다.
    assert.match(sent[0].payload.url, /\?flight=7/)
  } finally { db.close() }
})

test('dispatchFlightAlerts: 만료된 구독은 지운다', async () => {
  const db = createDb(':memory:')
  try {
    const uid = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)')
      .run('pilot', 'x', new Date().toISOString()).lastInsertRowid
    db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)')
      .run(uid, 'https://push.example/gone', 'p', 'a', new Date().toISOString())

    const gone = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }) }
    const result = await dispatchFlightAlerts(db, [{ id: 1, type: 'FG', target: 'RKPC', role: 'dest' }],
      { id: 7, user_id: uid }, { now: Date.now(), sendPushImpl: gone })

    assert.equal(result.push.pruned, 1)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n, 0)
  } finally { db.close() }
})

test('구독이 없으면 조용히 넘어간다 — 인앱은 이미 저장됐다', async () => {
  const db = createDb(':memory:')
  try {
    const uid = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)')
      .run('pilot', 'x', new Date().toISOString()).lastInsertRowid
    const result = await dispatchFlightAlerts(db, [{ id: 1, type: 'TS', target: 'RKSI', role: 'dep' }],
      { id: 7, user_id: uid }, { now: Date.now(), sendPushImpl: async () => {} })
    assert.equal(result.push.sent, 0)
  } finally { db.close() }
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/alert-sender.test.js
```

Expected: FAIL

- [ ] **Step 3: 최소 구현**

`sender.js`에서 `SEV_TAG`·`formatAlert`의 옛 분기·`shouldPush`를 지우고 아래로 바꾼다. 텔레그램 경로(`sendTelegram`·`isAdminUser`·`markAlerts`)는 그대로 둔다.

```js
import { sendPush } from '../push/send.js'

const ROLE_KO = { dep: '출발', dest: '도착', altn: '교체' }
const at = (alert) => (alert.role && ROLE_KO[alert.role] ? `${ROLE_KO[alert.role]} ${alert.target}` : alert.target)

// 변화 1건 → 통지 한 줄. 담백한 통지체(이모지 미사용, 공식 통지 톤).
export function formatAlert(alert) {
  switch (alert.type) {
    case 'IFR': return `${at(alert)} IFR 이하 예보`
    case 'TS': return `${at(alert)} 뇌전 예보`
    case 'FG': return `${at(alert)} 안개 예보`
    case 'SN': return `${at(alert)} 눈 예보`
    case 'SIGMET': return `경로상 신규 SIGMET (${alert.target})`
    default: return `${at(alert)} ${alert.type}`
  }
}
```

`composeMessage`는 그대로 두되 `formatAlert(a, route)` 호출에서 두 번째 인자를 뺀다.

Web Push 갈래를 더한다.

```js
// 경로 소유자에게 Web Push. 만료 구독(404/410)은 me/push.js의 테스트 발송과 같은 방식으로 정리한다.
// sendPushImpl은 테스트 주입용 — 실제로는 push/send.js의 sendPush를 쓴다.
async function pushToOwner(db, alerts, route, deps) {
  const userId = route.user_id ?? alerts[0]?.user_id
  if (!db || userId == null || alerts.length === 0) return { sent: 0, pruned: 0 }
  const send = deps.sendPushImpl ?? sendPush
  const subs = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?').all(userId)
  if (subs.length === 0) return { sent: 0, pruned: 0 }

  const routeId = route.id ?? alerts[0]?.route_id
  const payload = {
    title: route.name || [route.dep, route.dest].filter(Boolean).join(' → ') || '비행 알림',
    body: alerts.map((a) => formatAlert(a)).join('\n'),
    url: routeId != null ? `/?flight=${routeId}` : '/',
  }

  let sent = 0
  const stale = []
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      sent += 1
    } catch (err) {
      // 만료·해지된 구독은 지운다. 그 밖의 오류는 알림 하나 때문에 평가 전체를 멈추지 않도록 삼킨다.
      if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(s.id)
      else console.warn(`[alert-sender] push 실패(user ${userId}):`, err?.message)
    }
  }
  if (stale.length) {
    const del = db.prepare('DELETE FROM push_subscriptions WHERE id=?')
    stale.forEach((id) => del.run(id))
  }
  return { sent, pruned: stale.length }
}
```

`dispatchFlightAlerts`를 고친다 — **심각도로 거르지 않는다.**

```js
// 이 비행의 이번 변화들을 한 건으로 묶어 보낸다(§5B group_wait). 인앱은 이미 행 저장 완료.
// 폰과 앱이 같은 규칙을 쓰므로 여기서 다시 거르지 않는다 — 판정은 diff.js가 이미 끝냈다.
export async function dispatchFlightAlerts(db, alerts = [], route = {}, deps = {}) {
  if (alerts.length === 0) return { text: '', telegram: { skipped: 'no_changes' }, push: { sent: 0, pruned: 0 }, count: 0 }
  const text = composeMessage(alerts, route, deps)
  const telegram = isAdminUser(db, route.user_id ?? alerts[0]?.user_id)
    ? await sendTelegram(text, { routeId: route.id ?? alerts[0]?.route_id }, deps)
    : { skipped: 'not_admin' }
  const push = await pushToOwner(db, alerts, route, deps)
  const pushedIds = telegram.ok === true || push.sent > 0 ? new Set(alerts.map((a) => a.id)) : new Set()
  markAlerts(db, alerts, pushedIds, { telegram, push }, deps)
  return { text, telegram, push, count: alerts.length }
}
```

`markAlerts`의 `status` 조립을 `JSON.stringify({ inapp: 'stored', ...channels })`로 맞춘다.

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix backend test
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git status --short
git add backend/src/alerts/sender.js backend/test/alert-sender.test.js
git commit -m "feat(alerts): push to the route owner and drop the severity gate"
```

---

### Task 6: 알림을 탭하면 그 비행으로

**Files:**
- Modify: `frontend/public/sw.js`

`sw.js:18`이 지금은 무조건 `/`를 연다. 발송 payload의 `url`을 쓰게 한다. 이미 열려 있는 창이 있으면 그 창을 쓴다 — 새 창이 계속 쌓이면 쓰기 어렵다.

- [ ] **Step 1: 구현**

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // 발송 payload의 url(=/?flight=<id>)로 간다. 없으면 첫 화면.
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 이미 열린 창이 있으면 그 창을 쓴다 — 알림마다 새 창이 쌓이면 쓰기 어렵다.
    for (const client of clientList) {
      if ('focus' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
```

그리고 `push` 리스너가 `url`을 알림에 실어야 한다.

```js
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/gisang-i/clear_3_avatar.png',
      badge: '/gisang-i/clear_3_avatar.png',
      data: { url: data.url || '/' },
    })
```

- [ ] **Step 2: 문법 확인**

```bash
node --check frontend/public/sw.js
```

Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git status --short
git add frontend/public/sw.js
git commit -m "feat(push): open the flight the notification is about"
```

---

### Task 7: 감시 창 6/12/24시간

**Files:**
- Modify: `backend/src/me/alerts.js:13` (검증 범위)
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx:14` (선택지)

기본 2시간은 너무 늦다. 이 알림은 전부 "갈까 말까"를 뒤집는 정보인데, 출발 2시간 전이면 이미 공항으로 가는 중이라 할 수 있는 것이 취소뿐이다.

- [ ] **Step 1: 백엔드 검증 범위를 넓힌다**

```js
  alertStartMinBeforeEtd: z.number().int().min(360).max(1440).optional(), // 6~24h
```

- [ ] **Step 2: 화면 선택지를 바꾼다**

```js
const WATCH_OPTIONS = [
  { label: '6시간 전', minutes: 360 },
  { label: '12시간 전', minutes: 720 },
  { label: '24시간 전', minutes: 1440 },
]
```

기본값이 `120`으로 박힌 곳이 있으면 `360`으로 바꾼다(`useState` 초기값 확인).

- [ ] **Step 3: 빌드와 테스트**

```bash
npm --prefix backend test
npm --prefix frontend run build
```

- [ ] **Step 4: 커밋**

```bash
git status --short
git add backend/src/me/alerts.js frontend/src/features/personal/PersonalSettingsPanel.jsx
git commit -m "feat(alerts): start watching six to twenty-four hours before departure"
```

---

### Task 8: 푸시 켜기 스위치

**Files:**
- Modify: `frontend/src/features/personal/usePersonalSettings.js`
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx`

**Interfaces:**
- Consumes: `GET /api/me/push/vapid-public-key`, `POST /api/me/push/subscribe`, `DELETE /api/me/push/subscribe` (모두 이미 있다).
- Produces: 훅이 `{ pushEnabled, pushSupported, togglePush }`를 추가로 낸다.

- [ ] **Step 1: 훅에 구독 상태를 더한다**

`developerApi.js`의 개발자 탭 코드가 같은 흐름을 이미 쓴다 — 그 순서를 따른다.

```js
  // Web Push 구독 — 브라우저 권한과 서버 등록이 둘 다 있어야 켜진 것이다.
  const [pushEnabled, setPushEnabled] = useState(false)
  const pushSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  const refreshPush = useCallback(async () => {
    if (!pushSupported) return
    try {
      const reg = await navigator.serviceWorker.ready
      setPushEnabled(Boolean(await reg.pushManager.getSubscription()))
    } catch { setPushEnabled(false) }
  }, [pushSupported])

  const togglePush = useCallback(async (on) => {
    const reg = await navigator.serviceWorker.ready
    if (!on) {
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/me/push/subscribe', {
          method: 'DELETE', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushEnabled(false)
      return { ok: true }
    }
    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' }
    if ((await Notification.requestPermission()) !== 'granted') return { ok: false, reason: 'denied' }
    const res = await fetch('/api/me/push/vapid-public-key', { credentials: 'include' })
    if (!res.ok) return { ok: false, reason: 'not_configured' }
    const { key } = await res.json()
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    await fetch('/api/me/push/subscribe', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    setPushEnabled(true)
    return { ok: true }
  }, [])
```

`applicationServerKey`가 base64url 문자열을 그대로 받는지 확인한다. `developerApi.js`/`TriggerTab.jsx:59`가 변환을 거치면 **같은 방식을 쓴다** — 두 곳이 다르면 한쪽이 조용히 깨진다.

`useEffect`로 `refreshPush()`를 부르고, 훅 반환에 `pushEnabled`·`pushSupported`·`togglePush`를 더한다.

- [ ] **Step 2: 화면에 스위치를 단다**

비행 알림 탭 **맨 위**에 놓는다.

```jsx
<label className={s.checkRow}>
  <input
    type="checkbox"
    checked={pushEnabled}
    disabled={!pushSupported}
    onChange={async (e) => {
      const result = await togglePush(e.target.checked)
      if (!result.ok) {
        setMsg({ intent: 'error', text: result.reason === 'denied'
          ? '브라우저에서 알림이 차단돼 있습니다. 주소창 옆 자물쇠에서 알림을 허용하세요.'
          : '푸시 알림이 서버에 설정돼 있지 않습니다.' })
      }
    }}
  />
  <span>푸시 알림 받기{!pushSupported && ' (이 브라우저는 지원하지 않습니다)'}</span>
</label>
```

**거부된 이유를 반드시 말한다** — 스위치가 조용히 안 켜지면 고장으로 읽힌다.

- [ ] **Step 3: "이상없음 확인" 체크박스를 제거한다**

`PersonalSettingsPanel.jsx`의 `변화 없어도 이상없음 확인 알림 받기` 체크박스와 `sendNoChangeConfirm` 전달을 지운다. `send_no_change_confirm` 컬럼을 **읽는 코드가 없어** 켜도 아무 일이 없었다. 무소식이 희소식인 것을 소식으로 만들면 진짜 경보와 섞인다.

`me/alerts.js`의 `sendNoChangeConfirm` 스키마 항목과 INSERT 값도 함께 지운다(컬럼은 DB에 남긴다 — 삭제 마이그레이션은 이 범위 밖).

- [ ] **Step 4: 빌드와 테스트**

```bash
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix backend test
```

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/personal/usePersonalSettings.js frontend/src/features/personal/PersonalSettingsPanel.jsx backend/src/me/alerts.js
git commit -m "feat(push): let a pilot turn push alerts on"
```

---

### Task 9: 앱 안 문구와 변경점 띠

**Files:**
- Modify: `frontend/src/features/notifications/notificationFormat.js`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`
- Delete: `frontend/src/features/notifications/FlightAlertDetail.jsx`

- [ ] **Step 1: 알림센터 문구를 새 종류에 맞춘다**

`formatNotification`의 옛 분기를 지우고 백엔드 `formatAlert`와 같은 어휘를 쓴다. **두 곳이 다르면 같은 알림이 폰과 앱에서 다르게 읽힌다.**

```js
const ROLE_KO = { dep: '출발', dest: '도착', altn: '교체' }
// 백엔드 sender.formatAlert 미러. 문구를 고칠 때 두 곳을 함께 고친다.
const at = (n) => (n.role && ROLE_KO[n.role] ? `${ROLE_KO[n.role]} ${n.target}` : (n.target ?? ''))

export function formatNotification(n) {
  switch (n.type) {
    case 'IFR': return `${at(n)} IFR 이하 예보`
    case 'TS': return `${at(n)} 뇌전 예보`
    case 'FG': return `${at(n)} 안개 예보`
    case 'SN': return `${at(n)} 눈 예보`
    case 'SIGMET': return `경로상 신규 SIGMET (${n.target})`
    default: return `${at(n)} ${n.type}`
  }
}
```

`severityLevel`·`severityTag`는 고정값 `'ALERT'` 하나만 받으므로 단순화한다.

```js
// 다섯 종류가 전부 "울릴 만한 것"이라 등급이 없다. 색과 글자를 하나로 둔다.
export const severityLevel = () => 'amber'
export const severityTag = () => '알림'
```

`role`이 알림 피드에 실려 오는지 확인한다 — 백엔드가 `source_id`에 담으므로(`Task 4`), 피드 API가 그것을 `role`로 내보내야 한다. 안 그러면 "도착 RKPC"가 "RKPC"로만 보인다.

- [ ] **Step 2: 변경점을 브리핑 상단 띠로 올린다**

`BriefingView.jsx` 헤더 아래, `BriefingBanner` 옆에 한 줄 띠를 넣는다. 딥링크로 들어온 사람은 이 띠를 먼저 읽고 아래에서 근거를 확인하고, 브리핑을 보러 온 사람은 지나쳐 내려간다.

`useNotifications()`에서 이 비행의 알림을 받아 최근 것부터 한 줄로 잇는다. 알림이 없으면 띠를 그리지 않는다.

- [ ] **Step 3: `FlightAlertDetail`을 지운다**

어디서도 렌더하지 않는 고아 파일이다(2단계에서 딥링크가 브리핑으로 직행하게 바뀌면서). 변경점 표시가 띠로 옮겨졌으므로 지운다.

```bash
git rm frontend/src/features/notifications/FlightAlertDetail.jsx
```

참조가 남아 있으면(테스트 포함) 함께 정리한다.

- [ ] **Step 4: 빌드와 테스트**

```bash
npm --prefix frontend run build
npm --prefix frontend test
```

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/notifications/notificationFormat.js frontend/src/features/route-briefing/BriefingView.jsx
git commit -m "feat(alerts): show what changed at the top of the briefing"
```

---

### Task 10: 관문

**Files:** 없음 (검증만)

- [ ] **Step 1: VAPID 키가 있는지 확인한다**

```bash
grep -c "VAPID_PUBLIC_KEY\|VAPID_PRIVATE_KEY" .env 2>/dev/null || echo "없음"
```

없으면 만들어 `.env`에 넣는다. **없으면 구독 등록이 503으로 거부되어 이 단계 전체를 검증할 수 없다.**

```bash
node -e "const w=require('./backend/node_modules/web-push'); const k=w.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY='+k.publicKey); console.log('VAPID_PRIVATE_KEY='+k.privateKey)"
```

- [ ] **Step 2: 서버를 띄운다**

```bash
ss -ltnp | grep -E ':3001|:5173'
DISABLE_COLLECTION=1 npm run dev:serve
```

- [ ] **Step 3: 관문 A — 스위치**

`test`/`test1234`로 로그인 → 내 계정 → 비행 알림 → **푸시 알림 받기** 켜기.

**통과 기준:** 브라우저가 알림 권한을 묻고, 허용하면 스위치가 켜진 채로 남는다. 새로고침해도 켜져 있다.

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db',{readonly:true});
console.log(db.prepare('SELECT user_id, substr(endpoint,1,40) e FROM push_subscriptions').all());
"
```

- [ ] **Step 4: 관문 B — 감시 등록**

브리핑을 저장하고(3단계 기능), 비행 알림에서 그것을 골라 **ETD를 현재 + 7시간**으로 등록한다(기본 감시 시작이 6시간 전이므로 아직 창 밖이다). 선택지가 **6/12/24시간**인지 확인한다.

- [ ] **Step 5: 관문 C — 실제로 폰이 울린다**

ETD를 현재 + 1시간으로 고쳐 감시 창 안에 넣고, 스케줄러를 두 번 돌린다.

```bash
curl -s -b <쿠키> -X POST http://127.0.0.1:3001/api/dev/tick | cat   # 1회차 = 기준점
# 개발자 탭에서 악기상 주입(TAF 조건 바꾸기)
curl -s -b <쿠키> -X POST http://127.0.0.1:3001/api/dev/tick | cat   # 2회차 = 발화
```

**통과 기준:**
- 2회차 응답의 `fired`가 1 이상
- **브라우저에 알림이 실제로 뜬다**
- 알림을 누르면 **그 비행의 브리핑**으로 간다
- 알림센터에 같은 문구가 같은 어휘로 보인다

- [ ] **Step 6: 관문 D — 반복해서 울리지 않는다**

같은 상태로 tick을 한 번 더 돌린다.

**통과 기준:** `fired`가 0. 같은 조건으로 다시 울리지 않는다.

- [ ] **Step 7: 관문 E — ETD를 지나면 멈춘다**

ETD를 과거로 바꾸고 tick.

**통과 기준:** `evaluated`가 0. 감시 창을 벗어났다.

- [ ] **Step 8: 결과를 상태 파일에 남긴다**

`docs/superpowers/status/2026-08-19-push-alerts.status.md`에 한 페이지로: 관문 A~E 결과, 실제 발송된 알림 문구, 남은 위험.

- [ ] **Step 9: 커밋**

```bash
git add docs/superpowers/status/2026-08-19-push-alerts.status.md
git commit -m "docs: record stage 4 gate results"
```

---

## 완료 조건

- `npm test` (루트) 전체 통과
- `npm --prefix frontend run build` 성공
- 관문 A~E 전부 통과 — 특히 **C(실제로 폰이 울린다)**
- 우리 커밋에 다른 세션의 변경이 섞이지 않았다

## 이 단계에서 하지 않는 것

- **회복·개선 알림** — 조용하면 이상없다는 것이 계약이다.
- **항목별 on/off 설정** — 다섯 개뿐이고 전부 비행 가부를 가른다. 끄고 싶은 항목이 생기면 그것은 설정이 필요하다는 뜻이 아니라 목록에서 빼야 한다는 뜻이다.
- **조용시간(야간 억제)** — 뇌전·안개 소식은 새벽에라도 알아야 아침 계획을 바꿀 수 있다.
- **감시 창을 ETA까지 연장** — 이륙하면 폰이 비행모드라 볼 방법이 없다.
- **사용자 미니마를 알림에 되살리기** — 공항별 기본 미니마(`categoryFor`)가 그 역할을 한다. 개인 미니마 설정은 브리핑 화면에서 계속 쓰이므로 컬럼과 화면은 남긴다.
- **`send_no_change_confirm` 컬럼 삭제** — 화면과 API에서만 뺀다. DB 마이그레이션은 범위 밖.
- **텔레그램 채널 제거** — 관리자용으로 그대로 둔다. 다만 발화 규칙은 새 규칙 하나를 따른다.
- **알림이 원본 브리핑의 수정을 따라가게 하기** — 등록 시점의 복제본을 감시한다(3단계 결정).
