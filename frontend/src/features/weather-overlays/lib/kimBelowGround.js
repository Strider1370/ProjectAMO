// KIM 기압면이 지면 아래인 격자 표시(backend/src/processors/kim-surface-mask.js의 bitset-base64-v1)를 푼다.
export const KIM_BELOW_GROUND_LABEL = '지면 아래'
const decoded = new WeakMap()

export function decodeKimBelowGround(field) {
  if (!field || typeof field.belowGround !== 'string' || field.belowGroundEncoding !== 'bitset-base64-v1') return null
  if (decoded.has(field)) return decoded.get(field)
  const size = Number(field.grid?.nx) * Number(field.grid?.ny)
  if (!Number.isInteger(size) || size <= 0) return null
  const binary = atob(field.belowGround)
  if (binary.length !== Math.ceil(size / 8)) return null
  const mask = new Uint8Array(size)
  for (let i = 0; i < size; i++) mask[i] = (binary.charCodeAt(i >> 3) >> (i & 7)) & 1
  decoded.set(field, mask)
  return mask
}

// 지면 아래 칸의 색. 난류 칸처럼 같은 이미지의 격자 칸을 단색으로 칠한다.
const BELOW_GROUND_RGBA = Object.freeze([128, 134, 144, 120])
export function belowGroundCellRgba() {
  return BELOW_GROUND_RGBA
}
