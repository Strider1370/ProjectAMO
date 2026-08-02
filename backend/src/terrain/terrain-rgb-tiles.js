// 지형 근접 색칠(프런트 terrainHazardLayer.js)이 쓰는 terrain-RGB 타일.
// 우리 DEM(korea3sec, 연직 프로파일과 같은 자료)을 Mapbox terrain-RGB 규격으로 인코딩하고,
// 인천 FIR 밖 픽셀은 '자료 없음'으로 채운다 — 프런트의 색 범위 아래로 떨어져 투명해진다.
// Mapbox 지형 타일을 쓰면 일본·중국까지 칠해지고 표고 출처도 프로파일과 달라져서 직접 만든다.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { TerrainTileCache } from './terrain-cache.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIR_GEOJSON = path.join(__dirname, '../../../frontend/public/data/fir.geojson')

export const TILE_SIZE = 256
export const NO_DATA_ELEVATION_M = -10000

// 인천 FIR 외접 사각형 — 프런트 소스 bounds와 같은 값을 쓴다(FIR 밖 타일은 요청조차 하지 않도록).
export const INCHEON_FIR_BBOX = [123.5, 30.5, 133.0, 39.5]

let cachedRings = null

export function loadIncheonFirRings(geojsonPath = FIR_GEOJSON) {
  if (cachedRings) return cachedRings
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8').replace(/^﻿/, ''))
  const feature = geojson.features.find((item) => item.properties?.role === 'incheon-fir')
  if (!feature) throw new Error('fir.geojson has no incheon-fir polygon')
  const polygons = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates]
  // even-odd 규칙으로 채우므로 바깥 고리와 구멍을 구분할 필요가 없다.
  cachedRings = polygons.flat()
  return cachedRings
}

function tileLon(x, z, fraction) {
  return ((x + fraction) / 2 ** z) * 360 - 180
}

function tileLat(y, z, fraction) {
  const n = Math.PI - (2 * Math.PI * (y + fraction)) / 2 ** z
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

// 가로선 y=lat 이 고리들과 만나는 경도들 → 정렬하면 [들어감, 나옴] 짝이 된다.
export function firSpansAtLat(rings, lat) {
  const crossings = []
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[j]
      if ((y1 > lat) === (y2 > lat)) continue
      crossings.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1))
    }
  }
  return crossings.sort((a, b) => a - b)
}

export function renderTerrainRgbRaw({ z, x, y }, cache, rings) {
  const pixels = Buffer.alloc(TILE_SIZE * TILE_SIZE * 3)
  const west = tileLon(x, z, 0)
  const lonStep = (tileLon(x, z, 1) - west) / TILE_SIZE

  for (let row = 0; row < TILE_SIZE; row += 1) {
    const lat = tileLat(y, z, (row + 0.5) / TILE_SIZE)
    const spans = firSpansAtLat(rings, lat)
    let span = 0
    for (let col = 0; col < TILE_SIZE; col += 1) {
      const lon = west + (col + 0.5) * lonStep
      while (span < spans.length && spans[span] < lon) span += 1
      const insideFir = span % 2 === 1
      const elevationM = insideFir ? cache.sampleNearest(lon, lat) : null
      const value = Math.round(((elevationM ?? NO_DATA_ELEVATION_M) + 10000) * 10)
      const offset = (row * TILE_SIZE + col) * 3
      pixels[offset] = (value >> 16) & 0xff
      pixels[offset + 1] = (value >> 8) & 0xff
      pixels[offset + 2] = value & 0xff
    }
  }
  return pixels
}

export function createTerrainRgbTiler({ terrainRoot, maxCachedTiles = 128 }) {
  const cache = new TerrainTileCache({ terrainRoot })
  const pngCache = new Map()

  return async function renderTile({ z, x, y }) {
    const key = `${z}/${x}/${y}`
    if (pngCache.has(key)) {
      const hit = pngCache.get(key)
      pngCache.delete(key)
      pngCache.set(key, hit)
      return hit
    }

    const raw = renderTerrainRgbRaw({ z, x, y }, cache, loadIncheonFirRings())
    const png = await sharp(raw, { raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 3 } })
      .png({ compressionLevel: 6 })
      .toBuffer()

    pngCache.set(key, png)
    while (pngCache.size > maxCachedTiles) pngCache.delete(pngCache.keys().next().value)
    return png
  }
}
