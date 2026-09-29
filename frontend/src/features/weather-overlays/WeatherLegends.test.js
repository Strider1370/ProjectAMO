import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { entriesLeftToRight } from './lib/legendOrder.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../../..')
const source = fs.readFileSync(path.join(here, 'WeatherLegends.jsx'), 'utf8')
const panelSource = fs.readFileSync(path.join(here, 'WeatherOverlayPanel.jsx'), 'utf8')
const css = fs.readFileSync(path.join(here, '../map/MapView.css'), 'utf8')
let viteServer

async function renderLegends(props) {
  viteServer ??= await createServer({
    root: frontendRoot,
    configFile: false,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
  })
  const { default: WeatherLegends } = await viteServer.ssrLoadModule('/src/features/weather-overlays/WeatherLegends.jsx')
  return renderToStaticMarkup(createElement(WeatherLegends, props))
}

after(async () => viteServer?.close())

test('WISSDOM uses its existing panel button and is not automatic with HSR', () => {
  assert.doesNotMatch(source, /radarMotion/)
  assert.doesNotMatch(source, /radar-motion/)
  assert.match(panelSource, /레이더 바람장 \(WISSDOM\)/)
  assert.match(panelSource, /onRadarWindRequestedChange/)
  assert.doesNotMatch(panelSource, /레이더 에코 이동벡터 표시/)
  assert.match(css, /\.layer-tile-group-title-action:disabled \{[\s\S]*?background:\s*var\(--surface-2\)/)
  assert.match(css, /\.map-view-wrapper \.map-right-legends > \* \{[\s\S]*?pointer-events:\s*auto/)
})

test('all hooks run before the no-visible-legend return', () => {
  const effect = source.indexOf('useEffect(() =>')
  const emptyReturn = source.indexOf('&& !surfaceChartLegendVisible && !supplementalContent) return null')
  assert.ok(effect >= 0)
  assert.ok(emptyReturn > effect)
})

test('renders the surface chart precip legend with its note', async () => {
  // MapView는 지도 범례를 하단 독으로 그린다(bottomDock={!isMobile}).
  const html = await renderLegends({
    bottomDock: true,
    surfaceChartLegendVisible: true,
    surfaceChartLegendEntries: [{ label: '0.5', color: 'rgb(163, 199, 242)' }, { label: '80', color: 'rgb(248, 0, 0)' }],
    surfaceChartLegendNote: '등압선 2 hPa 간격(굵은 선 4 hPa) · 3시간 누적',
  })
  assert.match(html, /강수 · KIM · mm\/3h/)
  assert.match(html, /등압선 2 hPa 간격/)
})

test('horizontal legends preserve ascending ramps and reverse only descending sources', () => {
  const ascending = [{ label: 'weak' }, { label: 'strong' }]
  const descending = [{ label: 'strong' }, { label: 'weak' }]
  assert.deepEqual(entriesLeftToRight(ascending).map((entry) => entry.label), ['weak', 'strong'])
  assert.deepEqual(entriesLeftToRight(descending, true).map((entry) => entry.label), ['weak', 'strong'])
})

test('renders HSR and HCI as horizontal UI legends without KMA legend images', async () => {
  const html = await renderLegends({
    hsrLegendVisible: true,
    hciLegendVisible: true,
    wissdomLegendVisible: true,
    hsrLegend: [{ label: '0.0', color: 'rgb(247, 252, 249)' }, { label: '150', color: 'rgb(51, 50, 59)' }],
    hciLegend: [{ label: '우박', color: 'rgb(255, 51, 0)' }, { label: '비', color: 'rgb(51, 102, 255)' }],
    radarWindObservedAtMs: 0,
  })

  assert.match(html, /HSR · mm\/h/)
  assert.match(html, /HCI · 강수 형태/)
  assert.match(html, /WISSDOM · m\/s/)
  assert.doesNotMatch(html, /<img/)
})

// 에코탑 범례의 동작 검증은 브라우저 계약(frontend/verification/contracts/echo-top.spec.mjs)이 맡는다.
// 여기 있던 두 테스트는 소스 문자열을 찾는 방식이라, 실제로 렌더되지 않는 코드 경로를 검사하면서도
// 통과했다 — MapView가 bottomDock={!isMobile}을 넘겨 오른쪽 범례(panel)는 어느 화면에서도 렌더되지
// 않는데, 그 경로의 문구만 확인하고 있었다. 계약이 실제 화면에서 문구와 자료 없음 상태를 확인한다.

test('WISSDOM legend uses its KMA observation time', () => {
  assert.match(source, /WISSDOM/)
  assert.match(source, /radarWindObservedAtMs/)
})

test('QPF API legend appears only for the exact MAPLE forecast frame', async () => {
  const qpfStatus = { source: 'MAPLE', analysisTimeMs: 1, validTimeMs: 2, leadMinutes: 1, unit: 'mm/h' }
  const hidden = await renderLegends({ qpfStatus: null, qpfLegendPath: '/api/qpf/legend.png' })
  const visible = await renderLegends({ qpfStatus, qpfLegendPath: '/api/qpf/legend.png' })

  assert.equal(hidden, '')
  assert.match(visible, /초단기 강수예측/)
  assert.match(visible, /MAPLE/)
  // 기상청 세로 범례 그림 대신 같은 색의 가로 범례를 그린다.
  assert.doesNotMatch(visible, /<img/)
  assert.match(visible, /mm\/h/)
  assert.match(visible, /rgb\(0, 200, 255\)/)
  assert.match(visible, /rgb\(51, 51, 51\)/)
  assert.doesNotMatch(visible, /레이더 관측|QPF.{0,12}관측|관측.{0,12}QPF/)
})

test('HIGH uses its own compact upper key while model icing stays in the bottom legend', async () => {
  const bottom = await renderLegends({ bottomDock: true,
    icingLegendVisible: true, icingLegendEntries: [{ label: '모델 착빙', color: '#ACC7FF' }] })
  assert.match(bottom, /착빙 · 잠재성/)
  assert.doesNotMatch(bottom, /SIGWX HIGH/)
  const { default: HighLegend } = await viteServer.ssrLoadModule('/src/features/weather-overlays/SigwxHighLegend.jsx')
  const { default: TimeCard } = await viteServer.ssrLoadModule('/src/features/weather-overlays/WeatherLayerTimestampBar.jsx')
  const { WAFS_CHART_PALETTES } = await viteServer.ssrLoadModule('/src/features/weather-overlays/lib/wafsChartPalette.js')
  const props = { enabled: true, filter: { TURBULENCE: true, AIRFRAME_ICING: true }, palette: WAFS_CHART_PALETTES.light }
  const upper = renderToStaticMarkup(createElement(TimeCard, { entries: [{ key: 'wind', label: '바람', issueLabel: '09/29 12:00 UTC' }] }, createElement(HighLegend, props)))
  assert.match(upper, /SIGWX HIGH 난류·착빙 범례/)
  assert.match(upper, /난류/)
  assert.match(upper, /착빙/)
  assert.match(upper, /MOD 중간/)
  assert.match(upper, /SEV 강함/)
  assert.doesNotMatch(upper, /hlegend-bar/)
  const filtered = renderToStaticMarkup(createElement(HighLegend, { ...props, filter: { TURBULENCE: true } }))
  assert.doesNotMatch(filtered, />착빙</)
  assert.equal(renderToStaticMarkup(createElement(HighLegend, { ...props, enabled: false })), '')
  assert.equal(renderToStaticMarkup(createElement(HighLegend, { ...props, filter: {} })), '')
})

test('the existing legend dock holds source times and HIGH without adding another toggle', async () => {
  await renderLegends({})
  const { default: TimeCard } = await viteServer.ssrLoadModule('/src/features/weather-overlays/WeatherLayerTimestampBar.jsx')
  const { default: HighLegend } = await viteServer.ssrLoadModule('/src/features/weather-overlays/SigwxHighLegend.jsx')
  const { WAFS_CHART_PALETTES } = await viteServer.ssrLoadModule('/src/features/weather-overlays/lib/wafsChartPalette.js')
  const supplementalContent = createElement(TimeCard, {
    embedded: true,
    entries: [{ key: 'sigwxHigh', label: 'SIGWX HIGH', issueLabel: '08/02 12:00 UTC', note: '현재 기상 자료가 아닙니다.' }],
  }, createElement(HighLegend, { enabled: true, filter: { TURBULENCE: true }, palette: WAFS_CHART_PALETTES.dark }))
  // With no other legends, HIGH alone still exposes the existing dock.
  const markup = await renderLegends({ bottomDock: true, supplementalContent, sampleWarning: true, open: true })
  assert.match(markup, /weather-time-card--embedded/)
  assert.match(markup, /현재 기상 자료가 아닙니다/)
  assert.match(markup, /SIGWX HIGH 난류·착빙 범례/)
  assert.match(markup, /HIGH 현재 자료 아님/)
  assert.equal((markup.match(/<button/g) || []).length, 1)
  assert.match(markup, /aria-expanded="true"/)
})

test('HIGH details expose overlapping hazards and heights without duplicating timestamp card', async () => {
  await renderLegends({})
  const { default: Details } = await viteServer.ssrLoadModule('/src/features/weather-overlays/SigwxHighDetails.jsx')
  const { WAFS_CHART_PALETTES } = await viteServer.ssrLoadModule('/src/features/weather-overlays/lib/wafsChartPalette.js')
  const frame = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'public/samples/sigwx-high/frame-00.json'), 'utf8'))
  const items = frame.features.filter(f => f.properties.role === 'boundary' && ['TURBULENCE', 'AIRFRAME_ICING'].includes(f.properties.phenomenon)).slice(0, 2).map(f => f.properties)
  const model = { selection: { key: 'sample', items, activeId: items[0].objectId }, frame,
    picked: { ms: Date.UTC(2026, 8, 29) }, palette: WAFS_CHART_PALETTES.light, clearSelection() {}, choose() {} }
  const html = renderToStaticMarkup(createElement(Details, { model, tz: 'UTC' }))
  assert.match(html, /겹친 현상 선택/)
  assert.doesNotMatch(html, /원본 발표|원본 유효|표시 시각/)
  assert.doesNotMatch(html, /지점 자료/)
  assert.match(html, /난류 영역/)
  assert.match(html, /현상의 고도 범위/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /하한/)
  assert.match(html, /상한/)
  assert.equal(renderToStaticMarkup(createElement(Details, { model: { ...model, selection: null }, tz: 'UTC' })), '')
})

test('SIGWX HIGH timestamp card shows issue and valid time labels', async () => {
  await renderLegends({})
  const { default: TimeCard } = await viteServer.ssrLoadModule('/src/features/weather-overlays/WeatherLayerTimestampBar.jsx')
  const html = renderToStaticMarkup(createElement(TimeCard, { entries: [{ key: 'sigwxHigh', label: 'SIGWX HIGH · 고정 샘플',
    issueLabel: '2026-08-02 16:30 UTC', timeLabel: '발표', validLabel: '2026-08-02 18:00 UTC', validTimeLabel: '유효' }] }))
  assert.match(html, /<small>발표<\/small>/)
  assert.match(html, /<small>유효<\/small>/)
  assert.doesNotMatch(html, /<small>표시<\/small>|원본 유효|48시간 주기 반복/)
})
