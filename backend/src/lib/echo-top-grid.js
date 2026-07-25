// Echo Top 합성 격자 — 기존 HSR 레이더 합성 격자(2305×2881, 0.5 km LCC)를
// stride 4로 솎은 2 km 격자. 같은 투영을 쓰므로 Echo Top 이미지가
// 레이더 이미지와 경계·픽셀 정렬이 정확히 일치한다.
import { gridToLatLon, latLonToGrid } from '../parsers/radar-echo-parser.js'

const HSR_NX = 2305
const HSR_NY = 2881

export const ECHO_TOP_GRID = Object.freeze({
  stride: 4,
  nx: Math.ceil(HSR_NX / 4), // 577
  ny: Math.ceil(HSR_NY / 4), // 721
})

export function echoTopIndexForLatLon(lat, lon, grid = ECHO_TOP_GRID) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const { x, y } = latLonToGrid(lat, lon)
  const ix = Math.round(x / grid.stride)
  const iy = Math.round(y / grid.stride)
  if (ix < 0 || ix >= grid.nx || iy < 0 || iy >= grid.ny) return null
  return iy * grid.nx + ix
}

export function echoTopCellToLatLon(ix, iy, grid = ECHO_TOP_GRID) {
  return gridToLatLon(ix * grid.stride, iy * grid.stride)
}
