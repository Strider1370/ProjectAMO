import test from 'node:test'
import assert from 'node:assert/strict'
import distance from '@turf/distance'
import { addTyphoonLayers, buildTyphoonGeoJson, TYPHOON_LAYER_IDS, TYPHOON_SOURCE_IDS } from './typhoonLayers.js'
import { color } from '../../../shared/theme/tokens.js'

const row = (leadHours, forecast, lat, lon, validAt) => ({
  forecast, leadHours, lat, lon, seq: 32,
  validAt: validAt ?? `2022-09-05T${String(leadHours).padStart(2, '0')}:00:00.000Z`,
  pressureHpa: 930, maxWindMs: 50, location: '서귀포 남남서쪽 약 410 km 부근 해상',
  gale: { radiusKm: 500, exceptionDir: 'SW', exceptionRadiusKm: 330 },
  storm: null,
})

// 분석 행은 leadHours가 전부 0이라 validAt으로 구분해야 한다(실제 데이터는 9~32개).
const analysis0 = row(0, false, 28.6, 124.7, '2022-09-04T18:00:00.000Z')
const analysis1 = row(0, false, 29.8, 124.9) // 더 나중 관측 = 현재 위치

const TYPHOONS = [{
  number: 11, year: 2022, seq: 32, analyzedAt: '2022-09-05T00:00:00.000Z',
  current: analysis1,
  rows: [analysis0, analysis1, row(6, true, 31.0, 125.3), row(12, true, 32.4, 126.2)],
  geometry: {
    cone: { type: 'Polygon', coordinates: [[[124, 29], [126, 29], [126, 33], [124, 33], [124, 29]]] },
    gale: { type: 'Polygon', coordinates: [[[124, 29], [126, 29], [126, 31], [124, 31], [124, 29]]] },
    storm: null,
  },
}]

test('분석 구간과 예보 구간을 서로 다른 선으로 만든다', () => {
  const { track, forecastTrack } = buildTyphoonGeoJson(TYPHOONS)
  assert.equal(track.features.length, 1)
  assert.equal(forecastTrack.features.length, 1)
  assert.equal(forecastTrack.features[0].geometry.coordinates.length, 3, '예보선은 분석 마지막 점에서 이어져야 한다')
})

test('현재 위치는 정확히 한 곳만 표시된다', () => {
  const { points } = buildTyphoonGeoJson(TYPHOONS)
  // 분석 행은 leadHours가 전부 0이라 그것으로는 현재 위치를 고를 수 없다.
  assert.equal(points.features.filter((f) => f.properties.isCurrent).length, 1)
  const current = points.features.find((f) => f.properties.isCurrent)
  assert.deepEqual(current.geometry.coordinates, [124.9, 29.8])
})

test('모든 지점에 태풍번호와 색이 붙는다', () => {
  const { points } = buildTyphoonGeoJson(TYPHOONS)
  assert.equal(points.features.length, 4)
  for (const feature of points.features) {
    assert.equal(feature.properties.number, 11)
    assert.match(feature.properties.color, /^#[0-9a-f]{6}$/i)
    assert.equal(feature.properties.label, '11호')
  }
})

test('분석 행이 하나뿐이면 경로선을 만들지 않는다', () => {
  const single = [{ ...TYPHOONS[0], rows: [analysis1, row(6, true, 31.0, 125.3)], current: analysis1 }]
  const { track, points } = buildTyphoonGeoJson(single)
  assert.equal(track.features.length, 0, '점 하나로는 선을 그릴 수 없다')
  assert.ok(points.features.length > 0, '지점 자체는 표시되어야 한다')
})

test('폭풍 도형이 없으면 그 피처를 만들지 않는다', () => {
  const { storm, gale } = buildTyphoonGeoJson(TYPHOONS)
  assert.equal(storm.features.length, 0)
  assert.equal(gale.features.length, 1)
})

test('복수 태풍은 서로 다른 색을 받는다', () => {
  const second = { ...TYPHOONS[0], number: 12 }
  const { points } = buildTyphoonGeoJson([TYPHOONS[0], second])
  const colors = new Set(points.features.map((f) => f.properties.color))
  assert.equal(colors.size, 2)
})

function assertRadius(geometry, center, radiusKm) {
  assert.equal(geometry.type, 'Polygon')
  assert.equal(geometry.coordinates[0].length, 73)
  for (const point of geometry.coordinates[0]) {
    assert.ok(Math.abs(distance(center, point) - radiusKm) < 0.001)
  }
}

test('강풍·폭풍은 예외 방향을 생략한 동심원이며 원본과 70% 영역은 보존한다', () => {
  const input = structuredClone(TYPHOONS)
  input[0].current.storm = { radiusKm: 60, exceptionDir: 'SW', exceptionRadiusKm: 40 }
  const before = structuredClone(input)
  const result = buildTyphoonGeoJson(input)
  assertRadius(result.gale.features[0].geometry, [124.9, 29.8], 500)
  assertRadius(result.storm.features[0].geometry, [124.9, 29.8], 60)
  assert.deepEqual(result.cone.features[0].geometry, input[0].geometry.cone)
  assert.deepEqual(input, before)
})

test('시각 선택 시 해당 중심과 반경만 사용하고 다른 태풍과 70% 영역은 유지한다', () => {
  const forecast = { ...row(24, true, 33, 126), gale: { radiusKm: 520 }, storm: { radiusKm: 70 } }
  const input = [{ ...TYPHOONS[0], rows: [...TYPHOONS[0].rows, forecast] }, { ...TYPHOONS[0], number: 12 }]
  const result = buildTyphoonGeoJson(input, { number: 11, validAt: forecast.validAt })
  assertRadius(result.gale.features[0].geometry, [126, 33], 520)
  assertRadius(result.storm.features[0].geometry, [126, 33], 70)
  assertRadius(result.gale.features[1].geometry, [124.9, 29.8], 500)
  assert.deepEqual(result.cone, buildTyphoonGeoJson(input).cone)
})

test('선택 시각 반경이 결측 또는 유효하지 않으면 현재 반경으로 대체하지 않는다', () => {
  for (const radiusKm of [null, undefined, 0, -999, NaN, Infinity]) {
    const forecast = { ...row(24, true, 33, 126), gale: { radiusKm }, storm: { radiusKm } }
    const input = [{ ...TYPHOONS[0], rows: [forecast] }]
    const result = buildTyphoonGeoJson(input, { number: 11, validAt: forecast.validAt })
    assert.equal(result.gale.features.length, 0)
    assert.equal(result.storm.features.length, 0)
    assert.equal(result.cone.features.length, 1)
  }
})

test('빈 목록은 빈 FeatureCollection이다', () => {
  const result = buildTyphoonGeoJson([])
  for (const key of ['track', 'forecastTrack', 'points', 'cone', 'gale', 'storm']) {
    assert.equal(result[key].type, 'FeatureCollection')
    assert.deepEqual(result[key].features, [])
  }
})

test('소스와 레이어 ID가 중복 없이 정의된다', () => {
  assert.equal(new Set(TYPHOON_SOURCE_IDS).size, TYPHOON_SOURCE_IDS.length)
  assert.equal(new Set(TYPHOON_LAYER_IDS).size, TYPHOON_LAYER_IDS.length)
  assert.ok(TYPHOON_LAYER_IDS.length >= TYPHOON_SOURCE_IDS.length)
})

test('강도 숫자는 현재와 예보에만 표시하고 과거는 작은 채운 점으로 구분한다', () => {
  const { points } = buildTyphoonGeoJson(TYPHOONS)
  assert.deepEqual(points.features.map((feature) => feature.properties.strength), ['4', '4', '4', '4'])

  const layers = []
  const map = {
    getSource: () => null,
    addSource: () => {},
    getLayer: () => null,
    addLayer: (layer) => layers.push(layer),
  }
  addTyphoonLayers(map)
  const marker = layers.find((layer) => layer.id === 'typhoon-points-circle')
  assert.ok(marker)
  assert.equal(marker.type, 'circle')
  assert.deepEqual(layers.find((layer) => layer.id === 'typhoon-points-strength').filter,
    ['any', ['==', ['get', 'isCurrent'], true], ['==', ['get', 'forecast'], true]])
  assert.deepEqual(layers.find((layer) => layer.id === 'typhoon-current-ring').filter,
    ['==', ['get', 'isCurrent'], true])
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-points-circle'))
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-points-strength'))
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-point-labels'))
  assert.deepEqual(layers.find((layer) => layer.id === 'typhoon-forecast-track-line').paint['line-dasharray'], [5, 3])
})

test('현재 위치에는 이름을, 24시간 간격 예보에만 상대시각을 붙인다', () => {
  const input = { ...TYPHOONS[0], name: '힌남노', rows: [
    ...TYPHOONS[0].rows,
    ...[24, 36, 48, 72, 96, 120].map((lead) => row(lead, true, 33, 126)),
  ] }
  const points = buildTyphoonGeoJson(JSON.parse(JSON.stringify([input]))).points.features
  assert.equal(points.find((point) => point.properties.isCurrent).properties.pointLabel, '11호 힌남노 · 현재')
  assert.deepEqual(points.filter((point) => !point.properties.isCurrent).map((point) => point.properties.pointLabel),
    ['', '', '', '+24h', '', '+48h', '+72h', '+96h', '+120h'])
  const unnamed = buildTyphoonGeoJson(TYPHOONS).points.features.find((point) => point.properties.isCurrent)
  assert.equal(unnamed.properties.pointLabel, '11호 · 현재')
})

test('반경과 오차 콘은 색 테두리로 구분하고 콘 테두리는 점선이다', () => {
  const layers = []
  const map = {
    getSource: () => null,
    addSource: () => {},
    getLayer: () => null,
    addLayer: (layer) => layers.push(layer),
  }
  addTyphoonLayers(map)
  for (const id of ['typhoon-gale-outline', 'typhoon-storm-outline']) {
    const layer = layers.find((entry) => entry.id === id)
    assert.ok(layer)
    assert.equal(layer.paint['line-color'], color.icing[3])
  }
  const cone = layers.find((entry) => entry.id === 'typhoon-cone-outline')
  assert.ok(cone)
  assert.deepEqual(cone.paint['line-dasharray'], [2, 2])
  assert.equal(cone.paint['line-color'], color.level.amber)
})

test('태풍별 숨김은 모든 도형에 적용되고 남은 태풍의 색은 유지된다', () => {
  const all = [...TYPHOONS, { ...TYPHOONS[0], number: 17 }]
  const before = buildTyphoonGeoJson(all)
  const after = buildTyphoonGeoJson(all, null, ['2022-11'])
  for (const collection of Object.values(after)) {
    assert.ok(collection.features.every((feature) => feature.properties.number === 17))
  }
  assert.equal(after.points.features[0].properties.color, before.points.features.find((f) => f.properties.number === 17).properties.color)
  assert.equal(buildTyphoonGeoJson(all, null, ['2021-11']).points.features.length, 8, '다른 연도 설정을 적용하지 않는다')
  for (const collection of Object.values(buildTyphoonGeoJson(all, null, ['2022-11', '2022-17']))) {
    assert.equal(collection.features.length, 0)
  }
})
