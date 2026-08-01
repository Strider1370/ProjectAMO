import { enToLatLon84 } from '../lib/lcc-projection.js'

export const SFC_W = 2049
export const SFC_H = 2049

// sfc_grid_latlon.nc 헤더: 격자 0.5km, 투영 원점(38N,126E)이 col 880 / 남쪽기준 row 1540.
const CELL_M = 500
const ORIGIN_COL = 880
const ORIGIN_ROW_FROM_SOUTH = 1540

/**
 * Parse nph-sfc_obs_nc_api ASCII response (obs=vs, disp=A).
 * Returns Float32Array(SFC_W * SFC_H), values in metres.
 * Fill (-999) → -1. Raw unit is km → ×1000 to metres.
 */
export function parseSfcAscii(text) {
  const eqIdx = text.indexOf('=')
  const dataStart = eqIdx >= 0 ? eqIdx + 1 : 0
  const result = new Float32Array(SFC_W * SFC_H)
  let idx = 0
  let numStart = -1

  for (let i = dataStart; i <= text.length && idx < result.length; i++) {
    const ch = text[i]
    const isDigit = ch >= '0' && ch <= '9'
    const isDot = ch === '.'
    const isMinus = ch === '-'
    const isNumChar = isDigit || isDot || isMinus

    if (isNumChar && numStart === -1) {
      numStart = i
    } else if (!isNumChar && numStart !== -1) {
      const v = parseFloat(text.slice(numStart, i))
      result[idx++] = v <= -999 ? -1 : v * 1000
      numStart = -1
    }
  }
  if (numStart !== -1 && idx < result.length) {
    const v = parseFloat(text.slice(numStart))
    result[idx] = v <= -999 ? -1 : v * 1000
  }

  // API delivers rows south-first; flip to north-first to match sfcPixelToLatLon convention.
  const rowBuf = new Float32Array(SFC_W)
  for (let r = 0; r < Math.floor(SFC_H / 2); r++) {
    const top = r * SFC_W
    const bot = (SFC_H - 1 - r) * SFC_W
    rowBuf.set(result.subarray(top, top + SFC_W))
    result.copyWithin(top, bot, bot + SFC_W)
    result.set(rowBuf, bot)
  }

  return result
}

/**
 * 격자 픽셀 → 위경도. row 0 = 북단(parseSfcAscii가 뒤집은 뒤 관례).
 * WGS84 타원체 Lambert Conformal Conic.
 */
export function sfcPixelToLatLon(col, row) {
  const rowFromSouth = SFC_H - 1 - row
  const easting = (col - ORIGIN_COL) * CELL_M
  const northing = (rowFromSouth - ORIGIN_ROW_FROM_SOUTH) * CELL_M
  const [lat, lon] = enToLatLon84(easting, northing)
  return { lat, lon }
}
