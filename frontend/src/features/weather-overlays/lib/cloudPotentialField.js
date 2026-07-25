export const CLOUD_POTENTIAL_COLOR_RAMP = [
  { min: 0, max: 1, label: '0-1C', color: 'rgba(24, 96, 44, 0.68)', alpha: 0.68 },
  { min: 1, max: 2, label: '1-2C', color: 'rgba(49, 124, 62, 0.58)', alpha: 0.58 },
  { min: 2, max: 3, label: '2-3C', color: 'rgba(85, 150, 85, 0.48)', alpha: 0.48 },
  { min: 3, max: 4, label: '3-4C', color: 'rgba(132, 176, 124, 0.36)', alpha: 0.36 },
  { min: 4, max: 5, label: '4-5C', color: 'rgba(163, 195, 151, 0.28)', alpha: 0.28 },
  { min: 5, max: 6, label: '5-6C', color: 'rgba(188, 209, 174, 0.22)', alpha: 0.22 },
]
const TRANSPARENT_CLOUD_POTENTIAL = { min: 6, max: Infinity, label: 'Dry', color: 'rgba(24, 96, 44, 0)', alpha: 0 }

export function decodeScaledValue(value, field) {
  if (!Number.isFinite(value) || value === -32768) return null
  if (field?.encoding === 'int16-scaled-json-v1') {
    return Math.round((value * (field.scale ?? 1) + (field.offset ?? 0)) * 100) / 100
  }
  return value
}

export function decodeSpreadValue(value, field) {
  return decodeScaledValue(value, field)
}

export function decodeCloudPotentialValue(value, field) {
  return decodeScaledValue(value, field)
}

export function getCloudPotentialMaxSpread(field) {
  return field?.level?.id === '500hPa' ? 6 : 4
}

export function pickCloudPotentialColor(value, field = null) {
  const spread = Number(value)
  if (!Number.isFinite(spread)) return TRANSPARENT_CLOUD_POTENTIAL
  const maxSpread = getCloudPotentialMaxSpread(field)
  if (spread > maxSpread) return TRANSPARENT_CLOUD_POTENTIAL
  return CLOUD_POTENTIAL_COLOR_RAMP.find((entry) => spread >= entry.min && spread <= entry.max && entry.max <= maxSpread)
    || TRANSPARENT_CLOUD_POTENTIAL
}

function gridStep(min, max, count, fallback) {
  if (Number.isFinite(min) && Number.isFinite(max) && count > 1) return (max - min) / (count - 1)
  return fallback
}

export function createCloudPotentialSampler(field) {
  const grid = field?.grid
  if (!field || !grid || !Array.isArray(field.spread)) return { sample: () => null }
  const dx = gridStep(grid.lonMin, grid.lonMax, grid.nx, grid.dx)
  const dy = gridStep(grid.latMin, grid.latMax, grid.ny, grid.dy)

  function sample(lon, lat) {
    const x = Math.round((lon - grid.lonMin) / dx)
    const y = Math.round((lat - grid.latMin) / dy)
    if (x < 0 || y < 0 || x >= grid.nx || y >= grid.ny) return null
    const value = decodeCloudPotentialValue(field.spread[y * grid.nx + x], field)
    return value == null ? null : value
  }

  return { sample }
}
