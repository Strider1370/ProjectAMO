import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { fileURLToPath } from 'url'

import { TerrainTileCache } from '../src/terrain/terrain-cache.js'
import {
  TILE_SIZE,
  firSpansAtLat,
  loadIncheonFirRings,
  renderTerrainRgbRaw,
} from '../src/terrain/terrain-rgb-tiles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TERRAIN_ROOT = path.join(__dirname, '../data/terrain')

// 픽셀 → 표고(m). 프런트 raster-color-mix가 하는 계산과 같다.
function decode(pixels, col, row) {
  const offset = (row * TILE_SIZE + col) * 3
  return -10000 + (pixels[offset] * 65536 + pixels[offset + 1] * 256 + pixels[offset + 2]) * 0.1
}

function tileOf(lon, lat, z) {
  const n = 2 ** z
  const latRad = (lat * Math.PI) / 180
  return {
    z,
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  }
}

function pixelOf(lon, lat, { z, x, y }) {
  const n = 2 ** z
  const latRad = (lat * Math.PI) / 180
  const worldX = ((lon + 180) / 360) * n
  const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return {
    col: Math.min(TILE_SIZE - 1, Math.floor((worldX - x) * TILE_SIZE)),
    row: Math.min(TILE_SIZE - 1, Math.floor((worldY - y) * TILE_SIZE)),
  }
}

test('인천 FIR 안팎을 위도선 교차로 갈라낸다', () => {
  const rings = loadIncheonFirRings()
  const spans = firSpansAtLat(rings, 34.3)  // 대한해협 위도
  const inside = (lon) => spans.filter((crossing) => crossing < lon).length % 2 === 1
  assert.equal(inside(128.6), true, '부산 앞바다는 FIR 안')
  assert.equal(inside(129.35), false, '대마도는 후쿠오카 FIR')
})

test('타일 픽셀이 우리 DEM 표고를 담고, FIR 밖은 자료 없음이다', () => {
  const rings = loadIncheonFirRings()
  const cache = new TerrainTileCache({ terrainRoot: TERRAIN_ROOT })

  // 한라산(1,947m)이 들어 있는 z9 타일.
  const hallaTile = tileOf(126.53, 33.36, 9)
  const halla = renderTerrainRgbRaw(hallaTile, cache, rings)
  const hallaPixel = pixelOf(126.53, 33.36, hallaTile)
  const summit = decode(halla, hallaPixel.col, hallaPixel.row)
  assert.ok(summit > 1200 && summit < 2000, `한라산 정상 부근 표고: ${summit}`)

  // 대마도(FIR 밖)는 실제로 산이 있지만 자료 없음으로 비워야 한다.
  const tsushimaTile = tileOf(129.33, 34.32, 9)
  const tsushima = renderTerrainRgbRaw(tsushimaTile, cache, rings)
  const tsushimaPixel = pixelOf(129.33, 34.32, tsushimaTile)
  assert.equal(decode(tsushima, tsushimaPixel.col, tsushimaPixel.row), -10000)
})
