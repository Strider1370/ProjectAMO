# Plan: 경로비교·고도비교 위험기상 표시 개편

**Spec:** `docs/superpowers/specs/2026-07-21-hazard-comparison-display.md`
**Goal:** 착빙·난류 강도를 시각적으로 구분하고, 위험기상 잘림·내부 코드 노출을 없애고, 두 탭의 위험기상 표시를 격자 정렬·노출거리 합계로 통일한다. 판단 문구는 추가하지 않는다.

## Global Constraints

- 새 아이콘 라이브러리, 새 npm 의존성을 추가하지 않는다 — `lucide-react`만 사용한다.
- 새 CSS 색상 변수를 만들지 않는다 — `tokens.css`의 `--level-red/-amber/-green/-gray`(및 `-bg` 변형)만 사용한다.
- 강도 배지는 `icing`/`turbulence`에만 적용한다. SIGMET/AIRMET 등 강도 코드가 없는 현상에는 강도를 부여하지 않는다.
- `위험`/`주의`/`양호`/`가장 안전`/`추천` 등 시스템 판단 문구를 추가하지 않는다.
- 백엔드 응답의 기존 필드 값은 바꾸지 않는다 — `matchHazards()` 반환에 필드를 추가만 한다.

---

## Task 1: 고도 비교 강도 배지 + 격자 정렬

**Files:**
- Modify: `frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx:22-41` (rowDetails, gradeLabel), `:91-106` (카드 렌더)
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css:151-155` (`.rb-alternative-card`, `.rb-card-hazard`, `.rb-card-warning`)
- Test: `frontend/src/features/route-briefing/AltitudeWeatherComparison.test.jsx` (신규 파일 — 현재 존재하지 않음)

**Interfaces:**
- Consumes: `row.icing.summary.{highestGrade, highestGradeExposureNm, exposureNmByGrade}`, `row.turbulence.summary`(동일 구조), `row.hazards[]`(현재 필드: `source, label, altitude, timeStatus, encounter`), `lucide-react`의 `Snowflake, Waves, Wind, CloudLightning, Mountain, Clock, Minus, CircleHelp, ChevronDown`
- Produces: `SEVERITY_LABEL` 매핑 함수(grade 0~3 → `{ code: 'NIL'|'LGT'|'MOD'|'SVR', ko: string }`), `.sev-{svr,mod,lgt,none,na}` CSS 클래스, `.hz` / `.hz.on` / `.hz.near` CSS 클래스(위험기상 조우 구분)

- [ ] Step 1: `AltitudeWeatherComparison.jsx`에 `SEVERITY_LABEL` 함수 추가:
  ```js
  const SEVERITY_LABEL = { 0: { code: 'NIL', ko: '없음' }, 1: { code: 'LGT', ko: '약함' }, 2: { code: 'MOD', ko: '보통' }, 3: { code: 'SVR', ko: '심함' } }
  function severityBadge(grade) {
    const entry = SEVERITY_LABEL[Number(grade)]
    return entry ?? { code: '?', ko: '자료 없음' }
  }
  ```
- [ ] Step 2: 기존 `gradeLabel()`(현재 `없음/약/중/심` 문자열만 반환, 39-41행)을 유지하되 `rowDetails()`가 아닌 카드 렌더에서 직접 배지를 그리도록, `rowDetails()`의 icing/turbulence 처리(26-27행)를 `kind: 'severity', grade: ...`로 바꾼다. `kind: 'info'`(바람)와 분리한다.
- [ ] Step 3: 카드 렌더(91-106행)에서 `details.filter(...).map(...)`을 열 단위 렌더로 교체 — 바람/착빙/난류/위험기상을 각각 고정된 자리에 그리고, 값이 없으면 "보고 없음"(`Minus` 아이콘)으로 접는다. 착빙·난류는 `severityBadge()` 배지 + `lucide` 아이콘(`Snowflake`/`Waves`), 위험기상은 강도 없이 `source + label` 칩(`CloudLightning`/`Mountain` 아이콘, 조우 여부에 따라 `.hz.on`/`.hz.near`).
- [ ] Step 4: `RouteBriefing.css`에 `.sev-svr/.sev-mod/.sev-lgt/.sev-none/.sev-na`와 `.hz/.hz.on/.hz.near` 규칙을 새 클래스로 추가한다. `.rb-card-hazard`(154행)는 `AltitudeWeatherComparison.jsx:101`과 `RouteAlternativesStep.jsx:79`에서만 쓰이고(둘 다 이번 Task 1·Task 4에서 교체 대상), `.rb-card-warning`(155행)은 코드베이스 어디에서도 참조되지 않는 정의만 있는 CSS임을 확인했다(`grep -rn "rb-card-hazard\|rb-card-warning" frontend/src` 결과, 2026-07-21 확인). 따라서 두 클래스 모두 안전하게 제거하고 `.sev-*`/`.hz*`로 대체할 수 있다.
- [ ] Step 5: 선택된 카드의 상세 펼침(현재 100-101행)에서 `encounter === 'on'`이면 "실제 조우"(고도·시간 모두 겹침), `'nearby'`면 "인근"(시간 또는 고도만 겹침)으로 텍스트를 구분한다. 현재 텍스트("비행 시간과 겹침"/"시간 확인 필요")는 시간만 반영하므로 교체한다.
- [ ] Step 6: 테스트 추가 — grade 0/1/2/3/null 각각에 대해 `severityBadge()`가 올바른 code를 반환하는지, `encounter: 'nearby'`인 hazard가 "실제 조우" 텍스트를 갖지 않는지 확인.
- [ ] Step 7: Verify — `npm --prefix frontend test -- AltitudeWeatherComparison`; 통과 기대.
- [ ] Step 8: Commit — `git add frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx frontend/src/features/route-briefing/RouteBriefing.css frontend/src/features/route-briefing/AltitudeWeatherComparison.test.jsx && git commit -m "Add severity badges and encounter distinction to altitude comparison"`.

## Task 2: 백엔드 — 고도별 위험기상 노출거리 반환

**Files:**
- Modify: `backend/src/briefing/altitude-weather-comparison.js:143-160` (`matchHazards`)
- Test: `backend/test/altitude-weather-comparison.test.js` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `evaluateHorizontalExposure({ axis, geometry })`(이미 145행에서 호출, 반환값 `{ status, intervals[] }`)
- Produces: `matchHazards()` 반환 객체에 `horizontalExposure` 필드 추가(기존 필드는 그대로 유지)

- [ ] Step 1: `matchHazards()`의 반환 객체(149-159행)에 `horizontalExposure` 필드를 추가한다:
  ```js
  return [{
    source,
    sourceId: item.id ?? null,
    label: item.phenomenon_label ?? item.phenomenon_code ?? '현상명 없음',
    altitude: item.altitude ?? null,
    validFrom: item.valid_from ?? null,
    validTo: item.valid_to ?? null,
    encounter: altitudeExposure.status === 'intersects' && timeStatus === 'matched' ? 'on' : 'nearby',
    timeStatus,
    verticalStatus: altitudeExposure.status,
    horizontalExposure,
  }]
  ```
- [ ] Step 2: `backend/test/altitude-weather-comparison.test.js`의 `assert.deepEqual(rows[0].hazards[0], {...})`(약 67-70행)이 새 필드로 인해 **반드시 깨진다** — 조건부가 아니다. 기대 객체에 `horizontalExposure: { status: 'intersects', intervals: [{ startNm, endNm }] }`(실제 axis/geometry 기반 값)를 추가해 업데이트한다.
- [ ] Step 3: 테스트 추가 — 위험기상이 경로와 교차하는 고도 행에서 `hazard.horizontalExposure.intervals`가 최소 1개 구간을 갖는지 확인(Step 2의 업데이트로 커버되면 별도 케이스 생략 가능).
- [ ] Step 4: Verify — `npm --prefix backend test -- --test-name-pattern "altitude"`; 통과 기대.
- [ ] Step 5: Commit — `git add backend/src/briefing/altitude-weather-comparison.js backend/test/altitude-weather-comparison.test.js && git commit -m "Return per-hazard horizontal exposure from altitude comparison"`.

## Task 3: 고도 비교 프런트 — 노출거리 합계 표시

**Files:**
- Modify: `frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx`(Task 1에서 만든 열 렌더 옆에 합계 열 추가)
- Modify: `frontend/src/features/route-briefing/lib/routeComparison.js:10`(`exposureNm` 함수에 `export` 추가 — 로직 이동 없음, 가시성만 변경)

**Interfaces:**
- Consumes: Task 2가 추가한 `row.hazards[].horizontalExposure.intervals[]`, 기존 `row.icing.summary.highestGradeExposureNm`, `row.turbulence.summary.highestGradeExposureNm`, `routeComparison.js`의 `exposureNm()`(신규 export)
- Produces: 행별 `totalExposureNm`(착빙 최고등급거리 + 난류 최고등급거리 + 위험기상 교차거리 합)

- [ ] Step 1: `routeComparison.js:10-16`의 `exposureNm()`을 `export`해서 `AltitudeWeatherComparison.jsx`에서 import한다(복사·재구현 금지 — 계산 로직이 두 곳에서 갈라지는 것을 막기 위해 이동이 아니라 export만 한다). 각 행에 대해 `hazards.reduce((sum, h) => sum + exposureNm(h), 0)`로 합계를 낸다.
- [ ] Step 2: 카드 오른쪽 끝에 `총 {icing + turbulence + hazard} NM` 열 추가. 값이 전부 0이면 `0 NM`(회색, 판단 문구 아님).
- [ ] Step 3: Verify — `npm --prefix frontend run build`; 성공 기대.
- [ ] Step 4: Commit — `git add frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx && git commit -m "Show per-altitude exposure totals"`.

## Task 4: 경로비교 — 잘림 제거, 정렬, 코드 노출 제거

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteAlternativesStep.jsx:11-14`(`exposureLabel`), `:68-83`(카드 목록, `slice(0, 2)`는 79행), `:115-118`(비교 상세)
- Modify: `frontend/src/features/route-briefing/lib/routeComparison.js:18-25`(`exposureRows`), `:67-73`(`exposures` 생성)
- Test: `frontend/src/features/route-briefing/lib/routeComparison.test.js`(기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `design.routeExposure.hazards[]`(기존 필드: `source, phenomenon, label, horizontalExposure, timeStatus`)
- Produces: `phenomenonLabel(source, phenomenon)` 매핑 함수(내부 키 대신 사람이 읽는 라벨), `buildRouteComparison()` 각 `exposures[]` 항목에 `label` 필드 추가(기존 `key`는 유지 — React key용)

- [ ] Step 1: `routeComparison.js`의 `exposureRows()`(18-25행)에서 `key`를 만들 때 원본 `hazard.label`도 같이 보존하도록 `Map`을 `{ nm, label }` 값으로 바꾼다:
  ```js
  function exposureRows(exposure) {
    if (!exposure || exposure.trigger === 'unavailable') return null
    return (exposure.hazards ?? []).reduce((rows, hazard) => {
      const key = `${hazard.source ?? 'unknown'}:${hazard.phenomenon ?? 'unknown'}`
      const prev = rows.get(key) ?? { nm: 0, label: hazard.label ?? hazard.phenomenon ?? key, source: hazard.source }
      rows.set(key, { ...prev, nm: prev.nm + exposureNm(hazard) })
      return rows
    }, new Map())
  }
  ```
  `buildRouteComparison()`의 `exposures[]`(67-73행)에서 `baseExposure.get(key)`/`exposure.get(key)`가 이제 객체이므로 `.nm`으로 접근하도록 수정하고, 반환 항목에 `label: (baseExposure ?? exposure)?.get(key)?.label ?? key`를 추가한다.
- [ ] Step 2: `RouteAlternativesStep.jsx:117`의 `{exposure.key}: ...`를 `{exposure.label}: ...`로 교체.
- [ ] Step 3: 카드 목록(79행)의 `slice(0, 2)`를 제거하고, `design.routeExposure.hazards`를 `exposureNm()` 내림차순 정렬 후 상위 3건만 인라인 표시 + 나머지는 "N건 더 보기"(펼치면 전체 표시)로 바꾼다. 로컬 `useState`로 펼침 상태 관리(디자인 목업 v3의 `.more` 버튼 패턴).
- [ ] Step 4: 카드에 위험기상 노출거리 합계 배지 추가 — `design.routeExposure.hazards.reduce((sum, h) => sum + exposureNm(h), 0)`(기존 `exposureNm` 함수를 export해 재사용).
- [ ] Step 5: 비교 델타(115-118행)의 변화량 표시에서 색상(현재 없음, 목업에서 검토했던 녹색/빨강 도입 금지)을 넣지 않는다 — 방향 화살표(`ChevronUp`/`ChevronDown`, 중립 회색)만 추가.
- [ ] Step 6: `routeComparison.test.js:16`의 `assert.deepEqual(result.exposures[0], { key, baseNm, alternativeNm, deltaNm, unavailable })`이 Step 1의 `label` 추가로 깨진다 — `label: 'TS'`(또는 실제 hazard label)를 기대값에 추가해 업데이트한다. 테스트 추가 — `hazards`가 3건 초과일 때 잘림 없이 전부 데이터에 남아있는지(`buildRouteComparison` 레벨), `exposures[].label`이 `key`가 아닌 사람이 읽는 문자열인지 확인.
- [ ] Step 7: Verify — `npm --prefix frontend test -- routeComparison`; 통과 기대.
- [ ] Step 8: Verify — `npm --prefix frontend run build`; 성공 기대.
- [ ] Step 9: Commit — `git add frontend/src/features/route-briefing/RouteAlternativesStep.jsx frontend/src/features/route-briefing/lib/routeComparison.js frontend/src/features/route-briefing/lib/routeComparison.test.js && git commit -m "Remove hazard truncation and internal key exposure in route comparison"`.

## Task 5: 계약 검증 및 캡처

**Files:**
- Modify: `docs/superpowers/status/hazard-comparison-display.status.md`(작성)

**Interfaces:**
- Consumes: Task 1-4의 변경된 컴포넌트, 기존 `frontend/verification/contracts/tabcapture.spec.mjs`(픽스처에 위험기상 있는 케이스 추가 필요 시)

- [ ] Step 1: `frontend/verification/route-fixture.mjs`의 `altitudeComparison`/`exposure` 픽스처에 착빙 MOD, SIGMET 뇌우 등 위험기상이 있는 케이스를 최소 1개 추가 — 현재 픽스처는 전부 `없음/unavailable`이라 이번 변경이 시각적으로 검증되지 않는다.
- [ ] Step 2: Verify — `npm.cmd run dev:contract -- --grep tabcapture`; 위험기상이 있는 화면 캡처가 배지·격자·노출합계를 정상 표시하는지 스크린샷으로 확인.
- [ ] Step 3: Verify — `npm --prefix backend test` 전체, `npm --prefix frontend test` 전체, `npm --prefix frontend run build`; 전부 통과 기대.
- [ ] Step 4: Verify — `npm.cmd run dev:contract -- --grep route-workflow`; 기존 경로 워크플로 계약 회귀 없는지 확인.
- [ ] Step 5: `docs/superpowers/status/hazard-comparison-display.status.md` 작성 — 완료 커밋, 검증 결과, 스킵한 항목 기록.
- [ ] Step 6: Commit — `git add frontend/verification/route-fixture.mjs docs/superpowers/status/hazard-comparison-display.status.md && git commit -m "Add hazard fixtures and record verification"`.
