# 터미널 사이니지 2안·3안 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 터미널 사이니지에 날씨 중심 화면 두 개(2안·3안)를 추가하고, 기존 레일 화면(옛 3안)을 지운다.

**Architecture:** 예보 데이터를 3일치로 늘리고 해외 주간예보를 새로 만든 뒤, 순수 함수 모듈 세 개(예보 띠·주간·목적지 프레임)를 먼저 세운다. 화면 두 개는 각자 별도 파일로 두어 나중에 한 안만 남길 때 파일 하나와 스위치 버튼 하나만 지우면 끝나게 한다. 1안(보드)의 로직과 화면은 건드리지 않는다.

**Tech Stack:** React 18 (함수형 컴포넌트 + 훅), 순수 CSS(`terminal.css`), Node 내장 테스트 러너(`node:test` + `node:assert/strict`), Playwright, Express 백엔드 프로세서.

## Global Constraints

- **Linux 전용.** `git` · `npm` · `node` · `graphify`를 리눅스 셸에서만 실행한다. PowerShell·`cmd.exe`·`C:\` 경로 금지.
- **테스트 러너는 `node --test`.** 프론트엔드 전체는 `npm --prefix frontend test`, 백엔드 전체는 `npm --prefix backend test`, 둘 다는 `npm test`.
- **한 파일만 돌릴 때는 `cd <프로젝트> && node --test <파일경로>`를 쓴다.** `npm test -- --test-name-pattern=…`은 이 저장소에서 필터가 먹지 않고 135개 파일을 전부 돌린다(확인함). 실패를 확인하는 단계에서는 반드시 해당 파일만 돌려야 무엇이 실패했는지 보인다.
- **테스트 이름은 한국어로 쓴다.** 기존 `terminalCanvasScale.test.js` · `terminalFlightSimulation.test.js`의 문체를 따른다.
- **주석은 한국어로, "왜"를 쓴다.** 기존 터미널 코드가 전부 그렇다. "무엇을 하는지"는 코드가 말한다.
- **한글 등 비ASCII 텍스트를 건드리는 편집 전에 [encoding safety](../../policies/encoding-safety.md)를 읽는다.**
- **MET Norway 출처 표시(`MET Norway (CC BY 4.0)`)를 화면에서 지우지 않는다.** 무료 이용 조건이다.
- **1안(`BoardScreen`과 그 CSS·테스트)을 바꾸지 않는다.** 기존 테스트 `DestinationWeatherPage.board-layout.test.js`가 계속 통과해야 한다.
- **코드 변경 후 `graphify update .`를 실행한다.**
- **화면에 보이는 변경은 Playwright 증거가 필요하다.** 내장 미리보기는 증거가 아니다. [browser verification](../../policies/verification/browser-verification.md)과 [dev-server 절차](../../operations/dev-server-and-capture.md)를 따른다.
- **예보 칸 값의 형식**: 시간별 칸은 `{ date: 'YYYYMMDD', time: 'HH00', temp, icon, ... }`. 국내·해외 모두 같다.
- **아이콘 어휘**: `sun` · `cloud` · `cloudy` · `rain` · `shower` · `snow` · `storm` · `null`.

---

## 사양서와 달라지는 점 (구현 전 확인 완료)

**목적지 정렬을 "정렬 한 줄 제거"로 하면 안 된다.** 사양서에 그렇게 적었으나 실제 코드를 보니 틀렸다.

`buildTerminalSimulation`의 `destinations` 배열은 이렇게 만들어진다.

```js
const destinations = [...grouped.entries()]
  .map(([code, flights], priority) => ({ code, flights, priority }))   // priority = 출발 시각순 등장 순서
  .sort((left, right) => right.flights.length - left.flights.length || left.priority - right.priority)
```

`priority`가 **정렬 전에** 매겨지므로 이미 시간순 번호다. 정렬을 지우면 1안의 프레임 묶기(`buildCompactFrames`)가 바뀌어 1안이 망가진다.

**따라서 공유 로직은 손대지 않고, 2안·3안이 `priority` 오름차순으로 다시 정렬해서 쓴다.** 백엔드 무변경, 1안 무영향, 코드도 더 짧다.

---

## 파일 구조

### 새로 만드는 파일

| 파일 | 책임 |
|---|---|
| `frontend/src/features/terminal/terminalForecastStrip.js` | 시간별 칸 목록 → 화면용 칸 뽑기. 2안용(3일 10칸)과 3안용(24시간 8칸) 두 가지 |
| `frontend/src/features/terminal/terminalForecastStrip.test.js` | 위 테스트 |
| `frontend/src/features/terminal/terminalWeeklyForecast.js` | 주간 5줄 만들기. 국내 자료는 형식만 맞추고, 해외는 `daily`에서 변환 |
| `frontend/src/features/terminal/terminalWeeklyForecast.test.js` | 위 테스트 |
| `frontend/src/features/terminal/terminalShared.jsx` | 세 안이 함께 쓰는 조각. 아이콘·로고·스위처·항공편 목록·현재날씨 블록. 화면 파일끼리 서로를 참조하지 않게 하는 유일한 통로다 |
| `frontend/src/features/terminal/WeatherFirstScreen.jsx` | 2안 화면 |
| `frontend/src/features/terminal/WeeklyWeatherScreen.jsx` | 3안 화면 |
| `backend/src/processors/overseas-daily.js` | 해외 시간별 → 하루 단위(`daily`) 변환. 프로세서에서 분리해 테스트 가능하게 둔다 |
| `backend/test/overseas-daily.test.js` | 위 테스트 |

### 고치는 파일

| 파일 | 무엇을 |
|---|---|
| `backend/src/processors/ground-forecast-processor.js` | `HOURLY_SLOT_COUNT` 24 → 72 |
| `backend/src/processors/overseas-forecast-processor.js` | 시간별 24 → 72칸, 강수량 추출, `daily` 붙이기 |
| `frontend/src/features/terminal/terminalFlightSimulation.js` | `buildDestinationFrames` 추가 (도시 1곳 + 최대 5편) |
| `frontend/src/features/terminal/terminalLiveData.js` | 출발공항 현재기온, 3일 예보, 주간 자료 노출 |
| `frontend/src/features/terminal/DestinationWeatherPage.jsx` | 2안·3안 연결, 레일 화면 삭제 |
| `frontend/src/features/terminal/terminal.css` | 2안·3안 구역 추가, 레일 구역 삭제 |

### 지우는 것

`DestinationWeatherPage.jsx`의 `RailScreen` · `RailRow` · `RailStats` · `ForecastTimeline` · `railMotionModes`, `terminal.css`의 `.exact-rail` · `.rail-*` · `.rail-motion-*`, 레일만 검사하는 테스트.

---

## Task 1: 국내 시간별 예보를 3일치로 늘린다

**Files:**
- Modify: `backend/src/processors/ground-forecast-processor.js:10`
- Test: `backend/test/ground-forecast-hourly.test.js` (없으면 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `/api/ground-forecast`의 `airports[icao].hourly`가 최대 72칸(1시간 간격 3일치)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/ground-forecast-hourly.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { extractHourlySlots } from '../src/processors/ground-forecast-processor.js'

// 동네예보 item을 흉내낸다. 기준 시각부터 hours 시간만큼 1시간 간격으로 만든다.
function villageItems(startIso, hours) {
  const items = []
  for (let index = 0; index < hours; index += 1) {
    const at = new Date(new Date(startIso).getTime() + index * 3600 * 1000)
    const pad = (value) => String(value).padStart(2, '0')
    const fcstDate = `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`
    const fcstTime = `${pad(at.getUTCHours())}00`
    items.push({ fcstDate, fcstTime, category: 'TMP', fcstValue: '20' })
    items.push({ fcstDate, fcstTime, category: 'POP', fcstValue: '30' })
    items.push({ fcstDate, fcstTime, category: 'SKY', fcstValue: '1' })
  }
  return items
}

test('시간별 예보를 3일치(72칸)까지 담는다', () => {
  // getKstShiftedDate가 KST로 9시간 민 값을 쓰므로, now도 같은 기준으로 넘긴다.
  const now = new Date('2026-08-04T00:00:00Z')
  const slots = extractHourlySlots(villageItems('2026-08-04T09:00:00Z', 80), now)
  assert.equal(slots.length, 72)
})

test('예보가 짧으면 있는 만큼만 담는다', () => {
  const now = new Date('2026-08-04T00:00:00Z')
  const slots = extractHourlySlots(villageItems('2026-08-04T09:00:00Z', 30), now)
  assert.equal(slots.length, 30)
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd backend && node --test test/ground-forecast-hourly.test.js`
Expected: FAIL — 72가 아니라 24가 나온다

- [ ] **Step 3: 상수를 바꾼다**

`backend/src/processors/ground-forecast-processor.js:10`:

```js
// 2안·3안 사이니지가 3일치 예보를 그린다. 단기예보는 원래 3일을 주는데 24칸에서 잘라 쓰고 있었다.
const HOURLY_SLOT_COUNT = 72
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm --prefix backend test`
Expected: PASS — 새 테스트 2개 통과, 기존 예보 테스트도 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add backend/src/processors/ground-forecast-processor.js backend/test/ground-forecast-hourly.test.js
git commit -m "feat(forecast): keep three days of domestic hourly slots"
```

---

## Task 2: 해외 시간별 예보에 강수량을 넣고 3일치로 늘린다

**Files:**
- Modify: `backend/src/processors/overseas-forecast-processor.js:68-87`
- Test: `backend/test/overseas-forecast-processor.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `extractOverseasSlots(payload, hours = 72)` → 칸마다 `{ date, time, temp, humidity, windSpeed, windDirection, precipitation, icon }`. `precipitation`은 mm(숫자) 또는 `null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/overseas-forecast-processor.test.js` 끝에 붙인다:

```js
test('강수량을 mm로 꺼낸다', () => {
  const payload = {
    properties: {
      timeseries: [{
        time: '2026-08-04T06:00:00Z',
        data: {
          instant: { details: { air_temperature: 24.4, wind_speed: 3.2, wind_from_direction: 180 } },
          next_1_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 1.4 } },
        },
      }],
    },
  }
  const [slot] = extractOverseasSlots(payload)
  assert.equal(slot.precipitation, 1.4)
})

test('강수량이 없으면 null로 둔다', () => {
  const payload = {
    properties: {
      timeseries: [{
        time: '2026-08-04T06:00:00Z',
        data: {
          instant: { details: { air_temperature: 24.4 } },
          next_1_hours: { summary: { symbol_code: 'clearsky_day' } },
        },
      }],
    },
  }
  const [slot] = extractOverseasSlots(payload)
  assert.equal(slot.precipitation, null)
})

test('기본으로 3일치(72칸)까지 담는다', () => {
  const timeseries = Array.from({ length: 90 }, (unused, index) => ({
    time: new Date(Date.UTC(2026, 7, 4, index)).toISOString(),
    data: { instant: { details: { air_temperature: 20 } } },
  }))
  assert.equal(extractOverseasSlots({ properties: { timeseries } }).length, 72)
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd backend && node --test test/overseas-forecast-processor.test.js`
Expected: FAIL — `precipitation`이 `undefined`, 칸 수가 24

- [ ] **Step 3: 추출 함수를 고친다**

`backend/src/processors/overseas-forecast-processor.js`의 `extractOverseasSlots`:

```js
export function extractOverseasSlots(payload, hours = 72) {
  const series = payload?.properties?.timeseries
  if (!Array.isArray(series)) return []

  return series.slice(0, hours).map((entry) => {
    const parts = kstParts(entry?.time)
    if (!parts) return null
    const details = entry?.data?.instant?.details || {}
    const nextHour = entry?.data?.next_1_hours
    const nextSixHours = entry?.data?.next_6_hours
    const symbol = nextHour?.summary?.symbol_code || nextSixHours?.summary?.symbol_code
    return {
      ...parts,
      temp: finite(details.air_temperature),
      humidity: finite(details.relative_humidity),
      windSpeed: finite(details.wind_speed),
      windDirection: finite(details.wind_from_direction),
      // 국내는 강수확률(POP)을 주지만 met.no는 주지 않는다. 대신 강수량을 쓴다.
      // 사이니지는 한 화면에 도시 하나만 띄우므로 한 줄 안에서 단위가 섞이지 않는다.
      precipitation: finite(nextHour?.details?.precipitation_amount)
        ?? finite(nextSixHours?.details?.precipitation_amount),
      icon: symbolToIcon(symbol),
    }
  }).filter((slot) => slot && slot.temp != null)
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm --prefix backend test`
Expected: PASS — 새 테스트 3개와 기존 해외예보 테스트 모두 통과

- [ ] **Step 5: 커밋한다**

```bash
git add backend/src/processors/overseas-forecast-processor.js backend/test/overseas-forecast-processor.test.js
git commit -m "feat(forecast): add precipitation and extend overseas hourly to three days"
```

---

## Task 3: 해외 주간예보(`daily`)를 만든다

**Files:**
- Create: `backend/src/processors/overseas-daily.js`
- Create: `backend/test/overseas-daily.test.js`
- Modify: `backend/src/processors/overseas-forecast-processor.js` (`process` 안에서 `daily` 붙이기)

**Interfaces:**
- Consumes: Task 2의 시간별 칸 `{ date, time, temp, precipitation, icon }`
- Produces: `buildOverseasDaily(hourly, { offsetMinutes = 0, days = 7 })` → `[{ date, dayOfWeek, am, pm, tempMin, tempMax }]`. `am`/`pm`은 `{ icon }` 또는 `null`. 국내 `forecast` 배열과 같은 모양이라 화면이 출처를 구분하지 않아도 된다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/overseas-daily.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOverseasDaily } from '../src/processors/overseas-daily.js'

// 하루치 칸을 만든다. rainHours에 든 시각만 비로 둔다.
function daySlots(date, { rainHours = [], temps = {} } = {}) {
  return Array.from({ length: 24 }, (unused, hour) => ({
    date,
    time: `${String(hour).padStart(2, '0')}00`,
    temp: temps[hour] ?? 20,
    precipitation: rainHours.includes(hour) ? 1.2 : 0,
    icon: rainHours.includes(hour) ? 'rain' : 'sun',
  }))
}

test('오전과 오후를 나눠 대표 날씨를 낸다', () => {
  const hourly = daySlots('20260805', { rainHours: [8] })
  const [day] = buildOverseasDaily(hourly, { days: 1 })
  assert.equal(day.am.icon, 'rain')
  assert.equal(day.pm.icon, 'sun')
})

test('한 칸만 비여도 그 구간은 비로 표시한다', () => {
  // 최빈값으로 뽑으면 6시간 중 1시간 비가 사라진다. 우산을 안 챙기게 되는 쪽 실수가 더 비싸다.
  const hourly = daySlots('20260805', { rainHours: [13] })
  const [day] = buildOverseasDaily(hourly, { days: 1 })
  assert.equal(day.pm.icon, 'rain')
})

test('하루 최저·최고기온은 그날 전체에서 뽑는다', () => {
  const hourly = daySlots('20260805', { temps: { 5: 21, 15: 33 } })
  const [day] = buildOverseasDaily(hourly, { days: 1 })
  assert.equal(day.tempMin, 21)
  assert.equal(day.tempMax, 33)
})

test('요일을 한국어로 붙인다', () => {
  const [day] = buildOverseasDaily(daySlots('20260805'), { days: 1 })
  assert.equal(day.dayOfWeek, '수')
})

test('현지 시차만큼 밀어서 오전·오후를 나눈다', () => {
  // 저장은 한국 시각이다. 베이징(-60분)에서 한국 12시는 현지 11시라 오전에 들어가야 한다.
  const hourly = daySlots('20260805', { rainHours: [12] })
  const [day] = buildOverseasDaily(hourly, { days: 1, offsetMinutes: -60 })
  assert.equal(day.am.icon, 'rain')
  assert.equal(day.pm.icon, 'sun')
})

test('자료가 없는 날은 만들지 않는다', () => {
  assert.deepEqual(buildOverseasDaily([], { days: 7 }), [])
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd backend && node --test test/overseas-daily.test.js`
Expected: FAIL — `Cannot find module '../src/processors/overseas-daily.js'`

- [ ] **Step 3: 변환 모듈을 만든다**

`backend/src/processors/overseas-daily.js`:

```js
/**
 * 해외 시간별 예보를 하루 단위로 묶는다.
 *
 * met.no는 하루 최저·최고나 오전/오후 구분을 주지 않는다. 기상청 중기예보는 주므로
 * 국내는 이 변환이 필요 없다. 화면이 출처를 구분하지 않도록 국내 `forecast` 배열과
 * 같은 모양(`date` · `dayOfWeek` · `am` · `pm` · `tempMin` · `tempMax`)으로 맞춘다.
 */

const DAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토']

// 나쁜 쪽이 이긴다. 6시간 중 1시간만 비여도 그날 그 구간은 비다.
const ICON_SEVERITY = { storm: 6, snow: 5, rain: 4, shower: 3, cloudy: 2, cloud: 1, sun: 0 }

function worstIcon(slots) {
  let worst = null
  for (const slot of slots) {
    if (!slot.icon) continue
    if (!worst || (ICON_SEVERITY[slot.icon] ?? 0) > (ICON_SEVERITY[worst] ?? 0)) worst = slot.icon
  }
  return worst ? { icon: worst } : null
}

function dayLabel(dateString) {
  const year = Number(dateString.slice(0, 4))
  const month = Number(dateString.slice(4, 6))
  const day = Number(dateString.slice(6, 8))
  return DAY_LABELS_KO[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] || ''
}

/**
 * 저장된 칸은 한국 시각이다. 오전·오후는 승객이 그곳에서 맞을 시간이라 현지 기준이어야 한다.
 * offsetMinutes는 한국 시각에 더해 현지 시각을 만드는 값(베이징 -60, 방콕 -120).
 */
function localParts(slot, offsetMinutes) {
  const year = Number(slot.date.slice(0, 4))
  const month = Number(slot.date.slice(4, 6))
  const day = Number(slot.date.slice(6, 8))
  const hour = Number(slot.time.slice(0, 2))
  const shifted = new Date(Date.UTC(year, month - 1, day, hour) + offsetMinutes * 60 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return {
    date: `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}`,
    hour: shifted.getUTCHours(),
  }
}

export function buildOverseasDaily(hourly, { offsetMinutes = 0, days = 7 } = {}) {
  if (!Array.isArray(hourly) || hourly.length === 0) return []

  const byDate = new Map()
  for (const slot of hourly) {
    if (!slot?.date || !slot?.time) continue
    const { date, hour } = localParts(slot, offsetMinutes)
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push({ ...slot, localHour: hour })
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .slice(0, days)
    .map(([date, slots]) => {
      const temperatures = slots.map((slot) => slot.temp).filter((value) => Number.isFinite(value))
      return {
        date,
        dayOfWeek: dayLabel(date),
        am: worstIcon(slots.filter((slot) => slot.localHour >= 6 && slot.localHour < 12)),
        pm: worstIcon(slots.filter((slot) => slot.localHour >= 12 && slot.localHour < 18)),
        tempMin: temperatures.length ? Math.round(Math.min(...temperatures)) : null,
        tempMax: temperatures.length ? Math.round(Math.max(...temperatures)) : null,
      }
    })
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd backend && node --test test/overseas-daily.test.js`
Expected: PASS — 6개 모두 통과

- [ ] **Step 5: 해외 공항 자료에 시차 정보가 있는지 확인한다**

Run: `node -e "const a=require('./frontend/public/data/navdata/airports-overseas.json'); console.log(JSON.stringify(Object.values(a)[0],null,1))"`

찾는 것: `timezone` · `utcOffset` · `tz` 같은 시차 필드.

- **있으면** Step 6에서 그 값을 분 단위로 바꿔 `offsetMinutes`에 넘긴다.
- **없으면** `offsetMinutes`를 넘기지 않는다(한국 시각 기준으로 묶임). 그리고 `process` 안에 아래 주석을 남긴다:

```js
// 해외공항 자료에 시차가 없어 한국 시각 기준으로 오전·오후를 나눈다.
// 시차 1시간(베이징)까지는 경계 칸 하나만 어긋난다. 시차가 큰 목적지가 늘면
// 공항 자료에 시차를 채우고 buildOverseasDaily에 offsetMinutes로 넘긴다.
```

- [ ] **Step 6: 프로세서에서 `daily`를 붙인다**

`backend/src/processors/overseas-forecast-processor.js`의 `process` 안, `result.airports[...]` 대입부:

```js
const hourly = await fetchForecast(airport)
if (hourly.length === 0) throw new Error('empty forecast')
result.airports[airport.icao] = {
  icao: airport.icao,
  hourly,
  daily: buildOverseasDaily(hourly, { offsetMinutes: overseasOffsetMinutes(airport) }),
}
```

파일 위쪽에 import를 넣는다:

```js
import { buildOverseasDaily } from './overseas-daily.js'
```

Step 5에서 시차 필드를 찾지 못했다면 `offsetMinutes` 인자를 통째로 빼고 주석만 남긴다. 찾았다면 그 필드를 분으로 바꾸는 한 줄짜리 `overseasOffsetMinutes`를 같은 파일에 둔다.

- [ ] **Step 7: 전체 백엔드 테스트를 돌린다**

Run: `npm --prefix backend test`
Expected: PASS

- [ ] **Step 8: 커밋한다**

```bash
git add backend/src/processors/overseas-daily.js backend/test/overseas-daily.test.js backend/src/processors/overseas-forecast-processor.js
git commit -m "feat(forecast): derive overseas daily am/pm summary from hourly slots"
```

---

## Task 4: 예보 띠 뽑기 모듈 (2안 3일 10칸)

**Files:**
- Create: `frontend/src/features/terminal/terminalForecastStrip.js`
- Create: `frontend/src/features/terminal/terminalForecastStrip.test.js`

**Interfaces:**
- Consumes: 시간별 칸 `{ date, time, temp, icon, rainProb?, precipitation? }`
- Produces:
  - `threeDayStrip(hourly, nowKst)` → `[{ group, label, icon, temp, precipValue, precipKind }]`
    `group`은 `'today'` · `'tomorrow'` · `'dayAfter'`. `precipKind`는 `'prob'`(국내) 또는 `'amount'`(해외)
  - `PRECIP_HIGHLIGHT_PROB = 60` — 주황 알약을 칠하는 강수확률 기준
  - `isPrecipHighlighted(cell)` → 불리언

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/terminal/terminalForecastStrip.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { threeDayStrip, isPrecipHighlighted } from './terminalForecastStrip.js'

// 기준 시각부터 1시간 간격으로 hours칸을 만든다. 국내(rainProb) 모양이다.
function hourlySlots(startDate, startHour, hours) {
  const slots = []
  for (let index = 0; index < hours; index += 1) {
    const at = new Date(Date.UTC(
      Number(startDate.slice(0, 4)),
      Number(startDate.slice(4, 6)) - 1,
      Number(startDate.slice(6, 8)),
      startHour + index,
    ))
    const pad = (value) => String(value).padStart(2, '0')
    slots.push({
      date: `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`,
      time: `${pad(at.getUTCHours())}00`,
      temp: 20 + (index % 5),
      rainProb: 10,
      icon: 'sun',
    })
  }
  return slots
}

test('오늘은 3시간 간격으로 최대 네 칸이다', () => {
  const strip = threeDayStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  const today = strip.filter((cell) => cell.group === 'today')
  assert.deepEqual(today.map((cell) => cell.label), ['15시', '18시', '21시', '24시'])
})

test('내일과 모레는 오전·오후·밤 세 칸씩이다', () => {
  const strip = threeDayStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  assert.deepEqual(
    strip.filter((cell) => cell.group === 'tomorrow').map((cell) => cell.label),
    ['오전', '오후', '밤'],
  )
  assert.deepEqual(
    strip.filter((cell) => cell.group === 'dayAfter').map((cell) => cell.label),
    ['오전', '오후', '밤'],
  )
})

test('밤 늦은 시간에는 오늘 칸이 줄어든다', () => {
  const strip = threeDayStrip(hourlySlots('20260804', 22, 60), { date: '20260804', hour: 22 })
  const today = strip.filter((cell) => cell.group === 'today')
  assert.deepEqual(today.map((cell) => cell.label), ['24시'])
})

test('국내는 강수확률, 해외는 강수량으로 읽는다', () => {
  const domestic = threeDayStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  assert.equal(domestic[0].precipKind, 'prob')

  const overseas = hourlySlots('20260804', 13, 72).map((slot) => {
    const { rainProb, ...rest } = slot
    return { ...rest, precipitation: 0.4 }
  })
  const strip = threeDayStrip(overseas, { date: '20260804', hour: 13 })
  assert.equal(strip[0].precipKind, 'amount')
  assert.equal(strip[0].precipValue, 0.4)
})

test('강수확률 60% 이상이면 강조한다', () => {
  assert.equal(isPrecipHighlighted({ precipKind: 'prob', precipValue: 60 }), true)
  assert.equal(isPrecipHighlighted({ precipKind: 'prob', precipValue: 59 }), false)
  assert.equal(isPrecipHighlighted({ precipKind: 'amount', precipValue: 0.2 }), true)
  assert.equal(isPrecipHighlighted({ precipKind: 'amount', precipValue: 0 }), false)
})

test('예보가 없으면 빈 배열을 준다', () => {
  assert.deepEqual(threeDayStrip([], { date: '20260804', hour: 13 }), [])
  assert.deepEqual(threeDayStrip(null, { date: '20260804', hour: 13 }), [])
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalForecastStrip.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 모듈을 만든다**

`frontend/src/features/terminal/terminalForecastStrip.js`:

```js
/**
 * 시간별 예보 칸(최대 72개)에서 화면에 그릴 칸만 뽑는다.
 *
 * 2안은 오늘·내일·모레 세 구간으로, 3안은 앞으로 24시간을 3시간 간격으로 이어 붙인다.
 * 두 화면이 같은 자료에서 다르게 뽑는 것뿐이라 한 파일에 둔다.
 */

/** 강수확률이 이 값 이상이면 주황 알약으로 칠한다. 실제 화면을 보고 조정할 수 있게 상수로 둔다. */
export const PRECIP_HIGHLIGHT_PROB = 60

const HOUR_STEP = 3
const TODAY_MAX_CELLS = 4
// 내일·모레를 대표하는 시각. 오전은 활동 시작, 오후는 기온이 가장 높을 때, 밤은 귀가 시간.
const DAY_PART_HOURS = [['오전', 9], ['오후', 15], ['밤', 21]]

function hourOf(slot) {
  return Number(String(slot?.time || '').slice(0, 2))
}

function precipOf(slot) {
  // 국내(기상청)는 강수확률, 해외(met.no)는 강수량. 한 화면은 도시 하나만 띄우므로 섞이지 않는다.
  if (Number.isFinite(slot?.rainProb)) return { precipKind: 'prob', precipValue: slot.rainProb }
  if (Number.isFinite(slot?.precipitation)) return { precipKind: 'amount', precipValue: slot.precipitation }
  return { precipKind: null, precipValue: null }
}

function toCell(slot, group, label) {
  return { group, label, icon: slot.icon || null, temp: Math.round(slot.temp), ...precipOf(slot) }
}

export function isPrecipHighlighted(cell) {
  if (!cell || !Number.isFinite(cell.precipValue)) return false
  return cell.precipKind === 'prob' ? cell.precipValue >= PRECIP_HIGHLIGHT_PROB : cell.precipValue > 0
}

function addDays(dateString, days) {
  const at = new Date(Date.UTC(
    Number(dateString.slice(0, 4)),
    Number(dateString.slice(4, 6)) - 1,
    Number(dateString.slice(6, 8)) + days,
  ))
  const pad = (value) => String(value).padStart(2, '0')
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`
}

/**
 * 2안용. 오늘은 지금 이후 3시간 간격으로 자정까지 최대 네 칸,
 * 내일·모레는 오전(09시)·오후(15시)·밤(21시) 세 칸씩.
 * 밤 늦은 시간에는 오늘 칸이 줄고 남은 폭을 내일·모레가 나눠 가진다.
 */
export function threeDayStrip(hourly, nowKst) {
  if (!Array.isArray(hourly) || hourly.length === 0 || !nowKst?.date) return []
  const byDate = new Map()
  for (const slot of hourly) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, [])
    byDate.get(slot.date).push(slot)
  }

  const cells = []
  const todaySlots = byDate.get(nowKst.date) || []
  // 지금 이후 첫 3의 배수 시각부터 시작한다. 13시면 15시, 15시면 18시.
  for (let hour = (Math.floor(nowKst.hour / HOUR_STEP) + 1) * HOUR_STEP; hour <= 24; hour += HOUR_STEP) {
    if (cells.length >= TODAY_MAX_CELLS) break
    // 24시는 자정이라 같은 날 칸이 없다. 다음 날 00시 칸을 24시로 보여준다.
    const slot = hour === 24
      ? (byDate.get(addDays(nowKst.date, 1)) || []).find((entry) => hourOf(entry) === 0)
      : todaySlots.find((entry) => hourOf(entry) === hour)
    if (slot) cells.push(toCell(slot, 'today', `${hour}시`))
  }

  for (const [offset, group] of [[1, 'tomorrow'], [2, 'dayAfter']]) {
    const slots = byDate.get(addDays(nowKst.date, offset)) || []
    for (const [label, hour] of DAY_PART_HOURS) {
      const slot = slots.find((entry) => hourOf(entry) === hour)
      if (slot) cells.push(toCell(slot, group, label))
    }
  }

  return cells
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalForecastStrip.test.js`
Expected: PASS — 6개 통과

- [ ] **Step 5: 커밋한다**

```bash
git add frontend/src/features/terminal/terminalForecastStrip.js frontend/src/features/terminal/terminalForecastStrip.test.js
git commit -m "feat(terminal): add three-day forecast strip selection"
```

---

## Task 5: 예보 띠 뽑기 — 3안 24시간 8칸

**Files:**
- Modify: `frontend/src/features/terminal/terminalForecastStrip.js`
- Modify: `frontend/src/features/terminal/terminalForecastStrip.test.js`

**Interfaces:**
- Consumes: Task 4의 `precipOf` · `toCell` · `hourOf` (같은 파일 안)
- Produces: `dayCycleStrip(hourly, nowKst)` → 항상 최대 8칸. 각 칸은 `{ label, icon, temp, precipValue, precipKind }`. `group`은 없다

- [ ] **Step 1: 실패하는 테스트를 붙인다**

`terminalForecastStrip.test.js` 끝에:

```js
import { dayCycleStrip } from './terminalForecastStrip.js'

test('앞으로 24시간을 3시간 간격 여덟 칸으로 잇는다', () => {
  const strip = dayCycleStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  assert.deepEqual(
    strip.map((cell) => cell.label),
    ['15시', '18시', '21시', '0시', '3시', '6시', '9시', '12시'],
  )
})

test('자정을 구분선 없이 그냥 넘어간다', () => {
  // 3안은 날짜를 나누지 않는다. 기온 곡선이 끊기지 않아야 하루의 오르내림이 보인다.
  const strip = dayCycleStrip(hourlySlots('20260804', 22, 40), { date: '20260804', hour: 22 })
  assert.equal(strip.length, 8)
  assert.equal(strip[0].label, '0시')
})

test('예보가 모자라면 있는 칸까지만 준다', () => {
  const strip = dayCycleStrip(hourlySlots('20260804', 13, 10), { date: '20260804', hour: 13 })
  assert.equal(strip.length, 3)
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalForecastStrip.test.js`
Expected: FAIL — `dayCycleStrip` 없음

- [ ] **Step 3: 함수를 추가한다**

`terminalForecastStrip.js` 끝에:

```js
const DAY_CYCLE_CELLS = 8

/**
 * 3안용. 앞으로 24시간을 3시간 간격 여덟 칸으로 잇는다.
 * 자정에 구분선을 두지 않아 기온 꺾은선이 하루의 오르내림을 끊기지 않고 보여준다.
 * 칸 수가 시각에만 달렸고 도시와 무관해서, 도시가 바뀌어도 칸 폭이 변하지 않는다.
 */
export function dayCycleStrip(hourly, nowKst) {
  if (!Array.isArray(hourly) || hourly.length === 0 || !nowKst?.date) return []
  const startHour = (Math.floor(nowKst.hour / HOUR_STEP) + 1) * HOUR_STEP
  const cells = []
  for (let step = 0; step < DAY_CYCLE_CELLS; step += 1) {
    const absoluteHour = startHour + step * HOUR_STEP
    const date = addDays(nowKst.date, Math.floor(absoluteHour / 24))
    const hour = absoluteHour % 24
    const slot = hourly.find((entry) => entry.date === date && hourOf(entry) === hour)
    if (!slot) break
    cells.push({ label: `${hour}시`, icon: slot.icon || null, temp: Math.round(slot.temp), ...precipOf(slot) })
  }
  return cells
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalForecastStrip.test.js`
Expected: PASS — 3개 통과

- [ ] **Step 5: 커밋한다**

```bash
git add frontend/src/features/terminal/terminalForecastStrip.js frontend/src/features/terminal/terminalForecastStrip.test.js
git commit -m "feat(terminal): add 24-hour forecast strip for option three"
```

---

## Task 6: 주간 5줄 만들기

**Files:**
- Create: `frontend/src/features/terminal/terminalWeeklyForecast.js`
- Create: `frontend/src/features/terminal/terminalWeeklyForecast.test.js`

**Interfaces:**
- Consumes: 국내 `groundForecast.airports[icao].forecast`(=`days`) 또는 해외 `overseasForecast.airports[icao].daily`. 둘 다 `{ date, dayOfWeek, am, pm, tempMin, tempMax }`
- Produces: `weeklyRows(days, todayDate, count = 5)` → 정확히 `count`개. 자료가 없는 자리는 `{ empty: true }`. 값이 있는 자리는 `{ empty: false, dayOfWeek, monthDay, amIcon, pmIcon, tempMin, tempMax }`. `monthDay`는 `'8/5'` 형식

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/terminal/terminalWeeklyForecast.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { weeklyRows } from './terminalWeeklyForecast.js'

const days = [
  { date: '20260804', dayOfWeek: '화', am: { icon: 'sun' }, pm: { icon: 'sun' }, tempMin: 26, tempMax: 32 },
  { date: '20260805', dayOfWeek: '수', am: { icon: 'rain' }, pm: { icon: 'cloud' }, tempMin: 25, tempMax: 29 },
  { date: '20260806', dayOfWeek: '목', am: { icon: 'cloud' }, pm: { icon: 'sun' }, tempMin: 26, tempMax: 30 },
  { date: '20260807', dayOfWeek: '금', am: { icon: 'sun' }, pm: { icon: 'sun' }, tempMin: 27, tempMax: 33 },
  { date: '20260808', dayOfWeek: '토', am: { icon: 'sun' }, pm: { icon: 'sun' }, tempMin: 28, tempMax: 34 },
  { date: '20260809', dayOfWeek: '일', am: { icon: 'cloud' }, pm: { icon: 'cloud' }, tempMin: 27, tempMax: 31 },
]

test('오늘은 빼고 내일부터 다섯 줄을 만든다', () => {
  // 오늘은 왼쪽 시간별에 이미 다 들어 있다. 넣으면 같은 값을 두 번 보여주게 된다.
  const rows = weeklyRows(days, '20260804')
  assert.equal(rows.length, 5)
  assert.deepEqual(rows.map((row) => row.dayOfWeek), ['수', '목', '금', '토', '일'])
})

test('날짜를 월/일로 줄인다', () => {
  assert.equal(weeklyRows(days, '20260804')[0].monthDay, '8/5')
})

test('오전·오후 아이콘과 최저·최고기온을 짝지어 넘긴다', () => {
  const [first] = weeklyRows(days, '20260804')
  assert.equal(first.amIcon, 'rain')
  assert.equal(first.pmIcon, 'cloud')
  assert.equal(first.tempMin, 25)
  assert.equal(first.tempMax, 29)
})

test('자료가 모자라면 빈 줄로 자리를 채운다', () => {
  // 줄 수가 도시마다 달라지면 전환 중 아래 요소를 밀어 글자가 겹친다.
  const rows = weeklyRows(days.slice(0, 3), '20260804')
  assert.equal(rows.length, 5)
  assert.equal(rows[2].empty, true)
  assert.equal(rows[0].empty, false)
})

test('자료가 없어도 다섯 줄을 준다', () => {
  const rows = weeklyRows(null, '20260804')
  assert.equal(rows.length, 5)
  assert.ok(rows.every((row) => row.empty))
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalWeeklyForecast.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 모듈을 만든다**

`frontend/src/features/terminal/terminalWeeklyForecast.js`:

```js
/**
 * 3안 오른쪽 주간 칸에 그릴 다섯 줄을 만든다.
 *
 * 국내는 기상청이 오전·오후를 따로 주므로 형식만 맞추면 되고,
 * 해외는 백엔드(overseas-daily.js)가 시간별에서 같은 모양으로 만들어 둔다.
 * 그래서 여기서는 출처를 구분하지 않는다.
 */

export const WEEKLY_ROW_COUNT = 5

const EMPTY_ROW = Object.freeze({ empty: true })

function monthDay(dateString) {
  return `${Number(dateString.slice(4, 6))}/${Number(dateString.slice(6, 8))}`
}

export function weeklyRows(days, todayDate, count = WEEKLY_ROW_COUNT) {
  const upcoming = (Array.isArray(days) ? days : [])
    .filter((day) => day?.date && day.date > todayDate)
    .sort((left, right) => (left.date < right.date ? -1 : 1))
    .slice(0, count)

  // 줄 수를 항상 같게 유지한다. 도시마다 줄 수가 달라지면 전환 중 자리가 밀려 글자가 겹친다.
  return Array.from({ length: count }, (unused, index) => {
    const day = upcoming[index]
    if (!day) return EMPTY_ROW
    return {
      empty: false,
      dayOfWeek: day.dayOfWeek || '',
      monthDay: monthDay(day.date),
      amIcon: day.am?.icon || null,
      pmIcon: day.pm?.icon || null,
      tempMin: Number.isFinite(day.tempMin) ? Math.round(day.tempMin) : null,
      tempMax: Number.isFinite(day.tempMax) ? Math.round(day.tempMax) : null,
    }
  })
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalWeeklyForecast.test.js`
Expected: PASS — 5개 통과

- [ ] **Step 5: 커밋한다**

```bash
git add frontend/src/features/terminal/terminalWeeklyForecast.js frontend/src/features/terminal/terminalWeeklyForecast.test.js
git commit -m "feat(terminal): build weekly forecast rows for option three"
```

---

## Task 7: 도시 단위 프레임 만들기

**Files:**
- Modify: `frontend/src/features/terminal/terminalFlightSimulation.js` (`buildCompactFrames` 아래에 추가)
- Modify: `frontend/src/features/terminal/terminalFlightSimulation.test.js`

**Interfaces:**
- Consumes: `buildTerminalSimulation(icao, options)`가 내주는 `simulation.destinations` — `[{ code, flights, priority }]`. `priority`는 **정렬 전에 매겨진 출발 시각순 번호**다
- Produces:
  - `buildDestinationFrames(destinations, capacity = 5)` → `[{ code, flights, page, pageCount, destinationIndex }]`
  - `destinationFrameAt(frames, cursor)` → `{ frameIndex, frameCount, frame }`

- [ ] **Step 1: 실패하는 테스트를 붙인다**

`terminalFlightSimulation.test.js` 끝에:

```js
import { buildDestinationFrames } from './terminalFlightSimulation.js'

function destination(code, flightCount, priority) {
  return {
    code,
    priority,
    flights: Array.from({ length: flightCount }, (unused, index) => ({ flight: `${code}${index}` })),
  }
}

test('도시 하나가 프레임 하나가 된다', () => {
  const frames = buildDestinationFrames([destination('CJU', 3, 0), destination('KIX', 1, 1)])
  assert.equal(frames.length, 2)
  assert.deepEqual(frames.map((frame) => frame.code), ['CJU', 'KIX'])
})

test('출발 시각순으로 돈다', () => {
  // buildTerminalSimulation은 편 수 순으로 정렬해 넘긴다(1안이 세 칸을 채워야 해서).
  // 2안·3안은 priority(등장 순서 = 출발 시각순)로 되돌려 쓴다.
  const frames = buildDestinationFrames([destination('CJU', 5, 0), destination('KIX', 1, 1), destination('PKX', 1, 2)])
  assert.deepEqual(frames.map((frame) => frame.code), ['CJU', 'KIX', 'PKX'])
})

test('편이 여섯 편 이상이면 같은 도시를 나눠 넘긴다', () => {
  const frames = buildDestinationFrames([destination('CJU', 8, 0)])
  assert.equal(frames.length, 2)
  assert.equal(frames[0].flights.length, 5)
  assert.equal(frames[1].flights.length, 3)
  assert.deepEqual(frames.map((frame) => frame.page), [1, 2])
  assert.equal(frames[0].pageCount, 2)
})

test('나뉜 도시는 연달아 나온다', () => {
  // 제주(1/2) → 오사카 → 제주(2/2)로 흩어지면 승객이 읽던 목록을 잃는다.
  const frames = buildDestinationFrames([destination('CJU', 7, 0), destination('KIX', 1, 1)])
  assert.deepEqual(frames.map((frame) => frame.code), ['CJU', 'CJU', 'KIX'])
})

test('목적지가 없으면 빈 배열을 준다', () => {
  assert.deepEqual(buildDestinationFrames([]), [])
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalFlightSimulation.test.js`
Expected: FAIL — `buildDestinationFrames` 없음

- [ ] **Step 3: 함수를 추가한다**

`terminalFlightSimulation.js`의 `buildCompactFrames` 아래:

```js
/** 2안·3안의 한 프레임에 들어가는 항공편 줄 수. 자리 고정을 위해 화면도 이 값만큼 줄을 잡는다. */
export const DESTINATION_FRAME_CAPACITY = 5

/**
 * 2안·3안용 프레임. 한 프레임에 도시 하나와 그 도시로 가는 편 최대 다섯 편이 들어간다.
 *
 * `destinations`는 1안을 위해 편 수 순으로 정렬되어 오지만, 그 배열의 `priority`는
 * 정렬 전에 매겨진 출발 시각순 번호다. 여기서 그 번호로 되돌려 쓴다. 공유 정렬을 바꾸면
 * 1안의 프레임 묶기가 달라지므로 건드리지 않는다.
 *
 * 편이 여섯 편 이상인 도시는 같은 도시를 연달아 두 프레임으로 나눈다. 다른 도시 뒤로 흩어지면
 * 승객이 읽던 목록을 잃는다. 날씨는 그대로 두고 목록만 넘어가므로 시선도 편하다.
 */
export function buildDestinationFrames(destinations, capacity = DESTINATION_FRAME_CAPACITY) {
  if (!Array.isArray(destinations) || destinations.length === 0) return []

  const frames = []
  const ordered = [...destinations].sort((left, right) => left.priority - right.priority)
  ordered.forEach((destination, destinationIndex) => {
    const flights = destination.flights || []
    const pageCount = Math.max(1, Math.ceil(flights.length / capacity))
    for (let page = 0; page < pageCount; page += 1) {
      frames.push({
        ...destination,
        destinationIndex,
        flights: flights.slice(page * capacity, (page + 1) * capacity),
        page: page + 1,
        pageCount,
      })
    }
  })
  return frames
}

export function destinationFrameAt(frames, cursor) {
  const safeCursor = Math.max(0, Number(cursor) || 0)
  const frameCount = Math.max(1, frames.length)
  const frameIndex = frames.length ? safeCursor % frames.length : 0
  return { frameIndex, frameCount, frame: frames[frameIndex] || null }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm --prefix frontend test`
Expected: PASS — 새 테스트 5개와 기존 시뮬레이션 테스트 전부 통과 (기존 로직을 건드리지 않았으므로)

- [ ] **Step 5: 커밋한다**

```bash
git add frontend/src/features/terminal/terminalFlightSimulation.js frontend/src/features/terminal/terminalFlightSimulation.test.js
git commit -m "feat(terminal): build one-destination frames for weather-first screens"
```

---

## Task 8: 출발지 기온차와 3일 예보를 화면에 올린다

**Files:**
- Modify: `frontend/src/features/terminal/terminalLiveData.js`
- Modify: `frontend/src/features/terminal/terminalLiveData.test.js`

**Interfaces:**
- Consumes: `loadTerminalLiveWeatherData()`의 결과 — `{ airportCatalog, metar, metarOverseas, amos, groundForecast, overseasForecast, flights }`
- Produces:
  - `airportTemperature(liveData, icao)` → 섭씨 숫자 또는 `null`. AMOS 우선, 없으면 METAR
  - `temperatureGap(departureTemp, destinationTemp)` → `{ value, sign }` 또는 `null`. **2도 미만이면 `null`**
  - `destinationHourly(liveData, icao)` → 시간별 칸 배열(국내 우선, 없으면 해외) 또는 `[]`
  - `destinationDailyDays(liveData, icao)` → 주간 자료 배열(국내 `forecast`, 해외 `daily`) 또는 `[]`

- [ ] **Step 1: 실패하는 테스트를 붙인다**

`terminalLiveData.test.js` 끝에:

```js
import { airportTemperature, temperatureGap, destinationHourly, destinationDailyDays } from './terminalLiveData.js'

const liveData = {
  amos: { airports: { RKSS: { weather: { temperature_c: 28 } } } },
  metar: { airports: { RKPC: { observation: { temperature: { air: 32 } } } } },
  groundForecast: { airports: { RKPC: { hourly: [{ date: '20260804', time: '1500', temp: 34 }], forecast: [{ date: '20260805' }] } } },
  overseasForecast: { airports: { RJBB: { hourly: [{ date: '20260804', time: '1500', temp: 31 }], daily: [{ date: '20260805' }] } } },
}

test('출발 공항 기온은 AMOS를 먼저 쓴다', () => {
  assert.equal(airportTemperature(liveData, 'RKSS'), 28)
})

test('AMOS가 없으면 METAR 기온을 쓴다', () => {
  assert.equal(airportTemperature(liveData, 'RKPC'), 32)
})

test('관측이 없으면 null이다', () => {
  assert.equal(airportTemperature(liveData, 'RKPU'), null)
})

test('기온차가 2도 미만이면 표시하지 않는다', () => {
  // 자리는 유지하고 내용만 비운다. +0°는 공간만 먹고 읽을 게 없다.
  assert.equal(temperatureGap(28, 29), null)
  assert.equal(temperatureGap(28, 26.5), null)
})

test('기온차가 2도 이상이면 부호와 함께 준다', () => {
  assert.deepEqual(temperatureGap(28, 32), { value: 4, sign: '+' })
  assert.deepEqual(temperatureGap(32, 28), { value: 4, sign: '-' })
})

test('한쪽 관측이 없으면 기온차도 없다', () => {
  assert.equal(temperatureGap(null, 32), null)
  assert.equal(temperatureGap(28, null), null)
})

test('국내 목적지는 기상청 시간별을, 해외는 met.no를 쓴다', () => {
  assert.equal(destinationHourly(liveData, 'RKPC')[0].temp, 34)
  assert.equal(destinationHourly(liveData, 'RJBB')[0].temp, 31)
  assert.deepEqual(destinationHourly(liveData, 'RKPU'), [])
})

test('주간 자료는 국내 forecast와 해외 daily에서 온다', () => {
  assert.equal(destinationDailyDays(liveData, 'RKPC')[0].date, '20260805')
  assert.equal(destinationDailyDays(liveData, 'RJBB')[0].date, '20260805')
  assert.deepEqual(destinationDailyDays(liveData, 'RKPU'), [])
})
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd frontend && node --test src/features/terminal/terminalLiveData.test.js`
Expected: FAIL — 함수들이 없음

- [ ] **Step 3: 함수를 추가한다**

`terminalLiveData.js` 끝에:

```js
/** 기온차를 표시하는 최소 차이(도). 이보다 작으면 자리는 두고 내용만 비운다. */
export const TEMPERATURE_GAP_MIN = 2

/** 공항 하나의 현재 기온. 목적지에 쓰던 경로를 출발 공항에도 그대로 쓴다. */
export function airportTemperature(liveData, icao) {
  const amosRecord = sourceAirportRecord(liveData?.amos, icao)
  const amosTemp = finiteNumber(amosRecord?.weather?.temperature_c)
  if (amosTemp != null) return amosTemp
  const metarRecord = sourceAirportRecord(liveData?.metar, icao)
    || sourceAirportRecord(liveData?.metarOverseas, icao)
  return finiteNumber(metarRecord?.observation?.temperature?.air)
}

/**
 * "김포보다 +4°". 둘 다 관측값이라 같은 기준으로 비교된다.
 * 차이가 작으면 숨긴다 - `+0°`는 공간만 먹고 승객이 읽을 게 없다.
 */
export function temperatureGap(departureTemp, destinationTemp) {
  if (!Number.isFinite(departureTemp) || !Number.isFinite(destinationTemp)) return null
  const difference = Math.round(destinationTemp - departureTemp)
  if (Math.abs(difference) < TEMPERATURE_GAP_MIN) return null
  return { value: Math.abs(difference), sign: difference > 0 ? '+' : '-' }
}

/** 목적지 시간별 예보. 국내(기상청)를 먼저 보고 없으면 해외(met.no)를 본다. */
export function destinationHourly(liveData, icao) {
  const domestic = sourceAirportRecord(liveData?.groundForecast, icao)?.hourly
  if (Array.isArray(domestic) && domestic.length > 0) return domestic
  const overseas = sourceAirportRecord(liveData?.overseasForecast, icao)?.hourly
  return Array.isArray(overseas) ? overseas : []
}

/** 목적지 주간 예보. 국내는 기상청이 만든 `forecast`, 해외는 백엔드가 만든 `daily`. */
export function destinationDailyDays(liveData, icao) {
  const domestic = sourceAirportRecord(liveData?.groundForecast, icao)?.forecast
  if (Array.isArray(domestic) && domestic.length > 0) return domestic
  const overseas = sourceAirportRecord(liveData?.overseasForecast, icao)?.daily
  return Array.isArray(overseas) ? overseas : []
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm --prefix frontend test`
Expected: PASS — 새 테스트 8개와 기존 테스트 전부 통과

- [ ] **Step 5: 커밋한다**

```bash
git add frontend/src/features/terminal/terminalLiveData.js frontend/src/features/terminal/terminalLiveData.test.js
git commit -m "feat(terminal): expose departure temperature gap and three-day forecast"
```

---

## Task 9: 2안 화면을 만든다

**Files:**
- Create: `frontend/src/features/terminal/WeatherFirstScreen.jsx`
- Create: `frontend/src/features/terminal/terminalShared.jsx` (1안·2안·3안이 함께 쓰는 조각)
- Modify: `frontend/src/features/terminal/terminal.css` (파일 끝에 `/* ===== 2안 ===== */` 구역 추가)
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx` (공용 조각을 옮기고 `terminalShared.jsx`에서 import)

**Interfaces:**
- Consumes: Task 4의 `threeDayStrip` · `isPrecipHighlighted`, Task 7의 `buildDestinationFrames` · `destinationFrameAt` · `DESTINATION_FRAME_CAPACITY`, Task 8의 `airportTemperature` · `temperatureGap` · `destinationHourly`
- Produces: `export default function WeatherFirstScreen(props)`. props는 아래 목록 그대로

```
frame              // { code, flights, page, pageCount, destinationIndex }
destinations       // [{ code, city }] — 머리띠 순환 표시용, priority 순서
destinationIndex   // 지금 몇 번째 도시인지
departureName      // '김포'
departureTemp      // 숫자 또는 null
hourly             // 시간별 칸 배열
nowKst             // { date: 'YYYYMMDD', hour: 13 }
transitioning      // 불리언
motionMode         // 'cascade' | 'flap' | 'roll' | 'wipe' | 'fade'
onSelectMotion, onSelectView, onReplay, hasNext
clock, departureAirports, departureAirportIcao, onSelectDepartureAirport
```

- [ ] **Step 1: 공용 조각을 `terminalShared.jsx`로 옮긴다**

`DestinationWeatherPage.jsx`에 `export`만 붙이면 **순환 참조가 생긴다** — `DestinationWeatherPage`가 `WeatherFirstScreen`을 부르고, `WeatherFirstScreen`이 다시 `DestinationWeatherPage`에서 조각을 가져온다. ES 모듈이 버티기는 하지만 평가 순서에 기대는 구조라 깨지기 쉽고, 나중에 안을 하나 지울 때도 걸린다.

**새 파일 `frontend/src/features/terminal/terminalShared.jsx`를 만들어 아래를 통째로 옮긴다.** 구현은 한 글자도 바꾸지 않는다.

- `WeatherIcon` · `BoardWeatherImage` · `WeatherCondition`
- `AirlineLogo` · `withCodeshare`
- `TerminalEmptyState` · `TerminalTitle` · `AgencyMascot` · `ScreenFooterNote`
- `ViewSwitcher` · `MotionModeSwitcher` · `DepartureAirportSelect` · `TerminalSettings` · `HeaderWeatherPanel` · `PageIndicator`
- `displayTemperature` · `formatKoreanClock` · `splitArrivalKst` · `UNDECIDED_VALUES` · `GATE_CHANGED_STATUS`

`DestinationWeatherPage.jsx`는 이 파일에서 import 해서 쓴다. 화살표는 한 방향으로만 흐른다:

```
terminalShared.jsx  ←  DestinationWeatherPage.jsx (1안)
                    ←  WeatherFirstScreen.jsx     (2안)
                    ←  WeeklyWeatherScreen.jsx    (3안)
```

`MotionModeSwitcher`의 기본 `modes`와 `ariaLabel`은 1안 전용 값이 박혀 있으므로, 옮길 때 기본값을 없애고 **호출하는 쪽이 항상 넘기게** 바꾼다. 1안 호출부에 `modes={boardMotionModes} ariaLabel="1안 전환 애니메이션"`을 명시한다.

Run: `cd frontend && node --test src/features/terminal/DestinationWeatherPage.board-layout.test.js`
Expected: PASS — 옮기기만 했으므로 1안 동작 변화 없음

Run: `npm --prefix frontend run build`
Expected: 성공

- [ ] **Step 2: 2안·3안이 함께 쓰는 위쪽 절반을 `terminalShared.jsx`에 만든다**

3안은 위쪽 절반(머리띠·현재날씨·기온차·항공편 목록)이 2안과 같다. 이 조각들을 2안 파일에 두면 3안이 2안을 import하게 되어, 나중에 2안을 지울 때 3안이 같이 깨진다. **공용 파일에 둔다.**

```jsx
/** 항공편 줄. 공동운항은 편명만 위아래로 쌓고 시각·탑승구는 하나만 둔다. */
export function FlightRow({ flight }) { /* 편명(+공동운항 편명들) · 시각 · 탑승구 · 상태배지 */ }

/** 목록은 항상 다섯 줄 자리를 잡는다. 빈 줄은 투명하게 둬야 전환 중 자리가 안 밀린다. */
export function FlightList({ flights }) { /* flights + DESTINATION_FRAME_CAPACITY까지 빈 줄 채우기 */ }

/** 도시 순환 표시. 이름 + 점. 도시가 많으면 현재 도시 앞뒤만 이름을 보이고 나머지는 점으로 둔다. */
export function DestinationPager({ destinations, destinationIndex }) { /* … */ }

/** 아이콘 · 지금 도시 · 기온 · 하늘상태/바람 · 출발지 대비 기온차. 기온차 자리는 비어도 유지한다. */
export function CurrentWeatherBlock({ flight, departureName, departureTemp }) { /* … */ }
```

클래스 이름은 `tw-` 로 시작한다(terminal weather 공용). `wf-`(2안)·`ww-`(3안)와 구분해, 안 하나를 지울 때 어느 CSS가 남아야 하는지 헷갈리지 않게 한다.

Run: `npm --prefix frontend run build`
Expected: 성공

- [ ] **Step 3: 2안 화면 컴포넌트를 만든다**

`frontend/src/features/terminal/WeatherFirstScreen.jsx`. 구조는 이렇다.

```jsx
import { WeatherIcon, TerminalEmptyState, ViewSwitcher, MotionModeSwitcher, DepartureAirportSelect, TerminalSettings, HeaderWeatherPanel } from './terminalShared.jsx'
import { threeDayStrip, isPrecipHighlighted } from './terminalForecastStrip.js'
import { temperatureGap } from './terminalLiveData.js'

const MOTION_MODES = [
  ["cascade", "CASCADE", "행 순차"],
  ["flap", "FLAP", "뒤집기"],
  ["roll", "ROLL", "세로 롤"],
  ["wipe", "WIPE", "마스크"],
  ["fade", "FADE", "겹침"],
]

function ForecastStrip({ cells }) { /* group별 세로 구분선, 아이콘·꺾은선·기온·강수 */ }

export default function WeatherFirstScreen({ frame, ... }) { /* … */ }
```

**꼭 지킬 것:**

1. **다섯 줄 자리 고정** — `FlightList`는 `flights.length`가 몇이든 `DESTINATION_FRAME_CAPACITY`개의 `<li>`를 그린다. 남는 줄은 `<li className="is-empty" aria-hidden="true" />`.
2. **기온차 자리 고정** — `temperatureGap`이 `null`이어도 `<div className="wf-temp-gap" />`를 그대로 그린다. 내용만 비운다.
3. **줄 높이 고정** — 공동운항으로 편명이 두 개인 줄도 다른 줄과 높이가 같아야 한다. CSS에서 `.wf-flight-row { height: … }`로 못 박고, 편명 두 개는 그 안에서 작은 글씨로 쌓는다.
4. **머리띠 왼쪽 칸 고정 폭** — 도시 이름 길이가 달라도 오른쪽 순환 표시가 밀리지 않아야 한다.
5. **꺾은선은 인라인 SVG로 그린다.** 칸 개수와 기온 최소·최대로 좌표를 계산한다. 라이브러리를 넣지 않는다.
6. **편이 없으면** `<TerminalEmptyState />`를 그린다.

- [ ] **Step 4: CSS를 붙인다**

`terminal.css` 끝에 `/* ===== 2안 (WeatherFirstScreen) ===== */` 구역을 만들고, 클래스 이름을 전부 `wf-` 로 시작한다. 기존 `.board-*` · `.rail-*` 과 겹치지 않게 해서 나중에 이 구역만 통째로 지울 수 있게 한다.

세로 비율:

```css
.wf-screen { display: grid; grid-template-rows: 12% 40% 48%; }
.wf-middle { display: grid; grid-template-columns: 58% 42%; }
```

**전환 중 겹침 방지 — 나가는 화면과 들어오는 화면을 같은 격자칸에 포갠다:**

```css
/* 나란히 놓으면 서로를 밀어내 글자가 겹친다. 포개면 각자 제자리에서만 움직인다. */
.wf-viewport { display: grid; }
.wf-page { grid-area: 1 / 1; }
.wf-page.is-entering { background: var(--terminal-surface, #fff); }
```

- [ ] **Step 5: 개발 서버로 눈으로 확인한다**

Run: `npm run dev`
열기: `http://localhost:5173/terminal/rkss?view=weather`

확인: 세 덩이 비율, 항공편 다섯 줄, 예보 열 칸, 기온 꺾은선이 그려지는지.

- [ ] **Step 6: 커밋한다**

```bash
git add frontend/src/features/terminal/terminalShared.jsx frontend/src/features/terminal/WeatherFirstScreen.jsx frontend/src/features/terminal/terminal.css frontend/src/features/terminal/DestinationWeatherPage.jsx
git commit -m "feat(terminal): add weather-first screen for option two"
```

---

## Task 10: 2안을 전환 스위치에 연결한다

**Files:**
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx` (`ViewSwitcher`, `App`)

**Interfaces:**
- Consumes: Task 9의 `WeatherFirstScreen`, Task 7의 `buildDestinationFrames` · `destinationFrameAt`
- Produces: `?view=weather` 또는 키보드 `2`로 2안이 뜬다

- [ ] **Step 1: 스위치에 버튼을 넣는다**

```jsx
function ViewSwitcher({ view, onSelectView }) {
  return (
    <nav className="view-switcher" aria-label="화면 비교">
      <button type="button" className={view === "board" ? "is-active" : ""} aria-pressed={view === "board"} onClick={() => onSelectView("board")}>1안</button>
      <button type="button" className={view === "weather" ? "is-active" : ""} aria-pressed={view === "weather"} onClick={() => onSelectView("weather")}>2안</button>
      <button type="button" className={view === "rail" ? "is-active" : ""} aria-pressed={view === "rail"} onClick={() => onSelectView("rail")}>3안</button>
    </nav>
  );
}
```

- [ ] **Step 2: `App`에 2안 상태를 넣는다**

```js
const [view, setView] = useState(() => {
  const requested = params.get("view");
  return ["board", "weather", "rail"].includes(requested) ? requested : "board";
});
const [weatherMotionMode, setWeatherMotionMode] = useState(() => {
  const requested = params.get("weatherMotion");
  return ["cascade", "flap", "roll", "wipe", "fade"].includes(requested) ? requested : "cascade";
});
```

도시 프레임과 지금 시각을 계산한다.

```js
// 2안·3안은 도시 하나가 한 프레임이다. 1안의 세 칸짜리 프레임과 다른 배열을 쓴다.
const destinationFrames = useMemo(() => buildDestinationFrames(simulation.destinations), [simulation]);
const activeDestinationFrame = useMemo(
  () => destinationFrameAt(destinationFrames, frameCursor),
  [destinationFrames, frameCursor],
);
// 예보 칸을 고르는 기준 시각. 화면 시계와 같은 값을 쓴다.
const nowKst = useMemo(() => ({
  date: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`,
  hour: now.getHours(),
}), [now]);
```

- [ ] **Step 3: 프레임 간격을 화면별로 나눈다**

```js
// 1안은 9초, 2안·3안은 30초. 3일치 예보 띠를 훑는 데 시간이 걸린다.
// 도시 순서는 한 바퀴 유지하되 편 상태는 즉시 갱신되므로(nextDisplayedSimulation),
// 간격이 길어도 지연·탑승구 변경이 늦게 뜨지 않는다.
const FRAME_INTERVAL_MS = { board: 9000, weather: 30000, rail: 30000 };

useEffect(() => {
  if (params.get("autoplay") === "0") return undefined;
  const interval = window.setInterval(replay, FRAME_INTERVAL_MS[view] ?? 9000);
  return () => window.clearInterval(interval);
}, [params, replay, view]);
```

- [ ] **Step 4: 렌더 분기와 키보드 단축키를 고친다**

```js
if (event.key === "1") setView("board");
if (event.key === "2") setView("weather");
if (event.key === "3") setView("rail");
```

렌더는 `view === "board" ? <BoardScreen … /> : view === "weather" ? <WeatherFirstScreen … /> : <RailScreen … />`.

- [ ] **Step 5: 도시 순서가 바뀌었을 때 편 상태가 즉시 반영되는지 확인한다**

`activeDestinationFrame.frame.flights`에 `mergeTerminalLiveWeather`를 적용해 넘긴다. 1안이 `activeFlights`에 하는 것과 같다.

```js
const destinationFlights = useMemo(() => {
  const flights = activeDestinationFrame.frame?.flights || [];
  return liveWeatherData ? flights.map((flight) => mergeTerminalLiveWeather(flight, liveWeatherData)) : flights;
}, [activeDestinationFrame, liveWeatherData]);
```

- [ ] **Step 6: 테스트와 빌드를 돌린다**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: PASS — 1안 테스트(`DestinationWeatherPage.board-layout.test.js`) 포함 전부 통과

- [ ] **Step 7: 커밋한다**

```bash
git add frontend/src/features/terminal/DestinationWeatherPage.jsx
git commit -m "feat(terminal): wire option two into the view switcher"
```

---

## Task 11: 3안 화면을 만들고 레일을 지운다

**Files:**
- Create: `frontend/src/features/terminal/WeeklyWeatherScreen.jsx`
- Modify: `frontend/src/features/terminal/terminal.css` (3안 구역 추가, 레일 구역 삭제)
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx` (레일 삭제, 3안 연결)

**Interfaces:**
- Consumes: Task 5의 `dayCycleStrip`, Task 6의 `weeklyRows`, Task 8의 `destinationDailyDays`, Task 9의 `WeatherFirstScreen`이 쓰는 것과 같은 공용 조각
- Produces: `export default function WeeklyWeatherScreen(props)` — props는 2안과 같고 `days`(주간 자료 배열)가 추가된다

- [ ] **Step 1: 3안 화면을 만든다**

`WeeklyWeatherScreen.jsx`. **위쪽 절반(머리띠·현재날씨·기온차·항공편 목록)은 2안과 같은 조각을 쓴다.** Task 9 Step 2에서 `terminalShared.jsx`에 만들어 둔 `FlightList` · `DestinationPager` · `CurrentWeatherBlock`을 가져다 쓴다 — 같은 코드를 두 번 쓰지 않는다.

**2안 파일에서 가져오지 않는다.** 3안이 2안을 참조하면 나중에 2안을 지울 때 3안이 같이 깨진다. 화면 파일끼리는 서로를 모르고, 공용은 전부 `terminalShared.jsx`를 거친다.

아래쪽만 다르다.

```jsx
import { dayCycleStrip, isPrecipHighlighted } from './terminalForecastStrip.js'
import { weeklyRows } from './terminalWeeklyForecast.js'
import { FlightList, DestinationPager, CurrentWeatherBlock, ViewSwitcher, MotionModeSwitcher, TerminalEmptyState } from './terminalShared.jsx'

/** 왼쪽. 3시간 간격 여덟 칸을 날짜 구분 없이 잇는다. 칸 수가 고정이라 도시가 바뀌어도 폭이 안 변한다. */
function HourlyStrip({ cells }) { /* 아이콘 · 꺾은선 · 기온 · 강수 */ }

/** 오른쪽. 다섯 줄 고정. 아이콘과 기온을 짝지어 붙인다. */
function WeeklyPanel({ rows }) {
  /*
    한 줄: 요일 · 날짜 · [오전아이콘 + 최저기온(파랑)] · [오후아이콘 + 최고기온(빨강)]
    아이콘과 기온을 떨어뜨리면 어느 아이콘이 어느 기온인지 눈으로 이어야 한다.
    rows[i].empty가 true면 자리만 잡고 내용을 비운다.
  */
}
```

CSS 클래스는 전부 `ww-` 로 시작한다.

```css
.ww-bottom { display: grid; grid-template-columns: 62% 38%; }
```

- [ ] **Step 2: 개발 서버로 확인한다**

Run: `npm run dev`
열기: `http://localhost:5173/terminal/rkss?view=rail`

확인: 왼쪽 시간별 여덟 칸이 자정을 넘어가는지, 오른쪽 주간이 다섯 줄인지, 아이콘과 기온이 붙어 있는지.

- [ ] **Step 3: 레일 화면을 지운다**

`DestinationWeatherPage.jsx`에서 삭제:
`RailScreen` · `RailRow` · `RailStats` · `ForecastTimeline` · `railMotionModes` · `railMotionMode` 상태 · `selectRailMotionMode`.

`terminal.css`에서 삭제: `.exact-rail` · `.rail-*` · `.rail-motion-*` 로 시작하는 모든 규칙.

3안 렌더를 `<WeeklyWeatherScreen … />`으로 바꾼다.

- [ ] **Step 4: 남은 참조가 없는지 확인한다**

```bash
grep -rn "RailScreen\|railMotion\|rail-motion\|exact-rail\|ForecastTimeline\|RailStats" frontend/src frontend/artifacts 2>/dev/null
npx knip
npx depcruise .
```

Expected: 레일 관련 검색 결과 없음. `knip`이 새로 못 쓰는 코드를 잡으면 지운다.

레일만 검사하는 테스트가 있으면 함께 지운다. `DestinationWeatherPage.board-layout.test.js`는 1안 테스트이므로 **지우지 않는다.**

- [ ] **Step 5: 테스트와 빌드를 돌린다**

Run: `npm test && npm --prefix frontend run build`
Expected: PASS

- [ ] **Step 6: 그래프를 갱신하고 커밋한다**

```bash
graphify update .
git add frontend/src/features/terminal/WeeklyWeatherScreen.jsx frontend/src/features/terminal/terminal.css frontend/src/features/terminal/DestinationWeatherPage.jsx graphify-out
git commit -m "feat(terminal): replace rail screen with hourly and weekly option three"
```

---

## Task 12: 브라우저 증거를 남긴다

**Files:**
- Create: `artifacts/terminal-weather-screens/*.png`

**Interfaces:**
- Consumes: Task 10·11의 완성된 화면
- Produces: 사양서가 요구한 상황별 스크린샷

- [ ] **Step 1: 절차 문서를 읽는다**

읽기: `docs/policies/verification/browser-verification.md`, `docs/operations/dev-server-and-capture.md`

- [ ] **Step 2: 개발 서버를 띄운다**

Run: `npm run dev:serve`
확인: `ss -ltnp | grep 5173`

- [ ] **Step 3: 2안을 상황별로 찍는다**

1920×1080으로 아래를 찍는다.

- 김포 목적지 여러 곳 — `?view=weather` (`departureAirport=RKSS`)
- 울산 120분 창 — `departureAirport=RKPU`
- 편이 여섯 편 이상인 도시의 2페이지 (목록만 넘어가고 날씨는 그대로인지)
- 공동운항편이 있는 화면
- 기온차가 숨겨지는 화면 (자리는 유지되는지)
- **전환 도중** — 편 수가 다른 두 도시(제주 5편 → 오사카 1편) 사이. 글자가 겹치지 않는지

- [ ] **Step 4: 3안을 상황별로 찍는다**

- 김포 목적지 여러 곳 — `?view=rail`
- 해외 목적지 (주간이 계산값으로 채워지는지)
- 야간 (시간별이 자정을 넘어가는지)
- 주간 자료가 모자란 목적지 (빈 줄 처리)
- 전환 도중 화면

- [ ] **Step 5: 사진을 눈으로 검사한다**

찍은 PNG를 하나씩 열어 확인한다. 특히:

- 전환 도중 사진에서 **글자가 겹치지 않는지**
- 항공편 목록 줄 수가 도시가 바뀌어도 **같은지**
- 기온차가 숨겨진 화면에서 현재날씨 배치가 **밀리지 않았는지**
- 예보 칸의 기온 숫자와 꺾은선이 멀리서 읽을 크기인지

문제가 있으면 `superpowers:systematic-debugging`으로 원인을 찾고 해당 Task로 돌아간다.

- [ ] **Step 6: 커밋한다**

```bash
git add artifacts/terminal-weather-screens
git commit -m "test(terminal): capture browser evidence for options two and three"
```

---

## 자기 점검 결과

**사양서 대응**

| 사양서 요구 | Task |
|---|---|
| 예보 3일치 확장 (국내) | 1 |
| 예보 3일치 확장 + 강수량 (해외) | 2 |
| 해외 주간 `daily` 생성, 오전/오후 최악값, 현지 시각 | 3 |
| 2안 예보 띠 (오늘/내일/모레 10칸, 강수 강조) | 4 |
| 3안 시간별 (24시간 8칸, 자정 통과) | 5 |
| 3안 주간 5줄 (아이콘+기온 짝, 빈 줄 유지) | 6 |
| 도시 단위 프레임, 시간순, 편 많으면 목록만 넘김 | 7 |
| 출발지 기온차 (2도 미만 숨김) | 8 |
| 2안 화면, 자리 고정, 겹침 방지 | 9 |
| 전환 스위치 3개, 30초 간격, 즉시 갱신 | 10 |
| 3안 화면, 레일 삭제 | 11 |
| Playwright 증거 | 12 |

**미확정 항목** — 사양서가 "결정하지 않은 것"으로 남긴 값들. 구현 중 실제 화면을 보고 정한다.

- 도시 순환 표시에서 도시가 8곳 이상일 때 이름을 몇 개까지 보일지 (Task 9)
- 3안 좌우 비율 62 : 38 (Task 11)
- 주간을 5일로 둘지 6일로 늘릴지 (Task 11) — `weeklyRows`의 `count` 인자로 조정한다
