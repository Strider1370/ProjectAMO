# 모니터링 알람 표시 개편 Implementation Plan (계획 A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/monitoring` 벽걸이 화면의 알람을 자막 바에서 하단 알람 표로 바꾸고, 문제가 난 요소를 화면에서 직접 강조한다.

**Architecture:** 알람 판정 결과에 "강조 대상"을 함께 실어 반환하고, `MonitoringPage`가 그것을 METAR 카드·TAF 타임라인·지도에 prop 한 단계로 나눠준다. 하단 알람 표는 조건이 살아있는 동안 계속 떠 있고, 새 알람만 60초 강조된다. 전역 상태나 컨텍스트를 새로 만들지 않는다.

**Tech Stack:** React 18 (JSX, hooks), 순수 JS 모듈, `node --test` (단위), Playwright (브라우저 계약), MapLibre paint 표현식 (지도 링).

**Spec:** [docs/superpowers/specs/2026-07-27-monitoring-alert-redesign-design.md](../specs/2026-07-27-monitoring-alert-redesign-design.md) §4~§9, §14~§17

**후속 계획:** 계획 B(TAF 변화 알람)는 이 계획이 만든 알람 표 위에 얹힌다. 이 계획을 먼저 끝낸다.

## Global Constraints

- Linux 전용. `git`/`npm`/`node`/`npx`는 Linux 셸에서만 실행한다. PowerShell·cmd.exe 금지.
- 한글이 포함된 파일은 `Edit`/`Write` 도구로만 수정한다. 셸 리다이렉션(`>`)으로 덮어쓰지 않는다. 근거: `docs/policies/encoding-safety.md`
- 깜빡임 주기는 **0.8초** 고정. 기존 `LIGHTNING_BLINK_INTERVAL_MS`와 같은 값을 재사용한다. WCAG 2.3.1(초당 3회 이하) 준수.
- `prefers-reduced-motion: reduce`에서는 깜빡이지 않고 고정 외곽선만 그린다.
- 강조 색은 시맨틱 레벨색만 쓴다 — red `#c0291f` / amber `#92400e` / gray `#475569`.
- 강조는 **외곽선(`outline`)** 으로만 그린다. `border`나 `background`를 쓰지 않는다. 근거: 해당 칸들이 이미 배경색으로 비행조건(VFR/IFR/LIFR)을 표현하므로 한 색에 두 의미가 생긴다.
- 하단 알람 표 최대 표시 **6건**. 초과 시 오래된 것부터 제거.
- 새 알람 강조 시간 기본 **60초** (`highlight_seconds`).
- 알람 표의 `z-index`는 **9998**을 유지한다. 전체화면 슬라이드쇼(`.monitoring-slide-overlay--whole-screen`, `z-index: 900`)보다 위여야 한다.
- 기존 알람 6종(`low_visibility`·`high_wind`·`weather_phenomenon`·`low_ceiling`·`taf_adverse_weather`·`lightning_detected`)의 **판정 조건과 임계값은 변경하지 않는다.**
- 소리(`AlertSound`) 동작은 변경하지 않는다.
- 커밋 메시지는 한국어 본문, 영어 타입 접두사(`feat:`/`fix:`/`test:`/`refactor:`).

## 시작 전 상태 (측정됨)

`npx playwright test verification/contracts/monitoring.spec.mjs --project=desktop`를 2026-07-28에 실행한 결과:

```
1 failed  — alert panel collapses to a badge but keeps the list until dismissed
1 skipped — mobile: opens monitoring and navigates task tabs
2 passed  (19.3s)
```

**실패는 이 계획의 잘못이 아니라 기존 결함이다.** `.alert-panel-badge` CSS는 `App.css:3046`에 남아 있는데 그것을 렌더링하는 JSX가 없어서, 계약이 찾는 "알림 3건 펼치기" 버튼이 존재하지 않는다. 이 계획은 그 동작 자체를 삭제하므로(스펙 §7 "자동 숨김 없음") Task 11에서 계약을 교체하며 해소된다.

계약 실행 시 개발 서버가 이미 떠 있으면 `CONTRACT_REUSE_SERVER=1`을 앞에 붙인다.

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js` | 알람 판정. 각 결과에 강조 대상을 실어 반환 | 1, 2 |
| `.../utils/alerts/alert-triggers.test.js` | **신규** — 트리거 판정·강조 대상 단위 테스트 | 2 |
| `.../utils/alerts/alert-state.js` | 알람 키·재알림 간격·이력. 공항별 분리 | 3 |
| `.../utils/alerts/alert-state.test.js` | **신규** — 이력 분리 단위 테스트 | 3 |
| `.../utils/alerts/alert-settings.js` | 개인 설정 병합 + 저장분 1회 정리 | 4 |
| `.../utils/alerts/alert-settings.test.js` | **신규** — 저장분 정리 단위 테스트 | 4 |
| `shared/alert-defaults.js` | 기본 설정값 | 1, 4 |
| `.../components/alerts/AlertPanel.jsx` | 하단 알람 표 (표 형식으로 재작성) | 5 |
| `.../components/alerts/AlertMarquee.jsx` | **삭제** | 6 |
| `.../legacy/App.css` | 알람 표·강조 스타일. 자막 CSS 삭제 | 5, 6, 7 |
| `.../components/MetarCard.jsx` | 강조 대상 수신 → 칸 외곽선 | 7 |
| `.../components/TafTimeline.jsx` | 강조 대상 수신 → 시간칸 외곽선 | 7 |
| `.../MonitoringMap.jsx`, `frontend/src/features/map/MapView.jsx` | 강조 대상 수신 → 링 굵게·깜빡임 | 7 |
| `frontend/src/features/monitoring/MonitoringPage.jsx` | 강조 대상 분배, 지상 모드 정지, 평가 기준 리셋, 예시 교체 | 8 |
| `frontend/src/app/App.jsx` | 모바일 폭에서 `/monitoring` 진입 차단 | 9 |
| `.../components/alerts/Settings.jsx` | 설정 항목 정리, 예시 버튼 | 10 |
| `frontend/verification/contracts/monitoring.spec.mjs` | 브라우저 계약 | 11 |
| `docs/policies/verification/contracts.md` | 계약 등록부 | 11 |

---

## Task 1: 공항경보 트리거와 죽은 설정 키를 지운다

공항경보 패널이 이미 같은 정보를 보여주므로 알람으로 중복 표시하지 않는다. 알람 표가 하단 전폭 고정이 되면서 팝업 위치 설정도 의미를 잃는다.

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js:7-39, 240-248`
- Modify: `shared/alert-defaults.js:10-15, 21-33`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces: `alertDefaults.triggers`에서 `warning_issued` 제거됨. `alertDefaults.dispatchers.popup`에 `position` 없음. `alertDefaults.dispatchers.marquee` 없음. `alertDefaults.dispatchers.popup.highlight_seconds = 60`, `max_visible = 6`. 트리거 배열 길이 6.

- [ ] **Step 1: 기본 설정에서 죽은 키를 지우고 이름을 바꾼다**

`shared/alert-defaults.js`의 `dispatchers`와 `triggers` 앞부분을 아래로 교체한다. `sound`는 그대로 둔다.

```js
  dispatchers: {
    popup: {
      enabled: true,
      highlight_seconds: 60,
      max_visible: 6,
    },
    sound: {
      enabled: true,
      volume: 70,
      repeat_count: { info: 1, warning: 1, critical: 3 },
    },
  },

  triggers: {
    low_visibility: {
      enabled: true,
      params: { threshold: 1500 },
    },
```

`marquee` 블록 전체와 `warning_issued` 블록 전체가 사라진다. `low_visibility` 이후는 손대지 않는다.

- [ ] **Step 2: 트리거 파일에서 공항경보를 지운다**

`alert-triggers.js`에서 다음 세 곳을 지운다.

1. `findNewWarnings` 함수 전체 (7-17행) — `warningIssued`만 쓰던 헬퍼다
2. `warningIssued` 상수 전체 (19-39행, `// T-01: 경보 발령` 주석 포함)
3. 배열의 `warningIssued,` 한 줄 (241행)

`import { formatUtc } from "../helpers";`는 `tafAdverseWeather`와 `lightningDetected`가 계속 쓰므로 남긴다.

- [ ] **Step 3: 남은 참조가 없는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -rn "warning_issued\|warningIssued\|findNewWarnings\|dispatchers.marquee\|auto_dismiss_seconds\|popup.position" frontend/src shared backend/src --include=*.js --include=*.jsx
```
Expected: `MonitoringPage.jsx`(자막 배선), `Settings.jsx`(설정 항목·`TRIGGER_LABELS`), `AlertMarquee.jsx`만 나온다. 이들은 Task 6·10에서 정리한다. `alert-triggers.js`와 `shared/alert-defaults.js`에서는 **한 건도 나오지 않아야 한다.**

- [ ] **Step 4: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add shared/alert-defaults.js frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js
git commit -m "refactor(monitoring): 공항경보 트리거와 죽은 설정 키를 지운다

공항경보 패널이 같은 정보를 이미 보여주므로 알람 중복을 없앤다.
알람 표가 하단 전폭 고정이 되어 팝업 위치 설정도 성립하지 않는다."
```

---

## Task 2: 트리거 결과에 강조 대상을 싣는다

판정 로직이 이미 "무엇이 문제인지" 알고 있으므로, 대응표를 따로 두지 않고 트리거 정의 옆에 둔다. 낙뢰처럼 상황에 따라 대상이 바뀌는 경우도 자연히 처리된다.

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js`
- Create: `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js`

**Interfaces:**
- Consumes: Task 1의 트리거 6종 배열
- Produces: 모든 `evaluate()` 결과에 `highlight` 필드가 붙는다. 모양은 셋 중 하나다.
  - `{ panel: 'metar', field: 'visibility'|'ceiling'|'wind'|'weather' }`
  - `{ panel: 'taf', fields: string[], times: string[] }`
  - `{ panel: 'map', zone: 'alert'|'danger'|'caution' }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import triggers from './alert-triggers.js'

const byId = (id) => triggers.find((t) => t.id === id)

test('트리거는 6종이고 공항경보는 없다', () => {
  assert.equal(triggers.length, 6)
  assert.equal(byId('warning_issued'), undefined)
})

test('low_visibility: 시정 칸을 강조 대상으로 낸다', () => {
  const result = byId('low_visibility').evaluate(
    { observation: { visibility: { value: 800 } } },
    null,
    { threshold: 1500 }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'visibility' })
})

test('low_ceiling: 운고 칸을 강조 대상으로 낸다', () => {
  const result = byId('low_ceiling').evaluate(
    { observation: { clouds: [{ amount: 'OVC', base: 300 }] } },
    null,
    { threshold: 500, amounts: ['BKN', 'OVC'] }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'ceiling' })
})

test('high_wind: 바람 칸을 강조 대상으로 낸다', () => {
  const result = byId('high_wind').evaluate(
    { observation: { wind: { speed: 30, raw: '27030KT' } } },
    null,
    { speed_threshold: 25, gust_threshold: 35 }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'wind' })
})

test('weather_phenomenon: 날씨 칸을 강조 대상으로 낸다', () => {
  const result = byId('weather_phenomenon').evaluate(
    { observation: { weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] } },
    null,
    { phenomena: ['TS'] }
  )
  assert.deepEqual(result.highlight, { panel: 'metar', field: 'weather' })
})

test('taf_adverse_weather: 걸린 시각들을 강조 대상으로 낸다', () => {
  const soon = new Date(Date.now() + 3600000).toISOString()
  const result = byId('taf_adverse_weather').evaluate(
    { timeline: [{ time: soon, visibility: { value: 1200 }, weather: [] }] },
    null,
    { lookahead_hours: 6, vis_threshold: 3000, phenomena: ['TS'] }
  )
  assert.equal(result.highlight.panel, 'taf')
  assert.deepEqual(result.highlight.fields, ['visibility'])
  assert.deepEqual(result.highlight.times, [soon])
})

test('lightning_detected: 최근접 거리에 맞는 구역을 낸다', () => {
  const evaluate = (zone) => byId('lightning_detected').evaluate(
    { strikes: [{ time: '2026-07-28T00:00:00Z', lon: 126, lat: 37, type: 'G', zone, distance_km: 5 }] },
    null,
    { min_count: 1, types: ['G', 'C'], zones: ['alert', 'danger', 'caution'] }
  )
  assert.deepEqual(evaluate('alert').highlight, { panel: 'map', zone: 'alert' })
  assert.deepEqual(evaluate('danger').highlight, { panel: 'map', zone: 'danger' })
  assert.deepEqual(evaluate('caution').highlight, { panel: 'map', zone: 'caution' })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js
```
Expected: FAIL — `highlight`가 `undefined`라서 `deepEqual`이 깨진다. (첫 테스트 "트리거는 6종"은 Task 1 덕분에 통과한다.)

- [ ] **Step 3: 각 트리거 결과에 `highlight`를 넣는다**

`alert-triggers.js`의 반환 객체 다섯 곳에 한 줄씩 넣는다. `data:` 줄 바로 뒤가 자리다.

`lowVisibility`:
```js
      data: { value: vis, threshold: params.threshold },
      highlight: { panel: "metar", field: "visibility" },
```

`highWind`:
```js
      data: { speed: wind.speed, gust: wind.gust },
      highlight: { panel: "metar", field: "wind" },
```

`weatherPhenomenon`:
```js
      data: matched,
      highlight: { panel: "metar", field: "weather" },
```

`lowCeiling`:
```js
      data: { amount: ceiling.amount, base: ceiling.base },
      highlight: { panel: "metar", field: "ceiling" },
```

`lightningDetected`:
```js
      data: { byZone, nearest, newStrikes: fresh },
      highlight: {
        panel: "map",
        zone: byZone.alert > 0 ? "alert" : byZone.danger > 0 ? "danger" : "caution",
      },
```

- [ ] **Step 4: TAF 트리거의 강조 대상을 만든다**

`tafAdverseWeather`는 걸린 시각과 요소가 여러 개일 수 있으므로 모아서 낸다. `if (alerts.length === 0) return null;` 아래, `const worst = ...` 위에 두 줄을 넣는다.

```js
    if (alerts.length === 0) return null;

    const highlightFields = [...new Set(alerts.map((a) => (a.type === "vis" ? "visibility" : "weather")))];
    const highlightTimes = [...new Set(alerts.map((a) => a.time))];

    // 제목엔 실제로 위험한 값(시정/기상현상)을 담는다 — "TAF"라는 분류명은 본문으로 내리고,
```

그리고 반환 객체의 `data:` 줄 뒤에 넣는다.

```js
      data: alerts,
      highlight: { panel: "taf", fields: highlightFields, times: highlightTimes },
```

- [ ] **Step 5: 테스트 통과를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js
```
Expected: PASS — 7 tests

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js
git commit -m "feat(monitoring): 알람 판정 결과에 강조 대상을 함께 싣는다

어느 칸이 문제인지 화면에서 짚어주기 위해 판정 로직이 이미 아는 정보를
결과에 담는다. 대응표를 따로 두지 않아 낙뢰처럼 상황에 따라 대상이
바뀌는 경우도 자연히 처리된다."
```

---

## Task 3: 알람 이력을 공항별로 분리한다

지금은 이력이 전역이라, 다른 공항을 보는 동안 이전 공항 이력이 지워져 재알림 간격이 무시된다.

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-state.js`
- Create: `frontend/src/features/monitoring/legacy/utils/alerts/alert-state.test.js`

**Interfaces:**
- Consumes: Task 1의 트리거 6종 (`buildAlertKey`에서 `warning_issued` 분기 제거)
- Produces: `clearResolvedAlerts(firedKeys, icao)` — 두 번째 인자가 추가된다. 해당 공항의 키만 지운다. `buildAlertKey`·`isInCooldown`·`recordAlert` 서명은 그대로.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `frontend/src/features/monitoring/legacy/utils/alerts/alert-state.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { buildAlertKey, isInCooldown, recordAlert, clearResolvedAlerts, getHistory } from './alert-state.js'

beforeEach(() => {
  // 이력은 모듈 수준 객체다. 테스트마다 비운다.
  clearResolvedAlerts(new Set(), 'RKSI')
  clearResolvedAlerts(new Set(), 'RKPC')
})

test('알람 키에 공항이 들어간다', () => {
  const key = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  assert.equal(key, 'high_wind:RKSI')
})

test('공항경보 분기가 사라졌다', () => {
  const key = buildAlertKey({ triggerId: 'warning_issued', data: [] }, 'RKSI')
  assert.equal(key, 'warning_issued:RKSI')
})

test('다른 공항을 보는 동안 이전 공항 이력이 지워지지 않는다', () => {
  const sipKey = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  const pcKey = buildAlertKey({ triggerId: 'high_wind' }, 'RKPC')
  recordAlert(sipKey)

  // RKPC를 보는 사이클: RKPC 키만 발동했다
  clearResolvedAlerts(new Set([pcKey]), 'RKPC')

  assert.ok(getHistory()[sipKey], 'RKSI 이력이 남아 있어야 한다')
  assert.equal(isInCooldown(sipKey, 300), true)
})

test('같은 공항에서 조건이 해소되면 이력이 지워진다', () => {
  const key = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  recordAlert(key)
  clearResolvedAlerts(new Set(), 'RKSI')
  assert.equal(getHistory()[key], undefined)
})
```

- [ ] **Step 2: 실패를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/alert-state.test.js
```
Expected: FAIL — "다른 공항을 보는 동안…"에서 RKSI 이력이 지워진다. 현재 `clearResolvedAlerts`가 공항을 구분하지 않기 때문이다.

- [ ] **Step 3: 공항경보 분기를 지우고 정리 범위를 공항으로 좁힌다**

`alert-state.js`에서 `buildAlertKey`의 `warning_issued` 분기(9-13행)를 통째로 지운다. 그 트리거는 더 이상 없다. 지우면 마지막 `return \`${triggerId}:${icao}\``가 받는다.

그리고 `clearResolvedAlerts`를 아래로 교체한다.

```js
/**
 * 조건이 해소된 트리거의 이력을 삭제한다. 해당 공항의 키만 본다.
 * 이력이 전역이면 다른 공항을 보는 동안 이전 공항 이력이 지워져 재알림 간격이 무시된다.
 * firedKeys: 이번 사이클에서 발동된 키 Set
 */
export function clearResolvedAlerts(firedKeys, icao) {
  const suffix = `:${icao}`;
  for (const key of Object.keys(alertHistory)) {
    if (!key.endsWith(suffix) && !key.includes(`${suffix}:`)) continue;
    if (!firedKeys.has(key)) {
      delete alertHistory[key];
    }
  }
}
```

키 모양은 `triggerId:ICAO` 또는 `triggerId:ICAO:상세`다. 두 모양을 다 잡으려고 조건이 둘이다.

- [ ] **Step 4: 테스트 통과를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/alert-state.test.js
```
Expected: PASS — 4 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/utils/alerts/alert-state.js frontend/src/features/monitoring/legacy/utils/alerts/alert-state.test.js
git commit -m "fix(monitoring): 알람 이력을 공항별로 분리한다

이력이 전역이라 다른 공항을 보는 동안 이전 공항 이력이 지워져
재알림 간격이 무시되던 문제를 고친다."
```

---

## Task 4: 이미 저장된 개인 설정을 한 번 정리한다

설정은 `localStorage`에 개인 override로 저장되고 기본값 위에 깊은 병합된다. 그래서 **기본값만 바꾸면 이미 값을 저장한 사용자에게는 아무 일도 일어나지 않는다.**

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-settings.js`
- Create: `frontend/src/features/monitoring/legacy/utils/alerts/alert-settings.test.js`

**Interfaces:**
- Consumes: Task 1의 `alertDefaults` 모양
- Produces: `migratePersonalSettings(personal)` — 순수 함수를 새로 내보낸다. 저장된 객체를 받아 정리된 객체를 반환한다. `localStorage`를 만지지 않으므로 그대로 테스트할 수 있다. `resolveSettings()`가 내부에서 이 함수를 거친다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `frontend/src/features/monitoring/legacy/utils/alerts/alert-settings.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { migratePersonalSettings } from './alert-settings.js'

test('머무는 시간 10 이하는 강조 시간 60초가 된다', () => {
  const out = migratePersonalSettings({ dispatchers: { popup: { auto_dismiss_seconds: 10 } } })
  assert.equal(out.dispatchers.popup.highlight_seconds, 60)
  assert.equal(out.dispatchers.popup.auto_dismiss_seconds, undefined)
})

test('머무는 시간이 10보다 크면 그 값을 강조 시간으로 옮긴다', () => {
  const out = migratePersonalSettings({ dispatchers: { popup: { auto_dismiss_seconds: 45 } } })
  assert.equal(out.dispatchers.popup.highlight_seconds, 45)
})

test('최대 표시 5는 6이 되고 다른 값은 그대로 둔다', () => {
  assert.equal(migratePersonalSettings({ dispatchers: { popup: { max_visible: 5 } } }).dispatchers.popup.max_visible, 6)
  assert.equal(migratePersonalSettings({ dispatchers: { popup: { max_visible: 3 } } }).dispatchers.popup.max_visible, 3)
})

test('삭제 대상 키가 남지 않는다', () => {
  const out = migratePersonalSettings({
    dispatchers: { popup: { position: 'top-right' }, marquee: { enabled: false, speed: 'fast' } },
    triggers: { warning_issued: { enabled: false }, high_wind: { enabled: false } },
  })
  assert.equal(out.dispatchers.popup.position, undefined)
  assert.equal(out.dispatchers.marquee, undefined)
  assert.equal(out.triggers.warning_issued, undefined)
  assert.equal(out.triggers.high_wind.enabled, false, '남는 트리거 설정은 보존한다')
})

test('빈 입력과 null에서 터지지 않는다', () => {
  assert.deepEqual(migratePersonalSettings(null), {})
  assert.deepEqual(migratePersonalSettings({}), {})
})

test('정리할 것이 없으면 입력을 그대로 돌려준다', () => {
  const input = { global: { alerts_enabled: false } }
  assert.deepEqual(migratePersonalSettings(input), { global: { alerts_enabled: false } })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/alert-settings.test.js
```
Expected: FAIL — `migratePersonalSettings is not a function`

- [ ] **Step 3: 정리 함수를 만든다**

`alert-settings.js`의 `deepMerge` 아래, `resolveSettings` 위에 넣는다.

```js
/**
 * 저장된 개인 설정을 새 구조로 한 번 옮긴다. 순수 함수 — localStorage를 만지지 않는다.
 * 기본값만 바꾸면 이미 값을 저장한 사용자에게는 아무 일도 일어나지 않으므로 저장분을 직접 손본다.
 */
export function migratePersonalSettings(personal) {
  if (!personal || typeof personal !== "object") return {};

  const out = JSON.parse(JSON.stringify(personal));

  const popup = out.dispatchers?.popup;
  if (popup) {
    if (popup.auto_dismiss_seconds != null) {
      // 옛 값은 "팝업이 사라지는 시간"이고 새 값은 "강조가 유지되는 시간"이라 뜻이 다르다.
      // 10초 이하를 그대로 옮기면 강조가 순식간에 꺼지므로 새 기본값으로 올린다.
      const seconds = Number(popup.auto_dismiss_seconds);
      popup.highlight_seconds = Number.isFinite(seconds) && seconds > 10 ? seconds : 60;
      delete popup.auto_dismiss_seconds;
    }
    if (popup.max_visible === 5) popup.max_visible = 6; // 구 기본값만 올린다
    delete popup.position;
  }

  if (out.dispatchers) delete out.dispatchers.marquee;
  if (out.triggers) delete out.triggers.warning_issued;

  return out;
}
```

- [ ] **Step 4: `resolveSettings`가 정리를 거치게 하고 결과를 되저장한다**

`resolveSettings`를 아래로 교체한다.

```js
/**
 * 서버 기본값 + localStorage 개인 설정을 병합한다.
 * 저장분이 옛 구조면 한 번 정리하고 그 결과를 다시 저장한다.
 */
export function resolveSettings(defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw);
    const personal = migratePersonalSettings(stored);
    if (JSON.stringify(personal) !== JSON.stringify(stored)) {
      savePersonalSettings(personal);
    }
    return deepMerge(defaults, personal);
  } catch {
    // 저장분이 깨졌으면 기본값으로 간다. 알람이 뜨는 것이 개인 설정을 지키는 것보다 중요하다.
    return defaults;
  }
}
```

- [ ] **Step 5: 테스트 통과를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/alert-settings.test.js
```
Expected: PASS — 6 tests

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/utils/alerts/alert-settings.js frontend/src/features/monitoring/legacy/utils/alerts/alert-settings.test.js
git commit -m "feat(monitoring): 저장된 개인 설정을 새 구조로 한 번 옮긴다

개인 설정이 기본값을 덮으므로 기본값만 바꾸면 기존 사용자에게는
아무 변화가 없다. 저장분의 옛 키를 직접 옮기고 지운다."
```

---

## Task 5: 하단 알람 표를 만든다

자막 바가 있던 자리를 알람 표가 대체한다. 조건이 살아있는 동안 계속 떠 있고, 새 알람만 60초 강조된다.

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/alerts/AlertPanel.jsx` (전면 재작성)
- Modify: `frontend/src/features/monitoring/legacy/App.css:3033-3231` (`.alert-panel*` 블록 교체)

**Interfaces:**
- Consumes: `alerts` 배열의 각 항목은 `{ id, severity, title, message, icao, triggerId, alertKey, timestamp }` (`alert-dispatcher.js:45-54`가 만든다). `validKeys`는 `Set<string>`. `settings`는 `{ enabled, highlight_seconds, max_visible }`.
- Produces: `.alert-table` 컨테이너, 행마다 `.alert-table-row`, 채운 행에 `.alert-table-row--new`. Task 11의 계약이 이 클래스명을 쓴다.

- [ ] **Step 1: `AlertPanel.jsx`를 표로 다시 쓴다**

파일 전체를 아래로 교체한다.

```jsx
import { useEffect, useState } from "react";

// 심각도 순서. 정렬과 "가장 심한 것" 판단에 쓴다.
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const SEVERITY_LABEL = { critical: "위험", warning: "경고", info: "정보" };

function isAlertValid(alert, validKeys) {
  // 예시 등 alertKey가 없는 항목은 트리거 재평가 대상이 아니므로 항상 유효로 본다.
  return !alert.alertKey || !!validKeys?.has(alert.alertKey);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

// 벽걸이 상황실용 하단 알람 표. 자동으로 숨지 않는다 — 조건이 살아있는 한 계속 보인다.
// 정렬은 심각도순 → 같으면 최신순. 색으로 채우는 줄은 가장 최근 새 알람 1건뿐이다.
export default function AlertPanel({ alerts, validKeys, onDismiss, settings }) {
  const highlightMs = (settings?.highlight_seconds ?? 60) * 1000;
  const maxVisible = settings?.max_visible ?? 6;

  // 강조 창이 지나면 다시 그려 "새 알람"에서 빠지게 한다. 타이머 하나로 충분하다.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (alerts.length === 0) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [alerts.length]);

  if (!settings?.enabled) return null;

  const live = alerts.filter((alert) => isAlertValid(alert, validKeys));
  if (live.length === 0) return null;

  const now = Date.now();
  const isNew = (alert) => now - alert.timestamp < highlightMs;

  const sorted = [...live].sort((a, b) => {
    const bySeverity = (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2);
    return bySeverity !== 0 ? bySeverity : b.timestamp - a.timestamp;
  });
  const visible = sorted.slice(0, maxVisible);

  // 색으로 채우는 줄은 새 알람 중 가장 최근 1건뿐이다. 색을 아껴 써야 무엇이 급한지가 남는다.
  const featuredId = visible
    .filter(isNew)
    .reduce((best, alert) => (best && best.timestamp >= alert.timestamp ? best : alert), null)?.id;

  return (
    <div className="alert-table" role="log" aria-label="알람 목록">
      {visible.map((alert) => {
        const featured = alert.id === featuredId;
        return (
          <div
            key={alert.id}
            className={`alert-table-row alert-table-row--${alert.severity}${featured ? " alert-table-row--new" : ""}`}
          >
            <span className="alert-table-band" aria-hidden="true" />
            <span className="alert-table-level">{SEVERITY_LABEL[alert.severity] || "정보"}</span>
            <span className="alert-table-body">
              <span className="alert-table-title">{alert.title}</span>
              {featured && alert.message && (
                <span className="alert-table-message">{alert.message}</span>
              )}
            </span>
            <span className="alert-table-time">{formatTime(alert.timestamp)}</span>
            <button
              type="button"
              className="alert-table-close"
              onClick={() => onDismiss(alert.id)}
              aria-label={`${alert.title} 닫기`}
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 표 스타일을 넣는다**

`App.css`의 `.alert-panel {`(3033행)부터 `.alert-panel-row-close:hover { color: var(--ink); }`(3231행)까지 **블록 전체를 지우고** 아래로 교체한다. 지워지는 것에는 `.alert-panel-badge`(더 이상 렌더링되지 않는 죽은 스타일)도 포함된다.

```css
/* 하단 알람 표 — 벽걸이 상황실 기준. 4m 거리에서 읽히는 크기가 목표다.
   z-index 9998: 전체화면 슬라이드쇼(.monitoring-slide-overlay--whole-screen, 900)보다 위여야
   슬라이드를 켜 둔 화면에서도 알람이 보인다. */
.alert-table {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9998;
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  padding: 4px;
  pointer-events: none;
}

.alert-table-row {
  --alert-level-color: #475569;
  display: grid;
  grid-template-columns: 6px 4.5rem 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.75rem;
  background: var(--paper, #fff);
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  font-size: clamp(18px, 1.7vw, 32px);
  pointer-events: auto;
}

.alert-table-row--critical { --alert-level-color: #c0291f; }
.alert-table-row--warning  { --alert-level-color: #92400e; }
.alert-table-row--info     { --alert-level-color: #475569; }

.alert-table-band {
  align-self: stretch;
  background: var(--alert-level-color);
}

.alert-table-level {
  color: var(--alert-level-color);
  font-weight: 700;
  white-space: nowrap;
}

.alert-table-body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.alert-table-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-table-message {
  font-size: 0.62em;
  opacity: 0.85;
  white-space: pre-line;
}

.alert-table-time {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  font-size: 0.62em;
  white-space: nowrap;
}

.alert-table-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1em;
  line-height: 1;
  opacity: 0.5;
  padding: 0 0.25rem;
}

.alert-table-close:hover { opacity: 1; }

/* 새 알람 한 건만 색으로 채운다. 제목이 커지지만 목록이 아래 고정이라
   아래 줄들은 밀리지 않고 위쪽 끝만 내려온다. */
.alert-table-row--new {
  background: var(--alert-level-color);
  color: #fff;
  font-size: clamp(26px, 2.4vw, 46px);
}

.alert-table-row--new .alert-table-level,
.alert-table-row--new .alert-table-time { color: #fff; }
.alert-table-row--new .alert-table-band { background: rgba(255, 255, 255, 0.6); }
.alert-table-row--new .alert-table-close { opacity: 0.8; }
```

- [ ] **Step 3: 화면에 뜨는지 눈으로 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && CONTRACT_REUSE_SERVER=1 npx playwright test verification/contracts/monitoring.spec.mjs --project=desktop --retries=0 --reporter=line
```
Expected: 여전히 1 failed (배지 계약 — Task 11에서 교체한다). 새로 깨지는 것이 없어야 한다. `alert panel collapses to a badge` 외의 실패가 나오면 멈추고 원인을 찾는다.

- [ ] **Step 4: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/components/alerts/AlertPanel.jsx frontend/src/features/monitoring/legacy/App.css
git commit -m "feat(monitoring): 알람 패널을 하단 알람 표로 다시 만든다

멀리서 읽히도록 글자를 키우고, 자동으로 숨지 않게 한다.
색으로 채우는 줄은 가장 최근 새 알람 1건으로 제한해 무엇이 급한지 남긴다."
```

---

## Task 6: 자막 바를 지운다

하단 알람 표가 같은 자리를 대체한다.

**Files:**
- Delete: `frontend/src/features/monitoring/legacy/components/alerts/AlertMarquee.jsx`
- Modify: `frontend/src/features/monitoring/MonitoringPage.jsx:28, 455, 553`
- Modify: `frontend/src/features/monitoring/legacy/App.css:3233-3290` (`.alert-marquee*` 블록)

**Interfaces:**
- Consumes: Task 5의 `.alert-table`
- Produces: `AlertMarquee` import·렌더·`marqueeAlerts` 변수가 사라진다. `MonitoringPage`의 예시 배선은 Task 8에서 마저 정리한다.

- [ ] **Step 1: 컴포넌트 파일을 지운다**

```bash
cd /home/john_doe/ProjectAMO && git rm frontend/src/features/monitoring/legacy/components/alerts/AlertMarquee.jsx
```

- [ ] **Step 2: `MonitoringPage.jsx`에서 배선을 뺀다**

세 곳을 지운다.

1. import 한 줄 (28행): `import AlertMarquee from './legacy/components/alerts/AlertMarquee'`
2. `marqueeAlerts` 선언 한 줄 (455행): `const marqueeAlerts = [...previewAlerts.filter((alert) => alert.previewChannels?.marquee), ...activeAlerts]`
3. 렌더 한 줄 (553행): `<AlertMarquee alerts={marqueeAlerts} settings={settings.dispatchers.marquee} />`

- [ ] **Step 3: 자막 CSS를 지운다**

`App.css`에서 `.alert-marquee {`(3233행)로 시작하는 블록부터 자막 관련 규칙과 `@keyframes` 전체를 지운다. 경계를 정확히 잡으려면 먼저 확인한다.

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -n "alert-marquee" frontend/src/features/monitoring/legacy/App.css
```
나온 줄과 그 블록들을 지운다. 지운 뒤 같은 명령을 다시 돌려 **결과가 없어야 한다.**

- [ ] **Step 4: 남은 참조가 없는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -rn "AlertMarquee\|alert-marquee\|marqueeAlerts" frontend/src
```
Expected: 결과 없음

- [ ] **Step 5: 앱이 뜨는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && CONTRACT_REUSE_SERVER=1 npx playwright test verification/contracts/monitoring.spec.mjs --project=desktop --retries=0 --reporter=line
```
Expected: 배지 계약 1건과 `하단 알림 바 표시` 체크박스를 찾는 계약 1건이 실패한다(Task 10·11에서 교체). 그 외에는 통과. 화면이 아예 안 뜨는 오류가 나오면 멈춘다.

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add -A frontend/src/features/monitoring
git commit -m "refactor(monitoring): 자막 알림 바를 걷어낸다

한 바퀴 도는 데 약 170초가 걸리는데 30초 뒤 사라져 사실상 읽히지 않았다.
같은 자리를 하단 알람 표가 대체한다."
```

---

## Task 7: 문제가 난 요소를 깜빡인다

어느 칸이 문제인지 화면에서 직접 짚어준다. **칸 바깥 외곽선만 쓴다** — 이 칸들은 이미 배경색으로 비행조건을 표현하므로 배경이나 테두리를 쓰면 한 색에 두 의미가 생긴다.

기존 `metar-card--alert-outline` 클래스가 이미 같은 일을 하고 있다(`MetarCard.jsx:474,485,695,746`). 새 클래스를 만들지 말고 그 이름을 그대로 쓴다.

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/App.css` (외곽선·깜빡임 규칙)
- Modify: `frontend/src/features/monitoring/legacy/components/MetarCard.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/TafTimeline.jsx`
- Modify: `frontend/src/features/monitoring/MonitoringMap.jsx`, `frontend/src/features/map/MapView.jsx`

**Interfaces:**
- Consumes: Task 2의 `highlight` 모양
- Produces: 세 컴포넌트가 `highlight` prop을 받는다.
  - `MetarCard`: `highlightField?: 'visibility'|'ceiling'|'wind'|'weather'`
  - `TafTimeline`: `highlightTimes?: string[]`, `highlightFields?: string[]`
  - `MonitoringMap`/`MapView`: `highlightZone?: 'alert'|'danger'|'caution'`

- [ ] **Step 1: 깜빡이는 외곽선 규칙을 넣는다**

`App.css` 끝에 붙인다. 기존 `.metar-card--alert-outline` 규칙이 있으면 지우지 말고 아래를 추가해 색과 깜빡임만 얹는다.

```css
/* 요소 반짝임 — "어디가 문제인가"를 60초만 짚어준다.
   outline은 레이아웃을 차지하지 않으므로 칸이 밀리지 않는다.
   0.8초 주기 = 초당 1.25회. WCAG 2.3.1(초당 3회 이하)을 지킨다. */
.alert-outline-blink {
  --alert-outline-color: #c0291f;
  outline: 3px solid var(--alert-outline-color);
  outline-offset: 2px;
  animation: alert-outline-blink 0.8s step-end infinite;
}

.alert-outline-blink--warning { --alert-outline-color: #92400e; }
.alert-outline-blink--info    { --alert-outline-color: #475569; }

@keyframes alert-outline-blink {
  50% { outline-color: transparent; }
}

/* 움직임을 줄이는 설정에서는 깜빡이지 않고 고정 외곽선만 남긴다. */
@media (prefers-reduced-motion: reduce) {
  .alert-outline-blink { animation: none; }
}
```

- [ ] **Step 2: `MetarCard`가 강조 대상을 받게 한다**

컴포넌트 서명에 prop을 더한다(`MetarCard.jsx:280` 근처의 `export default function MetarCard({ ... })`).

```jsx
export default function MetarCard({ /* 기존 props 그대로 */, highlightField = null, highlightSeverity = "critical" }) {
```

그리고 강조가 붙을 칸의 `className`에 조건부로 클래스를 더한다. 데스크톱 카드는 `metar-surface-card`, 모바일 카드는 `metar-mobile-card`다. 헬퍼를 컴포넌트 안에 하나 두고 재사용한다.

```jsx
  const blinkClass = (field) =>
    highlightField === field
      ? ` alert-outline-blink${highlightSeverity === "critical" ? "" : ` alert-outline-blink--${highlightSeverity}`}`
      : "";
```

바람 카드는 이미 `metar-card--alert-outline`을 조건부로 붙이고 있으므로 그 뒤에 이어 붙인다(695행).

```jsx
              <article className={`metar-surface-card metar-surface-card--wind${highWind ? " metar-card--alert-outline" : ""}${blinkClass("wind")}`}>
```

시정·운고·날씨 카드에도 같은 방식으로 `blinkClass("visibility")`, `blinkClass("ceiling")`, `blinkClass("weather")`를 붙인다. 붙일 자리는 각 카드의 최상위 `className` 문자열 끝이다.

- [ ] **Step 3: `TafTimeline`이 강조 시각을 받게 한다**

서명에 prop을 더한다(`TafTimeline.jsx:257` 근처).

```jsx
export default function TafTimeline({ /* 기존 props 그대로 */, highlightTimes = [], highlightSeverity = "critical" }) {
  const highlightSet = new Set(highlightTimes);
```

시간칸을 그리는 곳에서 `slot.time`이 집합에 있으면 클래스를 붙인다. `displaySlots`를 도는 `.map()`의 각 칸 `className` 끝에 이어 붙인다.

```jsx
                className={`${기존_클래스}${highlightSet.has(slot.time) ? ` alert-outline-blink${highlightSeverity === "critical" ? "" : ` alert-outline-blink--${highlightSeverity}`}` : ""}`}
```

`displaySlots`는 `buildTafDisplaySlots()`(161행)가 만든다. 각 항목이 원본 `time`을 갖고 있는지 먼저 확인한다.

Run:
```bash
cd /home/john_doe/ProjectAMO && sed -n '161,200p' frontend/src/features/monitoring/legacy/components/TafTimeline.jsx
```
`time` 필드가 없으면 `buildTafDisplaySlots`가 원본 시각을 함께 담도록 한 줄 더한다.

- [ ] **Step 4: 지도 링을 굵게·깜빡이게 한다**

`RANGE_RING` 레이어는 feature마다 `radiusKm` 속성을 갖는다. 구역과 반지름 대응은 경보 8km · 위험 16km · 주의 32km다.

`MapView.jsx`에서 링 레이어의 `line-width` paint 속성을 강조 구역에 반응하도록 바꾼다.

```js
'line-width': [
  'case',
  ['==', ['get', 'radiusKm'], highlightRadiusKm ?? -1], 5,
  2,
],
```

`highlightRadiusKm`는 prop으로 받은 `highlightZone`을 반지름으로 옮긴 값이다.

```js
const ZONE_RADIUS_KM = { alert: 8, danger: 16, caution: 32 }
const highlightRadiusKm = highlightZone ? ZONE_RADIUS_KM[highlightZone] : null
```

깜빡임은 0.8초 간격으로 `line-width`를 5와 2 사이에서 토글해 만든다. 기존 낙뢰 깜빡임이 쓰는 `LIGHTNING_BLINK_INTERVAL_MS`를 재사용한다.

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -rn "LIGHTNING_BLINK_INTERVAL_MS\|RANGE_RING" frontend/src --include=*.js --include=*.jsx
```
나온 곳의 기존 깜빡임 구현을 그대로 따른다. 새 타이머 방식을 발명하지 않는다.

- [ ] **Step 5: 단위 테스트가 여전히 통과하는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/
```
Expected: PASS — 17 tests (Task 2·3·4의 7 + 4 + 6)

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring frontend/src/features/map
git commit -m "feat(monitoring): 문제가 난 요소를 외곽선으로 짚어준다

배경이나 테두리 대신 바깥 외곽선을 쓴다. 해당 칸들이 이미 배경색으로
비행조건을 표현하고 있어 한 색에 두 의미가 생기는 것을 막는다.
0.8초 주기로 초당 3회 이하를 지키고, 움직임 줄이기 설정에서는 고정 외곽선만 남긴다."
```

---

## Task 8: `MonitoringPage`를 다시 배선한다

강조 대상을 나눠 보내고, 지상 모드에서 판정을 멈추고, 중단 후 재개 시 "지금 무엇이 나쁜가"로 판정하고, 예시 3건을 교체한다.

**Files:**
- Modify: `frontend/src/features/monitoring/MonitoringPage.jsx:218-254, 261-324, 453-455`

**Interfaces:**
- Consumes: Task 2의 `highlight`, Task 3의 `clearResolvedAlerts(firedKeys, icao)`, Task 7의 세 컴포넌트 prop
- Produces: 없음 (배선 계층)

- [ ] **Step 1: 지상 모드에서 판정을 멈추고 이력 정리에 공항을 넘긴다**

`useEffect`(218행) 안에서 두 곳을 고친다. 지상 모드 여부를 나타내는 값의 이름은 먼저 확인한다.

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -n "mode\b\|'ground'\|\"ground\"" frontend/src/features/monitoring/MonitoringPage.jsx | head -20
```

확인한 이름을 써서 조기 반환을 더한다(221행의 기존 조기 반환 바로 아래).

```js
    if (!settings.global.alerts_enabled || isQuietHours(settings.global.quiet_hours)) return
    // 지상 모드에서는 알람 판정 자체를 멈춘다. 목록·반짝임·소리 모두 없다.
    if (mode === 'ground') return
```

그리고 이력 정리 호출(252행)에 공항을 넘긴다.

```js
    clearResolvedAlerts(firedKeys, selectedAirport)
```

- [ ] **Step 2: 중단되었다가 재개될 때 기준을 리셋한다**

지상 모드·방해금지 시간이 끝나 판정이 재개될 때, 중단 중 갱신되지 않은 이전 데이터와 비교하면 그동안의 변화가 한꺼번에 터진다. 재개 시에는 "지금 무엇이 나쁜가"로만 판정한다.

`prevDataRef` 선언(115행) 옆에 중단 여부를 기억할 ref를 하나 더 둔다.

```js
  const prevDataRef = useRef(null)
  const wasPausedRef = useRef(false)
```

Step 1에서 더한 두 조기 반환을 아래처럼 바꿔 중단을 기록한다.

```js
    const paused = !settings.global.alerts_enabled
      || isQuietHours(settings.global.quiet_hours)
      || mode === 'ground'
    if (paused) {
      wasPausedRef.current = true
      return
    }
```

그리고 `previousData` 계산(230행)에서 재개 직후면 이전 데이터를 비운다.

```js
    // 재개 직후에는 "그동안 무엇이 바뀌었나"가 아니라 "지금 무엇이 나쁜가"로 판정한다.
    const resuming = wasPausedRef.current
    wasPausedRef.current = false
    const prev = resuming ? null : prevDataRef.current
```

- [ ] **Step 3: 강조 대상을 갈라 전달한다**

`popupAlerts` 계산(453행) 부근에 강조 대상 추출을 더한다. 새 알람 60초 창 안의 것만 강조한다.

```js
  const popupAlerts = [...previewAlerts, ...activeAlerts]
  const soundAlerts = [...previewAlerts.filter((alert) => alert.previewChannels?.sound), ...activeAlerts]

  // 강조는 새 알람 창 안의 것만. 창 밖으로 나가면 요소는 평소 모습으로 돌아간다.
  const highlightMs = (settings?.dispatchers?.popup?.highlight_seconds ?? 60) * 1000
  const highlighting = popupAlerts.filter(
    (alert) => alert.highlight && Date.now() - alert.timestamp < highlightMs
  )
  const metarHighlight = highlighting.find((a) => a.highlight.panel === 'metar')
  const tafHighlight = highlighting.find((a) => a.highlight.panel === 'taf')
  const mapHighlight = highlighting.find((a) => a.highlight.panel === 'map')
```

그리고 세 컴포넌트에 넘긴다. `MetarCard`·`TafTimeline`이 렌더되는 자리에 prop을 더한다.

```jsx
      highlightField={metarHighlight?.highlight.field ?? null}
      highlightSeverity={metarHighlight?.severity ?? 'critical'}
```

```jsx
      highlightTimes={tafHighlight?.highlight.times ?? []}
      highlightSeverity={tafHighlight?.severity ?? 'critical'}
```

`MonitoringMap`(532행)에는:

```jsx
        highlightZone={mapHighlight?.highlight.zone ?? null}
```

`alert-dispatcher.js`가 `highlight`를 알람 객체에 담아야 하므로 한 줄 더한다. `alert-dispatcher.js:51` 뒤에:

```js
      triggerId: result.triggerId,
      highlight: result.highlight || null,
```

- [ ] **Step 4: 예시 3건을 교체하고 자막 예시 경로를 지운다**

`PANEL_PREVIEW_SEQUENCE`(263-267행)를 교체한다. 삭제되는 공항경보를 예시로 보여주면 존재하지 않는 알람을 광고하게 된다. 심각도를 내림차순으로 두어 "채운 줄이 맨 위가 아닐 수 있다"가 예시에서 그대로 재현되게 한다.

```js
  // 실제 트리거가 낼 법한 문구를 흉내 낸 예시 3종. alertKey가 없어 조건 해소로 사라지지 않으므로
  // 강조 시간이 끝나고 10초 뒤 스스로 빠진다.
  // 심각도 내림차순이라 마지막에 뜬 3번이 목록 맨 아래에 들어간다 — 채운 줄이 맨 위가 아님을 보여준다.
  const PANEL_PREVIEW_SEQUENCE = [
    {
      severity: 'critical',
      title: '낙뢰 경보: 8km 이내 3건',
      message: '최근접 5.2km | 경보 3건',
      highlight: { panel: 'map', zone: 'alert' },
    },
    {
      severity: 'warning',
      title: 'METAR 저시정: 1200m',
      message: '현재 시정이 1200m으로 임계값(1500m) 이하입니다.',
      highlight: { panel: 'metar', field: 'visibility' },
    },
    {
      severity: 'info',
      title: 'TAF 저시정: 2500m',
      message: 'TAF 6시간 내 예보\n[24일 02:00] 시정 2500m',
      highlight: { panel: 'taf', fields: ['visibility'], times: [] },
    },
  ]
```

`firePopupPreviewSequence`(269-283행)에서 `previewChannels`를 없앤다. 채널이 팝업 하나뿐이라 갈래가 필요 없다.

```js
  function firePopupPreviewSequence(highlightSeconds) {
    PANEL_PREVIEW_SEQUENCE.forEach((example, index) => {
      window.setTimeout(() => {
        const previewAlert = {
          id: `preview-popup-${Date.now()}-${index}`,
          ...example,
          icao: selectedAirport || DEFAULT_AIRPORT,
          triggerId: 'preview_popup',
          timestamp: Date.now(),
        }
        setPreviewAlerts((prev) => [previewAlert, ...prev].slice(0, 10))
        // 강조가 끝나고 10초 뒤 스스로 빠진다. 예시는 조건 해소 판정이 없다.
        window.setTimeout(() => {
          setPreviewAlerts((prev) => prev.filter((alert) => alert.id !== previewAlert.id))
        }, highlightSeconds * 1000 + 10000)
      }, index * 600)
    })
  }
```

`handlePreviewAlert`(285-324행)를 자막 갈래 없이 다시 쓴다.

```js
  function handlePreviewAlert(channel, previewDispatchers = null) {
    const settings = alertDefaults ? resolveSettings(alertDefaults) : null
    if (!settings) return
    const dispatchers = previewDispatchers || settings.dispatchers

    if (channel === 'popup') {
      firePopupPreviewSequence(dispatchers.popup?.highlight_seconds ?? 60)
      return
    }

    // 소리 예시: 목록에 줄을 만들되 강조 대상이 없고, 재생이 끝나면 곧 사라진다.
    const previewAlert = {
      id: `preview-sound-${Date.now()}`,
      severity: 'critical',
      title: '소리 알림 예시',
      message: '현재 설정된 사운드 크기와 패턴으로 재생됩니다.',
      icao: selectedAirport || DEFAULT_AIRPORT,
      triggerId: 'preview_sound',
      timestamp: Date.now(),
      previewChannels: { sound: true },
    }
    setPreviewAlerts((prev) => [previewAlert, ...prev].slice(0, 10))

    const repeat = dispatchers.sound?.repeat_count?.critical ?? 3
    window.setTimeout(() => {
      setPreviewAlerts((prev) => prev.filter((alert) => alert.id !== previewAlert.id))
    }, Math.max(repeat * 500 + 1000, 2500))
  }
```

`popupAlerts`가 예시를 그대로 받으므로 `previewChannels?.popup` 필터는 Step 3에서 이미 사라졌다.

- [ ] **Step 5: 화면이 뜨고 계약이 더 깨지지 않는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && CONTRACT_REUSE_SERVER=1 npx playwright test verification/contracts/monitoring.spec.mjs --project=desktop --retries=0 --reporter=line
```
Expected: Task 6과 같은 실패 2건(배지·자막 체크박스)만. 새 실패가 늘면 멈춘다.

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring
git commit -m "feat(monitoring): 강조 대상을 나눠 보내고 판정 중단·재개를 정리한다

지상 모드에서는 판정을 멈춘다. 중단되었다가 재개될 때는 그동안의 변화가
한꺼번에 터지지 않도록 '지금 무엇이 나쁜가'로만 판정한다.
설정창 예시도 남는 알람 6종으로 갈아끼운다."
```

---

## Task 9: 모바일에서 상황판 진입을 막는다

`/monitoring`은 벽걸이 전용 화면이다. 이미 만들어 둔 모바일 대응 코드는 **지우지 않는다** — 나중에 가드만 풀면 되살아나야 한다.

**Files:**
- Modify: `frontend/src/app/App.jsx:310-312`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 진입 가드를 넣는다**

`App.jsx:310`의 분기를 교체한다.

```jsx
  if (window.location.pathname === '/monitoring') {
    // 상황판은 벽걸이 전용이다. 모바일 폭에서는 조용히 메인으로 되돌린다 —
    // 운영자가 주소를 직접 아는 화면이라 모바일 사용자에게 설명할 맥락이 없다.
    // 가드는 여기 한 곳뿐이다. MonitoringPage의 모바일 대응 코드는 그대로 두어
    // 이 가드만 풀면 되살아나게 한다.
    if (window.innerWidth <= 719) {
      window.location.replace('/')
      return null
    }
    return <Suspense fallback={null}><MonitoringPage /></Suspense>
  }
```

- [ ] **Step 2: 데스크톱은 그대로 열리는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && CONTRACT_REUSE_SERVER=1 npx playwright test verification/contracts/monitoring.spec.mjs --project=desktop --retries=0 --reporter=line
```
Expected: Task 8과 같은 실패 2건만. 데스크톱 계약이 새로 깨지면 브레이크포인트 판정을 다시 본다.

- [ ] **Step 3: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/app/App.jsx
git commit -m "feat(monitoring): 모바일 폭에서 상황판 진입을 막는다

상황판은 벽걸이 전용이다. 가드는 진입 한 곳에만 두고 기존 모바일
대응 코드는 남겨 나중에 가드만 풀면 되살아나게 한다."
```

---

## Task 10: 설정창을 정리한다

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx:21-29, 386-433, 513-515`

**Interfaces:**
- Consumes: Task 1의 `alertDefaults` 모양, Task 8의 `onPreviewAlert(channel, dispatchers)`
- Produces: 설정창 알림 탭에 예시 버튼 2개(`알람 목록 표시 예시`, `소리 사용 예시`). 자막 항목 없음. Task 11의 계약이 이 이름을 쓴다.

- [ ] **Step 1: 트리거 라벨에서 공항경보를 뺀다**

`Settings.jsx:21-29`의 `TRIGGER_LABELS`에서 `warning_issued` 한 줄을 지운다.

```js
const TRIGGER_LABELS = {
  low_visibility: "시정이 나빠지면 알림",
  high_wind: "바람이 강해지면 알림",
  weather_phenomenon: "특이기상(TS/SN/FG)이 나타나면 알림",
  low_ceiling: "구름고도가 낮아지면 알림",
  taf_adverse_weather: "예보에 악기상이 들어오면 알림",
  lightning_detected: "공항 주변 낙뢰가 발생하면 알림",
};
```

- [ ] **Step 2: 알림 방식 행에서 자막을 빼고 팝업 이름을 바꾼다**

`Settings.jsx:513-515`를 교체한다.

```jsx
                  {renderDispatcherRow("popup", "알람 목록 표시", popupEnabled, setPopupEnabled)}
                  {renderDispatcherRow("sound", "소리 사용", soundEnabled, setSoundEnabled)}
```

- [ ] **Step 3: 지상 모드에서 목록 예시 버튼을 막는다**

예시는 판정을 우회하므로, 막지 않으면 알람이 없어야 할 화면에 알람이 뜬다. 소리 예시는 그대로 둔다 — 사용자가 직접 눌러 음량을 확인하는 동작이고, 지상에서 미리 맞춰 두는 것이 정상 사용이다.

`renderDispatcherRow`(390행)를 고친다.

```jsx
  function renderDispatcherRow(channel, text, checked, setChecked) {
    const inputId = `${rowIdBase}-${channel}`
    // 지상 모드에서는 판정이 멈춰 있다. 목록 예시는 판정을 우회하므로 함께 막는다.
    const blocked = channel === "popup" && isGroundMode
    return (
      <div className="alert-settings-row">
        <label htmlFor={inputId}>{text}</label>
        <span className="alert-settings-inline-actions">
          <button
            type="button"
            className="alert-settings-preview-btn"
            aria-label={`${text} 예시`}
            disabled={blocked}
            title={blocked ? "지상 모드에서는 알람이 동작하지 않습니다" : undefined}
            onClick={() => onPreviewAlert?.(channel, getPreviewDispatchers())}
          >
            예시
          </button>
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
        </span>
      </div>
    )
  }
```

`isGroundMode`를 컴포넌트 prop으로 받는다(97행의 서명에 추가).

```jsx
  isGroundMode = false,
```

그리고 `MonitoringPage`가 넘긴다(436행 `onPreviewAlert` 옆).

```jsx
        isGroundMode={mode === 'ground'}
```

- [ ] **Step 4: 예시용 설정 묶음에서 자막을 뺀다**

`getPreviewDispatchers`(415-433행)를 교체한다.

```jsx
  function getPreviewDispatchers() {
    return {
      popup: {
        enabled: popupEnabled,
        highlight_seconds: Number(highlightSeconds),
      },
      sound: {
        enabled: soundEnabled,
        volume: Number(volume),
        repeat_count: current.dispatchers.sound.repeat_count,
      },
    };
  }
```

`autoDismiss` 상태 변수의 이름을 `highlightSeconds`로 바꾸고, 화면 라벨을 **"새 알람 강조 시간(초)"** 로 고친다. 관련 위치를 먼저 확인한다.

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -n "autoDismiss\|머무는 시간\|marquee\|팝업 사용\|max_visible" frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx
```
나온 곳을 모두 새 이름·새 라벨로 고치고, 자막 관련 상태·입력을 지운다. 다 고친 뒤 같은 명령을 다시 돌려 `marquee`·`autoDismiss`·`머무는 시간`·`팝업 사용`이 **한 건도 남지 않아야 한다.**

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring
git commit -m "feat(monitoring): 설정창에서 자막·공항경보 항목을 걷어낸다

'팝업 사용'을 '알람 목록 표시'로, '머무는 시간'을 '새 알람 강조 시간'으로
바꾼다. 지상 모드에서는 목록 예시 버튼을 막는다 — 예시는 판정을 우회하므로
막지 않으면 알람이 없어야 할 화면에 알람이 뜬다."
```

---

## Task 11: 브라우저 계약을 교체하고 등록부를 고친다

시작 시점부터 깨져 있던 배지 계약을 새 계약으로 갈아끼운다.

**Files:**
- Modify: `frontend/verification/contracts/monitoring.spec.mjs:28-75`
- Modify: `docs/policies/verification/contracts.md:27`

**Interfaces:**
- Consumes: Task 5의 `.alert-table*` 클래스, Task 10의 설정 라벨
- Produces: 없음 (최종 검증)

- [ ] **Step 1: 자막 체크박스 계약을 고친다**

`monitoring.spec.mjs:34`의 목록에서 자막을 빼고 팝업 이름을 바꾼다.

```js
    for (const label of ['알람 목록 표시', '소리 사용']) {
```

- [ ] **Step 2: 배지 계약을 알람 표 계약으로 갈아끼운다**

`monitoring.spec.mjs:46-75`의 테스트 전체를 아래로 교체한다.

```js
  test('alert table sorts by severity and fills exactly one row', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // 강조 창을 짧게 두어 테스트가 기본값 60초를 기다리지 않게 한다.
    await page.addInitScript(() => {
      localStorage.setItem(
        'aviation-weather-alert-settings',
        JSON.stringify({ dispatchers: { popup: { highlight_seconds: 3 } } })
      )
    })
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    // 예시 3건이 표에 쌓인다.
    const rows = page.locator('.alert-table-row')
    await expect(rows).toHaveCount(3)

    // 색으로 채운 줄은 항상 1건뿐이다.
    await expect(page.locator('.alert-table-row--new')).toHaveCount(1)

    // 심각도순 정렬 — 위험이 맨 위다.
    await expect(rows.first()).toHaveClass(/alert-table-row--critical/)

    // 강조 창이 지나면 채운 줄이 가라앉되 목록에서 사라지지 않는다.
    await expect(page.locator('.alert-table-row--new')).toHaveCount(0, { timeout: 10000 })
    await expect(rows).toHaveCount(3)
  })

  test('alert table stays above the fullscreen slideshow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()
    await page.getByRole('button', { name: '알람 목록 표시 예시', exact: true }).click()
    await page.locator('.alert-popup-close').click()

    const tableZ = await page.locator('.alert-table').evaluate((el) => Number(getComputedStyle(el).zIndex))
    expect(tableZ).toBeGreaterThan(900)
  })

  test('ground mode disables the list preview button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await openMonitoringState(page, 'ops')
    await page.getByRole('tab', { name: '지상', exact: true }).click()
    await openMonitoringState(page, 'settings')
    await page.getByRole('button', { name: '알림', exact: true }).click()

    await expect(page.getByRole('button', { name: '알람 목록 표시 예시', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '소리 사용 예시', exact: true })).toBeEnabled()
  })

  test('mobile is redirected away from monitoring', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only test')

    await page.goto('/monitoring')
    await expect(page).toHaveURL(/\/$/)
  })
```

- [ ] **Step 3: 쓸모없어진 모바일 계약을 지운다**

`monitoring.spec.mjs:77-90`의 `mobile: opens monitoring and navigates task tabs` 테스트 전체를 지운다. 모바일은 더 이상 상황판에 들어갈 수 없으므로 그 안에서 탭을 오갈 수 없다. Step 2의 리디렉션 계약이 대신한다.

- [ ] **Step 4: 계약 전체를 돌린다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && CONTRACT_REUSE_SERVER=1 npx playwright test verification/contracts/monitoring.spec.mjs --retries=0 --reporter=line
```
Expected: **0 failed.** 시작 시점의 1 failed가 사라져야 한다. 실패가 남으면 멈추고 원인을 찾는다 — 이 시점에는 통과가 완료 조건이다.

- [ ] **Step 5: 단위 테스트 전체를 돌린다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/
```
Expected: PASS — 17 tests

- [ ] **Step 6: 계약 등록부를 사실대로 고친다**

`docs/policies/verification/contracts.md:27`의 `monitoring` 행을 고친다. 통과일을 실제 통과한 날짜로 바꾸고, 비고의 `mobile uses a different task UI`를 모바일 차단 사실로 정정한다.

```
| `monitoring` | `MonitoringPage.jsx` | desktop, iPad landscape | local monitoring data; mobile is redirected away from /monitoring | `frontend/verification/contracts/monitoring.spec.mjs` | frontend | active — passed 2026-07-28 |
```

날짜는 Step 4가 실제로 통과한 날로 적는다. 통과하지 않았으면 이 줄을 고치지 않는다.

- [ ] **Step 7: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/verification/contracts/monitoring.spec.mjs docs/policies/verification/contracts.md
git commit -m "test(monitoring): 알람 표 계약으로 갈아끼우고 등록부를 사실대로 고친다

배지로 접히는 동작을 검사하던 계약은 그 동작 자체가 사라져 이미 깨져 있었다.
정렬·채운 줄 1건·슬라이드쇼 위 표시·지상 모드 예시 차단·모바일 리디렉션을 검사한다."
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 절 | Task |
|---|---|
| §3 삭제 (공항경보·`position`·자막·자막 설정) | 1, 6, 10 |
| §3 모바일 차단 | 9 |
| §4 구조 (강조 대상 분배) | 8 |
| §5 강조 대상 전달 방식 | 2 |
| §6 요소 반짝임 (외곽선·0.8초·reduced-motion·60초·생략) | 7, 8 |
| §7 하단 알람 표 (위치·z-index·골격·정렬·6건·채운 줄 1건·자동 숨김 없음) | 5 |
| §8 지상 모드 판정 정지 | 8 |
| §9 평가 기준 리셋 (지상 복귀·방해금지 종료·공항 전환) | 3, 8 |
| §14 설정 (삭제·이름 변경·저장분 정리·예시 버튼) | 1, 4, 10 |
| §15 오류 처리 | 5, 7 (강조 생략), 2 (트리거 예외는 기존 유지) |
| §16 검증 | 2, 3, 4, 11 |
| §17 영향 파일 | 전체 |

빠진 것: **§15의 "컴포넌트 해제 시 반짝임 타이머 정리"** 는 Task 5의 `useEffect` 정리 함수와 Task 7의 지도 깜빡임(기존 낙뢰 구현 재사용)이 각각 맡는다. 별도 작업으로 두지 않았다.

**2. 미완성 표현** — "TBD"·"적절히"·"필요시" 없음. 코드 단계는 모두 실제 코드를 담았다.

세 곳은 **확인 명령을 먼저 돌리게** 했다. 값이 코드에 따라 달라 미리 못 박으면 틀리기 때문이다.
- Task 7 Step 3: `buildTafDisplaySlots`가 원본 `time`을 담는지
- Task 7 Step 4: 기존 낙뢰 깜빡임 구현 방식
- Task 8 Step 1 / Task 10 Step 4: 지상 모드 변수명, `autoDismiss` 사용처

이들은 "알아서 하라"가 아니라 **"이 명령을 돌려 나온 것을 이렇게 고쳐라"** 형태다.

**3. 타입 일관성**
- `highlight` 모양이 Task 2(생성) → Task 7(소비) → Task 8(분배)에서 일치한다
- `clearResolvedAlerts(firedKeys, icao)` 두 인자가 Task 3(정의)과 Task 8(호출)에서 일치한다
- `highlight_seconds`가 Task 1(기본값)·4(마이그레이션)·5(표)·8(강조 창)·10(설정)·11(계약)에서 같은 이름이다
- `.alert-table-row--new` 클래스가 Task 5(생성)와 Task 11(검사)에서 일치한다
- 예시 버튼 이름 `알람 목록 표시 예시`가 Task 10(생성)과 Task 11(검사)에서 일치한다

---

## Execution Handoff

계획 A 완료. 계획 B(TAF 변화 알람)는 이 계획을 끝낸 뒤 작성한다.
