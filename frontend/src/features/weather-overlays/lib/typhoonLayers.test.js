import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTyphoonGeoJson, TYPHOON_LAYER_IDS, TYPHOON_SOURCE_IDS } from './typhoonLayers.js'

const row = (leadHours, forecast, lat, lon, validAt) => ({
  forecast, leadHours, lat, lon, seq: 32,
  validAt: validAt ?? `2022-09-05T${String(leadHours).padStart(2, '0')}:00:00.000Z`,
  pressureHpa: 930, maxWindMs: 50, location: '서귀포 남남서쪽 약 410 km 부근 해상',
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
