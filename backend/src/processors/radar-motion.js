const FIVE_MINUTES_MS = 5 * 60 * 1000

export const MOTION_DEFAULTS = Object.freeze({
  stride: 4,
  candidateStride: 4,
  maxSearchCells: 8,
  patchRadius: 6,
  minScoreSeparation: 30,
  minReflectivity: 2000,
  minSpeedKt: 3,
  maxSpeedKt: 150,
  maxCandidates: 900,
})

export function createMotionInput(refl, geometry, options = {}) {
  const stride = options.stride ?? MOTION_DEFAULTS.stride
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
      values[row * width + col] = max
    }
  }

  return { width, height, stride, values, tm: options.tm ?? null }
}

function valueAt(input, col, row) {
  if (col < 0 || row < 0 || col >= input.width || row >= input.height) return -32768
  return input.values[row * input.width + col]
}

function patchDifference(previous, current, prevCol, prevRow, currentCol, currentRow, radius) {
  let difference = 0
  let samples = 0
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      difference += Math.abs(valueAt(previous, prevCol + x, prevRow + y) - valueAt(current, currentCol + x, currentRow + y))
      samples += 1
    }
  }
  return difference / samples
}

function bearingDegrees(start, end) {
  const lat1 = start.lat * Math.PI / 180
  const lat2 = end.lat * Math.PI / 180
  const deltaLon = (end.lon - start.lon) * Math.PI / 180
  return (Math.atan2(
    Math.sin(deltaLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon),
  ) * 180 / Math.PI + 360) % 360
}

function distanceKm(dxCells, dyCells, stride) {
  return Math.hypot(dxCells, dyCells) * stride * 0.5
}

export function deriveObservedMotion(previous, current, options = {}) {
  if (!previous || !current || previous.width !== current.width || previous.height !== current.height || previous.stride !== current.stride) {
    return { type: 'FeatureCollection', features: [] }
  }

  const settings = { ...MOTION_DEFAULTS, ...options }
  const deadlineAtMs = Number.isFinite(settings.deadlineAtMs) ? settings.deadlineAtMs : Infinity
  const timedOut = () => Date.now() >= deadlineAtMs
  const candidates = []
  for (let row = 1; row < current.height - 1; row += settings.candidateStride) {
    for (let col = 1; col < current.width - 1; col += settings.candidateStride) {
      if (timedOut()) return { type: 'FeatureCollection', features: [] }
      if (valueAt(current, col, row) < settings.minReflectivity) continue

      let best = null
      let runnerUp = null
      for (let dy = -settings.maxSearchCells; dy <= settings.maxSearchCells; dy += 1) {
        for (let dx = -settings.maxSearchCells; dx <= settings.maxSearchCells; dx += 1) {
          if (timedOut()) return { type: 'FeatureCollection', features: [] }
          if (dx === 0 && dy === 0) continue
          const prevCol = col - dx
          const prevRow = row - dy
          if (valueAt(previous, prevCol, prevRow) < settings.minReflectivity) continue
          const score = patchDifference(previous, current, prevCol, prevRow, col, row, settings.patchRadius)
          if (!best || score < best.score) {
            runnerUp = best
            best = { dx, dy, score }
          } else if (!runnerUp || score < runnerUp.score) {
            runnerUp = { dx, dy, score }
          }
        }
      }

      if (!best || !runnerUp || runnerUp.score - best.score < settings.minScoreSeparation) continue
      const speedKt = distanceKm(best.dx, best.dy, current.stride) / (FIVE_MINUTES_MS / 3600000) / 1.852
      if (speedKt < settings.minSpeedKt || speedKt > settings.maxSpeedKt) continue
      const confidence = Math.max(0, Math.min(1, 1 - best.score / 10000))
      if (confidence < 0.35) continue

      const sourceX = col * current.stride
      const sourceY = row * current.stride
      const endX = sourceX + best.dx * current.stride
      const endY = sourceY + best.dy * current.stride
      const start = options.gridToLatLon?.(sourceX, sourceY)
      const end = options.gridToLatLon?.(endX, endY)
      if (!start || !end || !Number.isFinite(start.lon) || !Number.isFinite(start.lat) || !Number.isFinite(end.lon) || !Number.isFinite(end.lat)) continue

      candidates.push({
        type: 'Feature',
        properties: {
          observedAtMs: options.observedAtMs ?? null,
          comparedFromMs: options.comparedFromMs ?? null,
          speedKt: Math.round(speedKt),
          bearingDeg: Math.round(bearingDegrees(start, end)),
          confidence: Number(confidence.toFixed(2)),
        },
        geometry: { type: 'LineString', coordinates: [[start.lon, start.lat], [end.lon, end.lat]] },
      })
    }
  }

  candidates.sort((a, b) => b.properties.confidence - a.properties.confidence)
  return { type: 'FeatureCollection', features: candidates.slice(0, settings.maxCandidates) }
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
