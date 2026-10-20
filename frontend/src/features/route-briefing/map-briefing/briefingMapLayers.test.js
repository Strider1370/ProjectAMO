import test from 'node:test'
import assert from 'node:assert/strict'
import { coordinatesBounds, focusCollection, hazardBandCollection, ribbonRangeCoordinates } from './briefingMapLayers.js'

// 지도 preview 선(절차 없음): 적도 위 동서 직선.
const previewGeojson = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] } }],
}
// 단면 샘플(SID 포함 실제 경로 축): 0–60NM은 북쪽으로 올라갔다가(절차) 60–120NM은 동쪽으로.
const samples = [
  { distanceNm: 0, lon: 0, lat: 0 }, { distanceNm: 60, lon: 0, lat: 1 }, { distanceNm: 120, lon: 1, lat: 1 },
]
const preview = { samples, previewGeojson }
const ribbon = {
  totalDistanceNm: 120,
  rows: [
    { key: 'turbulence', model: [{ level: 'SEV', startNm: 30, endNm: 90 }], frames: [{ source: 'SIGMET', startNm: 0, endNm: 60 }] },
    { key: 'icing', model: [{ level: 'MOD', startNm: 0, endNm: 30 }], frames: [] },
    { key: 'typhoon', model: [], frames: [{ source: 'TYPHOON', startNm: 100, endNm: 120 }] },
  ],
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} ≠ ${expected}`)

test('막대 거리 → 좌표는 단면 샘플(절차 포함) 축을 따른다, 샘플이 없을 때만 preview 선', () => {
  const coordinates = ribbonRangeCoordinates(preview, 30, 90)
  assert.deepEqual(coordinates.map(([lon, lat]) => [+lon.toFixed(3), +lat.toFixed(3)]), [[0, 0.5], [0, 1], [0.5, 1]])
  const fallback = ribbonRangeCoordinates({ previewGeojson }, 30, 90)
  near(fallback[0][0], 0.5)
  near(fallback.at(-1)[0], 1.5)
  assert.deepEqual(ribbonRangeCoordinates(null, 0, 10), [])
})

test('색 띠: 모델 구간과 태풍만(SIGMET 틀은 띠 없음), 숨긴 줄 제외, SEV가 MOD 위', () => {
  const bands = hazardBandCollection(ribbon, preview)
  assert.deepEqual(bands.features.map((feature) => [feature.properties.row, feature.properties.level]), [['icing', 'MOD'], ['turbulence', 'SEV'], ['typhoon', 'TC']])
  const hidden = hazardBandCollection(ribbon, preview, { hiddenRows: ['turbulence'] })
  assert.deepEqual(hidden.features.map((feature) => feature.properties.row), ['icing', 'typhoon'])
})

test('가리킨 구간은 선만, 누른 구간은 시작·끝 이름표까지', () => {
  const item = { startNm: 30, endNm: 90, from: 'AAA', to: 'BBB' }
  assert.deepEqual(focusCollection(ribbon, preview, { item }).features.map((feature) => feature.properties.kind), ['line'])
  const pinned = focusCollection(ribbon, preview, { item, pinned: true })
  assert.deepEqual(pinned.features.filter((feature) => feature.properties.kind === 'label').map((feature) => feature.properties.text), ['시작 AAA', '끝 BBB'])
  assert.equal(focusCollection(ribbon, preview, null).features.length, 0)
})

test('구간 경계', () => {
  assert.deepEqual(coordinatesBounds([[1, 2], [3, -1], [2, 5]]), [[1, -1], [3, 5]])
  assert.equal(coordinatesBounds([]), null)
})
