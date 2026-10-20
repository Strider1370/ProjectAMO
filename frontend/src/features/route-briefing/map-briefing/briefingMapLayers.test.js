import test from 'node:test'
import assert from 'node:assert/strict'
import { coordinatesBounds, focusCollection, hazardBandCollection, ribbonRangeCoordinates } from './briefingMapLayers.js'

// 적도 위 동서 직선: 경도 1° ≈ 60NM. 길이 ≈ 120NM.
const preview = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0], [2, 0]] } }],
}
const ribbon = {
  totalDistanceNm: 120,
  rows: [
    { key: 'turbulence', model: [{ level: 'SEV', startNm: 30, endNm: 90 }], frames: [{ source: 'SIGMET', startNm: 0, endNm: 60 }] },
    { key: 'icing', model: [{ level: 'MOD', startNm: 0, endNm: 30 }], frames: [] },
    { key: 'typhoon', model: [], frames: [{ source: 'TYPHOON', startNm: 100, endNm: 120 }] },
  ],
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} ≠ ${expected}`)

test('막대 거리 → 경로선 좌표: 지도 선이 총 거리와 다르면 비율로 맞춘다', () => {
  const coordinates = ribbonRangeCoordinates(preview, 120, 30, 90)
  near(coordinates[0][0], 0.5)
  near(coordinates.at(-1)[0], 1.5)
  // 브리핑 총 거리가 240NM로 두 배면 같은 막대는 선의 앞쪽 절반 안에 든다.
  near(ribbonRangeCoordinates(preview, 240, 30, 90).at(-1)[0], 0.75)
  assert.deepEqual(ribbonRangeCoordinates(null, 120, 0, 10), [])
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
