# METAR TAC 중심 색칠 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공항패널 METAR 탭에서 원문(TAC)을 위에, 임계값 초과 값만 색칠해서 보여주고, 기존 해독 카드 그리드는 접어서 그 아래로 내린다.

**Architecture:** `metarViewModel.js`에 순수 함수 `buildMetarTacSegments(rawText, viewModel)`을 추가한다. 이미 계산된 분류값(`visCat`/`ceilCat`/`highWind`/`precipitationWeather`/`specialWeather`)에서 "원문에 어떤 문자열로 나타나야 하는가"를 역산해 원문 문자열 안에서 찾고, 찾은 구간만 `className`을 붙인 세그먼트로 쪼갠다. 새 파싱·재조립 없음 — 원문은 항상 그대로, 색만 덧입힌다. `MetarTab.jsx`는 이 세그먼트 배열을 `<span>` 시퀀스로 렌더링하고, 기존 카드 그리드는 `<details>`로 감싼다.

**Tech Stack:** React (JSX), 순수 JS(뷰모델), CSS(디자인 헌법 `--level-*` 토큰), Node 내장 테스트 러너(`node:test`), Playwright(시각 검증).

**근거 스펙:** [`docs/superpowers/specs/2026-07-17-metar-tac-colored-display-design.md`](../specs/2026-07-17-metar-tac-colored-display-design.md)

---

## Task 1: `buildMetarTacSegments` — 뷰모델에 원문 하이라이트 로직 추가

**Files:**
- Modify: `frontend/src/features/airport-panel/lib/metarViewModel.js`
- Test: `frontend/src/features/airport-panel/lib/metarViewModel.test.js`

- [ ] **Step 1: 실패하는 테스트부터 작성**

`frontend/src/features/airport-panel/lib/metarViewModel.test.js` 맨 위 import를 아래로 바꾸고:

```js
import { buildMetarViewModel, buildMetarTacSegments } from './metarViewModel.js'
```

파일 맨 아래(마지막 `})` 다음)에 새 `describe` 블록을 추가:

```js
describe('buildMetarTacSegments — TAC 원문 하이라이트', () => {
  it('highlights visibility below the IFR threshold', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '4800', qnh: 'Q1008' },
        visibility: { value: 4800 },
        wind: { direction: 90, speed: 8, unit: 'KT' },
        clouds: [],
        temperature: { air: 22, dewpoint: 21 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSI', airportMeta: { runway_hdg: 150 } })
    const rawText = 'RKSI 171200Z 09008KT 4800 22/21 Q1008 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    const highlighted = segments.filter((s) => s.className)
    assert.equal(highlighted.length, 1)
    assert.equal(highlighted[0].text, '4800')
    assert.match(highlighted[0].className, /ap-metar-tac-hl--level-ifr/)
  })

  it('highlights gusty wind exceeding the high-wind threshold', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '9999', qnh: 'Q0998' },
        visibility: { value: 9999 },
        wind: { direction: 320, speed: 28, gust: 40, unit: 'KT' },
        clouds: [],
        temperature: { air: 19, dewpoint: 18 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSS', airportMeta: { runway_hdg: 140 } })
    const rawText = 'RKSS 171200Z 32028G40KT 9999 19/18 Q0998'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    const highlighted = segments.filter((s) => s.className)
    assert.equal(highlighted.length, 1)
    assert.equal(highlighted[0].text, '32028G40KT')
    assert.match(highlighted[0].className, /ap-metar-tac-hl--wind/)
  })

  it('highlights precipitation/special weather tokens', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: '-RA BR', visibility: '4800', qnh: 'Q1008' },
        visibility: { value: 4800 },
        wind: { direction: 90, speed: 8, unit: 'KT' },
        clouds: [{ amount: 'OVC', base: 1200 }],
        temperature: { air: 22, dewpoint: 21 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSI', airportMeta: { runway_hdg: 150 } })
    const rawText = 'RKSI 171200Z 09008KT 4800 -RA BR OVC012 22/21 Q1008 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    const wxSegments = segments.filter((s) => s.className?.includes('ap-metar-tac-hl--precip'))
    assert.deepEqual(wxSegments.map((s) => s.text), ['-RA', 'BR'])
    const ceilSegment = segments.find((s) => s.className?.includes('ap-metar-tac-hl--level-ifr') && s.text === 'OVC012')
    assert.ok(ceilSegment, 'expected OVC012 to be highlighted as IFR ceiling')
  })

  it('adds no highlights for a calm VFR observation', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '9999', qnh: 'Q1012' },
        visibility: { value: 9999 },
        wind: { direction: 270, speed: 6, unit: 'KT' },
        clouds: [{ amount: 'FEW', base: 3000 }],
        temperature: { air: 26, dewpoint: 18 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKPC', airportMeta: { runway_hdg: 70 } })
    const rawText = 'RKPC 171200Z 27006KT 9999 FEW030 26/18 Q1012 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.length, 1)
    assert.equal(segments[0].text, rawText)
    assert.equal(segments[0].className, undefined)
  })

  it('leaves text intact and uncolored when the parsed token cannot be found verbatim', () => {
    const metar = {
      header: { observation_time: '2026-05-21T10:00:00Z' },
      observation: {
        cavok: false,
        display: { weather: null, visibility: '3SM', qnh: 'A2996' },
        visibility: { value: 4800 },
        wind: { direction: 90, speed: 8, unit: 'KT' },
        clouds: [],
        temperature: { air: 22, dewpoint: 21 },
      },
    }
    const vm = buildMetarViewModel({ metar, amosData: null, icao: 'RKSI', airportMeta: { runway_hdg: 150 } })
    // 국제(SM) 표기라 파싱된 '4800' 토큰이 원문에 그대로 없음 — 탐색 실패해도 원문은 안전하게 보존돼야 함
    const rawText = 'RKSI 171200Z 09008KT 3SM 22/21 A2996 NOSIG'
    const segments = buildMetarTacSegments(rawText, vm)

    assert.equal(segments.map((s) => s.text).join(''), rawText)
    assert.equal(segments.filter((s) => s.className).length, 0)
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd frontend && node --test src/features/airport-panel/lib/metarViewModel.test.js`
Expected: FAIL — `buildMetarTacSegments is not a function` (아직 구현 안 함)

- [ ] **Step 3: `metarViewModel.js`에 구현 추가**

`frontend/src/features/airport-panel/lib/metarViewModel.js`에서 기존:

```js
  const clouds = obs?.clouds || []
  const ceilingCloud = clouds
    .filter((c) => c.amount === 'BKN' || c.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]
  const ceilingFt = ceilingCloud?.base ?? null
```

를 아래로 바꾼다(운고 구름 선택 로직을 재사용 가능한 함수로 추출):

```js
  const ceilingCloud = pickCeilingCloud(obs?.clouds)
  const ceilingFt = ceilingCloud?.base ?? null
```

파일 맨 위 `export function buildMetarViewModel` 바로 앞에 헬퍼들을 추가한다:

```js
function pickCeilingCloud(clouds) {
  return (clouds || [])
    .filter((c) => c.amount === 'BKN' || c.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0] || null
}

function buildWindToken(wind) {
  if (!wind || wind.calm) return null
  const dir = wind.variable ? 'VRB' : (Number.isFinite(wind.direction) ? String(wind.direction).padStart(3, '0') : null)
  const speed = Number.isFinite(wind.speed) ? String(wind.speed).padStart(2, '0') : null
  if (!dir || !speed) return null
  const gust = Number.isFinite(wind.gust) ? `G${String(wind.gust).padStart(2, '0')}` : ''
  return `${dir}${speed}${gust}${wind.unit || 'KT'}`
}

function buildVisibilityToken(obs) {
  const value = obs?.visibility?.value
  return Number.isFinite(value) ? String(value) : null
}

function buildCeilingToken(obs) {
  const ceilingCloud = pickCeilingCloud(obs?.clouds)
  if (!ceilingCloud || !Number.isFinite(ceilingCloud.base)) return null
  const hundreds = String(Math.round(ceilingCloud.base / 100)).padStart(3, '0')
  return `${ceilingCloud.amount}${hundreds}`
}

function weatherTokens(obs) {
  const raw = obs?.display?.weather
  return raw ? String(raw).split(/\s+/).filter(Boolean) : []
}

function levelHighlightClass(cat) {
  if (!cat || cat.category === 'VFR') return null
  return `ap-metar-tac-hl ap-metar-tac-hl--level-${cat.category.toLowerCase()}`
}

function splitSegmentsOn(segments, token, className) {
  if (!token) return segments
  return segments.flatMap((seg) => {
    if (seg.className || !seg.text.includes(token)) return [seg]
    const idx = seg.text.indexOf(token)
    const before = seg.text.slice(0, idx)
    const match = seg.text.slice(idx, idx + token.length)
    const after = seg.text.slice(idx + token.length)
    return [
      ...(before ? [{ text: before }] : []),
      { text: match, className },
      ...(after ? [{ text: after }] : []),
    ]
  })
}

// 원문(rawText)은 절대 바꾸지 않는다 — 이미 계산된 값(vm)이 원문 안에서 발견되는 구간만
// className을 붙여 쪼갠다. 못 찾으면 그 항목만 건너뛴다(원문 전체는 항상 그대로 보존).
export function buildMetarTacSegments(rawText, vm) {
  if (!rawText) return []
  let segments = [{ text: rawText }]

  if (vm.highWind) {
    segments = splitSegmentsOn(segments, buildWindToken(vm.obs?.wind), 'ap-metar-tac-hl ap-metar-tac-hl--wind')
  }

  const visClass = levelHighlightClass(vm.visCat)
  if (visClass) {
    segments = splitSegmentsOn(segments, buildVisibilityToken(vm.obs), visClass)
  }

  if (vm.precipitationWeather || vm.specialWeather) {
    const wxClass = vm.specialWeather
      ? 'ap-metar-tac-hl ap-metar-tac-hl--special'
      : 'ap-metar-tac-hl ap-metar-tac-hl--precip'
    for (const token of weatherTokens(vm.obs)) {
      segments = splitSegmentsOn(segments, token, wxClass)
    }
  }

  const ceilClass = levelHighlightClass(vm.ceilCat)
  if (ceilClass) {
    segments = splitSegmentsOn(segments, buildCeilingToken(vm.obs), ceilClass)
  }

  return segments
}
```

`vm.obs`, `vm.visCat`, `vm.ceilCat`, `vm.highWind`, `vm.precipitationWeather`, `vm.specialWeather`는 이미 `buildMetarViewModel`이 반환하는 필드들이라 추가 export 불필요.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd frontend && node --test src/features/airport-panel/lib/metarViewModel.test.js`
Expected: PASS — 기존 2개 + 신규 5개, 총 7개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/airport-panel/lib/metarViewModel.js frontend/src/features/airport-panel/lib/metarViewModel.test.js
git commit -m "feat: highlight METAR TAC substrings for threshold-exceeding values"
```

---

## Task 2: `MetarTab.jsx` — TAC 우선 표시 + 해독 카드 접기

**Files:**
- Modify: `frontend/src/features/airport-panel/tabs/MetarTab.jsx`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

`frontend/src/features/airport-panel/tabs/MetarTab.jsx` 전체를 다음으로 바꾼다(기존 해독 카드 그리드 내용은 그대로, TAC 블록 추가 + `<details>`로 감싸기 + 하단 원문 접기 섹션 삭제):

```jsx
import { MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import { buildMetarViewModel, buildMetarTacSegments } from '../lib/metarViewModel.js'
import { formatRvr } from '../../../shared/weather/helpers.js'

export default function MetarTab({ metar, amosData, icao, airportMeta }) {
  if (!metar) return <div className="ap-empty">METAR 데이터 없음</div>

  const vm = buildMetarViewModel({ metar, amosData, icao, airportMeta })
  const {
    obs,
    flightCat,
    visCat,
    ceilCat,
    highWind,
    weatherKorean,
    weatherVisual,
    precipitationWeather,
    specialWeather,
    visValue,
    ceilValue,
    windDir,
    windSpeedText,
    windGustText,
    windRotation,
    tempDisplay,
    rhDisplay,
    qnh,
  } = vm

  // METAR 본문 뒤 보조정보(ICAO Supplementary Information): 윈드시어(WS)·경향(NOSIG 등)을 원문 영어 그대로
  const windShearText = obs?.wind_shear
    ? (obs.wind_shear.all_runways ? 'WS ALL RWY' : (obs.wind_shear.runways || []).map((r) => `WS R${r}`).join(' '))
    : ''
  const metarTail = [windShearText, obs?.trend].filter(Boolean).join(' ')

  const rawText = metar?.header?.raw_text || ''
  const tacSegments = rawText ? buildMetarTacSegments(rawText, vm) : []

  return (
    <div className="ap-metar-v2">
      {/* ── TAC 원문 — 배지 + 임계값 색칠, 조종사가 짧은 시간에 스캔하는 기본 화면 ── */}
      {rawText && (
        <div className="ap-metar-tac-block">
          <span className={`ap-metar-tac-chip ap-metar-tac-chip--${flightCat.category}`}>{flightCat.category}</span>
          <code className="ap-metar-tac">
            {tacSegments.map((seg, i) => (
              <span key={i} className={seg.className}>{seg.text}</span>
            ))}
          </code>
        </div>
      )}

      {/* ── 해독 카드 — 기본 접힘, 필요할 때만 펼침 ── */}
      <details className="ap-metar-detail">
        <summary>해독 카드 보기</summary>

        {/* 비행규칙 세로 배너(좌) + 해독 카드(우) */}
        <div className="ap-mv2-body">
          <div className={`ap-mv2-cat-banner ap-mv2-cat-banner--${flightCat.category}`}>
            <span className="ap-mv2-cat-code">{flightCat.category}</span>
            <span className="ap-mv2-cat-label">{flightCat.labelKo}</span>
          </div>

          {/* 지표 그리드 (순서: 시정 → 운고 → RVR → 바람 → 현재날씨 → 온도 → 습도 → QNH) */}
          <div className="ap-mv2-grid">
          {/* 시정 */}
          <div
            className="ap-mv2-card"
            style={{
              backgroundColor: visCat.bg,
              borderLeft: `3px solid ${visCat.border}`,
            }}
          >
            <div className="ap-mv2-card-label">시정</div>
            <div className="ap-mv2-card-value" style={{ color: visCat.valueColor }}>{visValue}</div>
          </div>

          {/* 운고 */}
          <div
            className="ap-mv2-card"
            style={{
              backgroundColor: ceilCat.bg,
              borderLeft: `3px solid ${ceilCat.border}`,
            }}
          >
            <div className="ap-mv2-card-label">운고</div>
            <div className="ap-mv2-card-value" style={{ color: ceilCat.valueColor }}>{ceilValue}</div>
          </div>

          {/* RVR */}
          <div className="ap-mv2-card">
            <div className="ap-mv2-card-label">RVR</div>
            <div className="ap-mv2-card-value">{formatRvr(obs)}</div>
          </div>

          {/* 바람 */}
          <div className={`ap-mv2-card${highWind ? ' ap-mv2-card--alert' : ''}`}>
            <div className="ap-mv2-card-body">
              <div className="ap-mv2-card-content">
                <div className="ap-mv2-card-label">바람</div>
                <div className="ap-mv2-card-value">
                  {`${windDir}/${windSpeedText}kt`}
                  {windGustText && <span className="ap-mv2-card-sub">{windGustText}</span>}
                </div>
              </div>
              <div className="ap-mv2-card-aside">
                <MoveUp
                  className="ap-mv2-wind-arrow"
                  style={{ transform: `rotate(${windRotation}deg)` }}
                />
              </div>
            </div>
          </div>

          {/* 현재날씨 */}
          <div
            className={[
              'ap-mv2-card',
              precipitationWeather ? 'ap-mv2-card--precip-weather' : '',
              specialWeather ? 'ap-mv2-card--special-weather' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="ap-mv2-card-body">
              <div className="ap-mv2-card-content">
                <div className="ap-mv2-card-label">현재 날씨</div>
                <div className="ap-mv2-card-value ap-mv2-card-value--weather">{weatherKorean}</div>
              </div>
              <div className="ap-mv2-card-aside">
                <WeatherIcon visual={weatherVisual} className="ap-mv2-weather-icon" />
              </div>
            </div>
          </div>

          {/* 온도 */}
          <div className="ap-mv2-card">
            <div className="ap-mv2-card-label">온도</div>
            <div className="ap-mv2-card-value">{tempDisplay}</div>
          </div>

          {/* 습도 */}
          <div className="ap-mv2-card">
            <div className="ap-mv2-card-label">습도</div>
            <div className="ap-mv2-card-value">{rhDisplay}</div>
          </div>

          {/* QNH */}
          <div className="ap-mv2-card">
            <div className="ap-mv2-card-label">QNH</div>
            <div className="ap-mv2-card-value">{qnh}</div>
          </div>
          </div>
        </div>

        {/* ── 보조정보(ICAO Supplementary Information) — 원문 영어 그대로(WS·NOSIG 등) ── */}
        <div className="ap-mv2-trend">
          <span className="ap-mv2-trend-label">보조정보</span>
          <span className={`ap-mv2-trend-value${metarTail ? '' : ' is-empty'}`}>
            {metarTail || '해당 없음'}
          </span>
        </div>
      </details>
    </div>
  )
}
```

`RAW_TAC_STYLE`/`TafTab.jsx` import는 더 이상 안 쓰므로 제거했다(맨 아래 원문 접기 섹션이 없어졌기 때문). `<span className={seg.className}>`은 `className`이 `undefined`인 세그먼트에서도 안전하다(React는 `undefined` className을 그냥 생략).

- [ ] **Step 2: 프론트엔드 테스트·빌드로 문법 오류 확인**

Run: `cd frontend && npm test`
Expected: 기존 테스트 전부 PASS (신규 UI 로직은 컴포넌트라 유닛테스트 대상 아님 — Task 1의 뷰모델 테스트가 로직을 커버)

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/airport-panel/tabs/MetarTab.jsx
git commit -m "feat: lead METAR tab with colored TAC line, fold decoded cards"
```

---

## Task 3: `AirportPanel.css` — TAC 블록·칩·하이라이트·접기 스타일

**Files:**
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`

- [ ] **Step 1: `.ap-raw-fold` 블록 바로 다음에 새 규칙 추가**

`frontend/src/features/airport-panel/AirportPanel.css`에서 아래 블록을 찾는다:

```css
.ap-raw-fold {
  padding: 0;
}
.ap-raw-fold-summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  list-style: none;
}
.ap-raw-fold-summary::-webkit-details-marker { display: none; }
.ap-raw-fold-summary::before { content: "▸ "; }
.ap-raw-fold[open] .ap-raw-fold-summary::before { content: "▾ "; }
.ap-raw-fold > code { display: block; margin-top: 8px; }
```

그 바로 뒤에 이어서 추가한다:

```css
/* ── METAR TAC 원문 — 배지 + 임계값 색칠 (해독 카드보다 먼저 보이는 메인 뷰) ── */
.ap-metar-tac-block {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.ap-metar-tac {
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 17px;
  line-height: 1.65;
  letter-spacing: 0.01em;
  color: var(--text-1);
}

.ap-metar-tac-chip {
  display: inline-flex;
  align-items: baseline;
  padding: 3px 9px 4px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #ffffff;
  flex: 0 0 auto;
}

.ap-metar-tac-chip--VFR { background: var(--level-green); }
.ap-metar-tac-chip--IFR { background: var(--level-amber); }
.ap-metar-tac-chip--LIFR { background: var(--level-red); }

.ap-metar-tac-hl {
  border-radius: 4px;
  padding: 0 3px;
  font-weight: 800;
}
.ap-metar-tac-hl--level-ifr { background: var(--level-amber-bg); color: var(--level-amber); }
.ap-metar-tac-hl--level-lifr { background: var(--level-red-bg); color: var(--level-red); }
.ap-metar-tac-hl--wind { background: var(--level-red-bg); color: var(--level-red); }
.ap-metar-tac-hl--precip { background: rgba(186, 230, 253, 0.72); color: #0c4a6e; }
.ap-metar-tac-hl--special {
  background: var(--level-red-bg);
  color: var(--level-red);
  outline: 2px dashed var(--level-red);
  outline-offset: -1px;
}

/* ── 해독 카드 접기 (원문이 메인이 된 뒤, 카드는 보조 상세) ── */
.ap-metar-detail {
  margin-top: 4px;
}
.ap-metar-detail > summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  list-style: none;
}
.ap-metar-detail > summary::-webkit-details-marker { display: none; }
.ap-metar-detail > summary::before { content: "▸ "; }
.ap-metar-detail[open] > summary::before { content: "▾ "; }
.ap-metar-detail > .ap-mv2-body { margin-top: 10px; }
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/features/airport-panel/AirportPanel.css
git commit -m "style: add TAC chip/highlight and decoded-card fold styles for METAR tab"
```

---

## Task 4: 브라우저 검증 (Playwright)

**Files:**
- Create (temporary, delete after use): `frontend/scripts/_tmp-metar-tac-check.mjs`

- [ ] **Step 1: 서버 기동 확인**

Run (PowerShell, 저장소 루트):
```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
```
둘 다 안 떠 있으면 `npm.cmd run dev:serve`로 기동(`docs/operations/dev-server-and-capture.md` 절차 참고).

- [ ] **Step 2: 검증 스크립트 작성**

`frontend/scripts/_tmp-metar-tac-check.mjs`:

```js
import { chromium } from 'playwright'

const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'

async function check(icao, viewport, label) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newContext({ viewport, deviceScaleFactor: 1 }).then((c) => c.newPage())
  try {
    await page.goto(`${appUrl}/?airport=${icao}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.airport-panel', { timeout: 15000 })
    const closeBtn = page.locator('.updates-modal__close')
    if (await closeBtn.count()) { await closeBtn.first().click(); await page.waitForTimeout(300) }
    await page.waitForTimeout(1000)

    const btn = page.locator('.airport-panel-tab', { hasText: 'METAR' }).first()
    await btn.click()
    await page.waitForTimeout(500)

    const info = await page.evaluate(() => {
      const chip = document.querySelector('.ap-metar-tac-chip')
      const tac = document.querySelector('.ap-metar-tac')
      const detail = document.querySelector('.ap-metar-detail')
      const highlights = Array.from(document.querySelectorAll('.ap-metar-tac-hl')).map((el) => ({
        text: el.textContent,
        classes: el.className,
      }))
      return {
        chipText: chip?.textContent,
        chipBg: chip ? getComputedStyle(chip).backgroundColor : null,
        tacText: tac?.textContent,
        detailOpen: detail?.hasAttribute('open'),
        highlights,
      }
    })
    console.log(`--- ${icao} ${label} (${viewport.width}x${viewport.height}) ---`)
    console.log(JSON.stringify(info, null, 2))
  } finally {
    await browser.close()
  }
}

async function run() {
  for (const icao of ['RKSI', 'RKSS', 'RKPC']) {
    await check(icao, { width: 1600, height: 1200 }, 'desktop')
  }
  await check('RKSI', { width: 390, height: 844 }, 'mobile')
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
```

- [ ] **Step 3: 실행**

Run: `cd frontend && node scripts/_tmp-metar-tac-check.mjs`
Expected: 각 공항마다 `chipText`가 `VFR`/`IFR`/`LIFR` 중 하나로 나오고, `detailOpen: false`(기본 접힘)이며, 강풍·저시정·강수 공항에서는 `highlights` 배열이 비어있지 않아야 한다. 앱이 죽거나 콘솔 에러가 없어야 한다.

- [ ] **Step 4: 결과에 따라 조정 후 임시 스크립트 삭제**

문제 없으면:
```bash
rm frontend/scripts/_tmp-metar-tac-check.mjs
```
문제 있으면(예: 하이라이트가 하나도 안 잡힘) Task 1의 토큰 생성 함수(`buildWindToken`/`buildVisibilityToken`/`buildCeilingToken`)를 실제 관측값과 대조해 수정 — 백엔드가 주는 `raw_text` 포맷이 이 플랜이 가정한 것과 다를 수 있으므로, 이 단계에서 실제 데이터로 확인하는 게 핵심이다.

- [ ] **Step 5: 커밋할 변경사항이 남아있다면 커밋**

```bash
git status --porcelain
# 위에서 조정한 파일이 있으면:
git add -A
git commit -m "fix: adjust METAR TAC token matching against real observation data"
```

---

## 완료 조건

- [ ] `node --test frontend/src/features/airport-panel/lib/metarViewModel.test.js` 전부 통과
- [ ] `npm test` (루트) 전체 통과
- [ ] Playwright 확인: 배지 색상, 하이라이트 존재(문제 있는 공항), 해독 카드 기본 접힘, 데스크톱·모바일 둘 다 정상
- [ ] 임시 스크립트(`_tmp-metar-tac-check.mjs`) 삭제됨
