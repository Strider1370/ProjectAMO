import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KOREA_HIGHEST_TERRAIN_FT,
  TERRAIN_HAZARD_ALT_FT,
  TERRAIN_HAZARD_LAYER,
  TERRAIN_HAZARD_RED,
  TERRAIN_HAZARD_SOURCE,
  TERRAIN_HAZARD_YELLOW,
  TERRAIN_RGB_MIX,
  syncTerrainHazardLayer,
  terrainHazardPaint,
} from './terrainHazardLayer.js'

function createMockMap() {
  const sources = new Map()
  const layers = new Map()
  const paintCalls = []
  return {
    sources,
    layers,
    paintCalls,
    addSource(id, source) { sources.set(id, source) },
    getSource(id) { return sources.get(id) ?? null },
    removeSource(id) { sources.delete(id) },
    addLayer(layer) { layers.set(layer.id, layer) },
    getLayer(id) { return layers.get(id) ?? null },
    removeLayer(id) { layers.delete(id) },
    setPaintProperty(id, key, value) { paintCalls.push([id, key, value]) },
  }
}

// step 표현식에서 실제 색을 뽑는다: ['step', input, base, stop1, color1, stop2, color2, ...]
function colorAt(paint, elevationM) {
  const [, , base, ...pairs] = paint['raster-color']
  let color = base
  for (let i = 0; i < pairs.length; i += 2) {
    if (elevationM >= pairs[i]) color = pairs[i + 1]
  }
  return color
}

test('terrain-RGB 계수가 알려진 픽셀을 실제 표고로 디코딩한다', () => {
  // R=1, G=134, B=160 → -10000 + (65536 + 34304 + 160) * 0.1 = 0.0 m (Mapbox 문서 예시)
  const [rc, gc, bc, offset] = TERRAIN_RGB_MIX
  const decoded = (1 / 255) * rc + (134 / 255) * gc + (160 / 255) * bc + offset
  assert.ok(Math.abs(decoded - 0) < 0.001, `해수면이 0m로 나와야 함: ${decoded}`)
})

test('선택 고도 3,000ft — 100ft 이내는 적, 1,000ft 아래까지는 황, 그 아래는 투명', () => {
  const paint = terrainHazardPaint(3000)
  const ft = (v) => v * 0.3048
  assert.equal(colorAt(paint, ft(3200)), TERRAIN_HAZARD_RED, '고도보다 높은 지형')
  assert.equal(colorAt(paint, ft(2950)), TERRAIN_HAZARD_RED, '50ft 아래')
  assert.equal(colorAt(paint, ft(2800)), TERRAIN_HAZARD_YELLOW, '200ft 아래')
  assert.equal(colorAt(paint, ft(2100)), TERRAIN_HAZARD_YELLOW, '900ft 아래')
  assert.equal(colorAt(paint, ft(1900)), 'rgba(0, 0, 0, 0)', '1,100ft 아래 — 여유 있음')
})

test('고도 눈금은 국내 최고봉 + 황색 여유까지만 올라간다', () => {
  const top = Math.max(...TERRAIN_HAZARD_ALT_FT)
  assert.ok(top >= KOREA_HIGHEST_TERRAIN_FT + 1000, `한라산+1,000ft를 못 덮음: ${top}`)
  // 그 위는 어떤 지형도 안 걸려 백지만 보여준다 — 한 칸 여유까지만.
  assert.ok(top < KOREA_HIGHEST_TERRAIN_FT + 2000, `쓸모없는 눈금이 남아 있음: ${top}`)
})

test('꺼지면 소스와 레이어를 지운다 — 타일 요청이 남지 않도록', () => {
  const map = createMockMap()
  syncTerrainHazardLayer(map, { visible: true, altitudeFt: 3000 })
  assert.ok(map.getSource(TERRAIN_HAZARD_SOURCE))
  assert.ok(map.getLayer(TERRAIN_HAZARD_LAYER))
  // 표고 타일은 우리 백엔드가 준다 — FIR 밖이 비어 있는 자료라야 일본이 칠해지지 않는다.
  assert.equal(map.getSource(TERRAIN_HAZARD_SOURCE).tiles[0], '/api/terrain/rgb/{z}/{x}/{y}.png')

  syncTerrainHazardLayer(map, { visible: false, altitudeFt: 3000 })
  assert.equal(map.getSource(TERRAIN_HAZARD_SOURCE), null)
  assert.equal(map.getLayer(TERRAIN_HAZARD_LAYER), null)
})

test('고도만 바뀌면 레이어를 다시 만들지 않고 색만 갈아끼운다', () => {
  const map = createMockMap()
  syncTerrainHazardLayer(map, { visible: true, altitudeFt: 3000 })
  syncTerrainHazardLayer(map, { visible: true, altitudeFt: 6500 })
  assert.equal(map.paintCalls.filter(([, key]) => key === 'raster-color').length, 1)
  const [, , color] = map.paintCalls.find(([, key]) => key === 'raster-color')
  assert.deepEqual(color, terrainHazardPaint(6500)['raster-color'])
})
