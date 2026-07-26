import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RADAR_MOTION_ARROW_LAYER, RADAR_MOTION_SHAFT_LAYER, RADAR_MOTION_SHAFT_SOURCE, RADAR_MOTION_SOURCE,
  arrowTip, buildMotionHeadGeoJSON, buildMotionShaftGeoJSON, syncRadarMotionLayer,
} from './radarMotionLayers.js'

function fakeMap() {
  const sources = new Map(), layers = new Map(), images = new Set()
  return {
    sources, layers, images,
    getSource: (id) => sources.get(id),
    addSource: (id, spec) => sources.set(id, { ...spec, setData(data) { this.data = data } }),
    getLayer: (id) => layers.get(id),
    addLayer: (spec) => layers.set(spec.id, spec),
    setLayoutProperty: (id, key, value) => { const l = layers.get(id); if (l) l.layout = { ...l.layout, [key]: value } },
    hasImage: (id) => images.has(id),
    addImage: (id) => images.add(id),
    on: () => {},
  }
}

const point = (lon, lat, bearingDeg, speedKt) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { bearingDeg, speedKt, matchScore: 120, neighbourAgreement: 0.9 },
})
const fc = (...features) => ({ type: 'FeatureCollection', features })

test('화살대는 방위와 속도로 5분 이동거리만큼 뻗는다', () => {
  const shafts = buildMotionShaftGeoJSON(fc(point(127, 37, 90, 30)))
  assert.equal(shafts.features.length, 1)
  const coords = shafts.features[0].geometry.coordinates
  assert.equal(shafts.features[0].geometry.type, 'LineString')
  assert.ok(coords[1][0] > coords[0][0], '동쪽이면 경도가 커져야 한다')
  assert.ok(Math.abs(coords[1][1] - coords[0][1]) < 0.01, '동쪽이면 위도는 거의 그대로')
})

test('화살촉은 화살대 끝점과 정확히 같은 좌표에 놓인다', () => {
  const points = fc(point(127, 37, 45, 25))
  const tip = buildMotionShaftGeoJSON(points).features[0].geometry.coordinates[1]
  const head = buildMotionHeadGeoJSON(points).features[0].geometry.coordinates
  assert.deepEqual(head, tip)
  assert.deepEqual(head, arrowTip(points.features[0]))
})

test('속도가 빠를수록 화살대가 길다', () => {
  const span = (kt) => {
    const c = buildMotionShaftGeoJSON(fc(point(127, 37, 90, kt))).features[0].geometry.coordinates
    return c[1][0] - c[0][0]
  }
  assert.ok(span(40) > span(10) * 3)
})

test('속도 0이나 방위 결측은 버린다', () => {
  assert.deepEqual(buildMotionShaftGeoJSON(fc(point(127, 37, 90, 0))).features, [])
  assert.deepEqual(buildMotionHeadGeoJSON(fc(point(127, 37, NaN, 20))).features, [])
})

test('두 레이어를 등록하고 화살촉에 symbol-placement를 주지 않는다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.ok(map.getSource(RADAR_MOTION_SOURCE))
  assert.ok(map.getSource(RADAR_MOTION_SHAFT_SOURCE))
  const arrow = map.getLayer(RADAR_MOTION_ARROW_LAYER)
  assert.equal(arrow.type, 'symbol')
  assert.equal(arrow.layout['symbol-placement'], undefined, 'line-center 이중 회전을 막아야 한다')
  assert.deepEqual(arrow.layout['icon-rotate'], ['get', 'bearingDeg'])
  assert.equal(arrow.layout['icon-rotation-alignment'], 'map')
  assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).type, 'line')
})

test('보이는 상태에서 받은 점이 두 소스에 실제로 들어간다', async () => {
  const map = fakeMap()
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => fc(point(127, 37, 90, 30), point(127.5, 37.5, 180, 20)) })
  try {
    syncRadarMotionLayer(map, { visible: true, dataUrl: '/data/radar/motion_korea_202607261200.geojson' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).layout.visibility, 'visible')
    assert.equal(map.getSource(RADAR_MOTION_SHAFT_SOURCE).data.features.length, 2)
    assert.equal(map.getSource(RADAR_MOTION_SOURCE).data.features.length, 2)
  } finally { globalThis.fetch = original }
})

test('재동기화해도 소스·레이어가 중복되지 않는다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.equal(map.sources.size, 2)
  assert.equal(map.layers.size, 2)
})

test('숨김이면 두 레이어 모두 none이고 소스가 비워진다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.equal(map.getLayer(RADAR_MOTION_ARROW_LAYER).layout.visibility, 'none')
  assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).layout.visibility, 'none')
  assert.deepEqual(map.getSource(RADAR_MOTION_SOURCE).data.features, [])
})
