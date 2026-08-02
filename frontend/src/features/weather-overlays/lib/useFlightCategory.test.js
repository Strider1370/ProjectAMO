import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOverlayPayload } from './useFlightCategory.js'

test('꾸러미를 갈라 낸다', () => {
  const out = splitOverlayPayload({
    computed_at: '2026-08-01T15:22:13.722Z',
    visibility: { geojson: { type: 'FeatureCollection', features: [1] } },
    ceiling: { geojson: { type: 'FeatureCollection', features: [2] } },
    stations: [{ id: 'a' }],
    trend: { hours: 3, vis_delta: [] },
    sources: { missing_ratio: 0.8 },
  })
  assert.deepEqual(out.visibility.features, [1])
  assert.deepEqual(out.ceiling.features, [2])
  assert.deepEqual(out.stations, [{ id: 'a' }])
  assert.equal(out.trend.hours, 3)
  assert.equal(out.computedAt, '2026-08-01T15:22:13.722Z')
  assert.equal(out.hasData, true)
})

test('자료가 없으면 빈 도형을 주고 hasData가 거짓이다', () => {
  // 빈 화면을 "문제 없음"으로 읽게 두지 않기 위한 신호다.
  const out = splitOverlayPayload(null)
  assert.deepEqual(out.visibility.features, [])
  assert.deepEqual(out.ceiling.features, [])
  assert.deepEqual(out.stations, [])
  assert.equal(out.trend, null)
  assert.equal(out.computedAt, null)
  assert.equal(out.hasData, false)
})

test('trend가 null인 산출물도 받아들인다', () => {
  // 서버를 켠 지 3시간이 안 되면 정상적으로 null이다.
  const out = splitOverlayPayload({ visibility: { geojson: { type: 'FeatureCollection', features: [] } }, trend: null })
  assert.equal(out.trend, null)
  assert.equal(out.hasData, true)
})
