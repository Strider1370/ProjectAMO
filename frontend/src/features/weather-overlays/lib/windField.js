const KT_TO_MS = 0.514444

function kt(value) {
  return value * KT_TO_MS
}

export const WIND_SPEED_COLOR_RAMP = [
  { min: kt(0), max: kt(5), label: '0-5 kt', color: 'rgba(0, 126, 255, 0.38)' },
  { min: kt(5), max: kt(10), label: '5-10 kt', color: 'rgba(0, 190, 210, 0.38)' },
  { min: kt(10), max: kt(20), label: '10-20 kt', color: 'rgba(0, 220, 165, 0.38)' },
  { min: kt(20), max: kt(30), label: '20-30 kt', color: 'rgba(42, 220, 42, 0.38)' },
  { min: kt(30), max: kt(40), label: '30-40 kt', color: 'rgba(180, 225, 0, 0.38)' },
  { min: kt(40), max: kt(60), label: '40-60 kt', color: 'rgba(255, 205, 0, 0.38)' },
  { min: kt(60), max: kt(80), label: '60-80 kt', color: 'rgba(255, 150, 0, 0.38)' },
  { min: kt(80), max: kt(100), label: '80-100 kt', color: 'rgba(240, 45, 20, 0.38)' },
  { min: kt(100), max: kt(130), label: '100-130 kt', color: 'rgba(222, 0, 190, 0.38)' },
  { min: kt(130), max: Infinity, label: '130+ kt', color: 'rgba(126, 34, 206, 0.38)' },
]

export function decodeWindComponent(value, field) {
  if (!Number.isFinite(value)) return null
  if (field?.encoding === 'int16-scaled-json-v1') {
    return value * (field.scale ?? 1) + (field.offset ?? 0)
  }
  return value
}

function mix(a, b, t) {
  return a + (b - a) * t
}

function parseRgba(color) {
  const match = String(color).match(/rgba\(([^)]+)\)/)
  if (!match) return [255, 255, 255, 0]
  const [r, g, b, a] = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return [r, g, b, a ?? 1]
}

function formatRgba([r, g, b, a]) {
  const alpha = Math.round(a * 100) / 100
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

function componentAt(values, field, index) {
  return decodeWindComponent(values[index], field)
}

function gridStep(min, max, count, fallback) {
  if (Number.isFinite(min) && Number.isFinite(max) && count > 1) {
    return (max - min) / (count - 1)
  }
  return fallback
}

const downsampleCache = new WeakMap()

export function createWindFieldSampler(field) {
  const grid = field?.grid
  if (!field || !grid || !Array.isArray(field.u) || !Array.isArray(field.v)) {
    return { sample: () => null }
  }
  const dx = gridStep(grid.lonMin, grid.lonMax, grid.nx, grid.dx)
  const dy = gridStep(grid.latMin, grid.latMax, grid.ny, grid.dy)

  function sample(lon, lat) {
    const x = (lon - grid.lonMin) / dx
    const y = (lat - grid.latMin) / dy
    if (x < 0 || y < 0 || x > grid.nx - 1 || y > grid.ny - 1) return null

    const i0 = Math.min(Math.floor(x), grid.nx - 2)
    const j0 = Math.min(Math.floor(y), grid.ny - 2)
    const tx = x - i0
    const ty = y - j0
    const i1 = i0 + 1
    const j1 = j0 + 1

    const idx00 = j0 * grid.nx + i0
    const idx10 = j0 * grid.nx + i1
    const idx01 = j1 * grid.nx + i0
    const idx11 = j1 * grid.nx + i1

    const u00 = componentAt(field.u, field, idx00)
    const u10 = componentAt(field.u, field, idx10)
    const u01 = componentAt(field.u, field, idx01)
    const u11 = componentAt(field.u, field, idx11)
    const v00 = componentAt(field.v, field, idx00)
    const v10 = componentAt(field.v, field, idx10)
    const v01 = componentAt(field.v, field, idx01)
    const v11 = componentAt(field.v, field, idx11)
    if ([u00, u10, u01, u11, v00, v10, v01, v11].some((value) => value == null)) return null

    const u = mix(mix(u00, u10, tx), mix(u01, u11, tx), ty)
    const v = mix(mix(v00, v10, tx), mix(v01, v11, tx), ty)
    return { u, v, speed: Math.hypot(u, v) }
  }

  return { sample }
}

export function createDownsampledWindField(field, factor = 1) {
  const grid = field?.grid
  const step = Math.max(1, Math.round(factor))
  if (step <= 1 || !grid || grid.nx <= 2 || grid.ny <= 2) return field

  let byFactor = downsampleCache.get(field)
  if (!byFactor) {
    byFactor = new Map()
    downsampleCache.set(field, byFactor)
  }
  if (byFactor.has(step)) return byFactor.get(step)

  const nx = Math.max(2, Math.floor((grid.nx - 1) / step) + 1)
  const ny = Math.max(2, Math.floor((grid.ny - 1) / step) + 1)
  const lonMin = grid.lonMin
  const lonMax = grid.lonMax
  const latMin = grid.latMin
  const latMax = grid.latMax
  const dx = gridStep(lonMin, lonMax, nx, grid.dx * step)
  const dy = gridStep(latMin, latMax, ny, grid.dy * step)
  const sampler = createWindFieldSampler(field)
  const u = []
  const v = []

  for (let y = 0; y < ny; y += 1) {
    const lat = latMin + dy * y
    for (let x = 0; x < nx; x += 1) {
      const lon = lonMin + dx * x
      const vector = sampler.sample(lon, lat)
      u.push(vector?.u ?? Number.NaN)
      v.push(vector?.v ?? Number.NaN)
    }
  }

  const downsampled = {
    ...field,
    encoding: undefined,
    scale: undefined,
    offset: undefined,
    grid: { nx, ny, lonMin, latMin, lonMax, latMax, dx, dy },
    u,
    v,
  }
  byFactor.set(step, downsampled)
  return downsampled
}

export function pickWindSpeedColor(speed) {
  return WIND_SPEED_COLOR_RAMP.find((entry) => speed >= entry.min && speed < entry.max) || WIND_SPEED_COLOR_RAMP[0]
}

export function interpolateWindSpeedColor(speed, transitionFraction = 0.4) {
  const value = Number(speed)
  if (!Number.isFinite(value)) return 'rgba(0, 0, 0, 0)'
  const stops = WIND_SPEED_COLOR_RAMP
  if (value <= stops[0].min) return stops[0].color
  const current = pickWindSpeedColor(value)
  const transitionScale = Math.max(0, Math.min(1, Number(transitionFraction) || 0))

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1]
    const next = stops[index]
    const boundary = next.min
    const previousWidth = previous.max - previous.min
    const nextWidth = Number.isFinite(next.max) ? next.max - next.min : previousWidth
    const blendWidth = Math.min(previousWidth, nextWidth) * transitionScale
    const halfWidth = blendWidth / 2
    if (halfWidth <= 0 || value < boundary - halfWidth || value > boundary + halfWidth) continue

    const t = (value - (boundary - halfWidth)) / blendWidth
    const a = parseRgba(previous.color)
    const b = parseRgba(next.color)
    return formatRgba([
      mix(a[0], b[0], t),
      mix(a[1], b[1], t),
      mix(a[2], b[2], t),
      mix(a[3], b[3], t),
    ])
  }
  return current.color
}

export function getWindFieldMeanSpeed(field) {
  if (!field || !Array.isArray(field.u) || !Array.isArray(field.v)) return null
  const count = Math.min(field.u.length, field.v.length)
  let total = 0
  let samples = 0
  for (let index = 0; index < count; index += 1) {
    const u = decodeWindComponent(field.u[index], field)
    const v = decodeWindComponent(field.v[index], field)
    if (u == null || v == null) continue
    total += Math.hypot(u, v)
    samples += 1
  }
  return samples > 0 ? total / samples : null
}

export function formatKimWindMetaLabel(field) {
  const levelLabel = formatWindLevelLabel(field)
  const validTime = Date.parse(field?.time?.validTime)
  if (!Number.isFinite(validTime)) return `KIM 8km \u00b7 ${levelLabel}`
  const kst = new Date(validTime + 9 * 60 * 60 * 1000)
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hour = String(kst.getUTCHours()).padStart(2, '0')
  const minute = String(kst.getUTCMinutes()).padStart(2, '0')
  return `KIM 8km \u00b7 ${levelLabel} \u00b7 ${month}/${day} ${hour}:${minute} KST`
}

function formatWindLevelLabel(field) {
  const level = field?.level
  if (!level?.id) return '10m'
  if (level.unit === 'hPa') return `${level.value}hPa`
  if (level.unit === 'm') return `${level.value}m`
  return level.label || level.id
}

// 입자는 한 프레임에 경위도 고정량(u × speedFactor × 0.002°)만큼 움직인다. 한반도를 확대해 보는
// 기존 바람 레이어에는 맞지만, 동아시아 전체를 멀리서 보면 꼬리가 몇 픽셀로 줄어 점처럼 보인다.
// zoomSpeedReference를 주면 그 줌보다 멀리 볼수록 속도를 두 배씩 올려 화면상 꼬리 길이를 유지한다.
export function effectiveWindSpeedFactor(map, options = {}) {
  const base = options.speedFactor ?? 0.45
  const reference = options.zoomSpeedReference
  const zoom = map?.getZoom?.()
  if (!Number.isFinite(reference) || !Number.isFinite(zoom)) return base
  return base * 2 ** Math.max(0, reference - zoom)
}
