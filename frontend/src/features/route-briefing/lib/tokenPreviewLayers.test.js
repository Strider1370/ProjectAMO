import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTokenPreviewGeojson, syncTokenPreviewLayers, TOKEN_PREVIEW_SOURCE } from './tokenPreviewLayers.js'
import { classifyTokens, tokenGeometry } from './routeTokens.js'

const lookups = {
  airports: ['RKSI', 'RKPK'],
  airportsById: {
    RKSI: { coordinates: { lat: 37.4602, lon: 126.4407 } },
    RKPK: { coordinates: { lat: 35.1795, lon: 128.9382 } },
  },
  navpoints: { ANDOL: { coordinates: { lat: 37.666, lon: 133 } } },
  routes: { A582: {} },
}

test('a single airport yields one point and no line', () => {
  // 출발공항만 쳤어도 그 지점이 지도에 보여야 한다.
  const geometry = tokenGeometry(classifyTokens(['RKSI'], lookups))
  assert.equal(geometry.points.length, 1)
  assert.deepEqual(geometry.line, [])

  const geojson = buildTokenPreviewGeojson(geometry)
  assert.equal(geojson.features.length, 1)
  assert.equal(geojson.features[0].geometry.type, 'Point')
  assert.equal(geojson.features[0].properties.text, 'RKSI')
})

test('two resolvable tokens yield a line even without an arrival airport', () => {
  // RKSI ANDOL만 쳐도 그 사이를 잇는 선이 나와야 한다.
  const geometry = tokenGeometry(classifyTokens(['RKSI', 'ANDOL'], lookups))
  assert.equal(geometry.points.length, 2)
  assert.equal(geometry.line.length, 2)

  const geojson = buildTokenPreviewGeojson(geometry)
  const line = geojson.features.find((feature) => feature.geometry.type === 'LineString')
  assert.ok(line, '선이 있어야 한다')
  assert.deepEqual(line.geometry.coordinates[0], [126.4407, 37.4602])
})

test('airways and DCT carry no coordinate, so they add no point', () => {
  // 항공로는 지점이 아니다. 점을 찍으면 있지도 않은 위치를 그리는 것이 된다.
  const geometry = tokenGeometry(classifyTokens(['RKSI', 'A582', 'DCT', 'ANDOL'], lookups))
  assert.deepEqual(geometry.points.map((point) => point.text), ['RKSI', 'ANDOL'])
})

test('a typo contributes nothing to the map', () => {
  const geometry = tokenGeometry(classifyTokens(['RKSI', 'GONXA'], lookups))
  assert.equal(geometry.points.length, 1)
})

test('the preview clears once a real route exists', () => {
  // 같은 경로를 두 겹으로 그리면 어느 쪽이 실제 계산 결과인지 흐려진다.
  let data = null
  const map = {
    getStyle: () => ({ layers: [] }),
    getSource: (id) => (id === TOKEN_PREVIEW_SOURCE ? { setData: (value) => { data = value } } : null),
    getLayer: () => true,
    addSource: () => {},
    addLayer: () => {},
  }
  const geometry = tokenGeometry(classifyTokens(['RKSI', 'ANDOL'], lookups))

  syncTokenPreviewLayers(map, geometry, { hasAppliedRoute: false })
  assert.ok(data.features.length > 0)

  const result = syncTokenPreviewLayers(map, geometry, { hasAppliedRoute: true })
  assert.equal(data.features.length, 0)
  assert.deepEqual(result.fitCoordinates, [])
})
