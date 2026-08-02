import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./BriefingView.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./BriefingView.css', import.meta.url), 'utf8')
const profileWindowJsx = readFileSync(new URL('./VerticalProfileWindow.jsx', import.meta.url), 'utf8')
const profileWindowCss = readFileSync(new URL('./RouteBriefing.css', import.meta.url), 'utf8')
const profileChartJsx = readFileSync(new URL('./VerticalProfileChart.jsx', import.meta.url), 'utf8')

test('renders current airport reports as TAC cards', () => {
  assert.match(jsx, /className="bv-current-tac"/)
  assert.match(jsx, /className="bv-current-tac-raw"/)
  assert.match(jsx, /buildMetarTacSegments\(raw, vm\)/)
  assert.doesNotMatch(jsx, /const raw = a\.raw \? <div className="bv-amos-raw"/)
  assert.match(jsx, /\{a\.icao\} \{a\.reportType === 'SPECI' \? 'SPECI' : 'METAR'\}/)
})

test('turns destination forecast rows into labelled cards in a narrow briefing panel', () => {
  assert.match(jsx, /data-label="기간"/)
  assert.match(css, /@container briefing \(max-width: 719px\)/)
  assert.match(css, /\.bv-dest-periods tr/)
})

test('uses the airport panel compact TAF view and marks the ETA period', () => {
  assert.match(jsx, /<EnhancedTafTab taf=\{dest\.sourceTaf\} icao=\{dest\.icao\} eta=\{meta\.eta\} forceCompact \/>/)
})

test('keeps the mobile go/no-go banner in two columns', () => {
  assert.match(css, /\.bv-mobile \.bv-banner \{ flex-wrap: nowrap; \}/)
  assert.match(css, /\.bv-mobile \.bv-banner-body \{ min-width: 0;/)
})

// 리본(착빙·난류 구간 막대)과 연직단면도는 같은 경로 거리축을 쓰므로 붙어 있어야
// 막대 구간이 단면도의 어디인지 눈으로 이어진다. NAVLOG는 웨이포인트 축이라 그 아래.
test('places the vertical profile right after the ribbons, then legs, then raw winds', () => {
  const ribbons = jsx.indexOf('className="bv-ribbons"')
  const profile = jsx.indexOf('aria-label="연직단면도"')
  const legs = jsx.indexOf('<RouteWeatherLegTable')
  const rawWinds = jsx.indexOf('className="bv-rawwinds"')
  assert.ok(ribbons >= 0, 'ribbons present')
  assert.ok(profile > ribbons, 'profile follows ribbons')
  assert.ok(legs > profile, 'NAVLOG follows the profile')
  assert.ok(rawWinds > legs, 'raw winds last')
})

// 예보시각 앞뒤 이동은 큰 창에만 있고 브리핑 인라인 단면도에는 없었다 —
// 같은 조각(ForecastHourNav)을 두 곳이 함께 쓰도록 고정한다.
test('shares the forecast-hour nav between the profile window and the briefing inline profile', () => {
  const windowJsx = readFileSync(new URL('./VerticalProfileWindow.jsx', import.meta.url), 'utf8')
  const shared = readFileSync(new URL('./crossSectionLayers.jsx', import.meta.url), 'utf8')
  assert.match(shared, /export function ForecastHourNav/)
  assert.match(windowJsx, /<ForecastHourNav/)
  assert.match(jsx, /<ForecastHourNav/)
  // 버튼 JSX가 창 쪽에 복사본으로 남아 있으면 안 된다.
  assert.doesNotMatch(windowJsx, /aria-label="이전 예보시간"/)
  assert.doesNotMatch(jsx, /aria-label="이전 예보시간"/)
})

test('wires the default-on cloud contour layer through the shared profile state', () => {
  const shared = readFileSync(new URL('./crossSectionLayers.jsx', import.meta.url), 'utf8')
  assert.match(shared, /\['cloud', '구름'\]/)
  assert.match(shared, /cloud: true/)
  assert.match(jsx, /cloud: true/)
  assert.match(profileChartJsx, /data-testid="kim-cloud-contours"/)
  assert.match(profileChartJsx, /className="cs-cloud-contour"/)
  assert.match(profileChartJsx, /fill="none"/)
})

test('keeps the mobile fullscreen profile controls in the shared state flow', () => {
  const fullscreenStart = jsx.indexOf('{xsectionFull && verticalProfile && (')
  const fullscreenEnd = jsx.indexOf('\n        )}', fullscreenStart)
  const fullscreen = jsx.slice(fullscreenStart, fullscreenEnd)

  assert.ok(fullscreenStart >= 0, 'mobile fullscreen branch is present')
  assert.match(fullscreen, /<CrossSectionToggles layers=\{xLayers\} onToggle=\{toggleXLayer\} compact inline/)
  assert.match(fullscreen, /metaTrailing=\{<ForecastHourNav crossSection=\{crossSection\} onSelect=\{onSelectForecastHour\} loading=\{crossSectionHourLoading\} \/>\}/)
  assert.match(fullscreen, /layers=\{xLayers\}/)
  assert.match(fullscreen, /advisories=\{advisories\}/)
  assert.match(css, /\.bv-xfull-rotate \{[^}]*height: 100dvw;[^}]*display: flex;[^}]*overflow: hidden;/)
  assert.match(css, /\.bv-xfull-toolbar-main \{[^}]*grid-template-columns: minmax\(64px, auto\) minmax\(0, 1fr\) 36px;/)
  assert.match(css, /\.bv-xfull-toolbar-main \.cross-section-toggle-group \{ gap: var\(--space-s\); \}/)
  assert.match(css, /\.bv-xfull \.cs-toggle,[\s\S]*?min-height: 36px;/)
})

test('puts layers beside the fullscreen title and time navigation beside TOD and info', () => {
  assert.match(profileWindowJsx, /className="vertical-profile-mobile-toolbar-main"/)
  assert.match(profileWindowJsx, /vertical-profile-mobile-title">연직단면도/)
  assert.match(profileWindowJsx, /vertical-profile-altitude-nav/)
  assert.ok(profileWindowJsx.indexOf('<CrossSectionToggles layers={layers} onToggle={toggle} compact inline />') < profileWindowJsx.indexOf('{altitudeNav}'), 'altitude navigation is immediately before close after the layer buttons')
  assert.match(profileWindowJsx, /metaTrailing=\{placement === 'mobile-full' \? forecastHourNav : null\}/)
  assert.match(profileWindowJsx, /aria-label="닫기">×/)
  assert.match(profileWindowJsx, /<CrossSectionToggles layers=\{layers\} onToggle=\{toggle\} compact inline/)
  assert.match(profileWindowCss, /\.vertical-profile-window\.is-mobile-full \.cross-section-toggles\.is-inline \.cross-section-toggle-group \{[^}]*flex-wrap: nowrap;/)
  assert.match(profileWindowCss, /grid-template-columns: minmax\(64px, auto\) minmax\(0, 1fr\) auto 36px;/)
  assert.match(profileWindowCss, /\.vertical-profile-window\.is-mobile-full \.cs-toggle \{[^}]*padding: 2px 6px;[^}]*white-space: nowrap;/)
  assert.match(profileChartJsx, /metaTrailing = null/)
  assert.match(profileChartJsx, /\{metaTrailing\}/)
})

// NAVLOG 한 줄을 가리키면 지도뿐 아니라 연직단면도에도 같은 구간이 표시돼야 한다.
// 둘 다 같은 경로 거리축(startNm~endNm)을 쓰므로 표 → 두 그림이 한 번에 이어진다.
test('feeds the hovered/pinned NAVLOG leg into the vertical profile', () => {
  const table = readFileSync(new URL('./RouteWeatherLegTable.jsx', import.meta.url), 'utf8')
  const chart = readFileSync(new URL('./VerticalProfileChart.jsx', import.meta.url), 'utf8')
  // 표가 거리 범위를 실어 보낸다(지도는 FIX 이름, 단면도는 거리축을 쓴다).
  assert.match(table, /startNm: leg\.startNm, endNm: leg\.endNm/)
  // 브리핑이 그 구간을 차트로 넘긴다.
  assert.match(jsx, /highlightRangeNm=\{activeLeg\}/)
  // 차트가 거리 → x좌표로 바꿔 밴드를 그린다.
  assert.match(chart, /highlightRangeNm/)
  assert.match(chart, /vertical-profile-leg-band/)
})
