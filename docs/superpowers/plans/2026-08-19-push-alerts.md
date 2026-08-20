# 4단계: 푸시 알림 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록한 비행의 기상이 바뀌면 조종사 폰으로 알림이 간다.

**Architecture:** `diff.js`의 7종 판정을 걷어내고, 새 TAF에서 뽑은 **공항별 4개 불리언(IFR·TS·FG·SN)의 상태 전이 + 경로상 신규 SIGMET**으로 대체한다. 폰과 앱이 같은 규칙을 쓰므로 심각도로 채널을 가르는 층(`shouldPush`)이 사라진다. 발송은 이미 있는 Web Push 배관(`push/send.js`·`me/push.js`·`sw.js`)에 갈래 하나를 잇는다.

**Tech Stack:** Express + better-sqlite3, `web-push`(VAPID), React 18 + Fluent UI, Service Worker, `node --test`.

## Global Constraints

- 스펙: [2026-08-17 저장 경로 브리핑·푸시](../specs/2026-08-17-saved-route-briefing-and-push-design.md)의 **3단계 절** · 감시 대상 변경은 [2026-08-18 스펙](../specs/2026-08-18-saved-briefing-and-account-menu-design.md)
- 선행: [1단계](../status/2026-08-17-saved-route-geometry.status.md) · [2단계](../status/2026-08-18-saved-route-load-without-research.status.md) · [3단계](../status/2026-08-19-saved-briefings-and-account-menu.status.md) — 모두 완료·병합·배포
- **새 임계값을 정의하지 않는다.** 공항 접근최저치는 `flight-category.js`의 표를, 운고·시정 수치는 `taf-window.js`의 `metricsAt()`를 그대로 쓴다. 미설정 시 기본값(1500ft/5000m)은 이미 화면의 VFR 프리셋이자 이 앱의 IFR 판정선과 같은 값이다.
- **판정선은 `max(내 미니마, 공항 접근최저치)`.** 둘 다 바닥이라 먼저 걸리는 쪽이 실제 제약이다. 어느 쪽이 걸렸는지는 문구로 갈린다.
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
| `backend/src/briefing/taf-window.js` | 유효기간 밖이면 null + `weatherAt` | 수정 |
| `backend/test/taf-window.test.js` | 위 테스트 | 수정 |
| `backend/src/alerts/taf-conditions.js` | 그 시각 → `{ifr, ts, fg, sn}` (순수) | **신규** |
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
| `frontend/src/features/notifications/pushKey.js` | VAPID 키 변환 (공용) | **신규** |
| `frontend/src/features/developer/tabs/TriggerTab.jsx` | 지역 정의 → 공용 모듈 | 수정 |
| `frontend/src/features/personal/usePersonalSettings.js` | 푸시 구독 상태 | 수정 |
| `frontend/src/features/notifications/FlightAlertDetail.jsx` | 삭제 | **삭제** |

---

### Task 1: 내 시각의 조건을 정확히 읽는다

폰이 울릴 조건의 핵심. 순수 함수라 테스트가 쉽고, 여기가 맞으면 나머지는 배선이다.

#### 판정선은 "내가 갈 수 있느냐"다

고정 IFR선(5000m/1500ft)으로 판정하지 않는다. 그 선은 "공항이 계기비행 상태"라는 사실일 뿐,
**이 조종사가 갈 수 있느냐**와는 다르다. 대신 **실효 미니마** 하나로 본다.

```
실효 미니마 = max(내 미니마, 공항 접근최저치)
```

둘 다 "바닥"이라 **먼저 걸리는 쪽이 실제 제약**이다. 값이 큰 쪽(더 엄격한 쪽)을 쓴다.

- **내 미니마가 더 엄격** — 청주(550m) 가는데 내 기준이 5000m면 5000m에서 울린다. 정상적인 경우다.
- **공항 최저치가 더 엄격** — 내 기준을 200m로 잡았는데 그 공항 접근최저치가 550m라면,
  **400m에서 이미 아무도 착륙 못 한다.** 내 기준만 보면 그때 조용해서 **못 가는 걸 갈 수 있다고
  착각하게 만든다.** 알림이 있는 게 없느니만 못한 상황이다. 이 경우가 이 규칙의 존재 이유다.

**내 미니마를 설정하지 않았으면 VFR 기본값(1500ft / 5000m)을 쓴다.** 그 값이 고정 IFR선과
정확히 같아서, 미설정 사용자는 예전의 "IFR이면 울린다"와 같은 동작을 얻는다. 그래서 조건을
하나로 합칠 수 있다 — `IFR`과 `미니마 미만`을 따로 두면 VFR 프리셋(1500ft/5000m)을 쓰는
사용자에게 **항상 두 알림이 같이 간다.**

**어느 쪽이 걸렸는지는 문구로 갈린다.** 공항 최저치 때문에 걸렸는데 "내 미니마 미만"이라고
하면 거짓말이 된다.

| 걸린 쪽 | 문구 |
|---|---|
| 내 미니마 | `도착 RJBB 내 미니마 미만 예보` |
| 공항 접근최저치 | `도착 RKTU 접근최저치 미만 예보` — 아무도 못 내린다 |
| 미설정(VFR 기본) | `도착 RJBB IFR 이하 예보` |

**해외 공항은 접근최저치 자료가 없다**(표에 한국 공항만 있다). 그러면 내 미니마만 적용된다.
**인천·김포는 운고 최저치가 없다**(`ceilingFt: null`) — 운고는 내 미니마만 걸린다.

#### 그 시각을 정확히 집는다

**두 가지를 함께 고친다** — 둘 다 "그 시각의 상태를 맞게 읽는다"라는 하나의 일이다.

1. **유효기간 밖을 물으면 `null`을 준다.** 지금 `metricsAt`은 가장 가까운 항목을 거리 제한 없이
   고른다(`taf-window.js:225-231`). TAF 유효기간을 넘는 시각을 물으면 마지막 항목을 조용히
   돌려줘 **몇 시간 떨어진 예보로 판정**한다. 감시 시작이 24시간 전이면 그때의 ETA가 유효기간을
   넘어설 수 있어 실제로 닿는 경로다. 바로 아래 `alternateRequired`는 이미 ±1시간으로 제한한다 —
   같은 파일에서 여기만 빠져 있다. `metricsAt`은 **알림 스케줄러만 쓰므로**(다른 소비처 없음)
   고쳐도 브리핑에 파장이 없다.

2. **현상을 타임라인에서 읽는다.** `base.wx`와 변화 그룹을 손으로 훑지 않는다. 파서가 이미
   시간 단위로 병합한 결과를 `timeline[].weather`에 담아 둔다(`taf-parser.js:359`) — BECMG 누적,
   TEMPO/PROB 구간 적용, `wx_touched` 판정까지 끝난 상태다. 손으로 훑으면 그것을 다시,
   더 나쁘게 구현하게 된다(BECMG 누적이 빠진다). 타임라인을 쓰면 **운고·시정과 현상이 같은
   항목에서 나와** 시각이 어긋나지 않는다.

   `scheduler.js:49`의 주석 "timeline엔 wx가 없어"는 **틀렸다** — 필드 이름이 `wx`가 아니라
   `weather`다. 그 함수(`departureTs`)는 Task 2에서 지운다.

**PROB·TEMPO도 발화한다(결정).** 파서가 그것을 타임라인에 병합하므로 그대로 조건이 된다.
브리핑 화면이 보여주는 것과 알림이 같아야 하기 때문이다 — 브리핑엔 있는데 알림이 조용하면
"알림이 안 왔으니 괜찮겠지" 하고 브리핑을 안 보게 된다. 상태 전이 방식이라 두 번 울리지는 않는다.

**Files:**
- Modify: `backend/src/briefing/flight-category.js` (공항 최저치 조회 노출)
- Modify: `backend/src/briefing/taf-window.js` (제한 있는 조회 + `weatherAt`)
- Modify: `backend/test/taf-window.test.js`
- Create: `backend/src/alerts/taf-conditions.js`
- Create: `backend/test/taf-conditions.test.js`

**Interfaces:**
- Produces:
  - `airportMinima(icao)` from `flight-category.js` — `{ visibilityM, ceilingFt } | null`.
  - `metricsAt(taf, iso)` — 기존과 같되 **가장 가까운 항목이 30분을 넘게 떨어져 있으면 `null`**.
  - `weatherAt(taf, iso)` — 같은 항목의 병합된 현상 배열. 항목이 없으면 `[]`.
  - `tafConditionsAt(taf, iso, icao, userMinima) -> { minima, minimaBound, ts, fg, sn }`
    - `minima`: 실효 미니마 미만인가 (불리언)
    - `minimaBound`: `'personal' | 'airport' | 'default' | null` — 어느 쪽이 걸렸는지. 문구가 쓴다
    - Task 2가 쓴다.

- [ ] **Step 1: 공항 최저치 조회를 노출한다**

`flight-category.js`의 `minimaFor`는 내부 함수다. 알림이 실효 미니마를 계산하려면 그 값이 필요하다.
**표를 복사하지 않는다** — 복사하면 한쪽만 고쳐져 조용히 갈라진다.

```js
// 공항 접근최저치. 알림이 실효 미니마(= max(내 미니마, 이 값))를 계산하는 데 쓴다.
// 표를 복사해 쓰지 말 것 — 한쪽만 고쳐지면 판정이 조용히 갈린다.
export function airportMinima(icao) {
  return minimaFor(icao)
}
```

- [ ] **Step 2: 제한 있는 조회에 실패하는 테스트를 쓴다**

`backend/test/taf-window.test.js`에 더한다. 그 파일의 기존 `taf` 픽스처 구성 방식을 먼저 읽고 맞춘다.

```js
test('metricsAt: 유효기간을 벗어난 시각이면 null — 엉뚱한 시각 값을 조용히 주면 안 된다', () => {
  const t = {
    header: { icao: 'RKSI' },
    timeline: [
      { time: '2026-08-20T02:00:00Z', visibility: { value: 9999 }, clouds: [], weather: [] },
      { time: '2026-08-20T03:00:00Z', visibility: { value: 9999 }, clouds: [], weather: [] },
      { time: '2026-08-20T04:00:00Z', visibility: { value: 9999 }, clouds: [], weather: [] },
    ],
  }
  assert.ok(metricsAt(t, '2026-08-20T03:20:00Z'), '구간 안이면 준다')
  assert.equal(metricsAt(t, '2026-08-20T09:00:00Z'), null, '5시간 밖이면 주지 않는다')
})

test('weatherAt: 같은 항목의 병합된 현상을 준다', () => {
  const wx = [{ raw: 'FG', intensity: 'MODERATE', descriptor: null, phenomena: ['FG'] }]
  const t = {
    header: { icao: 'RKSI' },
    timeline: [{ time: '2026-08-20T03:00:00Z', visibility: { value: 400 }, clouds: [], weather: wx }],
  }
  assert.deepEqual(weatherAt(t, '2026-08-20T03:10:00Z'), wx)
  assert.deepEqual(weatherAt(t, '2026-08-20T09:00:00Z'), [], '유효기간 밖이면 빈 배열')
})
```

- [ ] **Step 3: 실패를 확인한다**

```bash
npm --prefix backend test -- test/taf-window.test.js
```

Expected: FAIL — `metricsAt`이 `null` 대신 값을 준다

- [ ] **Step 4: 제한 있는 조회를 구현한다**

`taf-window.js`의 `metricsAt`을 아래로 바꾸고 `weatherAt`을 더한다.

```js
// 타임라인은 유효기간을 시간 단위로 덮는다. 그래서 구간 안이면 가장 가까운 항목이 30분을
// 넘게 떨어질 수 없다. 30분을 넘으면 유효기간 밖을 물은 것이다 — 그때 마지막 항목을 돌려주면
// 몇 시간 떨어진 예보로 판정하게 되고, 아무 표시도 남지 않는다.
const NEAREST_LIMIT_MS = 30 * 60 * 1000

function nearestEntry(taf, iso) {
  const timeline = taf?.timeline ?? []
  const target = Date.parse(iso)
  if (timeline.length === 0 || !Number.isFinite(target)) return null
  let best = null
  for (const entry of timeline) {
    const t = Date.parse(entry.time)
    if (!Number.isFinite(t)) continue
    const delta = Math.abs(t - target)
    if (!best || delta < best.delta) best = { delta, entry }
  }
  return best && best.delta <= NEAREST_LIMIT_MS ? best.entry : null
}

// #13 미니마 판정용 — 그 시각 타임라인 항목의 수치(운고 ft·시정 m·카테고리).
export function metricsAt(taf, iso) {
  const entry = nearestEntry(taf, iso)
  if (!entry) return null
  const { visibilityM, ceilingFt } = entryMetrics(entry)
  return { visibilityM, ceilingFt, category: categoryFor({ visibilityM, ceilingFt, icao: taf?.header?.icao }) }
}

// 그 시각의 병합된 현상. 파서가 BECMG 누적·TEMPO/PROB 구간 적용·wx_touched 판정을 끝낸 결과다.
// metricsAt과 같은 항목에서 나오므로 운고·시정과 현상의 시각이 어긋나지 않는다.
export function weatherAt(taf, iso) {
  return nearestEntry(taf, iso)?.weather ?? []
}
```

- [ ] **Step 5: 통과를 확인한다**

```bash
npm --prefix backend test -- test/taf-window.test.js
npm --prefix backend test
```

Expected: 둘 다 PASS. 기존 `metricsAt` 테스트가 유효기간 밖 시각을 쓰면 그 기대를 고친다 —
**지우지 말고** 새 계약(밖이면 `null`)에 맞춘다.

- [ ] **Step 6: 조건에 실패하는 테스트를 쓴다**

Create `backend/test/taf-conditions.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tafConditionsAt } from '../src/alerts/taf-conditions.js'

const AT = '2026-08-20T02:00:00Z'

// 현상은 parse-utils.js가 낸 모양이다: { raw, intensity, descriptor, phenomena }.
const wx = (raw, { intensity = 'MODERATE', descriptor = null, phenomena = [] } = {}) =>
  ({ raw, intensity, descriptor, phenomena })

// 타임라인은 파서가 이미 병합해 둔 상태다 — 운고·시정과 현상이 같은 항목에 들어 있다.
const taf = ({ icao = 'RKTU', vis = 9999, ceil = 3000, weather = [] } = {}) => ({
  header: { icao },
  timeline: [{
    time: AT,
    visibility: { value: vis, cavok: false },
    clouds: [{ amount: 'BKN', base: ceil, raw: `BKN${ceil}` }],
    weather,
  }],
})

// RKTU 접근최저치는 550m / 200ft (flight-category.js의 표).

test('미니마를 설정하지 않으면 VFR 기본값(1500ft/5000m)으로 본다', () => {
  const c = tafConditionsAt(taf({ vis: 3000 }), AT, 'RKTU', null)
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'default', '옛 "IFR이면 울린다"와 같은 동작이다')
})

test('내 미니마가 더 엄격하면 내 기준으로 울린다', () => {
  // 내 기준 5000m, 공항 550m → 실효 5000m. 4000m면 걸린다.
  const c = tafConditionsAt(taf({ vis: 4000 }), AT, 'RKTU', { visibilityM: 5000, ceilingFt: 1500 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'personal')
})

test('공항 최저치가 더 엄격하면 공항 기준으로 울린다 — 못 가는 걸 갈 수 있다고 두면 안 된다', () => {
  // 내 기준 200m/100ft, 공항 550m/200ft → 실효 550m. 400m면 아무도 못 내린다.
  const c = tafConditionsAt(taf({ vis: 400 }), AT, 'RKTU', { visibilityM: 200, ceilingFt: 100 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'airport')
})

test('둘 다 넘으면 조용하다', () => {
  const c = tafConditionsAt(taf({ vis: 9999, ceil: 3000 }), AT, 'RKTU', { visibilityM: 5000, ceilingFt: 1500 })
  assert.equal(c.minima, false)
  assert.equal(c.minimaBound, null)
})

test('운고로도 걸린다', () => {
  const c = tafConditionsAt(taf({ ceil: 800 }), AT, 'RKTU', { visibilityM: 1600, ceilingFt: 1500 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'personal')
})

test('해외 공항은 접근최저치 자료가 없어 내 미니마만 적용된다', () => {
  const c = tafConditionsAt(taf({ icao: 'RJBB', vis: 4000 }), AT, 'RJBB', { visibilityM: 5000, ceilingFt: 1500 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'personal')
})

test('뇌전은 수식어로 읽는다 — TSRA도 뇌전이다', () => {
  const c = tafConditionsAt(taf({ weather: [wx('TSRA', { descriptor: 'TS', phenomena: ['RA'] })] }), AT, 'RKTU', null)
  assert.equal(c.ts, true)
  assert.equal(c.fg, false)
})

test('부근(VC)은 발화하지 않는다 — 공항이 아니라 그 주변이다', () => {
  const c = tafConditionsAt(taf({ weather: [wx('VCTS', { intensity: 'VICINITY', descriptor: 'TS' })] }), AT, 'RKTU', null)
  assert.equal(c.ts, false, 'VCTS를 "출발 RKTU 뇌전 예보"라고 알리면 사실과 다르다')
})

test('FZFG는 안개다 — 수식어가 붙어도 현상은 FG', () => {
  const c = tafConditionsAt(taf({ weather: [wx('FZFG', { descriptor: 'FZ', phenomena: ['FG'] })] }), AT, 'RKTU', null)
  assert.equal(c.fg, true)
})

test('약한 눈도 눈이다', () => {
  const c = tafConditionsAt(taf({ weather: [wx('-SN', { intensity: 'LIGHT', phenomena: ['SN'] })] }), AT, 'RKTU', null)
  assert.equal(c.sn, true)
  assert.equal(c.ts, false)
})

test('박무(BR)는 안개가 아니다 — 파서가 저시정에서 합성해 넣는 값이다', () => {
  const c = tafConditionsAt(taf({ vis: 3000, weather: [wx('BR', { phenomena: ['BR'] })] }), AT, 'RKTU', null)
  assert.equal(c.fg, false)
})

test('유효기간 밖 시각이면 아무것도 안 걸린다', () => {
  const c = tafConditionsAt(taf({ vis: 100 }), '2026-08-20T09:00:00Z', 'RKTU', null)
  assert.deepEqual(c, { minima: false, minimaBound: null, ts: false, fg: false, sn: false })
})

test('TAF가 없으면 아무것도 안 걸린다 — 없는 것을 위험으로 읽지 않는다', () => {
  const c = tafConditionsAt(null, AT, 'RKTU', null)
  assert.deepEqual(c, { minima: false, minimaBound: null, ts: false, fg: false, sn: false })
})
```

- [ ] **Step 7: 실패를 확인한다**

```bash
npm --prefix backend test -- test/taf-conditions.test.js
```

Expected: FAIL — `Cannot find module '../src/alerts/taf-conditions.js'`

- [ ] **Step 8: 조건을 구현한다**

Create `backend/src/alerts/taf-conditions.js`:

```js
// 폰이 울릴 조건 — 그 시각 타임라인 항목에서 상태를 뽑는다.
// 시간 병합도 임계값도 새로 만들지 않는다: 시각별 운고·시정과 병합된 현상은 taf-window.js가,
// 공항 접근최저치는 flight-category.js가 이미 준다. 여기서는 조합만 한다.
import { airportMinima } from '../briefing/flight-category.js'
import { metricsAt, weatherAt } from '../briefing/taf-window.js'

// 내 미니마를 설정하지 않았을 때의 기본. 관제권 VFR 최저치이자 이 앱의 IFR 판정선과 같은 값이라,
// 미설정 사용자는 "IFR이면 울린다"와 같은 동작을 얻는다.
const DEFAULT_MINIMA = { visibilityM: 5000, ceilingFt: 1500 }

const num = (v) => (Number.isFinite(v) ? v : null)

// 실효 미니마 = 더 엄격한 쪽. 둘 다 "바닥"이라 먼저 걸리는 쪽이 실제 제약이다.
// 내 기준이 공항 접근최저치보다 낮으면(더 관대하면) 공항 쪽이 이긴다 — 그 밑에선 아무도
// 착륙하지 못하는데 내 기준만 보면 조용해서, 못 가는 것을 갈 수 있다고 착각하게 만든다.
function effectiveMinima(icao, userMinima) {
  const airport = airportMinima(icao)
  const personal = {
    visibilityM: num(userMinima?.visibilityM) ?? DEFAULT_MINIMA.visibilityM,
    ceilingFt: num(userMinima?.ceilingFt) ?? DEFAULT_MINIMA.ceilingFt,
  }
  const isDefault = num(userMinima?.visibilityM) == null && num(userMinima?.ceilingFt) == null
  return {
    personal,
    airport: { visibilityM: num(airport?.visibilityM), ceilingFt: num(airport?.ceilingFt) },
    isDefault,
  }
}

// 어느 쪽이 걸렸는지까지 낸다 — 공항 최저치 때문에 걸렸는데 "내 미니마 미만"이라고 하면
// 거짓말이 된다. 둘 다 걸리면 더 엄격한 쪽(= 값이 큰 쪽)을 이름으로 삼는다.
function judgeMinima(metrics, icao, userMinima) {
  const { personal, airport, isDefault } = effectiveMinima(icao, userMinima)
  const below = (value, line) => Number.isFinite(value) && Number.isFinite(line) && value < line

  const byPersonal = below(metrics.visibilityM, personal.visibilityM) || below(metrics.ceilingFt, personal.ceilingFt)
  const byAirport = below(metrics.visibilityM, airport.visibilityM) || below(metrics.ceilingFt, airport.ceilingFt)

  if (!byPersonal && !byAirport) return { minima: false, minimaBound: null }
  // 공항 최저치가 걸렸다면 그것이 더 엄격한 선이다 — 그 밑은 개인 기준과 무관하게 불가능하다.
  if (byAirport) return { minima: true, minimaBound: 'airport' }
  return { minima: true, minimaBound: isDefault ? 'default' : 'personal' }
}

// 파서가 쪼개 준 구조를 쓴다 — 원문 글자를 정규식으로 훑지 않는다.
// parse-utils.js는 wx 토큰을 { raw, intensity, descriptor, phenomena }로 나눈다:
//   TSRA → descriptor 'TS', phenomena ['RA']   (뇌전은 현상이 아니라 수식어다)
//   VCTS → intensity 'VICINITY', descriptor 'TS'
//   FZFG → descriptor 'FZ', phenomena ['FG']
//   -SN  → intensity 'LIGHT', phenomena ['SN']
//
// 부근(VC)은 발화하지 않는다. VCTS는 공항이 아니라 주변 5~10 SM의 뇌전이라,
// "출발 RKSI 뇌전 예보"라고 알리면 사실과 다른 말을 하게 된다.
const isVicinity = (w) => w?.intensity === 'VICINITY'
const hasDescriptor = (list, code) => list.some((w) => !isVicinity(w) && w?.descriptor === code)
const hasPhenomenon = (list, code) => list.some((w) => !isVicinity(w) && (w?.phenomena ?? []).includes(code))

const NOTHING = { minima: false, minimaBound: null, ts: false, fg: false, sn: false }

export function tafConditionsAt(taf, iso, icao = null, userMinima = null) {
  const metrics = metricsAt(taf, iso)
  // TAF가 없거나 유효기간 밖이면 판정하지 않는다 — 없는 것을 위험으로 읽으면 오탐이 쌓인다.
  if (!metrics) return { ...NOTHING }
  const wx = weatherAt(taf, iso)
  return {
    ...judgeMinima(metrics, icao, userMinima),
    ts: hasDescriptor(wx, 'TS'),
    fg: hasPhenomenon(wx, 'FG'),
    sn: hasPhenomenon(wx, 'SN'),
  }
}

export default { tafConditionsAt }
```

- [ ] **Step 9: 통과를 확인한다**

```bash
npm --prefix backend test
```

Expected: 전체 PASS (조건 테스트 13건 포함)

- [ ] **Step 10: 커밋**

```bash
git status --short
git add backend/src/briefing/flight-category.js backend/src/briefing/taf-window.js backend/test/taf-window.test.js backend/src/alerts/taf-conditions.js backend/test/taf-conditions.test.js
git commit -m "feat(alerts): judge against the stricter of personal and published minima"
```

---

### Task 2: 스냅샷을 조건으로 줄인다

**Files:**
- Modify: `backend/src/alerts/scheduler.js` (`buildSnapshot` 및 그 보조 함수들)
- Modify: `backend/test/alert-scheduler.test.js`

**Interfaces:**
- Consumes: `tafConditionsAt` (Task 1).
- Produces: `buildSnapshot(briefing, tafByIcao, request)`가 아래를 낸다. Task 3이 쓴다.

```js
{
  airports: [{ icao, role: 'dep'|'dest'|'altn', minima, minimaBound, ts, fg, sn }],
  sigmets: [{ key, label }],   // 경로상 SIGMET만. AIRMET은 담지 않는다
}
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`alert-scheduler.test.js`의 `buildSnapshot` 테스트를 아래로 **교체**한다(옛 형태를 기대하는 단언은 지운다).

```js
test('buildSnapshot: 공항별 조건과 경로 SIGMET만 낸다', () => {
  const request = { departureAirport: 'RKSI', arrivalAirport: 'RKPC', alternateAirport: 'RKPK', etd: ETD, eta: ETA }
  const briefing = { sections: { adverse: { hazards: [
    { source: 'SIGMET', code: 'WS01', validFrom: ETD, encounter: 'on', label: 'SIGMET WS01' },
    { source: 'AIRMET', code: 'WA01', validFrom: ETD, encounter: 'on', label: 'AIRMET WA01' },
    { source: 'SIGMET', code: 'WS02', validFrom: ETD, encounter: 'nearby', label: '옆으로 스침' },
  ] } } }
  // 미니마 미설정 → VFR 기본값(1500ft/5000m)으로 판정한다.
  const snap = buildSnapshot(briefing, { RKPC: tafFor(800) }, request, null)

  assert.deepEqual(snap.airports.map((a) => a.role), ['dep', 'dest', 'altn'])
  assert.equal(snap.airports.find((a) => a.role === 'dest').minima, true, '운고 800ft는 기본 1500ft 미만')
  assert.equal(snap.airports.find((a) => a.role === 'dep').minima, false, 'TAF 없으면 판정하지 않는다')
  // AIRMET은 폰까지 가지 않는다. 경로에 안 걸친 SIGMET도 아니다.
  assert.deepEqual(snap.sigmets.map((s) => s.label), ['SIGMET WS01'])
})

test('buildSnapshot: 교체공항이 없으면 두 곳만 낸다', () => {
  const request = { departureAirport: 'RKSI', arrivalAirport: 'RKPC', alternateAirport: null, etd: ETD, eta: ETA }
  const snap = buildSnapshot({ sections: { adverse: { hazards: [] } } }, {}, request, null)
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
// 공항별 조건만 들고, 경로 위험은 SIGMET만 담는다(AIRMET은 폰까지 가지 않는다).
// userMinima는 evaluateFlight가 users 테이블에서 읽어 넘긴다 — 판정선이 조종사마다 다르다.
export function buildSnapshot(briefing, tafByIcao, request, userMinima = null) {
  const taf = (icao) => (icao ? tafByIcao?.[icao] ?? null : null)
  const at = [
    { icao: request.departureAirport, role: 'dep', iso: request.etd },
    { icao: request.arrivalAirport, role: 'dest', iso: request.eta },
    { icao: request.alternateAirport, role: 'altn', iso: request.eta },
  ].filter((entry) => entry.icao)

  const airports = at.map(({ icao, role, iso }) => ({
    icao, role, ...tafConditionsAt(taf(icao), iso, icao, userMinima),
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
{
  type: 'MINIMA'|'TS'|'FG'|'SN'|'SIGMET',
  target: '<ICAO>'|'<label>',
  role: 'dep'|'dest'|'altn'|null,
  bound: 'personal'|'airport'|'default'|null,   // MINIMA일 때만
  dedupKey: string,
}
```

`severity`·`from`·`to`는 더 이상 만들지 않는다. `plan` 인자(사용자 미니마)도 받지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`alert-diff.test.js`를 아래로 통째로 바꾼다.

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectChanges } from '../src/alerts/diff.js'

const airport = (over = {}) => ({ icao: 'RKPC', role: 'dest', minima: false, minimaBound: null, ts: false, fg: false, sn: false, ...over })
const snap = (airports = [airport()], sigmets = []) => ({ airports, sigmets })

test('없던 조건이 새로 생기면 발화한다', () => {
  const changes = detectChanges(snap(), snap([airport({ minima: true, minimaBound: 'personal' })]))
  assert.equal(changes.length, 1)
  assert.equal(changes[0].type, 'MINIMA')
  assert.equal(changes[0].target, 'RKPC')
  assert.equal(changes[0].role, 'dest')
  assert.equal(changes[0].bound, 'personal', '문구가 어느 미니마인지 말해야 한다')
})

test('이미 있던 조건은 다시 발화하지 않는다 — 정시 TAF마다 울리면 안 된다', () => {
  assert.deepEqual(detectChanges(snap([airport({ minima: true })]), snap([airport({ minima: true })])), [])
})

test('조건이 풀리면 아무 말도 하지 않는다 — 회복 알림은 만들지 않는다', () => {
  assert.deepEqual(detectChanges(snap([airport({ minima: true })]), snap()), [])
})

test('풀렸다가 다시 걸리면 그때 다시 발화한다', () => {
  assert.equal(detectChanges(snap(), snap([airport({ minima: true })])).length, 1)
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

test('출발지와 교체공항이 같아도 각각 따로 본다', () => {
  // 같은 공항을 출발지이자 교체공항으로 쓰는 것은 흔하다. 공항 코드만으로 묶으면
  // 한쪽이 사라지고, 남은 쪽이 엉뚱한 기준과 비교된다.
  const before = snap([airport({ icao: 'RKSI', role: 'dep' }), airport({ icao: 'RKSI', role: 'altn' })])
  const after = snap([airport({ icao: 'RKSI', role: 'dep' }), airport({ icao: 'RKSI', role: 'altn', fg: true })])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].role, 'altn', '바뀐 것은 교체공항 쪽이다')
})

test('같은 공항의 두 역할은 중복 방지 키가 다르다', () => {
  const before = snap([airport({ icao: 'RKSI', role: 'dep' }), airport({ icao: 'RKSI', role: 'altn' })])
  const after = snap([airport({ icao: 'RKSI', role: 'dep', ts: true }), airport({ icao: 'RKSI', role: 'altn', ts: true })])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 2)
  assert.notEqual(changes[0].dedupKey, changes[1].dedupKey, '키가 겹치면 한쪽이 삼켜진다')
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

const CONDITIONS = ['minima', 'ts', 'fg', 'sn']
const TYPE_OF = { minima: 'MINIMA', ts: 'TS', fg: 'FG', sn: 'SN' }

// 공항이 아니라 **공항+역할**로 짝짓는다. 출발지와 교체공항이 같은 곳일 수 있고(흔한 선택),
// 공항 코드만으로 묶으면 한쪽 역할이 조용히 사라져 엉뚱한 기준과 비교된다.
// dedupKey도 같은 이유로 역할을 포함한다 — 안 그러면 두 번째 역할의 진짜 변화가 삼켜진다.
const slotOf = (a) => `${a.icao}:${a.role ?? ''}`

function airportChanges(prev, curr) {
  const before = new Map((prev?.airports ?? []).map((a) => [slotOf(a), a]))
  const out = []
  for (const now of curr?.airports ?? []) {
    const then = before.get(slotOf(now))
    if (!then) continue // 이 자리의 직전 상태가 없다 — 기준점이 없으므로 판정하지 않는다
    for (const key of CONDITIONS) {
      if (now[key] && !then[key]) {
        out.push({
          type: TYPE_OF[key],
          target: now.icao,
          role: now.role ?? null,
          // 어느 미니마가 걸렸는지. 문구가 "내 미니마 미만"과 "접근최저치 미만"을 가른다.
          bound: key === 'minima' ? (now.minimaBound ?? null) : null,
          dedupKey: `${TYPE_OF[key]}:${slotOf(now)}`,
        })
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
- Modify: `backend/src/alerts/scheduler.js` (`evaluateFlight`, `insertAlert`)
- Modify: `backend/src/me/alerts.js` (`listNotifications`가 `role`을 내보낸다)
- Modify: `backend/test/alert-scheduler.test.js`
- Modify: `backend/test/me-notifications.test.js`

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

    // 2회차 = 목적지가 미니마 밑으로 떨어짐
    const second = evaluateFlight({ db, route, briefing: clear, tafByIcao: { RKPC: tafFor(800) }, cache })
    assert.equal(second.changes.length, 1)
    assert.equal(second.changes[0].type, 'MINIMA')

    // 3회차 = 그대로 IFR — 다시 넣지 않는다
    const third = evaluateFlight({ db, route, briefing: clear, tafByIcao: { RKPC: tafFor(800) }, cache })
    assert.equal(third.changes.length, 0)

    const rows = db.prepare('SELECT type, target, severity, to_val FROM triggered_alerts WHERE route_id=?').all(route.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].type, 'MINIMA')
    assert.equal(rows[0].severity, 'ALERT')
    assert.ok(rows[0].to_val, '어느 미니마가 걸렸는지가 남아야 문구를 만들 수 있다')
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

1. `userMinima` 함수는 **남긴다** — 판정선이 조종사마다 다르므로 `buildSnapshot`에 넘겨야 한다.
2. `insertAlert`의 값 부분을 새 어휘로 바꾼다. **어느 미니마가 걸렸는지는 `to_val`에 담는다** —
   비어 있던 컬럼이라 스키마를 건드릴 필요가 없다.
3. `evaluateFlight`가 `buildSnapshot`에 미니마를 넘기고, `detectChanges`에서는 인자를 뺀다.

```js
// 다섯 가지가 전부 "울릴 만한 것"이라 등급 구분의 쓸모가 없다. 컬럼은 남기되 고정값을 넣는다.
const ALERT_SEVERITY = 'ALERT'

function insertAlert(db, route, change, nowIso) {
  return db.prepare(`
    INSERT INTO triggered_alerts (user_id, route_id, type, severity, target, from_val, to_val, source_id, dedup_key, detected_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(route.user_id, route.id, change.type, ALERT_SEVERITY, change.target ?? null,
    // from_val은 안 쓴다. to_val에 "어느 미니마가 걸렸는지"를 담는다 — 문구가 그걸로 갈린다.
    null, change.bound ?? null, change.role ?? null, change.dedupKey, nowIso).lastInsertRowid
}
```

`evaluateFlight` 안 — 스냅샷을 만들 때 그 조종사의 미니마를 넘긴다:

```js
  const curr = buildSnapshot(briefing, tafByIcao, request, userMinima(db, route.user_id))
```

그리고 변화 적재:

```js
    const changes = detectChanges(prev, curr)
    for (const c of changes) {
      if (alreadyFired(db, route.id, c.dedupKey)) continue
      const id = insertAlert(db, route, c, nowIso)
      inserted.push({ ...c, id })
    }
```

- [ ] **Step 4: 알림 피드가 `role`을 내보내게 한다**

역할(출발/도착/교체)은 `source_id` 컬럼에 담기는데, 피드 SQL이 그 컬럼을 뽑지 않는다
(`backend/src/me/alerts.js:150`). 안 고치면 알림센터가 **"도착 RKPC"를 "RKPC"로만** 보여준다 —
Task 9의 문구가 `n.role`을 읽기 때문이다.

먼저 실패하는 테스트를 `backend/test/me-notifications.test.js`에 더한다. 그 파일의 기존
시딩 방식을 먼저 읽고 같은 골격을 쓴다.

```js
test('listNotifications: 역할을 함께 내보낸다 — 문구가 "도착 RKPC"로 읽히려면 필요하다', () => {
  // triggered_alerts에 source_id='dest'인 행을 하나 넣고
  const { notifications } = listNotifications(db, userId)
  assert.equal(notifications[0].role, 'dest')
})
```

그다음 SQL에 한 항목을 더한다.

```js
    SELECT t.id, t.route_id AS routeId, t.type, t.severity, t.target,
           t.source_id AS role,
           t.from_val AS fromVal, t.to_val AS toVal,
```

`toVal`은 이미 뽑고 있다 — 거기에 "어느 미니마가 걸렸는지"가 담기므로 따로 더할 것이 없다.

- [ ] **Step 5: 통과를 확인한다**

```bash
npm --prefix backend test
```

Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git status --short
git add backend/src/alerts/scheduler.js backend/src/me/alerts.js backend/test/alert-scheduler.test.js backend/test/me-notifications.test.js
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
  assert.match(formatAlert({ type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'personal' }, route), /도착 RKPC.*내 미니마 미만/)
  assert.match(formatAlert({ type: 'MINIMA', target: 'RKTU', role: 'dest', bound: 'airport' }, route), /접근최저치 미만/)
  assert.match(formatAlert({ type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'default' }, route), /IFR 이하/)
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
      [{ id: 1, type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'personal' }],
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

// 어느 미니마가 걸렸는지에 따라 말이 달라진다. 공항 접근최저치 때문에 걸렸는데
// "내 미니마 미만"이라고 하면 거짓말이 된다 — 그리고 그 경우가 더 무거운 상황이다.
const MINIMA_KO = {
  airport: '접근최저치 미만',   // 그 밑에선 아무도 착륙하지 못한다
  personal: '내 미니마 미만',
  default: 'IFR 이하',          // 미니마 미설정 — VFR 기본값(1500ft/5000m)으로 판정했다
}

// 변화 1건 → 통지 한 줄. 담백한 통지체(이모지 미사용, 공식 통지 톤).
export function formatAlert(alert) {
  switch (alert.type) {
    case 'MINIMA': return `${at(alert)} ${MINIMA_KO[alert.bound] ?? '최저치 미만'} 예보`
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
- Modify: `backend/src/me/alerts.js` — 검증 범위(`:13`)와 **기본값 두 곳**(`:28` `pickActiveFlight`, `:66` INSERT)
- Modify: `backend/src/db/schema.sql:46` — 컬럼 기본값
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx:14` (선택지)

기본 2시간은 너무 늦다. 이 알림은 전부 "갈까 말까"를 뒤집는 정보인데, 출발 2시간 전이면 이미 공항으로 가는 중이라 할 수 있는 것이 취소뿐이다.

- [ ] **Step 1: 백엔드 검증 범위를 넓힌다**

```js
  alertStartMinBeforeEtd: z.number().int().min(360).max(1440).optional(), // 6~24h
```

- [ ] **Step 2: 남아 있는 2시간 기본값 셋을 함께 올린다**

검증 범위만 바꾸면 **명시적으로 값을 안 준 등록은 여전히 2시간짜리**가 된다. 화면이 6/12/24를
보여주는데 실제로는 2시간인 상태가 조용히 생긴다.

```js
// backend/src/me/alerts.js — pickActiveFlight
const startMs = etdMs - (f.alertStartMinBeforeEtd || 360) * 60000
```

```js
// backend/src/me/alerts.js — INSERT
).run(req.session.userId, tpl.name, etd, eta ?? null, payload, alertStartMinBeforeEtd ?? 360, ...)
```

```sql
-- backend/src/db/schema.sql:46
alert_start_min_before_etd INTEGER NOT NULL DEFAULT 360,
```

**이미 만들어진 DB의 컬럼 기본값은 바뀌지 않는다**(SQLite는 `ALTER TABLE`로 기본값을 못 바꾼다).
새 서버에만 적용된다 — 그래서 위의 두 코드 기본값이 실질적인 안전망이다.

```js
test('pickActiveFlight: 감시 시작이 없으면 6시간 전부터 본다', () => {
  const etd = '2026-08-20T12:00:00Z'
  const flights = [{ id: 1, etd }] // alertStartMinBeforeEtd 없음
  assert.ok(pickActiveFlight(flights, Date.parse('2026-08-20T07:00:00Z')), '5시간 전이면 창 안')
  assert.equal(pickActiveFlight(flights, Date.parse('2026-08-20T05:00:00Z')), null, '7시간 전이면 아직')
})
```

- [ ] **Step 3: 화면 선택지를 바꾼다**

```js
const WATCH_OPTIONS = [
  { label: '6시간 전', minutes: 360 },
  { label: '12시간 전', minutes: 720 },
  { label: '24시간 전', minutes: 1440 },
]
```

기본값이 `120`으로 박힌 곳이 있으면 `360`으로 바꾼다(`useState` 초기값 확인).

- [ ] **Step 4: 빌드와 테스트**

```bash
npm --prefix backend test
npm --prefix frontend run build
```

- [ ] **Step 5: 커밋**

```bash
git status --short
git add backend/src/me/alerts.js backend/src/db/schema.sql backend/test/alert-active.test.js frontend/src/features/personal/PersonalSettingsPanel.jsx
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
    // 문자열을 그대로 넘기면 브라우저가 TypeError를 던진다 — Push API는 BufferSource를 받는다.
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
    await fetch('/api/me/push/subscribe', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    setPushEnabled(true)
    return { ok: true }
  }, [])
```

`useEffect`로 `refreshPush()`를 부르고, 훅 반환에 `pushEnabled`·`pushSupported`·`togglePush`를 더한다.

**변환 함수는 새로 쓰지 말고 옮겨 쓴다.** 개발자 탭(`frontend/src/features/developer/tabs/TriggerTab.jsx:8-11`)에 이미 `urlBase64ToUint8Array`가 있다. 그것을 `frontend/src/features/notifications/pushKey.js`로 옮기고 **양쪽이 같이 import** 한다 — 복사해 두면 한쪽만 고쳐져 조용히 갈라진다.

```js
// frontend/src/features/notifications/pushKey.js
// VAPID 공개키(base64url) → PushManager.subscribe가 요구하는 Uint8Array.
// 문자열을 그대로 넘기면 브라우저가 TypeError를 던진다.
export function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}
```

`TriggerTab.jsx`의 지역 정의를 지우고 이 모듈에서 import하도록 바꾼다.

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
git add frontend/src/features/notifications/pushKey.js frontend/src/features/developer/tabs/TriggerTab.jsx frontend/src/features/personal/usePersonalSettings.js frontend/src/features/personal/PersonalSettingsPanel.jsx backend/src/me/alerts.js
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
// 백엔드 sender.formatAlert 미러. 문구를 고칠 때 두 곳을 함께 고친다 —
// 다르면 같은 알림이 폰과 앱에서 다르게 읽힌다.
const at = (n) => (n.role && ROLE_KO[n.role] ? `${ROLE_KO[n.role]} ${n.target}` : (n.target ?? ''))

// 어느 미니마가 걸렸는지는 toVal에 담겨 온다(백엔드 insertAlert).
const MINIMA_KO = {
  airport: '접근최저치 미만',
  personal: '내 미니마 미만',
  default: 'IFR 이하',
}

export function formatNotification(n) {
  switch (n.type) {
    case 'MINIMA': return `${at(n)} ${MINIMA_KO[n.toVal] ?? '최저치 미만'} 예보`
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

`role`은 Task 4 Step 4에서 피드에 실린다(`t.source_id AS role`). 그것이 없으면 이 문구가
"도착 RKPC"를 "RKPC"로만 보여주므로, Task 4가 끝난 뒤에 이 태스크를 한다.

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

## 계획 검토에서 고친 것 (2026-08-20)

리뷰어 검토에서 다섯 가지가 나왔고 모두 반영했다.

| 지적 | 반영 |
|---|---|
| `applicationServerKey`에 문자열을 넘겨 `TypeError` | Task 8 — 기존 `urlBase64ToUint8Array`를 공용 모듈로 옮겨 양쪽이 함께 쓴다 |
| `role`이 알림 피드로 안 넘어와 "도착 RKPC"가 "RKPC"로 | Task 4 Step 4 — `t.source_id AS role` 추가 + 테스트 |
| 출발지·교체공항이 같으면 상태가 뭉개짐 | Task 3 — 짝짓기와 dedupKey를 `공항:역할`로 |
| 2시간 기본값이 세 군데 더 있음 | Task 7 Step 2 — 코드 두 곳과 스키마를 360으로 |
| `/TS/` 정규식이 부근 뇌전(VCTS)을 공항 뇌전으로 읽음 | Task 1 — 정규식 대신 파서 구조(`descriptor`/`phenomena`/`intensity`) 사용, 부근은 발화 안 함 |

이어서 파싱 사슬을 직접 훑어 두 가지를 더 찾아 고쳤다.

| 발견 | 반영 |
|---|---|
| `metricsAt`이 유효기간 밖에서도 가장 가까운 항목을 조용히 돌려줌 — 감시 시작 24시간 전이면 실제로 닿는다 | Task 1 — 30분을 넘으면 `null`. 아래 `alternateRequired`가 이미 쓰던 방식이다 |
| 계획이 `base.wx`+변화 그룹을 손으로 훑어 파서 로직을 다시(더 나쁘게) 구현 — BECMG 누적이 빠짐 | Task 1 — 이미 병합된 `timeline[].weather`를 쓴다. 운고·시정과 같은 항목이라 시각도 어긋나지 않는다 |

**PROB·TEMPO도 발화한다(결정).** 타임라인이 그것을 병합해 두므로 그대로 조건이 된다.
브리핑에 보이는 것과 알림이 어긋나면, 알림이 조용한 것을 "괜찮다"로 읽고 브리핑을 안 보게 된다.

**판정선을 개인 미니마로 바꿨다(2026-08-20 결정).** 처음 계획은 고정 IFR선(5000m/1500ft)만 봤다.
그것은 "공항이 계기비행 상태"라는 사실일 뿐 **이 조종사가 갈 수 있느냐**와 다르다. 대신
`max(내 미니마, 공항 접근최저치)`로 본다 — 둘 다 바닥이라 먼저 걸리는 쪽이 실제 제약이다.
**내 기준이 공항 접근최저치보다 관대하면 공항 쪽이 이긴다**: 그 밑에선 아무도 착륙하지 못하는데
내 기준만 보면 조용해서, 못 가는 것을 갈 수 있다고 착각하게 만든다. 미설정이면 VFR 기본값을
쓰므로 예전 동작과 같고, 그 값이 IFR선과 같아 조건을 하나로 합칠 수 있었다.

**부근(VC) 판단은 명시적 결정이다.** `VCTS`는 공항이 아니라 주변 5~10 SM의 뇌전이라,
"출발 RKSI 뇌전 예보"라고 알리면 사실과 다른 말을 하게 된다. 부근까지 알리려면 문구를
"부근 뇌전"으로 따로 두어야 하고 종류가 하나 늘어난다. 필요해지면 그때 늘린다.

## 이 단계에서 하지 않는 것

- **회복·개선 알림** — 조용하면 이상없다는 것이 계약이다.
- **항목별 on/off 설정** — 다섯 개뿐이고 전부 비행 가부를 가른다. 끄고 싶은 항목이 생기면 그것은 설정이 필요하다는 뜻이 아니라 목록에서 빼야 한다는 뜻이다.
- **조용시간(야간 억제)** — 뇌전·안개 소식은 새벽에라도 알아야 아침 계획을 바꿀 수 있다.
- **감시 창을 ETA까지 연장** — 이륙하면 폰이 비행모드라 볼 방법이 없다.
- **고정 IFR선을 따로 두기** — 미설정 기본값(1500ft/5000m)이 그 선과 같아서, 따로 두면 VFR 프리셋 사용자에게 항상 두 알림이 같이 간다.
- **`send_no_change_confirm` 컬럼 삭제** — 화면과 API에서만 뺀다. DB 마이그레이션은 범위 밖.
- **텔레그램 채널 제거** — 관리자용으로 그대로 둔다. 다만 발화 규칙은 새 규칙 하나를 따른다.
- **알림이 원본 브리핑의 수정을 따라가게 하기** — 등록 시점의 복제본을 감시한다(3단계 결정).
