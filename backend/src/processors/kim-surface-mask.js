// KIM 기압면이 지면 아래인 격자. 고원·산지에서 지상기압보다 큰 기압면 값은 모델이 외삽한 것이라 지도에 그리지 않는다.
//
// 지상기압(ps)은 GKTG 추가 입력으로 이미 받아 둔 원문 캐시(raw/gktg/hf<N>-ps-0.txt[.gz])에서 읽는다. 새 API 호출은 없다.
// 캐시가 없으면 null을 돌려주고 호출측은 값을 그대로 둔다(기존 동작).
import path from 'node:path'

import { parseKimGridText } from '../parsers/kim-grid-parser.js'
import { readKimRawText } from './kim-doc-store.js'
import { KIM_NWP_MODEL } from './kim-nwp-model.js'
import { resolveKimNwpRunDir } from './kim-nwp-store.js'
import { KIM_DEFAULT_DOMAIN } from './kim-domain.js'

export const KIM_BELOW_GROUND_ENCODING = 'bitset-base64-v1'
const cache = new Map()
const CACHE_SIZE = 6

export function readKimSurfacePressure({ root, tmfc, hf, domain = KIM_DEFAULT_DOMAIN }) {
  const key = `${root}:${domain}:${tmfc}:${hf}`
  if (cache.has(key)) return cache.get(key)
  const file = path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain }), 'raw', 'gktg', `hf${Number(hf)}-ps-0.txt`)
  const text = readKimRawText(file)
  let value = null
  if (text) {
    try {
      const parsed = parseKimGridText(text, { variable: 'ps', level: 0 })
      if (parsed.values.length === parsed.nx * parsed.ny) value = { nx: parsed.nx, ny: parsed.ny, values: Float32Array.from(parsed.values) }
    } catch { value = null }
  }
  cache.set(key, value)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
  return value
}

// 기압면(hPa)이 지면 아래인 격자를 1로 둔 Uint8Array. 지상기압이 없거나 격자가 다르면 null.
export function kimBelowGroundMask({ root, tmfc, hf, pressureHpa, grid, domain = KIM_DEFAULT_DOMAIN }) {
  if (!Number.isFinite(pressureHpa)) return null
  const ps = readKimSurfacePressure({ root, tmfc, hf, domain })
  if (!ps || ps.nx !== grid?.nx || ps.ny !== grid?.ny) return null
  const mask = new Uint8Array(ps.values.length)
  const levelPa = pressureHpa * 100
  for (let i = 0; i < mask.length; i++) mask[i] = Number.isFinite(ps.values[i]) && ps.values[i] < levelPa ? 1 : 0
  return mask
}

export function encodeKimBelowGround(mask) {
  const bytes = new Uint8Array(Math.ceil(mask.length / 8))
  for (let i = 0; i < mask.length; i++) if (mask[i]) bytes[i >> 3] |= 1 << (i & 7)
  return Buffer.from(bytes).toString('base64')
}

// 지도 응답에 지면 아래 표시를 붙이고, 그 격자의 값을 비운다. 마스크를 만들 수 없으면 필드를 그대로 돌려준다.
// missing: 비운 칸에 넣을 값. GKTG(실수 배열)는 null, int16 인코딩 배열(바람·기온·구름·착빙)은 결측값 -32768.
// edgeCells: 영역 가장자리 이 칸 수 안쪽만 표시한다. GKTG는 가장자리 10칸을 계산하지 않아(값 없음) 그 띠에
// 회색만 남지 않게 한다(2026-10-09, 확대 영역 서쪽 경계가 티베트 고원 동쪽에 걸림).
export function applyKimBelowGround(field, { root, arrays, domain = KIM_DEFAULT_DOMAIN, missing = null, edgeCells = 0 }) {
  const pressureHpa = field?.level?.kind === 'pressure' ? Number(field.level.value) : NaN
  const tmfc = field?.time?.tmfc ?? field?.tmfc
  const hf = field?.time?.hf ?? field?.hf
  const mask = kimBelowGroundMask({ root, tmfc, hf, pressureHpa, grid: field?.grid, domain })
  if (!mask) return field
  if (edgeCells > 0) {
    const { nx, ny } = field.grid
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      if (x < edgeCells || y < edgeCells || x >= nx - edgeCells || y >= ny - edgeCells) mask[y * nx + x] = 0
    }
  }
  const out = { ...field, belowGround: encodeKimBelowGround(mask), belowGroundEncoding: KIM_BELOW_GROUND_ENCODING }
  for (const name of arrays) {
    if (!Array.isArray(field[name])) continue
    out[name] = field[name].map((value, i) => (mask[i] ? missing : value))
  }
  return out
}
