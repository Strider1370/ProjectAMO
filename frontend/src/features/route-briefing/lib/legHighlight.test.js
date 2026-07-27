import assert from 'node:assert/strict'
import test from 'node:test'
import { legCoordinates, syncLegHighlight, LEG_HL_SOURCE } from './legHighlight.js'

const preview = {
  type: 'FeatureCollection',
  features: [
    { properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126, 37], [126.5, 36.5], [127, 36], [127.5, 35.5]] } },
    { properties: { role: 'route-preview-point', label: 'RKSS' }, geometry: { coordinates: [126, 37] } },
    { properties: { role: 'route-preview-point', label: 'BULTI' }, geometry: { coordinates: [126.5, 36.5] } },
    { properties: { role: 'route-preview-point', label: 'MEKIL' }, geometry: { coordinates: [127, 36] } },
  ],
}

test('legCoordinates가 두 FIX 사이의 경로선만 잘라낸다', () => {
  assert.deepEqual(legCoordinates(preview, 'BULTI', 'MEKIL'), [[126.5, 36.5], [127, 36]])
  assert.deepEqual(legCoordinates(preview, 'RKSS', 'MEKIL'), [[126, 37], [126.5, 36.5], [127, 36]])
})

test('legCoordinates가 모르는 FIX·빈 입력에는 빈 배열을 준다', () => {
  assert.deepEqual(legCoordinates(preview, 'BULTI', 'NOPE'), [])
  assert.deepEqual(legCoordinates(preview, null, 'MEKIL'), [])
  assert.deepEqual(legCoordinates(null, 'BULTI', 'MEKIL'), [])
  // 같은 지점끼리는 구간이 아니다.
  assert.deepEqual(legCoordinates(preview, 'BULTI', 'BULTI'), [])
})

function fakeMap() {
  const state = { data: null }
  return {
    state,
    getSource: () => ({ setData: (d) => { state.data = d } }),
    getLayer: () => true,
    addSource: () => {},
    addLayer: () => {},
  }
}

test('syncLegHighlight가 좌표를 실으면 pinned 속성이 따라간다', () => {
  const map = fakeMap()
  syncLegHighlight(map, [[126, 37], [127, 36]], { pinned: true })
  assert.equal(map.state.data.features.length, 1)
  assert.equal(map.state.data.features[0].properties.pinned, true)
  assert.equal(map.state.data.features[0].geometry.type, 'LineString')
})

test('syncLegHighlight가 좌표가 없으면 지운다', () => {
  const map = fakeMap()
  syncLegHighlight(map, [[126, 37], [127, 36]])
  syncLegHighlight(map, [])
  assert.deepEqual(map.state.data.features, [])
  assert.equal(LEG_HL_SOURCE, 'navlog-leg-highlight')
})
