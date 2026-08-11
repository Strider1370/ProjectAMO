import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./MonitoringMap.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./MonitoringPage.css', import.meta.url), 'utf8')

test('monitoring map keeps an accessible local loading status until Mapbox style readiness', () => {
  assert.match(source, /const \[mapStyleReady, setMapStyleReady\] = useState\(false\)/)
  assert.match(source, /onStyleReady=\{\(\) => setMapStyleReady\(true\)\}/)
  assert.match(source, /!mapStyleReady && \([\s\S]*?className="monitoring-map-loading"[\s\S]*?role="status"[\s\S]*?지도 불러오는 중…/)
  assert.match(css, /\.monitoring-map-loading\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?z-index:\s*5;/)
  assert.match(css, /\.monitoring-mapbox-panel:has\(\.map-view-error\) \.monitoring-map-loading\s*\{[\s\S]*?display:\s*none;/)
})

test('monitoring map forwards every weather overlay dataset supported by MapView', () => {
  for (const prop of [
    'wissdomMeta',
    'qpfMeta',
    'hsrMeta',
    'hciMeta',
    'satVisibleMeta',
    'echoTopMeta',
    'rainviewerMeta',
    'satMeta',
    'convectiveMeta',
    'notamData',
  ]) {
    const weatherProp = prop === 'notamData' ? 'notam' : prop
    assert.match(source, new RegExp(`${prop}=\\{weather\\?\\.${weatherProp}`))
  }
  assert.match(source, /enableWindOverlay=\{true\}/)
})
