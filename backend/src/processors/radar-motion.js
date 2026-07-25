import {
  annotateNeighbourAgreement, deriveMotionField, motionVectorsToGeoJSON, selectLeadingEdge,
} from './radar-motion-model.js'

// KMA HSR 합성 격자의 no-data. 실측상 작업 격자의 89~91%가 이 값이고 프레임 간
// 98.8% 동일한 고정 무늬라, 클램프하지 않으면 정합이 에코가 아니라 무늬에 끌려간다.
const NO_DATA = -25000

const EMPTY = { type: 'FeatureCollection', features: [] }

export function createMotionInput(refl, geometry, options = {}) {
  const stride = options.stride ?? 4
  const width = Math.ceil(geometry.nx / stride)
  const height = Math.ceil(geometry.ny / stride)
  const values = new Int16Array(width * height)

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let max = -32768
      const startY = row * stride
      const startX = col * stride
      for (let y = startY; y < Math.min(startY + stride, geometry.ny); y += 1) {
        for (let x = startX; x < Math.min(startX + stride, geometry.nx); x += 1) {
          max = Math.max(max, refl[y * geometry.nx + x])
        }
      }
      values[row * width + col] = max <= NO_DATA ? 0 : max
    }
  }

  return { width, height, stride, values, tm: options.tm ?? null }
}

// 두 프레임 -> 벡터장 -> 이웃 일치도 기록 -> 앞면만 선별 -> Point GeoJSON.
export function deriveMotionGeoJSON(previous, current, options) {
  const { settings, gridToLatLon, deadlineAtMs = Infinity } = options
  if (!previous || !current) return EMPTY
  if (previous.width !== current.width || previous.height !== current.height || previous.stride !== current.stride) return EMPTY

  const field = deriveMotionField(previous, current, settings, deadlineAtMs)
  if (!field.length) return EMPTY
  const edge = selectLeadingEdge(annotateNeighbourAgreement(field, settings), current, settings)
  // workStride의 단일 출처는 격자다. settings와 어긋나면 속도가 조용히 틀어진다.
  return motionVectorsToGeoJSON(edge, {
    gridToLatLon,
    workStride: current.stride,
    frameIntervalMs: settings.frameIntervalMs,
  })
}

export function serializeMotionInput(input) {
  return Buffer.from(JSON.stringify({
    tm: input.tm,
    width: input.width,
    height: input.height,
    stride: input.stride,
    values: Buffer.from(input.values.buffer, input.values.byteOffset, input.values.byteLength).toString('base64'),
  }))
}

export function deserializeMotionInput(buffer) {
  const payload = JSON.parse(Buffer.from(buffer).toString('utf8'))
  const bytes = Buffer.from(payload.values, 'base64')
  const values = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  return { tm: payload.tm ?? null, width: payload.width, height: payload.height, stride: payload.stride, values }
}
