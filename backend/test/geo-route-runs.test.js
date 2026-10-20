import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeRunsInGeometry } from '../src/briefing/geo-time-match.js'

// 발표 영역이 둘로 나뉘어 경로가 두 번 들어갔다 나오면 구간도 둘이다.
const box = (x0, x1) => [[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]]
const geometry = { type: 'MultiPolygon', coordinates: [box(1.5, 3.5), box(6.5, 8.5)] }
const axis = { samples: Array.from({ length: 11 }, (_, i) => ({ distanceNm: i * 10, lon: i, lat: 0.5 })) }

test('returns each run where the route is inside the area, with no corridor buffer', () => {
  assert.deepEqual(routeRunsInGeometry(axis, { type: 'Polygon', coordinates: [[[1.5, 0], [3.5, 0], [3.5, 1], [1.5, 1], [1.5, 0]]] }), [{ startNm: 20, endNm: 30 }])
  assert.deepEqual(routeRunsInGeometry(axis, geometry), [{ startNm: 20, endNm: 30 }, { startNm: 70, endNm: 80 }])
})
