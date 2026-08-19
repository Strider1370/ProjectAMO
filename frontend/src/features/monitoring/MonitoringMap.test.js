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

test('monitoring map passes only its approved weather overlays', () => {
  for (const prop of ['hsrMeta', 'hciMeta', 'satVisibleMeta', 'satMeta', 'airmetData', 'lightningData']) {
    assert.match(source, new RegExp(`${prop}=\\{weather\\?\\.`))
  }
  assert.match(source, /sigmetData=\{weather\?\.sigmet \|\| null\}/)
  for (const prop of ['echoMeta', 'wissdomMeta', 'qpfMeta', 'echoTopMeta', 'rainviewerMeta', 'convectiveMeta', 'sigwxLowData', 'notamData']) {
    assert.doesNotMatch(source, new RegExp(`${prop}=`))
  }
  assert.match(source, /metLayerIds=\{MONITORING_MET_LAYER_IDS\}/)
  assert.match(source, /enableWindOverlay=\{false\}/)
  assert.match(source, /showRadarWindControl=\{false\}/)
  assert.match(source, /enableFlightCategory=\{false\}/)
  assert.match(source, /enableTyphoonOverlay=\{false\}/)
  assert.match(source, /enableRouteBriefing=\{false\}/)
})
