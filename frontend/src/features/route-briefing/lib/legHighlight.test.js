import assert from 'node:assert/strict'
import test from 'node:test'
import { legCoordinates, legHighlightCoordinates, rangeCoordinates, syncLegHighlight, LEG_HL_SOURCE } from './legHighlight.js'

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

test('rangeCoordinates가 누적거리(NM) 범위로 여러 구간에 걸친 경로선을 잘라낸다', () => {
  // 126.8E를 따라 정남쪽: 위도 0.5°는 약 30NM.
  const preview = { features: [{ properties: { role: 'route-preview-line' }, geometry: { type: 'LineString',
    coordinates: [[126.8, 37.5], [126.8, 37.0], [126.8, 36.5], [126.8, 36.0]] } }] }
  const cut = rangeCoordinates(preview, 15, 75)
  assert.ok(Math.abs(cut[0][1] - 37.25) < 0.01)
  assert.deepEqual(cut.slice(1, 3), [[126.8, 37.0], [126.8, 36.5]])
  assert.ok(Math.abs(cut.at(-1)[1] - 36.25) < 0.01)
  assert.deepEqual(rangeCoordinates(preview, 50, 40), [])
  assert.deepEqual(rangeCoordinates(null, 0, 10), [])
})

test('legHighlightCoordinates는 FIX 이름을 먼저 쓰고 못 찾으면 NM 범위로 자른다', () => {
  const preview = { features: [
    { properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: [[126.8, 37.5], [126.8, 37.0], [126.8, 36.5]] } },
    { properties: { role: 'route-preview-point', label: 'AAA' }, geometry: { type: 'Point', coordinates: [126.8, 37.5] } },
    { properties: { role: 'route-preview-point', label: 'CCC' }, geometry: { type: 'Point', coordinates: [126.8, 36.5] } },
  ] }
  assert.equal(legHighlightCoordinates(preview, { from: 'AAA', to: 'CCC' }).length, 3)
  const byRange = legHighlightCoordinates(preview, { from: 'NOPE', to: 'CCC', startNm: 0, endNm: 30 })
  assert.equal(byRange.length, 2)
})
