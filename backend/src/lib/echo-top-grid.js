// Echo Top 합성 격자 — 기존 HSR 레이더 합성 격자(2305×2881, 0.5 km LCC)를
// stride 2로 솎은 1 km 격자. 같은 투영을 쓰므로 Echo Top 이미지가
// 레이더 이미지와 경계·픽셀 정렬이 정확히 일치한다.
import { gridToLatLon, latLonToGrid } from '../parsers/radar-echo-parser.js'

const HSR_NX = 2305
const HSR_NY = 2881

// stride 2 = 1 km. 발행 이미지가 1600px 폭에 약 1300 km를 담아 픽셀당 0.81 km라,
// 2 km 격자는 출력보다 거칠어 계단이 보였다. 1 km면 출력 해상도와 맞는다.
export const ECHO_TOP_GRID = Object.freeze({
  stride: 2,
  nx: Math.ceil(HSR_NX / 2), // 1153
  ny: Math.ceil(HSR_NY / 2), // 1441
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
