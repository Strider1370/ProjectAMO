import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./BriefingView.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./BriefingView.css', import.meta.url), 'utf8')
const profileWindowJsx = readFileSync(new URL('./VerticalProfileWindow.jsx', import.meta.url), 'utf8')
const profileWindowCss = readFileSync(new URL('./RouteBriefing.css', import.meta.url), 'utf8')
const profileChartJsx = readFileSync(new URL('./VerticalProfileChart.jsx', import.meta.url), 'utf8')

// 데스크톱은 공항=행 비교표 하나(원문은 행을 펼쳐서), 폰 시트는 공항별 원문 카드.
test('renders current airport reports as one comparison table on desktop and TAC cards on phones', () => {
  assert.match(jsx, /className="bv-current-matrix"/)
  assert.doesNotMatch(css, /\.bv-current-matrix \{ display: none; \}/)
  assert.match(jsx, /\{nav\}\{board\}\{layerAction\}\{adverse\}\{currentMobile\}/)
  assert.match(jsx, /\{nav\}\{board\}\{layerAction\}\{adverse\}\{currentDesktop\}/)
  assert.match(jsx, /className="bv-current-tac"/)
  assert.match(jsx, /className="bv-current-tac-raw"/)
  assert.match(jsx, /buildMetarTacSegments\(raw, vm\)/)
  assert.doesNotMatch(jsx, /const raw = a\.raw \? <div className="bv-amos-raw"/)
  assert.match(jsx, /\{a\.icao\} \{a\.reportType === 'SPECI' \? 'SPECI' : 'METAR'\}/)
})

test('uses the airport panel compact TAF view once, without the old period table', () => {
  assert.match(jsx, /<EnhancedTafTab taf=\{dest\.sourceTaf\} icao=\{dest\.icao\} eta=\{meta\.eta\} forceCompact( displayTimeZone=\{tafTz\})? \/>/)
  assert.doesNotMatch(jsx, /bv-dest-legacy|bv-dest-periods/)
})

test('keeps the mobile go/no-go banner in two columns', () => {
  assert.match(css, /\.bv-mobile \.bv-banner \{ flex-wrap: nowrap; \}/)
  assert.match(css, /\.bv-mobile \.bv-banner-body \{ min-width: 0;/)
})

// 데스크톱 노선 섹션은 지도형 독과 같은 부품(위험 막대 + 압축 단면도)을 쓰고, NAVLOG·원자료가 그 아래.
test('uses the map dock parts on desktop, then NAVLOG, then raw winds', () => {
  const dock = jsx.indexOf('<BriefingDock variant="document"')
  const legs = jsx.indexOf('<RouteWeatherLegTable')
  const rawWinds = jsx.indexOf('className="bv-rawwinds"')
  assert.ok(dock >= 0, 'document dock present')
  assert.ok(legs > dock, 'NAVLOG follows the dock')
  assert.ok(rawWinds > legs, 'raw winds last')
  assert.doesNotMatch(jsx, /className="bv-ribbons"/)
})

// 섹션 번호(①~⑤)는 쓰지 않는다 — NOTAM 유무로 목적지 번호가 바뀌던 문제.
test('labels sections without numbers', () => {
  assert.doesNotMatch(jsx, /[①②③④⑤⑥]/)
  assert.match(jsx, /label: '일기도'/)
})

// 일기도 칸: 켠 레이어는 같은 버튼 자리에서 끈다.
test('lets a chart tile turn its map layer back off', () => {
  assert.match(jsx, /metVisibility\?\.\[tile\.layer\]\s*\?\s*<Button[^>]*onClick=\{\(\) => onToggleMetLayer\?\.\(tile\.layer\)\}>지도에서 끄기<\/Button>/)
})

test('all briefing sizes use the shared viewer and keep linked state', () => {
  const viewer = readFileSync(new URL('./VerticalProfileViewer.jsx', import.meta.url), 'utf8')
  assert.match(profileWindowJsx, /VerticalProfileViewer/)
  assert.equal((jsx.match(/<VerticalProfileViewer /g) ?? []).length, 2) // 모바일 인라인 + 전체화면
  assert.match(jsx, /onToggleLayer=\{toggleXLayer\}/)
  assert.match(jsx, /highlightRangeNm=\{pinnedLeg\}/)
  assert.match(jsx, /onSelectForecastHour=\{onSelectForecastHour\}/)
  // 문서형에 끼운 단면은 휠이 문서 스크롤 — 지도형 독(compact)만 휠로 확대한다.
  assert.match(viewer, /if \(\(embedded && \(!compact \|\| documentMode\)\) \|\| e.ctrlKey/)
  assert.match(viewer, /statusMessage && <div/)
  assert.match(viewer, /onSelectLinkedItem=\{onSelectLinkedItem\}/)
  assert.match(css, /\.bv-xfull-rotate \{[^}]*transform: none;/)
})

// NAVLOG 한 줄을 가리키면 지도뿐 아니라 연직단면도에도 같은 구간이 표시돼야 한다.
// 둘 다 같은 경로 거리축(startNm~endNm)을 쓰므로 표 → 두 그림이 한 번에 이어진다.
test('feeds the hovered/pinned NAVLOG leg into the vertical profile', () => {
  const table = readFileSync(new URL('./RouteWeatherLegTable.jsx', import.meta.url), 'utf8')
  const chart = readFileSync(new URL('./VerticalProfileChart.jsx', import.meta.url), 'utf8')
  // 표가 거리 범위를 실어 보낸다(지도는 FIX 이름, 단면도는 거리축을 쓴다).
  assert.match(table, /startNm: leg\.startNm, endNm: leg\.endNm/)
  // 브리핑이 그 구간을 차트로 넘긴다.
  assert.match(jsx, /highlightRangeNm=\{ribbonHover \?\? activeLeg\}/)
  // 차트가 거리 → x좌표로 바꿔 밴드를 그린다.
  assert.match(chart, /highlightRangeNm/)
  assert.match(chart, /vertical-profile-leg-band/)
})

test('keeps each vertical profile chart on its own SVG clip and blur ids', () => {
  // 브리핑 패널과 크게 보기 창에 단면도가 함께 뜨면 고정 id가 겹쳐 큰 차트가 작은 차트 폭으로 잘린다.
  assert.match(profileChartJsx, /useId\(\)/)
  assert.match(profileChartJsx, /<clipPath id=\{clipId\}>/)
  assert.match(profileChartJsx, /clipPath=\{`url\(#\$\{clipId\}\)`\}/)
  assert.doesNotMatch(profileChartJsx, /id="cs-(clip|blur)"|url\(#cs-(clip|blur)\)/)
})
