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

test('the WISSDOM toggle lives in the layer panel, not the legend', () => {
  assert.doesNotMatch(source, /radarMotion/)
  assert.doesNotMatch(source, /radar-motion/)
  assert.match(panelSource, /레이더 바람장 \(WISSDOM\)/)
  assert.doesNotMatch(panelSource, /레이더 바람장 \(WISSDOM\) · \{radarWindHeightM\.toLocaleString\(\)\} m/)
  assert.doesNotMatch(panelSource, /레이더 에코 이동벡터 표시/)
  assert.match(css, /\.layer-tile-group-title-action:disabled \{[\s\S]*?background:\s*var\(--surface-2\)/)
  assert.match(css, /\.map-view-wrapper \.map-right-legends > \* \{[\s\S]*?pointer-events:\s*auto/)
})

test('all hooks run before the no-visible-legend return', () => {
  const effect = source.indexOf('useEffect(() =>')
  const emptyReturn = source.indexOf('&& !echoTopLegendVisible) return null')
  assert.ok(effect >= 0)
  assert.ok(emptyReturn > effect)
})

test('horizontal legends preserve ascending ramps and reverse only descending sources', () => {
  const ascending = [{ label: 'weak' }, { label: 'strong' }]
  const descending = [{ label: 'strong' }, { label: 'weak' }]
  assert.deepEqual(entriesLeftToRight(ascending).map((entry) => entry.label), ['weak', 'strong'])
  assert.deepEqual(entriesLeftToRight(descending, true).map((entry) => entry.label), ['weak', 'strong'])
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
  assert.match(visible, /src="\/api\/qpf\/legend\.png"/)
  assert.doesNotMatch(visible, /레이더 관측|QPF.{0,12}관측|관측.{0,12}QPF/)
})
