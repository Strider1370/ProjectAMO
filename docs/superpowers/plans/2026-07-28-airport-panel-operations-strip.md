# 국내 공항 운항정보 스트립 Implementation Plan

> **For agentic workers:** 이 계획은 승인 후 `superpowers:executing-plans`로 순서대로 실행한다. 각 작업은 `superpowers:test-driven-development`의 Red → Green → Refactor 순서를 지키며, 실패가 발생하면 즉시 `superpowers:systematic-debugging`으로 원인을 확인한다.

**Spec:** `docs/superpowers/specs/2026-07-28-airport-panel-operations-strip-design.md`

**Goal:** 국내 공항패널의 공항경보 바로 위에 오늘 기준 공항 표고·일출·일몰을 동일 너비 3열로 표시한다.

**Architecture:** 기존 `shared/airports.js` 공항 객체에 공식 표고를 붙이고, 모니터링에 중복된 일출·일몰 계산을 기존 공용 weather helper로 옮긴다. `AirportPanel.jsx` 안의 작은 표시 컴포넌트가 이미 전달되는 `airport`와 `tz`만 사용해 렌더링한다. 새 API, polling, 상태, 저장소, 의존성은 추가하지 않는다.

**Tech Stack:** React, JavaScript ES modules, CSS Grid, Node test runner, Playwright

## Global Constraints

- 승인된 명세 밖의 활주로·박명·현지시각·운영기관 정보는 추가하지 않는다.
- 국내 공항에만 표시하며 해외 공항은 기존 패널 동작을 유지한다.
- 새 공항 스트립의 “오늘”은 KST 달력일로 고정하고, 표시 시각만 앱의 KST/UTC 설정을 따른다.
- 기존 모니터링 호출은 현재처럼 표시 시간대의 달력일을 쓰게 해 값 회귀를 만들지 않는다.
- 일출 계산식, 천문박명 기준이 아닌 기존 zenith `90.833`, 분 단위 반올림, `-` fallback을 바꾸지 않는다.
- 모니터링의 표시 문자열과 값은 유지한다.
- `AirportPanel.css`에는 사용자의 기존 미커밋 변경이 있다. 구현 전후 diff를 확인하고 이 작업의 hunk만 `git add -p`로 스테이징한다.
- 한국어가 포함된 파일은 UTF-8을 유지하고 `docs/policies/encoding-safety.md`의 검사 절차를 따른다.
- 브라우저 검증은 사용자가 브라우저 실행을 승인한 뒤 Linux Playwright 관리 명령으로 수행한다.

---

### Task 1: 공식 표고 데이터와 공용 일출 계산을 한 경로로 합치기

**Files:**

- Modify: `shared/airports.js`
- Modify: `frontend/src/shared/weather/helpers.js`
- Modify: `frontend/src/shared/weather/helpers.test.js`
- Modify: `frontend/src/features/monitoring/legacy/components/MetarCard.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx`
- Modify: `frontend/src/features/airport-panel/AirportPanel.test.js`

**Step 1: 공용 일출 계산과 공항 표고의 실패 테스트 작성**

`frontend/src/shared/weather/helpers.test.js`에 `computeSunTimes`를 import하고 다음 고정 시각 검증을 추가한다.

```js
it('can use the KST calendar day while formatting the selected time zone', () => {
  const now = new Date('2025-12-31T16:00:00Z') // 2026-01-01 01:00 KST

  assert.deepEqual(
    computeSunTimes(37.4602, 126.4407, now, 'KST'),
    { sunrise: '07:49', sunset: '17:27' },
  )
  assert.deepEqual(
    computeSunTimes(37.4602, 126.4407, now, 'UTC', 'KST'),
    { sunrise: '22:49', sunset: '08:27' },
  )
})

it('keeps the monitoring default date boundary unchanged', () => {
  assert.deepEqual(
    computeSunTimes(37.4602, 126.4407, new Date('2025-12-31T16:00:00Z'), 'UTC'),
    { sunrise: '22:49', sunset: '08:26' },
  )
})

it('falls back when coordinates are missing', () => {
  assert.deepEqual(
    computeSunTimes(undefined, 126.4407, new Date('2026-07-28T03:00:00Z'), 'KST'),
    { sunrise: '-', sunset: '-' },
  )
})
```

`frontend/src/features/airport-panel/AirportPanel.test.js`에서 국내 공항 배열을 import하고 15개 공항의 값을 한 번에 검증한다.

```js
const expectedElevationFt = {
  RKSI: 23,
  RKSS: 59,
  RKPC: 118,
  RKPK: 13,
  RKTU: 192,
  RKTN: 120,
  RKTH: 75,
  RKJB: 52,
  RKJJ: 49,
  RKJK: 29,
  RKJY: 52,
  RKNW: 330,
  RKPS: 26,
  RKPU: 43,
  RKNY: 240,
}

test('domestic airports carry official elevation in feet', () => {
  assert.deepEqual(
    Object.fromEntries(airports.map(({ icao, elevation_ft }) => [icao, elevation_ft])),
    expectedElevationFt,
  )
})
```

값은 대한민국 공식 eAIP의 각 공항 `AD 2.2 AERODROME GEOGRAPHICAL AND ADMINISTRATIVE DATA`에 기재된 aerodrome elevation을 사용한다. eAIP가 ft 값을 병기한 경우 그 값을 우선하고, m만 기재한 경우 `Math.round(m * 3.28084)`로 정수 ft를 만든다. DEM이나 좌표 기반 추정은 하지 않는다.

**Step 2: 실패 테스트 실행**

Run:

```bash
node --test \
  frontend/src/shared/weather/helpers.test.js \
  frontend/src/features/airport-panel/AirportPanel.test.js
```

Expected: `computeSunTimes` export와 `elevation_ft`가 아직 없어 FAIL.

**Step 3: 기존 두 구현 중 하나를 공용 helper로 이동**

`frontend/src/shared/weather/helpers.js`에 `computeSunTimes(lat, lon, date, tz, dateBoundaryTz = tz)`를 named export로 추가한다.

- `toLocalDateParts`는 `dateBoundaryTz`가 `KST`이면 `Asia/Seoul`, 아니면 `UTC`에서 연·월·일을 구한다.
- 기존 `dayOfYear`, `normalizeDegrees`, `formatClockFromMinutes`, `calculate` 계산을 그대로 옮긴다.
- `tz === 'KST' ? 9 : 0` 표시 오프셋은 그대로 둔다.
- 선택 인자를 생략하는 기존 모니터링 호출은 지금과 동일하게 `dateBoundaryTz = tz`로 동작한다.
- 새 공항 스트립만 다섯 번째 인자로 `KST`를 넘겨 국내 공항의 오늘 경계를 고정한다.
- 위도·경도 누락과 극지방 계산 불가 시 `{ sunrise: '-', sunset: '-' }`를 반환한다.
- 함수 안에서 현재 시각을 생성하지 않고 전달받은 `date`만 사용한다.

핵심 경계는 다음과 같다.

```js
export function computeSunTimes(lat, lon, date, tz, dateBoundaryTz = tz) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { sunrise: '-', sunset: '-' }
  }

  const { year, month, day } = toLocalDateParts(date, dateBoundaryTz)
  // 기존 NOAA-style 계산식과 Math.round 분 반올림을 그대로 사용
  const localOffsetHours = tz === 'KST' ? 9 : 0

  return {
    sunrise: formatClockFromMinutes(calculate(true)),
    sunset: formatClockFromMinutes(calculate(false)),
  }
}
```

**Step 4: 모니터링의 중복 구현 두 벌 삭제**

두 컴포넌트 모두 아래 공용 import를 사용한다.

```js
import { computeSunTimes } from '../../../../shared/weather/helpers.js'
```

- `MetarCard.jsx`의 `toLocalDateParts`부터 `computeSunTimes`까지 삭제한다.
- `GroundCurrentWeatherCard.jsx`의 `toKstDateParts`부터 `computeSunTimes`까지 삭제한다.
- 기존 호출부와 다음 표시 문자열은 그대로 둔다.

```jsx
☀ 일출 {sunTimes.sunrise} · 일몰 {sunTimes.sunset}
```

기존 모바일 METAR의 `/` 구분도 현재 화면 회귀를 피하기 위해 그대로 둔다.

**Step 5: 국내 공항 메타데이터에 공식 표고 추가**

`shared/airports.js`의 각 객체에 정수 `elevation_ft`를 추가한다.

| ICAO | elevation_ft |
| --- | ---: |
| RKSI | 23 |
| RKSS | 59 |
| RKPC | 118 |
| RKPK | 13 |
| RKTU | 192 |
| RKTN | 120 |
| RKTH | 75 |
| RKJB | 52 |
| RKJJ | 49 |
| RKJK | 29 |
| RKJY | 52 |
| RKNW | 330 |
| RKPS | 26 |
| RKPU | 43 |
| RKNY | 240 |

기존 객체와 전달 경로가 추가 속성을 보존하므로 별도 API 스키마나 fetch는 만들지 않는다.

**Step 6: focused test와 전체 frontend unit test 실행**

Run:

```bash
node --test \
  frontend/src/shared/weather/helpers.test.js \
  frontend/src/features/airport-panel/AirportPanel.test.js
npm --prefix frontend test
```

Expected: 모두 PASS.

**Step 7: 변경 범위 확인 후 Task 1 커밋**

Run:

```bash
git diff --check
git diff -- \
  shared/airports.js \
  frontend/src/shared/weather/helpers.js \
  frontend/src/shared/weather/helpers.test.js \
  frontend/src/features/monitoring/legacy/components/MetarCard.jsx \
  frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx \
  frontend/src/features/airport-panel/AirportPanel.test.js
git add \
  shared/airports.js \
  frontend/src/shared/weather/helpers.js \
  frontend/src/shared/weather/helpers.test.js \
  frontend/src/features/monitoring/legacy/components/MetarCard.jsx \
  frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx \
  frontend/src/features/airport-panel/AirportPanel.test.js
git commit -m "refactor: share airport sun times and elevations"
```

Expected: Task 1의 여섯 파일만 커밋되고 사용자 변경은 포함되지 않음.

---

### Task 2: 공항경보 위에 국내 공항 3열 스트립 표시

**Files:**

- Modify: `frontend/src/features/airport-panel/AirportPanel.jsx`
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`
- Modify: `frontend/src/features/airport-panel/AirportPanel.test.js`
- Modify: `frontend/src/features/airport-panel/lib/formatters.js`
- Modify: `frontend/verification/contracts/airport-panel.spec.mjs`

**Step 1: 기존 RKSI 상단을 세 viewport에서 캡처하고 이슈 기록**

사용자가 Playwright Chromium 실행을 승인한 뒤, 먼저 기존 `airport-panel` contract의 test callback에 `testInfo`를 받고 환경 변수가 있을 때만 패널 스크린샷을 남기는 작은 capture hook을 추가한다. 기존 locator 정책에 맞춰 패널 소유 클래스 범위로 캡처하고, 파일명에는 `testInfo.project.name`을 사용한다.

```js
const captureDir = process.env.PROJECTAMO_CAPTURE_DIR
if (captureDir) {
  await page.locator('.airport-panel').screenshot({
    path: `${captureDir}/${testInfo.project.name}-${process.env.PROJECTAMO_CAPTURE_LABEL || 'capture'}.png`,
  })
}
```

hook만 추가한 상태에서 UI 코드를 편집하기 전에 Run:

```bash
export AIRPORT_STRIP_CAPTURE_ROOT="artifacts/responsive-screenshots/airport-operations-strip/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$AIRPORT_STRIP_CAPTURE_ROOT/before" "$AIRPORT_STRIP_CAPTURE_ROOT/after" "$AIRPORT_STRIP_CAPTURE_ROOT/review"
PROJECTAMO_CAPTURE_DIR="$PWD/$AIRPORT_STRIP_CAPTURE_ROOT/before" \
PROJECTAMO_CAPTURE_LABEL=before \
npm run dev:contract -- airport-panel.spec.mjs
```

Expected: desktop, iPad landscape, mobile의 기존 RKSI 패널 상단 캡처가 `before/`에 생성됨.

같은 artifact 폴더에 다음을 남긴다.

- `README.md`: 캡처 시각, branch/commit, 세 viewport, RKSI 직접 링크, capture hook, 실행 명령
- `review/issues.md`: 현재 공항경보 상단의 정보 부재, 기존 잘림·가로 스크롤 여부, 운영 상태 가시성

read-only UI reviewer가 세 캡처를 확인하고 이슈를 기록한 뒤에만 CSS를 편집한다. 이 단계에서는 제품 코드를 바꾸지 않는다.

**Step 2: 배치·국내 전용 guard·표고 fallback의 실패 테스트 작성**

기존 source-level 회귀 테스트에서 `formatElevationFt`를 `./lib/formatters.js`로부터 import하고 다음 조건을 추가한다.

```js
test('AirportPanel places the domestic operations strip before warning sections', () => {
  const bodyIndex = source.indexOf('className="airport-panel-body"')
  const stripIndex = source.indexOf('<AirportOperationsStrip', bodyIndex)
  const sectionsIndex = source.indexOf('{sections.map((s) => {', bodyIndex)

  assert.ok(stripIndex > bodyIndex)
  assert.ok(stripIndex < sectionsIndex)
  assert.match(source, /if \(airport\?\.overseas\) return null/)
})

test('formats missing airport elevation with the shared panel fallback', () => {
  assert.equal(formatElevationFt(23), '23 ft')
  assert.equal(formatElevationFt(undefined), '-')
})
```

Run:

```bash
node --test frontend/src/features/airport-panel/AirportPanel.test.js
```

Expected: 표시 컴포넌트가 아직 없어 FAIL.

**Step 3: `AirportPanel.jsx` 안에 작은 표시 컴포넌트 추가**

새 파일이나 새 상태를 만들지 않고 같은 파일에 아래 책임만 가진 컴포넌트를 둔다.

```jsx
function AirportOperationsStrip({ airport, tz, now = new Date() }) {
  if (airport?.overseas) return null

  const { sunrise, sunset } = computeSunTimes(airport?.lat, airport?.lon, now, tz, 'KST')
  const elevation = formatElevationFt(airport?.elevation_ft)

  return (
    <div className="ap-operations-strip" role="group" aria-label="공항 운항정보">
      <span className="ap-operations-item">표고 {elevation}</span>
      <span className="ap-operations-item">
        <span aria-hidden="true">☀ </span>일출 {sunrise}
      </span>
      <span className="ap-operations-item">일몰 {sunset}</span>
    </div>
  )
}
```

`computeSunTimes`는 `../../shared/weather/helpers.js`에서 import한다. 기존 `./lib/formatters.js`에는 한 줄짜리 `formatElevationFt`를 추가하고 `AirportPanel.test.js`가 그 fallback을 직접 검증한다.

```js
export function formatElevationFt(value) {
  return Number.isFinite(value) ? `${value} ft` : '-'
}
```

공항 객체가 없는 경우 상위 `AirportPanel`이 이미 `null`을 반환하며, 좌표·표고 누락은 각각 공용 helper와 이 formatter에서 `-`로 처리한다.

`airport-panel-body`의 첫 자식으로 넣어 `공항경보`의 `<details id="sec-warn">`보다 앞에 둔다.

```jsx
<div className="airport-panel-body" ref={bodyRef}>
  <AirportOperationsStrip airport={airport} tz={tz} />
  {sections.map(/* 기존 코드 */)}
</div>
```

새 섹션, 탭, 레일 항목, 클릭 동작은 추가하지 않는다.

**Step 4: 기존 토큰으로 3열 CSS 작성**

`AirportPanel.css`의 `.airport-panel-body` 바로 아래에 필요한 스타일만 추가한다.

```css
.ap-operations-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: var(--space-xxl);
  padding-bottom: var(--space-s);
  border-bottom: 2px solid var(--stroke-2);
  color: var(--text-3);
  font-size: var(--fs-200);
  font-weight: var(--fw-medium);
}

.ap-operations-item {
  min-width: 0;
  text-align: center;
  white-space: nowrap;
}

.ap-operations-item + .ap-operations-item {
  border-left: 1px solid var(--stroke-2);
}
```

- 데스크톱·iPad·모바일 모두 같은 grid를 쓰며 1열 전환이나 가로 스크롤을 만들지 않는다.
- 세 viewport 모두 최소 `--fs-200`(12px)을 유지한다. 폭이 부족하면 폰트를 줄이지 않고 셀 내부 여백과 라벨 간격만 기존 spacing token 범위에서 조정한다.
- 위험색, 카드 배경, 아이콘 라이브러리, 애니메이션은 추가하지 않는다.

**Step 5: source-level test를 통과시킨 뒤 browser contract 확장**

Run:

```bash
node --test frontend/src/features/airport-panel/AirportPanel.test.js
```

Expected: PASS.

`frontend/verification/contracts/airport-panel.spec.mjs`의 기존 RKSI 직접 링크 흐름에 다음을 검증한다.

- `getByRole('group', { name: '공항 운항정보' })`가 보인다.
- `표고 23 ft`, `일출 HH:MM`, `일몰 HH:MM`가 보인다.
- computed `gridTemplateColumns`가 세 칸이다.
- 각 셀의 `scrollWidth <= clientWidth`라서 텍스트가 잘리지 않는다.
- 스트립의 다음 DOM 형제가 `sec-warn`이라 공항경보보다 먼저다.
- 패널 본문의 `scrollWidth <= clientWidth`라 새 가로 스크롤이 없다.
- `/?airport=RJAA` 직접 링크로 해외 공항패널이 열린 상태에서 `공항 운항정보` group이 0개다.

시간 값은 브라우저가 실행된 실제 날짜를 사용하므로 contract에서는 `HH:MM` 형식만 단언한다. 날짜 경계와 정확한 값은 Task 1의 고정 시각 unit test가 담당한다.

RJAA는 `frontend/public/data/navdata/airports-overseas.json`에서 로드되는 커밋된 deterministic 공항 메타데이터를 사용한다. 별도 mock이나 날씨 응답은 필요하지 않다. source-level guard와 실제 해외 direct-link 미표시를 함께 고정한다.

**Step 6: 빠른 브라우저 검증**

사용자가 Playwright 실행을 승인한 뒤 Run:

```bash
npm --prefix frontend run dev:contract:fast -- \
  contracts/airport-panel.spec.mjs \
  -g "opens the RKSI airport panel from its direct link"
```

Expected: desktop PASS.

같은 공용 helper를 import하는 모니터링의 런타임 회귀도 확인한다.

```bash
npm --prefix frontend run dev:contract:fast -- \
  contracts/monitoring.spec.mjs \
  -g "opens operations mode and switches to ground mode"
```

Expected: desktop PASS, 기존 일출·일몰 표시와 페이지 전환에 회귀 없음.

실패가 나면 반복 실행하지 않고 `superpowers:systematic-debugging`으로 저장된 trace와 DOM을 확인한다.

**Step 7: 전체 contract와 변경 후 시각 증거 검증**

Run:

```bash
npm --prefix frontend test
npm --prefix frontend run build
AIRPORT_STRIP_CAPTURE_ROOT="$(find artifacts/responsive-screenshots/airport-operations-strip -mindepth 1 -maxdepth 1 -type d -printf '%p\n' | sort | tail -1)"
test -n "$AIRPORT_STRIP_CAPTURE_ROOT"
PROJECTAMO_CAPTURE_DIR="$PWD/$AIRPORT_STRIP_CAPTURE_ROOT/after" \
PROJECTAMO_CAPTURE_LABEL=after \
npm run dev:contract -- airport-panel.spec.mjs monitoring.spec.mjs
graphify update .
git diff --check
```

Expected:

- frontend unit test PASS
- production build PASS
- `airport-panel`: desktop, iPad landscape, mobile 전부 PASS
- `monitoring`: desktop, iPad landscape 전부 PASS
- desktop, iPad landscape, mobile의 RKSI 변경 후 캡처가 `after/`에 생성됨
- graphify graph 갱신 성공
- whitespace/encoding 오류 없음

read-only UI reviewer에게 같은 viewport의 `before`와 `after` 이미지를 함께 제공해 잘림, 간격, 글자 크기, 경계선, 공항경보 우선순위, 가로 스크롤을 비교하게 한다. 결과를 `$AIRPORT_STRIP_CAPTURE_ROOT/review/issues.md`에 갱신하고, 발견된 범위 내 CSS 문제만 한 번에 수정한 뒤 영향 contract와 `after` 캡처를 다시 실행한다.

브라우저 결과는 `superpowers:verification-before-completion` 절차에 따라 실제 명령 출력으로 보고한다. embedded preview나 정적 source 확인만으로 완료를 선언하지 않는다.

**Step 8: 사용자 변경을 보존하며 Task 2 커밋**

`AirportPanel.css`는 기존 사용자 변경과 겹치므로 반드시 patch staging한다.

Run:

```bash
git add \
  frontend/src/features/airport-panel/AirportPanel.jsx \
  frontend/src/features/airport-panel/AirportPanel.test.js \
  frontend/src/features/airport-panel/lib/formatters.js \
  frontend/verification/contracts/airport-panel.spec.mjs
git add -p frontend/src/features/airport-panel/AirportPanel.css
git diff --cached --check
git diff --cached --stat
git commit -m "feat: show airport elevation and sun times"
```

Expected: 운항정보 스트립 관련 hunk만 커밋되고 `AirportPanel.css`의 선행 사용자 변경은 working tree에 남음.

---

## Completion Gate

- 승인 명세의 모든 항목이 Task 1 또는 Task 2에 대응한다.
- 새 API, 네트워크 요청, polling, localStorage, 의존성, 날짜 선택 UI가 없다.
- 공식 표고 15개와 고정 시각 일출 계산이 unit test로 고정된다.
- 국내 RKSI는 세 칸이 공항경보보다 먼저 보이고, 해외 RJAA 미표시와 누락 fallback이 코드와 테스트에 남는다.
- Playwright 관리 contract가 지정된 모든 viewport에서 통과한다.
- 같은 세 viewport의 전·후 패널 캡처, manifest, 시각 리뷰 이력이 ignored artifact 폴더에 남는다.
- `graphify update .` 이후 아키텍처 문서가 현실과 어긋나지 않으면 별도 문서 변경을 하지 않는다.
