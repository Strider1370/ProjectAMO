# 3단계: 저장된 브리핑과 내 계정 메뉴 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고도까지 확정된 브리핑을 저장하고, 내 계정 패널에서 다시 연다. 열 때 시각을 고른다. 비행 알림은 그 브리핑을 감시한다.

**Architecture:** 저장 형식과 API는 그대로 두고 스냅샷에 종류 표시(`kind`)만 더한다. 여는 것은 2단계에서 만든 `openSavedBriefing`을 쓰되 ETD를 갈아끼울 수 있게 한다. 새로 만드는 것은 종류 구분, 저장 동작, 계정 패널 화면이다.

**Tech Stack:** React 18 + Fluent UI, Express + better-sqlite3, `node --test`.

## Global Constraints

- 스펙: [2026-08-18 저장된 브리핑과 내 계정 메뉴](../specs/2026-08-18-saved-briefing-and-account-menu-design.md) · 선행: [2단계 상태](../status/2026-08-18-saved-route-load-without-research.status.md)
- **저장 payload 상한 20,000 B** (`backend/src/me/routes.js:8`). 2단계 실측 최대 9,280 B.
- **브리핑 저장 상한 5개.** 경로는 기존대로 100개.
- **저장 형식을 새로 만들지 않는다.** `routes` 테이블과 `POST /api/me/routes`를 그대로 쓰고 스냅샷에 `kind`만 더한다. 새 테이블·새 라우터·새 컬럼 금지.
- **브리핑 저장은 로그인 필수.** 게스트는 경로만 저장한다.
- **저장된 브리핑을 자동으로 지우지 않는다.** 같은 노선을 반복 비행하는 사용자가 많다.
- **수정 후 저장은 새 항목이다.** 덮어쓰기를 만들지 않는다.
- **기상을 저장하지 않는다.** 열 때마다 다시 계산한다.
- Linux 전용. 테스트는 `node --test`. 프레임워크 추가 금지.
- **작업 트리 주의:** 여러 세션이 공유한다. 커밋 시 `git add`로 해당 파일만 담는다. **`git add -A` 금지.**

## 사용자 결정 사항

이 계획은 아래 결정을 그대로 구현한다. 임의로 바꾸지 않는다.

| # | 결정 |
|---|---|
| 1 | 브리핑을 열 때 **현재시각으로 열지, 저장된 시각으로 열지** 고른다. 저장된 ETD가 이미 지났으면 현재시각만 고를 수 있다 |
| 2 | 브리핑을 고쳐 저장하면 **새 항목**이다 |
| 3 | 저장 시 **기본 이름에 노선·ETD·순항고도**를 넣는다. 사용자가 고칠 수 있다 |
| 4 | 브리핑 상한 **5개** |
| 5 | **자동 삭제 없음** |
| 6 | 알림이 감시할 브리핑을 고른다. ETD를 지나면 알림이 멈추는 것은 **이미 그렇게 되어 있다**(`me/alerts.js:29` `nowMs < etdMs`, `EXPIRE_MS` ETD+3h) — 손대지 않는다 |
| 7 | 게스트는 **경로만** 저장한다 |
| 8 | 기존 저장분은 **지운다** |
| 9 | 기능을 어떻게 발견하게 할지만 고민한다 |

**결정 4·5·2의 결과:** 브리핑을 다듬을 때마다 새 항목이 쌓이고 자동 정리가 없으므로 5칸이 금방 찬다. 상한에 닿으면 **어느 것을 지울지 사용자가 고르게** 안내한다(조용히 실패하지 않는다).

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `frontend/src/features/route-briefing/lib/routeStore.js` | `kind` 보존·필터, 브리핑 저장 | 수정 |
| `frontend/src/features/route-briefing/lib/routeStore.test.js` | 위 테스트 | 수정 |
| `frontend/src/features/route-briefing/lib/briefingName.js` | 기본 이름 조립 (순수) | **신규** |
| `frontend/src/features/route-briefing/lib/briefingName.test.js` | 위 테스트 | **신규** |
| `frontend/src/features/route-briefing/lib/savedRouteBriefing.js` | ETD 갈아끼우기 | 수정 |
| `frontend/src/features/route-briefing/useRouteBriefing.js` | 브리핑 저장·ETD 선택 열기 | 수정 |
| `frontend/src/features/route-briefing/BriefingView.jsx` | `브리핑 저장` 버튼 | 수정 |
| `frontend/src/features/account/AccountPanel.jsx` | 내 계정 화면 | **신규** |
| `frontend/src/app/App.jsx` | 계정 패널 연결 | 수정 |
| `frontend/src/features/settings/SettingsModal.jsx` | 개인설정 탭 제거 | 수정 |
| `frontend/src/features/personal/usePersonalSettings.js` | 알림 대상을 브리핑에서 | 수정 |
| `frontend/src/features/personal/PersonalSettingsPanel.jsx` | 라벨 문구 | 수정 |
| `backend/src/me/routes.js` | 브리핑 5개 상한 | 수정 |
| `backend/test/me-routes-briefing-limit.test.js` | 위 테스트 | **신규** |

---

## 배경

브리핑은 경로만으로 성립하지 않는다. 대안 비교와 순항고도를 거쳐야 나온다. 저장 경로를 불러와 곧바로 브리핑을 띄우면 **사용자가 정한 적 없는 고도의 판단 화면**이 뜬다 — 2단계에서 그렇게 만들었다가 되돌렸다.

알림도 같다. 스케줄러는 순항고도로 착빙·난류를 판정하는데 없으면 9000ft로 가정한다(`scheduler.js:19`). FL280 계획을 9000ft로 판정한 경보는 쓸모가 없다.

**되살리는 코드는 이미 있다.** `openSavedBriefing`(2단계, 관문 통과). 담을 재료도 이미 저장된다. 이 단계는 **구분·저장 동작·화면**이다.

---

### Task 1: 종류 표시와 목록 분리

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeStore.js`
- Modify: `frontend/src/features/route-briefing/lib/routeStore.test.js`

**Interfaces:**
- Produces:
  - `normalizeRouteSnapshot`이 `kind: 'route' | 'briefing'`을 보존한다. 없으면 `'route'`.
  - `listSavedRoutes({ kind })` — 종류로 거른 목록. 인자 없으면 전부.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test('normalizeRouteSnapshot: kind를 보존하고, 없으면 경로로 본다', () => {
  const briefing = normalizeRouteSnapshot({
    version: 3, kind: 'briefing',
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(briefing.kind, 'briefing')

  const legacy = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(legacy.kind, 'route')
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeStore.test.js
```

Expected: FAIL — `undefined !== 'briefing'`

- [ ] **Step 3: 최소 구현**

`routeStore.js`의 v3 분기에 한 줄:

```js
    version: 3,
    // 'route' = 경로(다음 비행의 출발점) · 'briefing' = 고도까지 확정된 한 번의 비행.
    kind: snapshot.kind === 'briefing' ? 'briefing' : 'route',
```

목록 조회에 필터를 더한다. 기존 `listSavedRoutes` 본문은 `listAllSavedRoutes`로 이름만 바꿔 내부에 남긴다(export 하지 않는다).

```js
// kind로 거른 목록. 인자 없으면 전부.
export async function listSavedRoutes({ kind } = {}) {
  const all = await listAllSavedRoutes()
  return kind ? all.filter((entry) => (entry.kind === 'briefing' ? 'briefing' : 'route') === kind) : all
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test
```

Expected: 전부 PASS. 인자 없이 부르던 곳들이 그대로 동작해야 한다.

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/lib/routeStore.js frontend/src/features/route-briefing/lib/routeStore.test.js
git commit -m "feat(route): tag saved snapshots as route or briefing"
```

---

### Task 2: 브리핑 기본 이름

목록에서 구분되려면 이름에 노선·ETD·순항고도가 있어야 한다. 같은 노선을 여러 번 저장하는 것이 정상 사용이다.

**Files:**
- Create: `frontend/src/features/route-briefing/lib/briefingName.js`
- Create: `frontend/src/features/route-briefing/lib/briefingName.test.js`

**Interfaces:**
- Produces: `defaultBriefingName({ departureAirport, arrivalAirport, etd, cruiseAltitudeFt }) -> string`. Task 3이 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { defaultBriefingName } from './briefingName.js'

test('노선·ETD·순항고도를 이름에 담는다', () => {
  const name = defaultBriefingName({
    departureAirport: 'RKSI', arrivalAirport: 'RJBB',
    etd: '2026-08-19T02:00:00Z', cruiseAltitudeFt: 28000,
  })
  assert.match(name, /RKSI/)
  assert.match(name, /RJBB/)
  assert.match(name, /0200Z/)   // 항공 표기: 콜론 없는 Zulu
  assert.match(name, /FL280/)
})

test('고도가 전이고도 미만이면 ft로 적는다', () => {
  const name = defaultBriefingName({
    departureAirport: 'RKSS', arrivalAirport: 'RKPC',
    etd: '2026-08-19T02:00:00Z', cruiseAltitudeFt: 9000,
  })
  assert.match(name, /9,000 ft/)
  assert.doesNotMatch(name, /FL/)
})

test('빠진 값이 있어도 만들 수 있는 만큼 만든다', () => {
  assert.equal(typeof defaultBriefingName({}), 'string')
  assert.ok(defaultBriefingName({}).length > 0)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/briefingName.test.js
```

Expected: FAIL — `Cannot find module './briefingName.js'`

- [ ] **Step 3: 최소 구현**

```js
// 저장 브리핑의 기본 이름. 같은 노선을 여러 번 저장하는 것이 정상이라, 목록에서 구분되려면
// 이름에 ETD와 순항고도가 있어야 한다.
const TRANSITION_ALTITUDE_FT = 14000 // 국내 전이고도. 이 위는 FL, 아래는 ft.

const hhmmZ = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

const altitudeLabel = (ft) => {
  const value = Number(ft)
  if (!Number.isFinite(value) || value <= 0) return null
  return value >= TRANSITION_ALTITUDE_FT
    ? `FL${String(Math.round(value / 100)).padStart(3, '0')}`
    : `${value.toLocaleString('en-US')} ft`
}

export function defaultBriefingName({ departureAirport, arrivalAirport, etd, cruiseAltitudeFt } = {}) {
  const route = [departureAirport, arrivalAirport].filter(Boolean).join(' → ')
  const parts = [route || '브리핑', hhmmZ(etd) && `ETD ${hhmmZ(etd)}`, altitudeLabel(cruiseAltitudeFt)]
  return parts.filter(Boolean).join(' · ')
}

export default { defaultBriefingName }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/briefingName.test.js
```

Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/lib/briefingName.js frontend/src/features/route-briefing/lib/briefingName.test.js
git commit -m "feat(briefing): name saved briefings by route, etd and altitude"
```

---

### Task 3: 브리핑 저장

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`

**Interfaces:**
- Consumes: `buildSavedGeometry`, `saveRoute`, `defaultBriefingName` (Task 2), `useAuth`.
- Produces: 훅 액션 `saveCurrentBriefing()` — `{ ok: true, entry } | { ok: false, reason }`.

- [ ] **Step 1: 훅에 저장 함수를 더한다**

`handleGenerateBriefing` 근처에 넣는다. 고도는 브리핑에 실제로 쓰인 값을 담는다.

```js
  // 브리핑 저장 — 고도까지 확정된 한 번의 비행을 통째로 남긴다. 경로 저장과 형식은 같고
  // kind로만 갈린다. 기상은 담지 않는다(열 때마다 새로 계산).
  // 게스트는 저장하지 않는다 — 브리핑은 알림 감시 대상이고 알림은 계정에 매인다.
  async function saveCurrentBriefing() {
    if (!briefing) return { ok: false, reason: 'no_briefing' }
    if (!user) return { ok: false, reason: 'login_required' }
    const base = routeDesigns.find((design) => design.id === activeAppliedDesignId)
      ?? routeDesigns.find((design) => design.id === 'base')
    const etdIso = Number.isFinite(Date.parse(etd)) ? new Date(etd).toISOString().replace('.000Z', 'Z') : null
    const suggested = defaultBriefingName({
      departureAirport: routeForm.departureAirport,
      arrivalAirport: routeForm.arrivalAirport,
      etd: etdIso,
      cruiseAltitudeFt,
    })
    const name = window.prompt('브리핑 이름', suggested)
    if (name == null) return { ok: false, reason: 'cancelled' }

    const { routeGeometry, enrouteGeometry, routeModel, routeMarkers } = buildSavedGeometry({
      routeResult: base?.routeResult ?? routeResult,
      vfrWaypoints: appliedVfrWaypoints,
      selectedSid, selectedStar, selectedIap,
    })
    const airacCycle = (await loadNavdata()).publicationId ?? null
    const entry = await saveRoute(name.trim() || suggested, {
      version: 3,
      kind: 'briefing',
      cruiseAltitudeFt, tasKt, etd: etdIso, eta,
      routeGeometry, enrouteGeometry, routeModel, routeMarkers, airacCycle,
      alternateAirport: alternateAirport || null,
      // 브리핑은 이미 고른 하나의 비행이다. 대안까지 담으면 payload가 커지고,
      // 열었을 때 "어느 것이 이 브리핑인가"가 다시 모호해진다.
      selectedAlternativeId: null,
      alternatives: [],
      base: base && {
        id: 'base', kind: 'base', name: base.name,
        routeForm: base.routeForm,
        procedureIds: { sid: base.procedures?.sid?.id ?? null, star: base.procedures?.star?.id ?? null, iapKey: base.procedures?.iapKey ?? null },
        enroute: base.enroute,
        routeString: base.routeString,
      },
    })
    return entry ? { ok: true, entry } : { ok: false, reason: 'save_failed' }
  }
```

`saveRoute`·`buildSavedGeometry`·`loadNavdata`·`defaultBriefingName`·`useAuth` import를 확인해 없으면 더한다. 훅 반환 `actions`에 `saveCurrentBriefing`을 노출한다.

- [ ] **Step 2: 브리핑 화면에 버튼을 단다**

`BriefingView.jsx`에 `onSaveBriefing` prop을 받아 버튼을 단다. 기존 Fluent `Button`과 `MessageBar` 패턴을 따른다.

```jsx
<Button appearance="primary" onClick={onSaveBriefing}>브리핑 저장</Button>
```

**저장 결과를 반드시 알린다 — 여기가 기능을 발견하게 만드는 자리다(결정 9).**

| 결과 | 문구 |
|---|---|
| 성공 | `저장했습니다 — 왼쪽 아래 프로필 > 저장한 브리핑에서 다시 열 수 있습니다` |
| `login_required` | `브리핑을 저장하려면 로그인하세요` |
| `save_failed` (상한) | `저장한 브리핑이 5개입니다 — 계정에서 하나를 지우고 다시 시도하세요` |

- [ ] **Step 3: 빌드 확인**

```bash
npm --prefix frontend run build
```

Expected: 성공. `appliedVfrWaypoints`·`selectedIap`·`activeAppliedDesignId`·`user`가 훅 스코프에 있는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/BriefingView.jsx
git commit -m "feat(briefing): save a briefing with its cruise altitude"
```

---

### Task 4: 브리핑 5개 상한 (백엔드)

**Files:**
- Modify: `backend/src/me/routes.js`
- Create: `backend/test/me-routes-briefing-limit.test.js`

**Interfaces:**
- Produces: `POST /api/me/routes`가 `snapshot.kind === 'briefing'`일 때 6번째부터 `400 { error: 'too_many_briefings' }`.

컬럼을 새로 만들지 않는다. 저장물이 사용자당 최대 100개라 payload를 훑어 세도 부담이 없다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/`의 기존 라우터 테스트(`me-alerts-delete.test.js` 등)가 쓰는 방식을 먼저 읽고 같은 골격을 쓴다. 세션 없이 라우터를 부르려면 그 파일들이 쓰는 `db` 주입과 `requireAuth` 우회 방식을 따른다.

```js
test('POST /routes: 브리핑은 5개까지', async () => {
  // 브리핑 5개를 넣은 뒤 6번째가 400 too_many_briefings로 거부돼야 한다.
  // 경로(kind 없음/route)는 같은 상한에 걸리지 않는다.
})
```

실제 단언은 그 파일들의 요청 헬퍼에 맞춰 채운다.

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/me-routes-briefing-limit.test.js
```

Expected: FAIL — 6번째가 201로 통과한다

- [ ] **Step 3: 최소 구현**

`me/routes.js`에 상한과 검사를 더한다.

```js
const MAX_ROUTES = 100
const MAX_BRIEFINGS = 5 // 브리핑은 확정된 한 번의 비행이라 몇 개면 충분하다. 자동 삭제가 없으므로 낮게 둔다.
```

`POST /routes`의 개수 검사 옆에 더한다.

```js
    if (parsed.data.snapshot?.kind === 'briefing') {
      // kind는 payload 안에만 있다(컬럼을 새로 만들지 않는다). 사용자당 최대 100행이라
      // 훑어 세도 부담이 없다.
      const briefings = db2.prepare('SELECT payload FROM routes WHERE user_id = ?').all(req.session.userId)
        .filter((row) => { try { return JSON.parse(row.payload).kind === 'briefing' } catch { return false } })
      if (briefings.length >= MAX_BRIEFINGS) return res.status(400).json({ error: 'too_many_briefings' })
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
git add backend/src/me/routes.js backend/test/me-routes-briefing-limit.test.js
git commit -m "feat(routes): cap saved briefings at five"
```

---

### Task 5: 열 때 시각을 고른다

저장된 ETD는 고정이다. 하루만 지나도 과거 시각이 되고, 과거에 대한 예보는 없어 브리핑이 빈다.

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/savedRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/lib/savedRouteBriefing.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`

**Interfaces:**
- Produces:
  - `buildSavedBriefingInputs(saved, { etd } = {})` — `etd`를 주면 그 시각으로 갈아끼우고 ETA를 거리·TAS로 다시 계산한다.
  - `isSavedEtdPast(saved, now)` — 저장된 ETD가 지났는지. 계정 패널이 선택지를 켜고 끄는 데 쓴다.
  - `openSavedBriefing(saved, { etd } = {})`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test('ETD를 갈아끼우면 ETA도 다시 계산한다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ eta: '2026-08-18T03:30:00Z' }), { etd: '2026-08-20T05:00:00Z' })
  assert.equal(out.etd, '2026-08-20T05:00:00Z')
  assert.ok(Date.parse(out.eta) > Date.parse(out.etd), '저장된 ETA를 그대로 쓰면 안 된다')
})

test('ETD를 안 주면 저장된 값을 쓴다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ eta: '2026-08-18T03:30:00Z' }))
  assert.equal(out.etd, '2026-08-18T02:00:00Z')
  assert.equal(out.eta, '2026-08-18T03:30:00Z')
})

test('isSavedEtdPast: 저장된 ETD가 지났는지 알려준다', () => {
  const saved = savedRoute()
  assert.equal(isSavedEtdPast(saved, Date.parse('2026-08-18T01:00:00Z')), false)
  assert.equal(isSavedEtdPast(saved, Date.parse('2026-08-18T03:00:00Z')), true)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/savedRouteBriefing.test.js
```

Expected: FAIL

- [ ] **Step 3: 최소 구현**

`buildSavedBriefingInputs`의 시그니처와 ETD 결정부를 고친다.

```js
export function buildSavedBriefingInputs(rawSaved, { etd: etdOverride = null } = {}) {
  ...
  // 시각을 갈아끼우면 저장된 ETA는 버린다 — 그 ETA는 옛 ETD 기준이라 비행시간이 어긋난다.
  const etd = isoOf(etdOverride) ?? isoOf(saved.etd)
  const distanceNm = geometryDistanceNm(routeGeometry)
  const eta = (etdOverride ? null : isoOf(saved.eta)) ?? isoOf(computeEtaIso(etd, distanceNm, saved.tasKt)) ?? null
```

그리고 판정 함수를 더한다.

```js
// 저장된 ETD가 지났는지. 지난 브리핑은 그 시각으로 열어봐야 예보가 없어 빈 화면이 된다.
export function isSavedEtdPast(rawSaved, nowMs = Date.now()) {
  const parsed = Date.parse(normalizeRouteSnapshot(rawSaved ?? {}).etd)
  return Number.isFinite(parsed) ? parsed <= nowMs : true
}
```

`openSavedBriefing`이 옵션을 넘기게 한다.

```js
  async function openSavedBriefing(saved, { etd } = {}) {
    const inputs = buildSavedBriefingInputs(saved, { etd })
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test
npm --prefix frontend run build
```

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/lib/savedRouteBriefing.js frontend/src/features/route-briefing/lib/savedRouteBriefing.test.js frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "feat(briefing): open a saved briefing at a chosen departure time"
```

---

### Task 6: 내 계정 패널

**Files:**
- Create: `frontend/src/features/account/AccountPanel.jsx`
- Modify: `frontend/src/app/App.jsx`
- Modify: `frontend/src/features/settings/SettingsModal.jsx`

**Interfaces:**
- Consumes: `listSavedRoutes({ kind: 'briefing' })` (Task 1), `isSavedEtdPast` (Task 5), `PersonalSettingsContent` (기존), `useAuth`.

- [ ] **Step 1: 계정 패널을 만든다**

`PersonalSettingsPanel.jsx`의 Fluent 사용 방식과 `SettingsModal.jsx`의 탭 구성을 따른다.

구성:
- 상단: 사용자 이름·역할
- **저장한 브리핑** — 각 줄에 이름(노선·ETD·고도가 이미 들어 있다), 저장 시각(`relativeTime` 재사용), `삭제`, 그리고 **여는 시각 선택**
- **개인설정** — `PersonalSettingsContent`를 그대로 렌더
- 로그아웃

여는 시각 선택(결정 1):

```jsx
<Button onClick={() => onOpenBriefing(entry, { etd: nowIso() })}>지금 시각으로 열기</Button>
<Button
  onClick={() => onOpenBriefing(entry)}
  disabled={isSavedEtdPast(entry)}
  title={isSavedEtdPast(entry) ? '저장된 출발시각이 지나 예보가 없습니다' : undefined}
>저장된 시각으로 열기</Button>
```

`disabled`에 `title`을 반드시 붙인다 — 왜 못 누르는지 보이지 않으면 고장으로 읽힌다.

목록이 비면: `저장한 브리핑이 없습니다 — 브리핑 화면에서 [브리핑 저장]을 누르면 여기에 담깁니다`. 5개가 차면 그 사실과 지우는 방법을 한 줄로 안내한다.

- [ ] **Step 2: 로그인 버튼을 계정 패널로 잇는다**

`App.jsx:221`을 바꾼다.

```jsx
onProfileClick={() => (user ? setAccountOpen(true) : setAuthOpen(true))}
```

`accountOpen` 상태와 `AccountPanel` 렌더를 더한다. `onOpenBriefing`은 `mapRef.current?.loadRouteBriefing?.(entry, opts)`로 잇는다 — 2단계 딥링크가 쓰는 통로다. `MapView`의 `loadRouteBriefing`이 두 번째 인자를 넘기도록 함께 고친다.

- [ ] **Step 3: 설정 모달에서 개인설정 탭을 뺀다**

`SettingsModal.jsx:48`의 `<Tab value="personal" ...>`와 `:82`의 렌더, `PersonalSettingsContent` import를 제거한다. 표시 설정만 남는다.

**`PersonalSettingsPanel.jsx`는 지우지 않는다** — 계정 패널이 그대로 쓴다.

- [ ] **Step 4: 빌드와 테스트**

```bash
npm --prefix frontend run build
npm --prefix frontend test
```

Expected: 둘 다 성공. 설정 모달의 개인설정 탭을 기대하는 테스트가 있으면 계정 패널로 옮긴다. **그냥 지우지 않는다.**

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/account/AccountPanel.jsx frontend/src/app/App.jsx frontend/src/features/settings/SettingsModal.jsx frontend/src/features/map/MapView.jsx
git commit -m "feat(account): gather saved briefings and personal settings in one place"
```

---

### Task 7: 알림이 브리핑을 감시한다

**Files:**
- Modify: `frontend/src/features/personal/usePersonalSettings.js`
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx`

알림 등록은 대상을 복제해 `alert_enabled=1` 행을 만든다(`me/alerts.js:62`). 복제되는 것이 브리핑이면 payload에 순항고도가 들어 있어 `buildBriefingRequest`가 `p.cruiseAltitudeFt`를 읽는다(`scheduler.js:45`). **백엔드는 고칠 것이 없다.**

- [ ] **Step 1: 대상 목록을 브리핑으로 바꾼다**

```js
  // 감시 대상은 저장된 브리핑이다 — 순항고도가 확정돼 있어야 착빙·난류 판정이 맞는다.
  // 경로만으로는 고도를 몰라 스케줄러가 9000ft로 가정한다(scheduler.js DEFAULT_CRUISE_ALT_FT).
  const refreshTemplates = useCallback(async () => {
    if (!user) return
    try { setTemplates(await listSavedRoutes({ kind: 'briefing' })) }
    catch { /* best-effort */ }
  }, [user])
```

- [ ] **Step 2: 라벨을 고친다**

`경로 템플릿` → `감시할 브리핑`. `aria-label`도 함께. 목록이 비면 `저장한 브리핑이 없습니다 — 브리핑 화면에서 먼저 저장하세요`.

- [ ] **Step 3: 빌드와 테스트**

```bash
npm --prefix frontend run build
npm --prefix frontend test
```

- [ ] **Step 4: 커밋**

```bash
git status --short
git add frontend/src/features/personal/usePersonalSettings.js frontend/src/features/personal/PersonalSettingsPanel.jsx
git commit -m "feat(alerts): watch saved briefings instead of routes"
```

---

### Task 8: 관문

**Files:** 없음 (검증만)

- [ ] **Step 1: 기존 저장분을 지운다 (결정 8)**

개발 DB의 저장 경로 2건은 종류 표시가 없는 과도기 데이터다. 지우고 새로 만든다.

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db');
console.log('삭제 전:', db.prepare('SELECT COUNT(*) n FROM routes').get());
db.prepare('DELETE FROM triggered_alerts').run();
db.prepare('DELETE FROM routes').run();
console.log('삭제 후:', db.prepare('SELECT COUNT(*) n FROM routes').get());
"
```

`triggered_alerts`를 먼저 지우는 이유: 알림 기록이 경로를 참조 중이면 외래키가 삭제를 막는다(`scheduler.js:179` 주석 참조).

- [ ] **Step 2: 서버를 띄운다**

```bash
ss -ltnp | grep -E ':3001|:5173'
DISABLE_COLLECTION=1 npm run dev:serve
```

자동수집은 끄되 admin 자동 로그인은 하지 않는다 — 일반 사용자로 확인한다.

- [ ] **Step 3: 관문 A — 저장**

`test`/`test1234`로 로그인. 경로를 만들고 대안 비교·고도 설정을 거쳐 브리핑까지 간 뒤 `브리핑 저장`.

**통과 기준:**
- 이름 기본값에 **노선·ETD·순항고도**가 들어 있다
- 저장 후 **어디서 다시 열 수 있는지 알려주는 문구**가 뜬다

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db',{readonly:true});
for (const r of db.prepare('SELECT id, name, payload FROM routes ORDER BY id').all()) {
  const p=JSON.parse(r.payload);
  console.log(r.id, r.name, { kind: p.kind, bytes: Buffer.byteLength(r.payload,'utf8'), alt: p.cruiseAltitudeFt, etd: p.etd });
}"
```

`kind`가 `briefing`, `cruiseAltitudeFt`가 화면에서 고른 값, 크기 20,000 B 미만.

- [ ] **Step 4: 관문 B — 계정 패널에서 연다**

브라우저를 완전히 새로 고치고 사이드바 프로필을 누른다.

**통과 기준:**
- 계정 패널이 열리고 저장한 브리핑이 보인다
- `저장된 시각으로 열기`가 **눌린다**(ETD가 아직 안 지났으므로) → 브리핑이 그 고도로 뜨고 NAVLOG·연직단면도가 채워져 있다
- `지금 시각으로 열기`를 누르면 ETD가 현재로 바뀌고 ETA가 다시 계산된다
- 개인설정(미니마·비행 알림)이 같은 패널 안에 있다
- 설정 모달에는 개인설정 탭이 없다

- [ ] **Step 5: 관문 C — 지난 브리핑**

DB에서 그 브리핑의 `etd`를 과거로 바꾼 뒤 패널을 다시 연다.

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db');
const row=db.prepare(\"SELECT id,payload FROM routes WHERE payload LIKE '%\\\"kind\\\":\\\"briefing\\\"%' LIMIT 1\").get();
const p=JSON.parse(row.payload); p.etd='2026-08-01T00:00:00Z';
db.prepare('UPDATE routes SET payload=? WHERE id=?').run(JSON.stringify(p), row.id);
console.log('과거로 바꿈:', row.id);
"
```

**통과 기준:** `저장된 시각으로 열기`가 **비활성**이고, 왜 못 누르는지 안내가 보인다. `지금 시각으로 열기`는 정상 동작한다.

- [ ] **Step 6: 관문 D — 목록이 섞이지 않는다**

경로도 하나 저장한 뒤 `경로` 메뉴와 계정 패널을 각각 연다.

**통과 기준:** 경로 목록에 브리핑이 없고, 브리핑 목록에 경로가 없다.

- [ ] **Step 7: 관문 E — 상한 5개**

브리핑을 6개째 저장한다.

**통과 기준:** 거부되고, **몇 개까지이며 어떻게 지우는지** 알려주는 문구가 뜬다. 조용히 실패하지 않는다.

- [ ] **Step 8: 관문 F — 알림이 브리핑을 감시한다**

계정 패널 > 비행 알림에서 저장한 브리핑을 골라 ETD를 현재 + 1시간으로 등록하고 스케줄러를 1회 돌린다.

**통과 기준:** `evaluated >= 1`, `skipped == 0`. 그리고 감시 행 payload에 `cruiseAltitudeFt`가 있어 9000ft 기본값을 쓰지 않는다.

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db',{readonly:true});
for (const r of db.prepare('SELECT id, name, payload FROM routes WHERE alert_enabled=1').all()) {
  console.log(r.id, r.name, 'alt:', JSON.parse(r.payload).cruiseAltitudeFt);
}"
```

- [ ] **Step 9: 결과를 상태 파일에 남긴다**

`docs/superpowers/status/2026-08-19-saved-briefings-and-account-menu.status.md`에 한 페이지로: 저장물 종류·크기·고도, 관문 A~F 결과, 남은 위험.

- [ ] **Step 10: 커밋**

```bash
git add docs/superpowers/status/2026-08-19-saved-briefings-and-account-menu.status.md
git commit -m "docs: record stage 3 gate results"
```

---

## 완료 조건

- `npm test` (루트) 전체 통과
- `npm --prefix frontend run build` 성공
- 관문 A~F 전부 통과
- 우리 커밋에 다른 세션의 변경이 섞이지 않았다

## 이 단계에서 하지 않는 것

- **푸시 알림** — 4단계. 발송 규칙·감시창·구독 스위치는 [2026-08-17 스펙](../specs/2026-08-17-saved-route-briefing-and-push-design.md)의 3단계 절 그대로.
- **변경점 띠와 `FlightAlertDetail` 제거** — 4단계.
- **덮어쓰기 저장** — 결정 2에 따라 항상 새 항목.
- **자동 삭제** — 결정 5에 따라 만들지 않는다.
- **게스트 브리핑 저장** — 결정 7에 따라 경로만.
- **알림과 원본 브리핑의 연동** — 알림은 등록 시점의 복제본을 감시한다. 원본을 고쳐도 따라가지 않는다. 4단계에서 알림 규칙을 손볼 때 함께 본다.
- **저장 형식 변경** — `kind` 한 필드만. 새 테이블·새 컬럼 금지.
