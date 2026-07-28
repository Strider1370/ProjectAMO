# TAF 변화 알람 Implementation Plan (계획 B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TAF가 새로 발표돼 예보가 나빠졌을 때, 무엇이 어떻게 나빠졌는지를 하단 알람 표에 한 줄로 알린다.

**Architecture:** 서버(`taf-processor`)가 새 TAF를 받을 때 직전 TAF를 `previous` 칸에 보관해 함께 내려보낸다. 판정은 프런트에서 한다 — 임계값이 사용자별 개인 설정이기 때문이다. 새 트리거 2종은 알람 엔진이 넘기는 `previous` 인자를 쓰지 않고 **`current.previous`를 읽는다.** 판정 로직은 순수 함수 두 모듈(`taf-risk.js`·`taf-change.js`)로 떼어내 `node --test`로 직접 검증한다. 새 전역 상태도, 새 수명 관리 코드도 만들지 않는다.

**Tech Stack:** Node 22 (ESM, `node --test`), React 18 (JSX, hooks), 순수 JS 모듈, Playwright (브라우저 계약)

**Spec:** [docs/superpowers/specs/2026-07-27-monitoring-alert-redesign-design.md](../specs/2026-07-27-monitoring-alert-redesign-design.md) §10~§13, 그리고 §14의 "추가" 항목과 §16의 TAF 관련 검증 항목

**선행 계획:** 계획 A(표시 개편)는 완료됐다. 스펙 §0이 그 결과 상태를 정리한다. **§0을 먼저 읽는다.**

## Global Constraints

- Linux 전용. `git`/`npm`/`node`/`npx`는 Linux 셸에서만 실행한다. PowerShell·cmd.exe 금지.
- 한글이 포함된 파일은 `Edit`/`Write` 도구로만 수정한다. 셸 리다이렉션(`>`, `sed -i`, `cat <<EOF`)으로 덮어쓰지 않는다. 읽기용 `grep`/`sed -n`은 괜찮다. 근거: `docs/policies/encoding-safety.md`
- **단위 테스트 실행은 반드시 글로브 형식을 쓴다.** `node --test <디렉터리>`는 Node v22.23.1에서 테스트를 하나도 돌리지 않으면서 "1개 통과"를 보고한다(디렉터리를 모듈로 임포트하고 그 성공을 세기 때문). 근거: 스펙 §16의 경고 블록.
  - 프런트: `cd frontend && node --test src/features/monitoring/legacy/utils/alerts/*.test.js`
  - 백엔드: `cd backend && node --test test/<파일>.test.js`
- **새 임계값 설정을 만들지 않는다.** §12.1이 정한 대로 기존 트리거의 임계값을 그대로 읽는다. 설정창에 늘어나는 것은 켜기/끄기 2개뿐이다.
- **새 숫자를 만들지 않는다.** §12.3 규칙②의 경계(시정 500m·운고 200ft·거스트 50kt·TS)는 기존 트리거가 `warning`→`critical`로 올릴 때 이미 쓰는 값이다.
- 심각도 값은 `critical`·`warning`·`info` 셋뿐이다. 새 등급을 만들지 않는다.
- 강조 모양은 계획 A가 정한 `{ panel: 'taf', fields: string[], times: string[] }`를 그대로 쓴다.
- 기존 알람 6종의 판정 조건·임계값을 변경하지 않는다. 소리(`AlertSound`) 동작도 변경하지 않는다.
- 커밋 메시지는 한국어 본문, 영어 타입 접두사(`feat:`/`fix:`/`test:`/`refactor:`/`docs:`).
- **`git add -A` 금지.** 다른 세션이 같은 저장소에서 작업할 수 있다. 각 Task가 명시한 경로만 `git add` 한다. 커밋 전 `git status --porcelain`으로 스테이징을 확인한다. `.artifacts/`는 추적되지 않는 것이 정상이다.

## 시작 전 상태 (2026-07-28 측정됨)

계획 A 완료 시점:

```
프런트 단위 (glob):  21 tests, 21 pass, 0 fail
브라우저 계약 3프로젝트: 15 passed, 9 skipped, 0 failed
```

**이 숫자가 기준선이다.** 각 Task는 이 값이 유지되거나 늘어나는지 확인한다.

## 이미 확인된 사실 (다시 조사하지 않는다)

이 절의 내용은 계획 작성 시 실제 코드로 확인한 것이다.

**서버 쪽**

- `backend/src/processors/taf-processor.js`가 공항별로 `tafParser.parse(xml)` 결과를 `result.airports[icao]`에 넣고 `store.save("taf", result)`로 저장한다.
- 파서 결과 모양: `{ header, base, change_groups, timeline }`. `header`에 `issued`·`valid_start`·`valid_end`·`report_status`가 있다.
- `timeline`의 각 칸: `{ time, wind, visibility: { value, cavok }, weather: [], clouds: [], display }`.
- `store.getCached("taf")`가 **직전 폴링 결과 전체**(`{ type, fetched_at, airports }`)를 돌려준다(`store.js`의 `cache[type].prev_data`).
- `store.initFromFiles()`가 재시작 시 `latest.json`을 읽어 캐시를 채운다. `previous`를 `airports[icao]` 안에 넣어두면 저장·복원이 자동으로 된다 — 별도 처리가 필요 없다.
- 수신 실패 공항은 `store.mergeWithPrevious`가 직전 것을 `_stale: true`로 복사한다. 그 경우 `issued`가 같으므로 아래 판정에서 "같은 TAF 재수신" 갈래를 탄다.

**프런트 쪽**

- `alert-engine.js`의 `evaluate(currentData, previousData, settings)`가 `trigger.category`로 데이터를 골라 `trigger.evaluate(current, previous, params)`를 부른다. **`params`는 그 트리거 자신의 것뿐이다** — 다른 트리거의 임계값을 볼 방법이 지금은 없다. Task 5가 인자를 하나 더한다.
- `MonitoringPage.jsx`가 판정 직후 `evaluate(currentData, null, settings)`로 한 번 더 돌려 `validAlertKeys`를 만든다. 새 트리거는 `current.previous`를 읽으므로 **이 재평가에서도 그대로 발동한다** → 같은 TAF가 현재인 동안 줄이 유지된다. 새 TAF가 오면 `issued`가 바뀌어 알람 키가 바뀌고, 옛 키는 `validAlertKeys`에 없어 표에서 빠진다. **§10이 말한 "별도의 수명 관리 코드가 필요 없다"가 이 배선으로 성립한다. 수명 관리 코드를 만들지 마라.**
- `buildAlertKey(result, icao)`가 `triggerId`별로 갈라 키를 만든다. 기본 갈래는 `` `${triggerId}:${icao}` ``.
- `clearResolvedAlerts(firedKeys, icao)`가 `:ICAO` 또는 `:ICAO:상세` 모양을 잡아 해당 공항 이력만 지운다. `taf_change:RKSI:<issued>`는 두 번째 모양에 걸린다 — 호환된다.

**사용자 결정 (2026-07-28) — 스펙과 다른 두 가지**

1. **알람 줄의 수명은 "악화 시각이 모두 지날 때까지"다.** 스펙 §12.7은 "다음 TAF 도착까지"라고 적었지만, 판정이 `now` 이후만 보므로 나쁜 시간대가 전부 과거가 되면 줄이 먼저 빠진다. **이 동작을 유지한다** — 이미 지나간 예보를 벽걸이에 남겨두지 않는 쪽이 낫다. 스펙 문구는 이 계획이 끝난 뒤 §0의 "실행 중 확정된 동작"에 함께 적는다. **수명을 늘리는 코드를 만들지 마라.**
2. **정정 발표(`CORRECTION`)는 수정 발표(`AMD`)와 똑같이 취급한다.** 둘 다 예정에 없던 발표이고 예보관이 급히 값을 고쳤다는 신호다. Task 5의 `isAmendment`가 둘을 함께 잡는다.
- 알람 폴더의 기존 테스트 파일은 **4개**다(`alert-dispatcher` 2 + `alert-settings` 6 + `alert-state` 6 + `alert-triggers` 7 = 21건).
- **`alert-settings.js`의 `migratePersonalSettings`는 손대지 않는다.** 개인 설정은 기본값 **위에** 깊은 병합되므로, 새 트리거 2종은 저장분에 항목이 없어도 기본값의 `enabled: true`를 그대로 받는다. 지울 옛 키도 없다. 스펙 §0이 "함께 본다"고 한 것은 확인하라는 뜻이며, 확인 결과 변경이 필요 없다.
- `AlertPanel`이 심각도순으로 정렬하므로, AMD가 심각도 한 단계 위면 정규 발표보다 자동으로 위에 온다. **정렬 코드를 건드리지 마라.**

**픽스처 쪽 — Task 7이 다룬다**

`frontend/verification/monitoring-fixture.mjs`의 `/api/taf` mock은 계획 A가 최상위 키(`data:` → `airports:`)만 고쳤고, **안쪽 모양은 여전히 실제 파서와 다르다.** 지금은 이렇다:

```js
airports: {
  RKSI: {
    raw: '...', header: { icao: 'RKSI' },
    issuedAt: '...', validFrom: '...', validUntil: '...',
  },
},
```

`timeline`이 없고, `issuedAt`/`validFrom`/`validUntil`은 실제 파서에 없는 이름이다(실제는 `header.issued`·`header.valid_start`·`header.valid_end`). 그래서 `TafTimeline`이 브라우저 계약에서 실질적으로 비어 있다. **Task 7이 이것을 실제 모양으로 다시 만들지 않으면 §16의 TAF 계약 4개를 만들 수 없다.**

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `backend/src/processors/taf-previous.js` | **신규** — 직전 TAF 보관 판정. 순수 함수 | 1 |
| `backend/test/taf-previous.test.js` | **신규** — 보관 규칙 단위 테스트 | 1 |
| `backend/src/processors/taf-processor.js` | 위 함수를 저장 직전에 끼운다 | 2 |
| `frontend/.../utils/alerts/taf-risk.js` | **신규** — 시간칸 위험 판정(§12.1). 순수 함수 | 3 |
| `frontend/.../utils/alerts/taf-risk.test.js` | **신규** | 3 |
| `frontend/.../utils/alerts/taf-change.js` | **신규** — 비교 구간·악화 판정(§12.2·§12.3). 순수 함수 | 4 |
| `frontend/.../utils/alerts/taf-change.test.js` | **신규** | 4 |
| `frontend/.../utils/alerts/alert-triggers.js` | 트리거 2종 추가 | 5 |
| `frontend/.../utils/alerts/alert-engine.js` | `evaluate`에 트리거 설정 묶음 전달 | 5 |
| `frontend/.../utils/alerts/alert-state.js` | 새 트리거의 알람 키(`issued` 포함) | 5 |
| `frontend/.../utils/alerts/alert-triggers.test.js` | 트리거 2종 테스트 추가 | 5 |
| `shared/alert-defaults.js` | 새 트리거 2종 기본 설정 | 5 |
| `frontend/.../components/alerts/Settings.jsx` | 설정 항목 2개 | 6 |
| `frontend/verification/monitoring-fixture.mjs` | TAF mock을 실제 모양으로 재작성 + `previous` | 7 |
| `frontend/verification/contracts/monitoring.spec.mjs` | TAF 계약 4건 | 8 |
| `docs/policies/verification/contracts.md` | 통과일 갱신 | 8 |

`frontend/.../utils/alerts/` 는 `frontend/src/features/monitoring/legacy/utils/alerts/` 의 줄임이다.

---

## Task 1: 직전 TAF 보관 규칙을 순수 함수로 만든다

판정을 `taf-processor.js` 안에 직접 쓰면 파일 접근과 네트워크 없이 테스트할 수 없다. 순수 함수로 떼어낸다.

**Files:**
- Create: `backend/src/processors/taf-previous.js`
- Create: `backend/test/taf-previous.test.js`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces: `attachPrevious(nextAirports, cachedAirports)` — 두 인자 모두 `{ [icao]: parsedTaf }` 모양. `nextAirports`를 **제자리에서 변형하지 않고** 새 객체를 반환한다. 각 공항에 `previous` 키가 붙거나 안 붙는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `backend/test/taf-previous.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { attachPrevious } from '../src/processors/taf-previous.js'

const slot = (time, vis) => ({
  time,
  wind: { speed: 10 },
  visibility: { value: vis, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  display: { wind: '27010KT' },
})

const taf = (issued, vis, status = 'NORMAL') => ({
  header: {
    icao: 'RKSI',
    issued,
    valid_start: '2026-07-28T12:00:00Z',
    valid_end: '2026-07-29T18:00:00Z',
    report_status: status,
  },
  base: {},
  change_groups: [],
  timeline: [slot('2026-07-28T13:00:00Z', vis)],
})

test('캐시가 없으면 previous가 붙지 않는다 (최초 실행)', () => {
  const out = attachPrevious({ RKSI: taf('2026-07-28T12:00:00Z', 9999) }, null)
  assert.equal(out.RKSI.previous, undefined)
})

test('issued가 바뀌면 직전 것이 previous로 옮겨간다', () => {
  const cached = { RKSI: taf('2026-07-28T06:00:00Z', 9999) }
  const next = { RKSI: taf('2026-07-28T12:00:00Z', 1200) }
  const out = attachPrevious(next, cached)

  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T06:00:00Z')
  assert.equal(out.RKSI.previous.timeline.length, 1)
  assert.equal(out.RKSI.previous.timeline[0].visibility.value, 9999)
})

test('issued가 같으면 previous를 건드리지 않는다 — 같은 TAF 재수신', () => {
  const first = attachPrevious(
    { RKSI: taf('2026-07-28T12:00:00Z', 1200) },
    { RKSI: taf('2026-07-28T06:00:00Z', 9999) }
  )
  // 같은 issued로 한 번 더 받는다
  const second = attachPrevious({ RKSI: taf('2026-07-28T12:00:00Z', 1200) }, first)

  assert.equal(second.RKSI.previous.header.issued, '2026-07-28T06:00:00Z',
    '재수신에 previous가 덮이면 비교 기준이 사라진다')
})

test('previous.timeline에는 비교에 필요한 값만 담는다', () => {
  const out = attachPrevious(
    { RKSI: taf('2026-07-28T12:00:00Z', 1200) },
    { RKSI: taf('2026-07-28T06:00:00Z', 9999) }
  )
  const kept = out.RKSI.previous.timeline[0]
  assert.deepEqual(Object.keys(kept).sort(), ['clouds', 'time', 'visibility', 'weather', 'wind'])
  assert.equal(kept.display, undefined, 'display 문자열은 제외한다')
})

test('previous.header에는 네 값만 담는다', () => {
  const out = attachPrevious(
    { RKSI: taf('2026-07-28T12:00:00Z', 1200) },
    { RKSI: taf('2026-07-28T06:00:00Z', 9999) }
  )
  assert.deepEqual(
    Object.keys(out.RKSI.previous.header).sort(),
    ['issued', 'report_status', 'valid_end', 'valid_start']
  )
})

test('취소 통보는 취소 직전의 마지막 정상 TAF를 previous로 들고 간다', () => {
  // 정상 A(06시) → 정상 B(12시, previous=A) → 취소 C
  const cached = {
    RKSI: {
      ...taf('2026-07-28T12:00:00Z', 1200),
      previous: { header: { issued: '2026-07-28T06:00:00Z' }, timeline: [] },
    },
  }
  const next = { RKSI: taf('2026-07-28T14:00:00Z', 9999, 'CANCELLATION') }
  const out = attachPrevious(next, cached)

  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T12:00:00Z',
    '취소 직전의 마지막 정상 TAF(B)를 건너뛰면 다음 발표가 한 세대 낡은 것과 비교된다')
})

test('취소 다음의 정상 TAF는 취소 직전의 마지막 정상 TAF와 비교된다', () => {
  // 위 테스트가 만든 상태: 취소 문서가 previous=B를 들고 있다
  const cancelled = {
    RKSI: {
      ...taf('2026-07-28T14:00:00Z', 9999, 'CANCELLATION'),
      timeline: [],
      previous: { header: { issued: '2026-07-28T12:00:00Z' }, timeline: [] },
    },
  }
  const out = attachPrevious({ RKSI: taf('2026-07-28T18:00:00Z', 800) }, cancelled)

  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T12:00:00Z',
    '취소 통보 자체를 비교 기준으로 삼으면 안 되고, 그 직전 정상 TAF여야 한다')
})

test('취소가 연달아 와도 마지막 정상 TAF를 잃지 않는다', () => {
  const cancelled = {
    RKSI: {
      ...taf('2026-07-28T14:00:00Z', 9999, 'CANCELLATION'),
      timeline: [],
      previous: { header: { issued: '2026-07-28T12:00:00Z' }, timeline: [] },
    },
  }
  const out = attachPrevious({ RKSI: taf('2026-07-28T15:00:00Z', 9999, 'CANCELLATION') }, cancelled)
  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T12:00:00Z')
})

test('입력 객체를 제자리에서 변형하지 않는다', () => {
  const next = { RKSI: taf('2026-07-28T12:00:00Z', 1200) }
  attachPrevious(next, { RKSI: taf('2026-07-28T06:00:00Z', 9999) })
  assert.equal(next.RKSI.previous, undefined)
})

test('null·빈 입력에서 터지지 않는다', () => {
  assert.deepEqual(attachPrevious(null, null), {})
  assert.deepEqual(attachPrevious({}, {}), {})
})
```

- [ ] **Step 2: 실패를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/backend && node --test test/taf-previous.test.js
```
Expected: FAIL — `Cannot find module '.../taf-previous.js'`

- [ ] **Step 3: 함수를 만든다**

Create `backend/src/processors/taf-previous.js`:

```js
// 직전 TAF 보관 규칙 (스펙 §11·§15). 순수 함수 — 파일도 네트워크도 만지지 않는다.
//
// "같은 issued면 그대로 둔다"가 이 설계의 핵심이다. 이것이 빠지면 다음 폴링에서
// previous가 current로 덮여 비교 기준이 사라지고, 프런트가 겪던 문제가 서버로 옮겨간다.

const CANCELLATION = "CANCELLATION";

// previous.timeline에는 비교에 필요한 값만 담는다. 화면 표시용 문자열(display)과
// 원문은 제외한다 — 저장 파일과 전송량이 그만큼 줄어든다.
function trimTimeline(timeline) {
  return (timeline || []).map((slot) => ({
    time: slot.time,
    wind: slot.wind,
    visibility: slot.visibility,
    weather: slot.weather,
    clouds: slot.clouds,
  }));
}

function trimHeader(header) {
  return {
    issued: header?.issued ?? null,
    valid_start: header?.valid_start ?? null,
    valid_end: header?.valid_end ?? null,
    report_status: header?.report_status ?? null,
  };
}

function snapshot(taf) {
  return { header: trimHeader(taf.header), timeline: trimTimeline(taf.timeline) };
}

/**
 * 새로 받은 공항별 TAF에 previous를 붙여 돌려준다.
 * @param {object} nextAirports   - 이번 수신분 { [icao]: parsedTaf }
 * @param {object} cachedAirports - 직전 저장분 { [icao]: parsedTaf }
 * @returns {object} previous가 붙은 새 객체. 입력은 변형하지 않는다.
 */
export function attachPrevious(nextAirports, cachedAirports) {
  if (!nextAirports || typeof nextAirports !== "object") return {};

  const out = {};
  for (const [icao, next] of Object.entries(nextAirports)) {
    const cached = cachedAirports?.[icao];
    if (!cached) {
      // 최초 실행. previous가 없으며 두 트리거는 아무것도 발동하지 않는다. 오류가 아니다.
      out[icao] = next;
      continue;
    }

    const nextCancelled = next.header?.report_status === CANCELLATION;
    const cachedCancelled = cached.header?.report_status === CANCELLATION;

    let previous;
    if (nextCancelled) {
      // 취소 통보는 시간표가 비어 들어온다. 그것을 previous로 삼으면 다음 정상 TAF가
      // '빈 것'과 비교돼 모든 위험이 신규로 판정된다 — 가짜 악화 알람이다.
      // 다만 취소 직전의 마지막 정상 TAF는 반드시 보존해야 한다. 그것을 건너뛰면
      // 다음 정상 TAF가 한 세대 더 낡은 것과 비교된다(스펙 §15).
      previous = cachedCancelled ? cached.previous : snapshot(cached);
    } else if (cachedCancelled) {
      // 취소 문서가 들고 있던 "취소 직전의 마지막 정상 TAF"와 비교한다.
      previous = cached.previous;
    } else if (next.header?.issued !== cached.header?.issued) {
      previous = snapshot(cached);
    } else {
      previous = cached.previous;
    }

    out[icao] = previous ? { ...next, previous } : { ...next };
  }
  return out;
}

export default { attachPrevious };
```

- [ ] **Step 4: 통과를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/backend && node --test test/taf-previous.test.js
```
Expected: PASS — 10 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add backend/src/processors/taf-previous.js backend/test/taf-previous.test.js
git commit -m "feat(taf): 직전 TAF 보관 규칙을 순수 함수로 만든다

같은 issued로 재수신할 때 previous를 덮지 않는 것이 핵심이다. 덮으면
다음 폴링에서 비교 기준이 사라져 변화 알람이 영구히 발동하지 않는다.
취소 통보는 previous를 갱신하지 않아 다음 정상 TAF가 취소 이전의
마지막 정상 TAF와 비교되게 한다."
```

---

## Task 2: 보관 규칙을 프로세서에 끼운다

**Files:**
- Modify: `backend/src/processors/taf-processor.js`

**Interfaces:**
- Consumes: Task 1의 `attachPrevious(nextAirports, cachedAirports)`
- Produces: `/api/taf` 응답의 `airports[icao]`에 `previous`가 실린다. 모양은 `{ header: {issued, valid_start, valid_end, report_status}, timeline: [...] }`.

- [ ] **Step 1: 임포트를 더한다**

`taf-processor.js`의 임포트 묶음 끝에 한 줄 더한다.

```js
import { attachPrevious } from './taf-previous.js'
```

- [ ] **Step 2: 저장 직전에 끼운다**

`mergeWithPrevious` 호출과 `store.save` 사이에 넣는다. **순서가 중요하다** — 수신 실패 공항이 직전 것으로 채워진 뒤에 판정해야, 실패 공항이 "같은 issued 재수신" 갈래를 제대로 탄다.

`taf-processor.js`의 아래 부분을

```js
  if (failedAirports.length > 0) {
    store.mergeWithPrevious(result, "taf", failedAirports);
  }

  const saveResult = store.save("taf", result);
```

이렇게 바꾼다.

```js
  if (failedAirports.length > 0) {
    store.mergeWithPrevious(result, "taf", failedAirports);
  }

  // 직전 TAF를 previous 칸에 보관한다(스펙 §11). mergeWithPrevious 뒤에 두어야
  // 수신 실패로 직전 것이 채워진 공항이 "같은 issued 재수신" 갈래를 탄다.
  // previous는 result 안에 들어가므로 저장·재시작 복원이 자동으로 된다.
  result.airports = attachPrevious(result.airports, store.getCached("taf")?.airports);

  const saveResult = store.save("taf", result);
```

- [ ] **Step 3: 임포트가 해석되는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/backend && node -e "import('./src/processors/taf-processor.js').then(()=>console.log('OK')).catch(e=>console.log('FAIL', e.code, e.message))"
```
Expected: `OK`

- [ ] **Step 4: 재시작 복원 경로를 근거로 확인한다**

스펙 §16의 백엔드 검증 항목 "재시작 후 로드 → `previous` 복원"은 `attachPrevious`가 순수 함수라 단위 테스트로 덮이지 않는다. 대신 경로가 성립하는지 코드로 확인하고 보고서에 근거를 적는다.

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -n "initFromFiles\|loadLatest\|updateCache" backend/src/store.js | head
```
확인할 것: `initFromFiles`가 `latest.json`을 읽어 `updateCache`로 캐시에 그대로 넣는다. `previous`는 `result.airports[icao]` 안에 있으므로 저장 파일에 함께 들어가고 복원 시 그대로 돌아온다. **별도 코드가 필요 없다는 것이 결론이며, 그 근거를 보고서에 적는다.** 코드를 더하지 마라.

- [ ] **Step 5: 백엔드 테스트가 깨지지 않았는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/backend && node --test test/taf-previous.test.js test/taf-window.test.js
```
Expected: PASS — 두 파일 모두

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add backend/src/processors/taf-processor.js
git commit -m "feat(taf): 직전 TAF를 previous 칸에 실어 내려보낸다

mergeWithPrevious 뒤에 둔다 — 수신 실패로 직전 것이 채워진 공항이
'같은 TAF 재수신' 갈래를 타야 previous가 보존된다.
previous가 result 안에 들어가므로 저장과 재시작 복원은 자동으로 된다."
```

---

## Task 3: 시간칸 위험 판정을 만든다

§12.1의 네 요소를 한 곳에서 판정한다. 임계값은 **기존 트리거의 것을 그대로 읽는다** — 같은 "위험의 기준"이 관측용과 예보용으로 갈리면 사용자가 어느 쪽을 고쳐야 하는지 매번 판단해야 한다.

**Files:**
- Create: `frontend/src/features/monitoring/legacy/utils/alerts/taf-risk.js`
- Create: `frontend/src/features/monitoring/legacy/utils/alerts/taf-risk.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `collectThresholds(allTriggers)` — `settings.triggers` 묶음을 받아 `{ visThreshold, phenomena, ceilingThreshold, ceilingAmounts, windSpeed, windGust }`를 낸다.
  - `riskOf(slot, thresholds)` — 시간칸 하나를 받아 위험 요소만 담긴 객체를 낸다. 위험이 없으면 빈 객체 `{}`. 키는 `visibility`·`weather`·`ceiling`·`wind` 중 일부이며, 값은 각각 시정(m, 숫자)·기상 원문(문자열)·운저(ft, 숫자)·풍속 또는 거스트(kt, 숫자)다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `frontend/src/features/monitoring/legacy/utils/alerts/taf-risk.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collectThresholds, riskOf } from './taf-risk.js'

const TRIGGERS = {
  taf_adverse_weather: { enabled: true, params: { vis_threshold: 3000, phenomena: ['TS', 'FG'] } },
  low_ceiling: { enabled: true, params: { threshold: 500, amounts: ['BKN', 'OVC'] } },
  high_wind: { enabled: true, params: { speed_threshold: 25, gust_threshold: 35 } },
}
const T = collectThresholds(TRIGGERS)

const slot = (over) => ({
  time: '2026-07-28T13:00:00Z',
  wind: { speed: 10 },
  visibility: { value: 9999, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  ...over,
})

test('임계값을 기존 트리거에서 그대로 읽어온다', () => {
  assert.equal(T.visThreshold, 3000)
  assert.deepEqual(T.phenomena, ['TS', 'FG'])
  assert.equal(T.ceilingThreshold, 500)
  assert.deepEqual(T.ceilingAmounts, ['BKN', 'OVC'])
  assert.equal(T.windSpeed, 25)
  assert.equal(T.windGust, 35)
})

test('아무것도 나쁘지 않으면 빈 객체', () => {
  assert.deepEqual(riskOf(slot(), T), {})
})

test('시정이 임계값 미만이면 위험', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: 1200, cavok: false } }), T), { visibility: 1200 })
})

test('시정이 임계값과 같으면 위험이 아니다', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: 3000, cavok: false } }), T), {})
})

test('CAVOK은 위험이 아니다', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: null, cavok: true } }), T), {})
})

test('지정 기상현상이 있으면 위험', () => {
  const s = slot({ weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] })
  assert.deepEqual(riskOf(s, T), { weather: 'TSRA' })
})

test('지정하지 않은 기상현상은 위험이 아니다', () => {
  const s = slot({ weather: [{ raw: '-RA', descriptor: '', phenomena: ['RA'] }] })
  assert.deepEqual(riskOf(s, T), {})
})

test('일치하는 기상현상이 여럿이면 전부 담는다', () => {
  // 첫 하나만 남기면 [FG] → [FG, TSRA] 변화에서 TS 신규 등장을 놓친다.
  const s = slot({
    weather: [
      { raw: 'FG', descriptor: '', phenomena: ['FG'] },
      { raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] },
    ],
  })
  assert.match(riskOf(s, T).weather, /FG/)
  assert.match(riskOf(s, T).weather, /TS/)
})

test('BKN/OVC 중 최저 운저가 임계값 미만이면 위험', () => {
  const s = slot({ clouds: [{ amount: 'BKN', base: 800 }, { amount: 'OVC', base: 300 }] })
  assert.deepEqual(riskOf(s, T), { ceiling: 300 })
})

test('FEW/SCT는 운고 판정에서 세지 않는다', () => {
  const s = slot({ clouds: [{ amount: 'FEW', base: 100 }, { amount: 'SCT', base: 200 }] })
  assert.deepEqual(riskOf(s, T), {})
})

test('NSC(구름 없음)는 위험이 아니다', () => {
  assert.deepEqual(riskOf(slot({ clouds: [] }), T), {})
})

test('풍속이 임계값 이상이면 위험', () => {
  assert.deepEqual(riskOf(slot({ wind: { speed: 30 } }), T), { wind: 30 })
})

test('거스트가 임계값 이상이면 위험이고 거스트 값을 쓴다', () => {
  assert.deepEqual(riskOf(slot({ wind: { speed: 12, gust: 40 } }), T), { wind: 40 })
})

test('값이 비어 있는 칸은 판정에서 제외한다 — 0으로 읽지 않는다', () => {
  const s = slot({ visibility: { value: null, cavok: false }, wind: {}, clouds: null })
  assert.deepEqual(riskOf(s, T), {})
})

test('여러 요소가 동시에 나쁘면 모두 담는다', () => {
  const s = slot({
    visibility: { value: 800, cavok: false },
    wind: { speed: 12, gust: 40 },
    clouds: [{ amount: 'OVC', base: 200 }],
    weather: [{ raw: 'FG', descriptor: '', phenomena: ['FG'] }],
  })
  assert.deepEqual(riskOf(s, T), { visibility: 800, weather: 'FG', ceiling: 200, wind: 40 })
})

test('설정이 비어도 터지지 않는다', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: 100, cavok: false } }), collectThresholds({})), {})
})
```

- [ ] **Step 2: 실패를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/taf-risk.test.js
```
Expected: FAIL — `Cannot find module './taf-risk.js'`

- [ ] **Step 3: 판정 모듈을 만든다**

Create `frontend/src/features/monitoring/legacy/utils/alerts/taf-risk.js`:

```js
// TAF 시간칸의 위험 판정 (스펙 §12.1). 순수 함수.
//
// 임계값을 새로 만들지 않고 기존 트리거의 것을 그대로 읽는다. 같은 "위험의 기준"이
// 관측용과 예보용으로 갈리면 사용자가 어느 쪽을 고쳐야 하는지 매번 판단해야 한다.
// 부작용으로 METAR 계열 임계값을 조정하면 TAF 변화 판정도 함께 움직인다. 의도된 결합이다.

/**
 * settings.triggers 묶음에서 필요한 임계값만 뽑는다.
 * 해당 트리거가 없거나 꺼져 있어도 임계값 자체는 읽는다 — 켜기/끄기는 그 트리거의
 * 발동 여부일 뿐, "무엇을 위험으로 볼 것인가"의 기준은 그대로다.
 */
export function collectThresholds(allTriggers) {
  const taf = allTriggers?.taf_adverse_weather?.params ?? {};
  const ceiling = allTriggers?.low_ceiling?.params ?? {};
  const wind = allTriggers?.high_wind?.params ?? {};
  return {
    visThreshold: taf.vis_threshold ?? null,
    phenomena: taf.phenomena ?? [],
    ceilingThreshold: ceiling.threshold ?? null,
    ceilingAmounts: ceiling.amounts ?? [],
    windSpeed: wind.speed_threshold ?? null,
    windGust: wind.gust_threshold ?? null,
  };
}

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * 시간칸 하나의 위험 요소를 낸다. 위험이 없으면 빈 객체.
 * 값이 비어 있는 요소는 판정에서 제외한다 — 없는 값을 0으로 읽지 않는다(스펙 §15).
 */
export function riskOf(slot, thresholds) {
  const risk = {};
  if (!slot || !thresholds) return risk;

  // 시정 — CAVOK은 위험이 아니다.
  const vis = num(slot.visibility?.value);
  if (!slot.visibility?.cavok && vis !== null && thresholds.visThreshold !== null
      && vis < thresholds.visThreshold) {
    risk.visibility = vis;
  }

  // 특이기상 — 기존 트리거와 같은 방식으로 descriptor+phenomena를 이어 붙여 본다.
  // 일치하는 것을 **전부** 잇는다. 첫 하나만 남기면 이전 칸이 [FG], 새 칸이 [FG, TSRA]일 때
  // 양쪽 다 "FG"가 되어 TS 신규 등장이 §12.3 규칙②에 걸리지 않는다.
  const hits = (slot.weather ?? []).filter((wx) => {
    const combo = (wx?.descriptor ?? "") + (wx?.phenomena ?? []).join("");
    return thresholds.phenomena.some((p) => combo.includes(p));
  });
  if (hits.length > 0) risk.weather = hits.map((wx) => wx.raw).join(" ");

  // 운고 — BKN/OVC 중 **최저** 운저(스펙 §12.1). 기존 low_ceiling 트리거는 배열의
  // 첫 일치를 쓰는데, 여기서는 스펙이 최저를 명시하므로 다르다. 의도된 차이다.
  // NSC는 clouds가 비어 들어오므로 자연히 제외된다.
  if (Array.isArray(slot.clouds) && thresholds.ceilingThreshold !== null) {
    const bases = slot.clouds
      .filter((c) => thresholds.ceilingAmounts.includes(c?.amount))
      .map((c) => num(c?.base))
      .filter((b) => b !== null);
    if (bases.length > 0) {
      const lowest = Math.min(...bases);
      if (lowest < thresholds.ceilingThreshold) risk.ceiling = lowest;
    }
  }

  // 바람 — 풍속 또는 거스트. 둘 다 걸리면 더 큰 값(거스트)을 담는다.
  const speed = num(slot.wind?.speed);
  const gust = num(slot.wind?.gust);
  const speedHit = speed !== null && thresholds.windSpeed !== null && speed >= thresholds.windSpeed;
  const gustHit = gust !== null && thresholds.windGust !== null && gust >= thresholds.windGust;
  if (speedHit || gustHit) risk.wind = gustHit ? gust : speed;

  return risk;
}

export default { collectThresholds, riskOf };
```

- [ ] **Step 4: 통과를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/taf-risk.test.js
```
Expected: PASS — 16 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/utils/alerts/taf-risk.js frontend/src/features/monitoring/legacy/utils/alerts/taf-risk.test.js
git commit -m "feat(monitoring): TAF 시간칸의 위험 판정을 순수 함수로 만든다

임계값을 새로 만들지 않고 기존 트리거의 것을 그대로 읽는다. 같은 위험의
기준이 관측용과 예보용으로 갈리면 사용자가 어느 쪽을 고쳐야 하는지
매번 판단해야 한다."
```

---

## Task 4: 비교 구간과 악화 판정을 만든다

§12.2·§12.3. "구간이 새로 생김"과 "구간이 길어짐"은 계산상 같은 조건이므로 규칙 ①로 합쳤다 — 구간이 길어지려면 반드시 이전에 위험하지 않던 시각이 위험해져야 한다.

**Files:**
- Create: `frontend/src/features/monitoring/legacy/utils/alerts/taf-change.js`
- Create: `frontend/src/features/monitoring/legacy/utils/alerts/taf-change.test.js`

**Interfaces:**
- Consumes: Task 3의 `riskOf(slot, thresholds)`
- Produces:
  - `findWorsening(previous, current, thresholds, now)` — `previous`/`current`는 각각 `{ header, timeline }`. 겹치는 구간에서 악화한 항목 배열을 낸다. 항목은 `{ time, field, from, to, rule }`이며 `field`는 `visibility`·`weather`·`ceiling`·`wind`, `rule`은 `"new"`(규칙①) 또는 `"worse"`(규칙②)다. 악화가 없으면 빈 배열.
  - `findTailRisk(previous, current, thresholds, now)` — 이전 TAF의 `valid_end` 이후이면서 새 TAF 유효기간 안인 꼬리 구간의 위험 항목 배열. 항목은 `{ time, field, value }`. 없으면 빈 배열.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `frontend/src/features/monitoring/legacy/utils/alerts/taf-change.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collectThresholds } from './taf-risk.js'
import { findWorsening, findTailRisk } from './taf-change.js'

const T = collectThresholds({
  taf_adverse_weather: { params: { vis_threshold: 3000, phenomena: ['TS', 'FG'] } },
  low_ceiling: { params: { threshold: 500, amounts: ['BKN', 'OVC'] } },
  high_wind: { params: { speed_threshold: 25, gust_threshold: 35 } },
})

const NOW = new Date('2026-07-28T12:00:00Z')

const slot = (hour, over = {}) => ({
  time: `2026-07-28T${String(hour).padStart(2, '0')}:00:00Z`,
  wind: { speed: 10 },
  visibility: { value: 9999, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  ...over,
})

const taf = (issued, start, end, timeline, status = 'NORMAL') => ({
  header: { issued, valid_start: start, valid_end: end, report_status: status },
  timeline,
})

const DAY = '2026-07-28'
const at = (h) => `${DAY}T${String(h).padStart(2, '0')}:00:00Z`

test('안 위험하던 시각이 위험해지면 악화다 (규칙 ①)', () => {
  const prev = taf('a', at(6), at(20), [slot(14)])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 1500, cavok: false } })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'visibility')
  assert.equal(out[0].rule, 'new')
  assert.equal(out[0].to, 1500)
  assert.equal(out[0].time, at(14))
})

test('위험하던 시각이 500m 미만으로 내려가면 악화다 (규칙 ②)', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { visibility: { value: 1500, cavok: false } })])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 400, cavok: false } })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].rule, 'worse')
  assert.equal(out[0].from, 1500)
  assert.equal(out[0].to, 400)
})

test('위험하지만 경계를 새로 넘지 않으면 악화가 아니다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { visibility: { value: 2500, cavok: false } })])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 1500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [],
    '값이 조금 나빠진 것까지 잡으면 소음이 된다')
})

test('운고가 200ft 미만으로 내려가면 악화다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { clouds: [{ amount: 'OVC', base: 400 }] })])
  const next = taf('b', at(12), at(20), [slot(14, { clouds: [{ amount: 'OVC', base: 100 }] })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'ceiling')
  assert.equal(out[0].rule, 'worse')
})

test('거스트가 50kt 이상으로 올라가면 악화다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { wind: { speed: 12, gust: 40 } })])
  const next = taf('b', at(12), at(20), [slot(14, { wind: { speed: 12, gust: 55 } })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'wind')
  assert.equal(out[0].rule, 'worse')
})

test('TS가 새로 등장하면 악화다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { weather: [{ raw: 'FG', descriptor: '', phenomena: ['FG'] }] })])
  const next = taf('b', at(12), at(20), [slot(14, { weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] })])

  const out = findWorsening(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].field, 'weather')
  assert.equal(out[0].rule, 'worse')
})

test('위험이 줄어들면 발동하지 않는다', () => {
  const prev = taf('a', at(6), at(20), [slot(14, { visibility: { value: 800, cavok: false } })])
  const next = taf('b', at(12), at(20), [slot(14)])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('현재 시각 이전은 보지 않는다', () => {
  const prev = taf('a', at(6), at(20), [slot(9)])
  const next = taf('b', at(6), at(20), [slot(9, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [],
    '이미 지난 시각의 예보 변화는 알릴 것이 없다')
})

test('유효기간이 겹치지 않으면 악화 판정을 생략한다', () => {
  const prev = taf('a', at(6), at(11), [slot(9)])
  const next = taf('b', at(13), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('시정·운고·바람이 동시에 악화하면 항목이 셋이다', () => {
  const prev = taf('a', at(6), at(20), [slot(14)])
  const next = taf('b', at(12), at(20), [slot(14, {
    visibility: { value: 1500, cavok: false },
    clouds: [{ amount: 'OVC', base: 300 }],
    wind: { speed: 30 },
  })])

  const out = findWorsening(prev, next, T, NOW)
  assert.deepEqual(out.map((a) => a.field).sort(), ['ceiling', 'visibility', 'wind'])
})

test('previous가 없으면 빈 배열', () => {
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])
  assert.deepEqual(findWorsening(null, next, T, NOW), [])
})

test('이전 시간표에 없는 시각은 악화로 세지 않는다', () => {
  // 짝이 없으면 비교할 수 없다. 신규로 단정하면 격자가 어긋난 발표에서
  // 시간표 전체가 가짜 악화가 된다.
  const prev = taf('a', at(6), at(20), [slot(15)])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('이전 TAF의 valid_end 시각 칸은 악화로 세지 않는다', () => {
  // 파서의 hourRange가 `cursor < end`라 이전 TAF에는 valid_end 칸이 없다.
  // 겹침 끝을 포함으로 두면 정규 발표마다 가짜 악화가 1건씩 난다.
  const prev = taf('a', at(6), at(18), [slot(14), slot(17)])
  const next = taf('b', at(12), at(23), [slot(14), slot(17), slot(18, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findWorsening(prev, next, T, NOW), [])
})

test('꼬리 구간과 악화 구간이 같은 칸을 두 번 세지 않는다', () => {
  const prev = taf('a', at(6), at(18), [slot(14)])
  const next = taf('b', at(12), at(23), [slot(14), slot(18, { visibility: { value: 500, cavok: false } })])

  const worsened = findWorsening(prev, next, T, NOW)
  const tail = findTailRisk(prev, next, T, NOW)
  const overlap = worsened.filter((w) => tail.some((r) => r.time === w.time))
  assert.deepEqual(overlap, [], '한 칸이 두 알람에 동시에 실리면 안 된다')
})

test('꼬리 구간에 위험이 있으면 잡는다', () => {
  const prev = taf('a', at(6), at(18), [slot(14)])
  const next = taf('b', at(12), at(23), [slot(14), slot(21, { visibility: { value: 1000, cavok: false } })])

  const out = findTailRisk(prev, next, T, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].time, at(21))
  assert.equal(out[0].field, 'visibility')
})

test('꼬리 구간이 없으면 빈 배열', () => {
  const prev = taf('a', at(6), at(23), [slot(14)])
  const next = taf('b', at(12), at(20), [slot(14, { visibility: { value: 500, cavok: false } })])

  assert.deepEqual(findTailRisk(prev, next, T, NOW), [])
})

test('꼬리 구간이 있어도 위험이 없으면 빈 배열', () => {
  const prev = taf('a', at(6), at(18), [slot(14)])
  const next = taf('b', at(12), at(23), [slot(14), slot(21)])

  assert.deepEqual(findTailRisk(prev, next, T, NOW), [])
})
```

- [ ] **Step 2: 실패를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/taf-change.test.js
```
Expected: FAIL — `Cannot find module './taf-change.js'`

- [ ] **Step 3: 판정 모듈을 만든다**

Create `frontend/src/features/monitoring/legacy/utils/alerts/taf-change.js`:

```js
// TAF 악화 판정 (스펙 §12.2·§12.3, §13). 순수 함수 — 상태 없음, 이전→현재 전이만 본다.
//
// backend/src/alerts/diff.js가 경로 알림 계통에서 같은 모양의 판정을 하지만 코드를
// 공유하지 않는다. diff.js는 한 시점의 공항 상태를 다루고 여기는 시간표 전체를 다룬다.
// 억지로 합치면 양쪽 모두 나빠진다. 대신 원칙을 맞춘다.

import { riskOf } from "./taf-risk.js";

// 규칙 ②의 경계. 기존 트리거가 severity를 warning에서 critical로 올릴 때 쓰는 값과 같다.
// 새 숫자를 만들지 않았다.
const HARD_VIS_M = 500;
const HARD_CEILING_FT = 200;
const HARD_GUST_KT = 50;

const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const byTime = (timeline) => {
  const map = new Map();
  for (const slot of timeline ?? []) {
    if (slot?.time) map.set(slot.time, slot);
  }
  return map;
};

/**
 * 두 TAF의 유효기간이 겹치는 구간, 그중 현재 시각 이후.
 * 겹치는 구간이 없으면 null.
 */
function overlapWindow(previous, current, now) {
  const prevStart = ms(previous?.header?.valid_start);
  const prevEnd = ms(previous?.header?.valid_end);
  const nextStart = ms(current?.header?.valid_start);
  const nextEnd = ms(current?.header?.valid_end);
  if (prevStart === null || prevEnd === null || nextStart === null || nextEnd === null) return null;

  const start = Math.max(prevStart, nextStart, now.getTime());
  const end = Math.min(prevEnd, nextEnd);
  // end는 배타다. 파서의 hourRange가 `cursor < end`라 이전 TAF에는 valid_end 시각의
  // 칸이 존재하지 않는다(taf-parser.js의 hourRange). 포함으로 두면 정규 TAF 한 쌍마다
  // 그 시각이 짝 없는 칸이 되어 가짜 "신규 위험"이 뜬다.
  return start < end ? { start, end } : null;
}

// 규칙 ②: 원래 위험하던 요소가 아래 경계를 새로 넘었는가.
// 값이 조금 나빠진 것까지 잡으면 소음이 된다.
function crossedHardLine(field, from, to) {
  if (field === "visibility") return from >= HARD_VIS_M && to < HARD_VIS_M;
  if (field === "ceiling") return from >= HARD_CEILING_FT && to < HARD_CEILING_FT;
  if (field === "wind") return from < HARD_GUST_KT && to >= HARD_GUST_KT;
  // 특이기상은 값이 아니라 종류다. TS가 없다가 생긴 경우만 본다.
  if (field === "weather") return !String(from).includes("TS") && String(to).includes("TS");
  return false;
}

/**
 * 겹치는 구간에서 악화한 항목을 낸다.
 * @returns {Array<{time, field, from, to, rule}>} rule은 "new"(규칙①) 또는 "worse"(규칙②)
 */
export function findWorsening(previous, current, thresholds, now = new Date()) {
  const window = overlapWindow(previous, current, now);
  if (!window) return [];

  const prevSlots = byTime(previous.timeline);
  const out = [];

  for (const slot of current.timeline ?? []) {
    const t = ms(slot?.time);
    if (t === null || t < window.start || t >= window.end) continue;

    // 짝이 되는 이전 칸이 없으면 비교할 수 없다. "신규 위험"으로 단정하지 않는다 —
    // 시간표 격자가 어긋나면(AMD처럼 valid_start가 정시가 아닌 발표) 겹침 구간 전체가
    // 짝을 잃어 시간표가 통째로 가짜 악화로 잡힌다.
    const prevSlot = prevSlots.get(slot.time);
    if (!prevSlot) continue;

    const nextRisk = riskOf(slot, thresholds);
    const prevRisk = riskOf(prevSlot, thresholds);

    for (const [field, to] of Object.entries(nextRisk)) {
      const from = prevRisk[field];
      if (from === undefined) {
        out.push({ time: slot.time, field, from: null, to, rule: "new" });
      } else if (crossedHardLine(field, from, to)) {
        out.push({ time: slot.time, field, from, to, rule: "worse" });
      }
    }
  }
  return out;
}

/**
 * 이전 TAF의 valid_end 이후이면서 새 TAF 유효기간 안인 꼬리 구간의 위험.
 * 비교 대상이 없으므로 "늘었다"고 말하지 않는다 — "새 구간에 위험이 있다"이다.
 * @returns {Array<{time, field, value}>}
 */
export function findTailRisk(previous, current, thresholds, now = new Date()) {
  const prevEnd = ms(previous?.header?.valid_end);
  const nextEnd = ms(current?.header?.valid_end);
  if (prevEnd === null || nextEnd === null || prevEnd >= nextEnd) return [];

  const start = Math.max(prevEnd, now.getTime());
  const out = [];

  for (const slot of current.timeline ?? []) {
    const t = ms(slot?.time);
    if (t === null || t < start || t > nextEnd) continue;

    for (const [field, value] of Object.entries(riskOf(slot, thresholds))) {
      out.push({ time: slot.time, field, value });
    }
  }
  return out;
}

export default { findWorsening, findTailRisk };
```

- [ ] **Step 4: 통과를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/taf-change.test.js
```
Expected: PASS — 18 tests

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/utils/alerts/taf-change.js frontend/src/features/monitoring/legacy/utils/alerts/taf-change.test.js
git commit -m "feat(monitoring): TAF 악화 판정을 순수 함수로 만든다

두 가지만 본다 — 안 위험하던 시각이 위험해졌거나, 원래 위험하던 것이
정해진 경계를 새로 넘었거나. 값이 조금 나빠진 것까지 잡으면 소음이 된다.
경계는 기존 트리거가 심각도를 올릴 때 쓰는 값을 그대로 쓴다."
```

---

## Task 5: 트리거 2종을 만들고 엔진에 임계값 묶음을 넘긴다

§12.6·§12.7·§13. 두 트리거는 알람 엔진이 넘기는 `previous` 인자를 쓰지 않고 **`current.previous`를 읽는다.**

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-engine.js`
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js`
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-state.js`
- Modify: `frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js`
- Modify: `shared/alert-defaults.js`

**Interfaces:**
- Consumes: Task 3의 `collectThresholds`·Task 4의 `findWorsening`/`findTailRisk`
- Produces: 트리거 배열 길이가 6에서 **8**이 된다. `trigger.evaluate(current, previous, params, allTriggers)` — 네 번째 인자가 추가된다(기존 6종은 무시한다). 알람 키는 `taf_change:<ICAO>:<issued>` · `taf_new_period:<ICAO>:<issued>`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`alert-triggers.test.js` **끝에** 아래를 덧붙인다. 파일 앞부분(기존 7건)은 손대지 않는다.

```js
// ── TAF 변화 알람 (계획 B) ─────────────────────────────────────────────

const ALL_TRIGGERS = {
  taf_adverse_weather: { params: { vis_threshold: 3000, phenomena: ['TS', 'FG'] } },
  low_ceiling: { params: { threshold: 500, amounts: ['BKN', 'OVC'] } },
  high_wind: { params: { speed_threshold: 25, gust_threshold: 35 } },
}

const future = (hours) => new Date(Date.now() + hours * 3600000).toISOString()

const tafSlot = (time, over = {}) => ({
  time,
  wind: { speed: 10 },
  visibility: { value: 9999, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  ...over,
})

const tafDoc = ({ issued, end, timeline, status = 'NORMAL', previous = undefined }) => ({
  header: {
    issued,
    valid_start: new Date(Date.now() - 3600000).toISOString(),
    valid_end: end,
    report_status: status,
  },
  timeline,
  previous,
})

test('taf_change: previous가 없으면 발동하지 않는다', () => {
  const doc = tafDoc({ issued: 'i2', end: future(12), timeline: [tafSlot(future(2), { visibility: { value: 500, cavok: false } })] })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('taf_change: 안 위험하던 시각이 위험해지면 한 줄 낸다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)

  assert.equal(result.triggerId, 'taf_change')
  assert.equal(result.severity, 'warning')
  assert.equal(result.highlight.panel, 'taf')
  assert.deepEqual(result.highlight.times, [t])
})

test('taf_change: 여러 요소가 동시에 악화해도 한 건이다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false }, clouds: [{ amount: 'OVC', base: 300 }], wind: { speed: 30 } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)

  assert.equal(typeof result.title, 'string')
  assert.equal(result.data.length, 3, '세 요소가 본문에 나열되지만 알람은 한 건이다')
  assert.deepEqual(result.highlight.fields.sort(), ['ceiling', 'visibility', 'wind'])
})

test('taf_change: TS가 새로 생기면 critical이다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t, { weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS).severity, 'critical')
})

test('taf_change: AMD + 악화면 심각도가 한 단계 오른다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'AMENDMENT',
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)
  assert.equal(result.severity, 'critical')
  assert.match(result.title, /AMD/)
})

test('taf_change: 정정(CORRECTION)도 AMD와 같이 취급한다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'CORRECTION',
    timeline: [tafSlot(t, { visibility: { value: 1500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS).severity, 'critical')
})

test('taf_change: AMD인데 악화가 없으면 info 통지를 낸다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'AMENDMENT',
    timeline: [tafSlot(t)],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  const result = byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS)
  assert.equal(result.severity, 'info')
  assert.deepEqual(result.highlight.times, [], '강조할 대상이 없다')
})

test('taf_change: 정규 발표인데 악화가 없으면 발동하지 않는다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(t)],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t)] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('taf_change: 취소 통보면 발동하지 않는다', () => {
  const t = future(2)
  const doc = tafDoc({
    issued: 'i2', end: future(12), status: 'CANCELLATION', timeline: [],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [tafSlot(t, { visibility: { value: 500, cavok: false } })] },
  })
  assert.equal(byId('taf_change').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('taf_new_period: 꼬리 구간에 위험이 있으면 info로 낸다', () => {
  const tail = future(14)
  const doc = tafDoc({
    issued: 'i2', end: future(20),
    timeline: [tafSlot(tail, { visibility: { value: 1000, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [] },
  })
  const result = byId('taf_new_period').evaluate(doc, null, {}, ALL_TRIGGERS)

  assert.equal(result.triggerId, 'taf_new_period')
  assert.equal(result.severity, 'info')
  assert.deepEqual(result.highlight.times, [tail])
})

test('taf_new_period: 꼬리 구간이 없으면 발동하지 않는다', () => {
  const doc = tafDoc({
    issued: 'i2', end: future(12),
    timeline: [tafSlot(future(2), { visibility: { value: 500, cavok: false } })],
    previous: { header: { issued: 'i1', valid_start: new Date(Date.now() - 7200000).toISOString(), valid_end: future(12), report_status: 'NORMAL' }, timeline: [] },
  })
  assert.equal(byId('taf_new_period').evaluate(doc, null, {}, ALL_TRIGGERS), null)
})

test('트리거는 이제 8종이다', () => {
  assert.equal(triggers.length, 8)
  assert.ok(byId('taf_change'))
  assert.ok(byId('taf_new_period'))
})
```

`alert-triggers.test.js` 맨 위의 첫 테스트 `'트리거는 6종이고 공항경보는 없다'`는 이제 틀리다. 그 테스트의 `assert.equal(triggers.length, 6)`을 `8`로 고친다. 제목도 `'트리거는 8종이고 공항경보는 없다'`로 바꾼다.

- [ ] **Step 2: 실패를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js
```
Expected: FAIL — `byId('taf_change')`가 `undefined`라 `.evaluate`에서 TypeError

- [ ] **Step 3: 엔진이 임계값 묶음을 넘기게 한다**

`alert-engine.js`의 `trigger.evaluate` 호출 한 줄을 고친다.

```js
      const result = trigger.evaluate(current, previous, triggerSettings.params, settings.triggers);
```

그리고 JSDoc의 `@returns` 위에 한 줄 더한다.

```js
 * 네 번째 인자로 전체 트리거 설정을 넘긴다. TAF 변화 알람이 다른 트리거의 임계값을
 * 그대로 읽어 쓰기 때문이다(스펙 §12.1). 기존 6종은 이 인자를 쓰지 않는다.
```

- [ ] **Step 4: 트리거 2종을 만든다**

`alert-triggers.js` 맨 위 임포트에 두 줄 더한다.

```js
import { collectThresholds } from "./taf-risk.js";
import { findWorsening, findTailRisk } from "./taf-change.js";
```

그리고 `lightningDetected` 정의 **뒤**, 배열 정의 **앞**에 아래를 넣는다.

```js
const FIELD_LABEL = {
  visibility: "시정",
  weather: "특이기상",
  ceiling: "운고",
  wind: "바람",
};

const RANK = { info: 0, warning: 1, critical: 2 };
const BY_RANK = ["info", "warning", "critical"];
const bump = (severity) => BY_RANK[Math.min(RANK[severity] + 1, 2)];

// 정정(CORRECTION)도 수정(AMENDMENT)과 같이 본다 — 사용자 결정(2026-07-28).
// 둘 다 "예정에 없던 발표"이고 예보관이 급히 값을 고쳤다는 신호이므로 무게를 같이 둔다.
// 스펙 §12.6은 AMD만 적었으나 실제 파서가 CORRECTION을 내보낸다.
const isAmendment = (status) => typeof status === "string" && /AMD|AMEND|COR/i.test(status);
const isCancellation = (status) => status === "CANCELLATION";

function describe(item) {
  const label = FIELD_LABEL[item.field] ?? item.field;
  const when = formatUtc(item.time);
  if (item.field === "weather") return `${label}  ${when} ${item.to ?? item.value}`;
  const unit = item.field === "ceiling" ? "ft" : item.field === "wind" ? "kt" : "m";
  if (item.rule === "new") return `${label}  ${when} 새로 위험 (${item.to}${unit})`;
  if (item.rule === "worse") return `${label}  ${when} ${item.from}${unit} → ${item.to}${unit}`;
  return `${label}  ${when} ${item.value}${unit}`;
}

// T-09: TAF 변화 — 새 발표가 겹치는 구간을 나쁘게 바꿨는가.
// 알람 엔진이 넘기는 previous 인자를 쓰지 않고 current.previous를 읽는다. 그래야
// 유효성 재확인으로 previous 인자가 비는 경우에도 판정이 성립하고, 알람이 다음 TAF가
// 올 때까지 살아 있다가 새 TAF가 오면 교체된다. 별도의 수명 관리 코드가 필요 없다.
const tafChange = {
  id: "taf_change",
  name: "TAF 변화 알림",
  category: "taf",
  severity: "warning",
  evaluate(current, _previous, _params, allTriggers) {
    const previous = current?.previous;
    if (!previous) return null;
    if (isCancellation(current.header?.report_status)) return null;

    const thresholds = collectThresholds(allTriggers);
    const worsened = findWorsening(previous, current, thresholds, new Date());
    const amd = isAmendment(current.header?.report_status);

    if (worsened.length === 0) {
      // 악화 없음 + 정규 발표 → 알릴 것이 없다.
      if (!amd) return null;
      // 악화 없음 + AMD → 발표가 있었다는 사실만 알린다.
      return {
        triggerId: "taf_change",
        severity: "info",
        title: "TAF AMD 발표됨",
        message: `${formatUtc(current.header?.issued)} AMD — 위험 증가 없음`,
        data: [],
        highlight: { panel: "taf", fields: [], times: [] },
      };
    }

    const base = worsened.some((w) => w.field === "weather" && String(w.to).includes("TS"))
      ? "critical"
      : "warning";
    const severity = amd ? bump(base) : base;

    // 제목엔 실제로 위험한 값을 담는다. 한 번의 발표는 한 줄이며 본문에 요소별로 나열한다.
    const worst = worsened.find((w) => w.field === "visibility") ?? worsened[0];
    const kind = FIELD_LABEL[worst.field] ?? worst.field;
    // 단위를 붙인다 — 4m 거리에서 읽는 화면이라 숫자만 있으면 무엇인지 알 수 없다.
    const unit = worst.field === "ceiling" ? "ft" : worst.field === "wind" ? "kt" : worst.field === "visibility" ? "m" : "";
    const title = `${amd ? "TAF AMD 악화" : "TAF 악화"}: ${kind} ${worst.to}${unit}`;

    return {
      triggerId: "taf_change",
      severity,
      title,
      message: `${formatUtc(current.header?.issued)} ${amd ? "AMD" : "발표"} (직전 ${formatUtc(previous.header?.issued)} 대비)\n`
        + worsened.map(describe).join("\n"),
      data: worsened,
      highlight: {
        panel: "taf",
        fields: [...new Set(worsened.map((w) => w.field))],
        times: [...new Set(worsened.map((w) => w.time))],
      },
    };
  },
};

// T-10: TAF 새 구간 — 이전 TAF에 없던 꼬리 구간에 위험이 있는가.
// 비교 대상이 없으므로 "늘었다"고 말하지 않는다.
const tafNewPeriod = {
  id: "taf_new_period",
  name: "TAF 새 구간 알림",
  category: "taf",
  severity: "info",
  evaluate(current, _previous, _params, allTriggers) {
    const previous = current?.previous;
    if (!previous) return null;
    if (isCancellation(current.header?.report_status)) return null;

    const thresholds = collectThresholds(allTriggers);
    const risks = findTailRisk(previous, current, thresholds, new Date());
    if (risks.length === 0) return null;

    const worst = risks.find((r) => r.field === "weather") ?? risks[0];
    const kind = FIELD_LABEL[worst.field] ?? worst.field;

    return {
      triggerId: "taf_new_period",
      // AMD여도 심각도를 올리지 않는다. AMD의 무게는 taf_change가 이미 표현한다.
      severity: "info",
      title: `TAF 새 구간: ${formatUtc(worst.time)} ${kind} ${worst.value}`,
      message: `${formatUtc(current.header?.issued)} 발표 — 직전 예보에 없던 구간\n`
        + risks.map(describe).join("\n"),
      data: risks,
      highlight: {
        panel: "taf",
        fields: [...new Set(risks.map((r) => r.field))],
        times: [...new Set(risks.map((r) => r.time))],
      },
    };
  },
};
```

배열에 두 줄 더한다. `tafAdverseWeather` 뒤가 자리다.

```js
  tafAdverseWeather,
  tafChange,
  tafNewPeriod,
```

- [ ] **Step 5: 알람 키에 `issued`를 넣는다**

`alert-state.js`의 `buildAlertKey`에서 `taf_adverse_weather` 분기 **뒤**에 넣는다.

```js
  if (triggerId === "taf_change" || triggerId === "taf_new_period") {
    // 발표마다 별개의 알람이 되어 재알림 간격이 새 발표를 가로막지 않는다(스펙 §12.7).
    // 새 TAF가 오면 키가 바뀌어 옛 줄이 유효 목록에서 빠지고 교체된다.
    return `${triggerId}:${icao}:${result.issued ?? ""}`;
  }
```

`result.issued`가 필요하므로 두 트리거의 반환 객체에 한 줄씩 더한다. `triggerId:` 줄 바로 뒤가 자리다 — **세 곳 모두**(`tafChange`의 AMD 통지 갈래와 악화 갈래, `tafNewPeriod`).

```js
      issued: current.header?.issued ?? null,
```

그리고 `alert-state.test.js` **끝에** 키 테스트를 덧붙인다. 스펙 §16의 "알람 키 — 발표마다 달라짐" 항목이다.

```js
test('TAF 변화 알람 키는 발표(issued)마다 달라진다', () => {
  const k1 = buildAlertKey({ triggerId: 'taf_change', issued: 'i1' }, 'RKSI')
  const k2 = buildAlertKey({ triggerId: 'taf_change', issued: 'i2' }, 'RKSI')

  assert.equal(k1, 'taf_change:RKSI:i1')
  assert.notEqual(k1, k2, '키가 같으면 재알림 간격이 새 발표를 가로막는다')
})

test('TAF 변화 알람 키가 공항별 이력 정리 규칙에 걸린다', () => {
  const key = buildAlertKey({ triggerId: 'taf_new_period', issued: 'i1' }, 'RKSI')
  recordAlert(key)
  clearResolvedAlerts(new Set(), 'RKSI')
  assert.equal(getHistory()[key], undefined, ':ICAO: 모양을 정리 규칙이 잡아야 한다')
})
```

- [ ] **Step 6: 기본 설정을 더한다**

`shared/alert-defaults.js`의 `triggers`에서 `taf_adverse_weather` 블록 **뒤**에 넣는다. **임계값 항목이 없다** — §12.1대로 기존 트리거의 값을 읽는다.

```js
    taf_change: {
      enabled: true,
      params: {},
    },
    taf_new_period: {
      enabled: true,
      params: {},
    },
```

- [ ] **Step 7: 통과를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/*.test.js
```
Expected: PASS — **69 tests**. 내역: 계획 A의 21(`alert-dispatcher` 2 + `alert-settings` 6 + `alert-state` 6 + `alert-triggers` 7) + Task 3의 16 + Task 4의 18 + 이 Task의 14(트리거 12 + 알람 키 2). **fail 0**이어야 한다. 합계가 다르면 글로브가 새 파일을 집었는지부터 확인한다.

- [ ] **Step 8: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.js frontend/src/features/monitoring/legacy/utils/alerts/alert-engine.js frontend/src/features/monitoring/legacy/utils/alerts/alert-state.js frontend/src/features/monitoring/legacy/utils/alerts/alert-triggers.test.js shared/alert-defaults.js
git commit -m "feat(monitoring): TAF 변화 알람 트리거 2종을 만든다

두 트리거는 엔진이 넘기는 previous 인자가 아니라 current.previous를 읽는다.
그래야 유효성 재확인으로 인자가 비는 경우에도 판정이 성립하고, 새 TAF가
오면 알람 키가 바뀌어 옛 줄이 자연히 교체된다.
임계값은 새로 만들지 않고 기존 트리거의 것을 엔진이 넘겨준다."
```

---

## Task 6: 설정창에 켜기/끄기 2개를 더한다

§14의 "추가". **켜기/끄기만 추가한다. 임계값 입력 칸은 하나도 늘어나지 않는다.**

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx`

**Interfaces:**
- Consumes: Task 5의 트리거 id 2종
- Produces: 설정창 알림 탭의 "예고 / 공식 알림" 절에 항목 2개가 늘어난다.

- [ ] **Step 1: 라벨을 더한다**

`Settings.jsx`의 `TRIGGER_LABELS`에 두 줄 더한다.

```js
const TRIGGER_LABELS = {
  low_visibility: "시정이 나빠지면 알림",
  high_wind: "바람이 강해지면 알림",
  weather_phenomenon: "특이기상(TS/SN/FG)이 나타나면 알림",
  low_ceiling: "구름고도가 낮아지면 알림",
  taf_adverse_weather: "예보에 악기상이 들어오면 알림",
  lightning_detected: "공항 주변 낙뢰가 발생하면 알림",
  taf_change: "TAF가 바뀌어 위험이 늘면 알림",
  taf_new_period: "TAF 새 구간에 위험이 있으면 알림",
};
```

- [ ] **Step 2: 예고 절에 넣는다**

`ALERT_USER_SECTIONS`의 `forecast-official` 절 `triggerIds`를 고친다.

```js
    triggerIds: ["taf_adverse_weather", "taf_change", "taf_new_period"],
```

- [ ] **Step 3: 남은 항목이 없는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -n "taf_change\|taf_new_period" frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx
```
Expected: `TRIGGER_LABELS` 2줄과 `triggerIds` 1줄, 총 3곳.

- [ ] **Step 4: 설정창이 열리는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && npx playwright test verification/contracts/monitoring.spec.mjs --project=desktop --retries=0 --reporter=line
```
개발 서버가 이미 떠 있으면 `CONTRACT_REUSE_SERVER=1`을 앞에 붙인다.
Expected: **desktop 7 passed, 1 skipped, 0 failed.** (skip 1건은 모바일 전용 리디렉션 계약이다.) 새 실패가 나오면 멈추고 원인을 찾는다.

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/src/features/monitoring/legacy/components/alerts/Settings.jsx
git commit -m "feat(monitoring): 설정창에 TAF 변화 알람 항목 2개를 더한다

켜기/끄기만 늘어난다. 판정 임계값은 기존 항목을 그대로 읽으므로
입력 칸이 늘지 않는다."
```

---

## Task 7: 브라우저 계약 픽스처의 TAF mock을 실제 모양으로 다시 만든다

Task 8의 계약을 만들려면 픽스처가 `timeline`과 `previous`를 실제 파서 모양으로 내야 한다. 지금 mock은 `issuedAt`/`validFrom`/`validUntil`이라는 **실제로 존재하지 않는 이름**을 쓰고 `timeline`이 아예 없다.

**Files:**
- Modify: `frontend/verification/monitoring-fixture.mjs`

**Interfaces:**
- Consumes: Task 2의 `previous` 모양
- Produces:
  - `/api/taf` mock이 `{ header: { icao, issued, valid_start, valid_end, report_status }, timeline: [...], previous: { header, timeline } }`를 낸다.
  - **`export function buildTafPayload({ reportStatus, issued } = {})`** — 계약이 상태를 바꿔 가며 재사용한다. Task 8이 이것에 의존한다.
  - **`export const TAF_HASH`** — `/api/snapshot-meta`가 쓰는 TAF 해시 상수. Task 8이 새 해시를 만들 때 기준으로 쓴다.
  - **`export function buildSnapshotMeta(overrides = {})`** — `/api/snapshot-meta` 본문을 만들고 넘긴 키만 덮어쓴다. Task 8이 TAF 해시를 바꿔 재수신을 유발하는 데 쓴다.

**왜 함수로 내보내나:** Playwright의 `route.fetch()`는 페이지 라우트를 거치지 않고 **실제 네트워크로 나간다.** `playwright.config`의 `webServer`가 `DISABLE_COLLECTION=1`로 진짜 백엔드(:3001)를 띄우므로, 계약에서 `route.fetch()`로 픽스처 응답을 받아 고치려 하면 수집이 꺼진 서버에 닿아 `airports.RKSI`가 없다. 대신 본문을 만드는 함수를 내보내 계약이 **완결된 본문을 직접 fulfill** 한다.

- [ ] **Step 1: 현재 mock의 경계를 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -n "api/taf'" frontend/verification/monitoring-fixture.mjs
```
나온 줄부터 그 `await page.route(...)` 블록 전체가 교체 대상이다. `taf-overseas`는 건드리지 않는다.

- [ ] **Step 2: mock을 실제 모양으로 교체한다**

`/api/taf` 블록을 아래로 교체한다. 시각은 **고정 문자열이 아니라 현재 시각 기준 상대값**이어야 한다 — 계약이 "현재 시각 이후"만 판정하므로 고정값을 쓰면 시간이 지나 계약이 저절로 깨진다.

```js
  // TAF mock — 실제 taf-parser 출력 모양을 따른다.
  // header.issued / valid_start / valid_end / report_status, 그리고 timeline 각 칸은
  // { time, wind, visibility: { value, cavok }, weather, clouds, display }.
  // previous는 taf-previous.js가 붙이는 모양이다(display 없음).
  //
  // 시각은 현재 기준 상대값이다. 고정 문자열을 쓰면 판정이 "현재 시각 이후"만 보므로
  // 시간이 지나면 계약이 저절로 깨진다.
  await page.route('**/api/taf', (route) => fulfill(route, buildTafPayload()))
```

그리고 **파일 맨 위 상수 묶음 근처**(`const HASH_TAF = ...` 아래)에 본문 생성 함수를 놓는다. `installMonitoringFixture` 바깥이어야 계약에서 임포트할 수 있다.

```js
// 계약이 상태를 바꿔 가며 재사용한다. route.fetch()는 페이지 라우트를 거치지 않고
// 실제 백엔드로 나가므로, 응답을 받아 고치는 대신 본문을 여기서 완결해 만든다.
export const TAF_HASH = HASH_TAF

export function buildTafPayload({ reportStatus = 'NORMAL', issued = null } = {}) {
  const hourMs = 3600000
  const iso = (offsetHours) => new Date(Date.now() + offsetHours * hourMs).toISOString()
  const slot = (offsetHours, over = {}) => ({
      time: iso(offsetHours),
      wind: { speed: 10, raw: '27010KT' },
      visibility: { value: 9999, cavok: false },
      weather: [],
      clouds: [{ amount: 'BKN', base: 3000 }],
      display: { wind: '27010KT', vis: '9999', clouds: 'BKN030' },
      ...over,
    })
    // 새 TAF: +2시간 칸이 저시정(1200m)으로 나빠졌다. 직전 TAF에서는 멀쩡했다.
    const badSlot = slot(2, {
      visibility: { value: 1200, cavok: false },
      display: { wind: '27010KT', vis: '1200', clouds: 'BKN030' },
    })
    const previousSlot = { ...slot(2) }
    delete previousSlot.display

    return {
      content_hash: HASH_TAF,
      // taf-processor.js 결과도 `airports`가 최상위 키다.
      airports: {
        RKSI: {
          header: {
            icao: 'RKSI',
            issued: issued ?? iso(-0.5),
            valid_start: iso(-1),
            valid_end: iso(12),
            report_status: reportStatus,
            raw_text: 'TAF RKSI 2712/2812 27010KT 9999 BKN030',
          },
          base: {},
          change_groups: [],
          timeline: [slot(1), badSlot, slot(3), slot(4), slot(5), slot(6)],
          previous: {
            header: {
              issued: iso(-6.5),
              valid_start: iso(-7),
              valid_end: iso(12),
              report_status: 'NORMAL',
            },
            timeline: [
              { ...slot(1), display: undefined },
              previousSlot,
              { ...slot(3), display: undefined },
              { ...slot(4), display: undefined },
              { ...slot(5), display: undefined },
              { ...slot(6), display: undefined },
            ],
          },
        },
      },
    }
  }
```

`installMonitoringFixture` 안의 `/api/taf` 라우트 등록은 위에서 바꾼 한 줄(`fulfill(route, buildTafPayload())`)만 남는다.

- [ ] **Step 2b: 스냅샷 메타 본문도 함수로 뺀다**

같은 이유로 `/api/snapshot-meta`도 계약이 재사용할 수 있어야 한다. 현재 그 라우트 안에 인라인으로 있는 객체를 함수로 옮기고, 라우트는 함수를 부르게 한다.

```js
export function buildSnapshotMeta(overrides = {}) {
  return {
    // 기존 인라인 객체의 내용을 그대로 옮긴다. 값을 바꾸지 마라.
    // ... metar, metarOverseas, taf, ... (현재 있는 키 전부)
    ...overrides,
  }
}
```

라우트는 이렇게 된다.

```js
  await page.route('**/api/snapshot-meta', (route) => fulfill(route, buildSnapshotMeta()))
```

**키를 하나도 빠뜨리지 마라.** 옮기기 전에 현재 객체를 그대로 복사하고, 옮긴 뒤 계약을 돌려 기존 15건이 유지되는지 확인한다.

- [ ] **Step 3: 기존 계약이 깨지지 않는지 확인한다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && npx playwright test verification/contracts/monitoring.spec.mjs --retries=0 --reporter=line
```
Expected: **15 passed, 9 skipped, 0 failed.**

이제 TAF 타임라인이 실제로 그려지기 시작하므로 **새로 깨지는 계약이 나올 수 있다.** 나오면 판단한다.
- 계약이 옛 빈 화면을 전제하고 있었다면 → 계약을 고친다.
- 진짜 제품 결함이 드러난 것이라면 → **멈추고 보고한다. 소스를 고치지 마라.**

- [ ] **Step 4: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/verification/monitoring-fixture.mjs
git commit -m "test(monitoring): TAF 픽스처를 실제 파서 출력 모양으로 다시 만든다

기존 mock은 issuedAt/validFrom/validUntil이라는 실제로 없는 이름을 쓰고
timeline이 아예 없어, 브라우저 계약에서 TAF 타임라인이 사실상 비어 있었다.
header.issued/valid_start/valid_end와 timeline, 그리고 previous를 실제
모양으로 채운다. 시각은 현재 기준 상대값이라 시간이 지나도 깨지지 않는다."
```

---

## Task 8: 브라우저 계약 4건을 더하고 등록부를 고친다

§16의 TAF 관련 항목 4개를 계약으로 만든다.

**Files:**
- Modify: `frontend/verification/contracts/monitoring.spec.mjs`
- Modify: `docs/policies/verification/contracts.md`

**Interfaces:**
- Consumes: Task 5의 트리거·알람 키, Task 7의 픽스처
- Produces: 없음 (최종 검증)

**주의 — 계약은 세 프로젝트에서 돈다.** `desktop` · `ipad-landscape` · `mobile`. 상황판에 들어가는 **모든** 계약에 모바일 skip이 있어야 한다. 없으면 0 failed에 도달하지 못한다.

**주의 — `openMonitoringState(page, 'settings')`는 `/monitoring?mode=ops`로 다시 이동한다**(`monitoring-fixture.mjs`). 지상 모드를 확인하는 계약에서는 쓰지 않는다.

- [ ] **Step 1: 계약 4건을 더한다**

먼저 `monitoring.spec.mjs` 맨 위 임포트에 Task 7이 내보낸 것들을 더한다. 기존 임포트 줄에 이어 붙인다.

```js
import { buildTafPayload, buildSnapshotMeta, TAF_HASH } from '../monitoring-fixture.mjs'
```

경로가 기존 `openMonitoringState` 임포트와 다르면 그쪽에 맞춘다. 그리고 마지막 테스트 뒤, `describe` 블록이 닫히기 전에 아래를 넣는다.

```js
  test('TAF worsening alert shows one row listing every worsened element', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    // 픽스처의 새 TAF는 +2시간 칸이 1200m로 나빠졌고 직전 TAF에서는 멀쩡했다.
    // 여러 요소가 동시에 악화해도 줄은 하나여야 한다(스펙 §12.7).
    const rows = page.locator('.alert-table-row', { hasText: 'TAF 악화' })
    await expect(rows).toHaveCount(1, { timeout: 15000 })
  })

  test('TAF worsening alert outlines the affected timeline slot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })
    await expect(page.locator('.alert-table-row', { hasText: 'TAF 악화' })).toHaveCount(1, { timeout: 15000 })

    // 강조는 시간 눈금이 아니라 **막대 자체**에 붙는다. 한 시간대가 걸리면
    // 다섯 줄(비행조건·날씨·바람·시정·운고)의 해당 막대가 함께 강조된다.
    const blinking = page.locator('.taf-new-timeline .alert-outline-blink')
    await expect(blinking).toHaveCount(5)

    // 시간 눈금에는 테두리가 가지 않는다 — 눈금이 몰린 구간에서 뭉개져 못 읽는다.
    await expect(page.locator('.taf-scale-item.alert-outline-blink')).toHaveCount(0)
  })

  test('an AMD worsening alert is raised one severity step', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    // AMD면 심각도가 한 단계 올라간다(스펙 §12.6). 알람 표가 심각도순으로 정렬하므로
    // 그 결과 정규 발표보다 위에 온다 — 정렬 자체는 기존 계약이 이미 덮는다.
    //
    // route.fetch()를 쓰지 않는다. 그것은 페이지 라우트를 거치지 않고 실제 백엔드로
    // 나가므로 픽스처가 아니라 수집이 꺼진 서버에 닿는다. 대신 본문을 직접 만든다.
    // 나중에 등록한 라우트가 먼저 매치되므로 픽스처 설치 뒤에 덮어쓰면 된다.
    await page.route('**/api/taf', (route) =>
      route.fulfill({ json: buildTafPayload({ reportStatus: 'AMENDMENT' }) })
    )
    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    const row = page.locator('.alert-table-row', { hasText: 'TAF AMD 악화' })
    await expect(row).toHaveCount(1, { timeout: 15000 })
    await expect(row).toHaveClass(/alert-table-row--critical/)
    await expect(page.locator('.alert-table-row', { hasText: /TAF 악화/ })).toHaveCount(0)
  })

  test('a new TAF replaces the previous TAF alert row instead of stacking', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'monitoring is desktop-only; mobile is redirected away')

    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    const rows = page.locator('.alert-table-row', { hasText: 'TAF 악화' })
    await expect(rows).toHaveCount(1, { timeout: 15000 })
    // 교체를 확인하려면 "옛 줄이 사라졌다"를 봐야 한다. 발동 시각으로 구별한다.
    const firstRowTime = await rows.first().locator('.alert-table-time').textContent()

    // 프런트는 /api/snapshot-meta의 taf.hash가 바뀔 때만 TAF를 다시 내려받는다(스펙 §1.3).
    // 본문만 바꾸면 새 TAF가 영영 도착하지 않아 계약이 아무 일 없이 통과해 버린다.
    const newIssued = new Date().toISOString()
    await page.route('**/api/taf', (route) =>
      route.fulfill({ json: buildTafPayload({ issued: newIssued }) })
    )
    await page.route('**/api/snapshot-meta', (route) =>
      route.fulfill({ json: buildSnapshotMeta({ taf: { hash: `${TAF_HASH}-changed` } }) })
    )

    // 새 발표가 오면 알람 키의 issued가 바뀐다. 옛 줄은 유효 목록에서 빠지고
    // 새 줄이 대신 들어간다 — 두 줄이 되면 안 된다(스펙 §12.7 수명).
    await expect(rows).toHaveCount(1, { timeout: 30000 })
    await expect
      .poll(async () => rows.first().locator('.alert-table-time').textContent(), { timeout: 30000 })
      .not.toBe(firstRowTime)
  })
```

- [ ] **Step 2: 세 프로젝트 전부 돌린다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && npx playwright test verification/contracts/monitoring.spec.mjs --retries=0 --reporter=line
```
개발 서버가 이미 떠 있으면 `CONTRACT_REUSE_SERVER=1`을 앞에 붙인다.

Expected: **23 passed, 13 skipped, 0 failed.** 계약 4건이 세 프로젝트에 곱해지되 모바일에서는 전부 skip이므로 `passed`는 15+8, `skipped`는 9+4가 된다.

**`skipped`가 이보다 많으면 모바일 skip 조건을 잘못 쓴 것이다** — 0 failed로도 통과해 버리므로 숫자를 반드시 확인한다. 이 시점에는 통과가 완료 조건이다.

**타임아웃을 늘리거나 단언을 약화시켜 초록불을 만들지 마라.** 계약이 진짜 결함을 잡았다면 멈추고 보고한다.

- [ ] **Step 3: 단위 테스트 전체를 돌린다**

Run:
```bash
cd /home/john_doe/ProjectAMO/frontend && node --test src/features/monitoring/legacy/utils/alerts/*.test.js
cd /home/john_doe/ProjectAMO/backend && node --test test/taf-previous.test.js
```
Expected: 양쪽 모두 **fail 0**.

- [ ] **Step 4: 등록부를 고친다**

`docs/policies/verification/contracts.md`의 `monitoring` 행에서 통과일을 **Step 2가 실제로 통과한 날**로 바꾼다. 통과하지 않았으면 이 줄을 고치지 않는다.

- [ ] **Step 5: 커밋**

```bash
cd /home/john_doe/ProjectAMO
git add frontend/verification/contracts/monitoring.spec.mjs docs/policies/verification/contracts.md
git commit -m "test(monitoring): TAF 변화 알람 계약을 더한다

한 발표에 한 줄, 해당 시간칸 강조, AMD 심각도 상승, 새 발표 시 줄 교체를
검사한다. 상황판에 들어가는 계약이므로 모두 모바일에서 제외한다."
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 절 | Task |
|---|---|
| §10 구조 (서버 보관 + 프런트 판정, `current.previous` 읽기) | 1, 2, 5 |
| §11 서버 직전 TAF 보관 (issued 비교·유지·재시작) | 1, 2 |
| §11 내려보내는 모양 (`previous.header`·`previous.timeline` 축약) | 1 |
| §12.1 위험 시각 (4요소, 기존 임계값 재사용) | 3 |
| §12.2 비교 구간 (겹침 ∩ 현재 이후) | 4 |
| §12.3 악화 판정 (규칙 ①②, 경계 4개) | 4 |
| §12.4 좋아진 경우 미발동 | 4 |
| §12.5 오탐 억제 (새 TAF 도착 시에만 판정) | 5 — `current.previous`가 바뀔 때만 결과가 바뀐다 |
| §12.6 `taf_change` 결과표 (4갈래) | 5 |
| §12.7 공통 규칙 (한 줄 병합·둘 다 발동 가능·`issued` 키·수명) | 5 |
| §12.8 문구 예 | 5 (`describe`·`title`) |
| §13 `taf_new_period` | 4, 5 |
| §14 추가 (켜기/끄기 2개, 임계값 칸 없음) | 5, 6 |
| §15 오류 처리 (previous 없음·미중첩·빈 값·CAVOK/NSC·취소) | 1, 3, 4, 5 |
| §16 브라우저 계약 TAF 4항목 | 8 |
| §16 단위 테스트 (프런트·백엔드) | 1, 3, 4, 5 |
| §17 영향 파일 ⬜ 항목 전부 | 전체 |

**§16 항목별 대조**

| 스펙 §16 항목 | 계약 |
|---|---|
| TAF 악화 알람이 표에 뜨고, 여러 요소가 악화해도 줄이 하나인가 | `TAF worsening alert shows one row listing every worsened element` |
| TAF 타임라인의 해당 시간칸에 강조가 붙는가 | `TAF worsening alert outlines the affected timeline slot` |
| AMD 알람이 정규 발표 알람보다 위에 정렬되는가 | `an AMD worsening alert sorts above a regular one` |
| 다음 TAF 도착 시 이전 줄이 빠지고 교체되는가 | `a new TAF replaces the previous TAF alert row instead of stacking` |

AMD 정렬은 **심각도 상승**으로 검사한다. 정렬 자체는 계획 A의 `AlertPanel`이 이미 심각도순으로 하고 그 동작은 기존 계약이 덮는다 — 여기서 다시 검사하면 동어반복이다.

**2. 미완성 표현** — "TBD"·"적절히"·"필요시" 없음. 코드 단계는 모두 실제 코드를 담았다.

Task 7 Step 1과 Task 8 Step 4만 **확인 명령을 먼저 돌리게** 했다. 파일 내용에 따라 경계와 날짜가 달라져 미리 못 박으면 틀리기 때문이다. "알아서 하라"가 아니라 "이 명령을 돌려 나온 것을 이렇게 고쳐라" 형태다.

**3. 타입 일관성**

- `previous` 모양이 Task 1(생성) → Task 2(전송) → Task 4(소비) → Task 7(픽스처)에서 일치한다: `{ header: {issued, valid_start, valid_end, report_status}, timeline: [...] }`
- `riskOf`의 반환 키(`visibility`·`weather`·`ceiling`·`wind`)가 Task 3(정의) → Task 4(비교) → Task 5(`highlight.fields`)에서 일치한다
- `findWorsening` 항목의 `{time, field, from, to, rule}`이 Task 4(정의)와 Task 5(`describe`·`data`)에서 일치한다
- `findTailRisk` 항목의 `{time, field, value}`가 Task 4와 Task 5에서 일치한다
- `trigger.evaluate`의 네 번째 인자가 Task 5의 엔진(전달)과 트리거(수신)에서 일치한다 — `settings.triggers` 묶음
- `highlight` 모양이 계획 A의 `{ panel: 'taf', fields, times }`와 같다
- 알람 키 `taf_change:<ICAO>:<issued>`가 Task 5(생성)와 계획 A의 `clearResolvedAlerts` 정리 규칙(`:ICAO:` 매칭)과 호환된다
- 트리거 배열 길이가 Task 5에서 6 → 8이 되고, `alert-triggers.test.js`의 첫 테스트도 함께 8로 고친다

**4. 계획 A와의 접점**

- `highlight.fields`는 아무도 읽지 않는다. 이 계획도 **읽지 않는다** — 강조는 `times`로만 붙는다.
  2026-07-28에 강조 대상이 **시간 눈금에서 막대 자체로 옮겨졌다**(커밋 `3ce2188`). 한 시간대가 걸리면 다섯 줄(비행조건·날씨·바람·시정·운고)의 해당 막대가 **함께** 강조된다 — 사용자 결정이며, 4m 거리에서 "이 시간대가 문제"가 보이는 것이 요소를 구분하는 것보다 중요하다. 따라서 요소별 강조가 필요하지 않고 `fields`는 계속 예비 값으로 남는다.
  `TafTimeline`의 `blinkGroup`이 `group.startIndex`·`group.hourCount`로 막대가 덮는 시각을 찾는다. **계획 B의 새 트리거도 `times`만 채우면 강조가 자동으로 붙는다.**
- 계획 A가 `AlertPanel`에 alertKey 중복 제거를 넣었다. 새 트리거의 키에 `issued`가 들어가므로 같은 발표에 대한 재발화는 한 줄로 유지되고, 새 발표는 새 키라 별개 줄이 되었다가 옛 키가 유효 목록에서 빠지며 교체된다.
- 강조는 최초 발동 시각(`highlightSince`)부터 60초다. 새 발표가 오면 키가 달라 새 알람이므로 다시 강조된다 — 의도된 동작이다.

---

## Execution Handoff

계획 B는 스펙 §10~§13, §14의 추가 항목, §16의 TAF 검증 항목을 모두 덮는다. 이 계획을 끝내면 스펙 전체가 구현된다. 스펙 §0의 표에서 ⬜가 모두 ✅이 된다.
