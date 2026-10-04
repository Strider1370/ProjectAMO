import { cloudSpreadColor } from '../../../shared/weather/cloudIcingPresentation.js'

export const CLOUD_POTENTIAL_COLOR_RAMP = Array.from({ length: 6 }, (_, i) => ({ min: i, max: i + 1, label: `${i}–${i + 1}°C`, color: cloudSpreadColor(i + .5, 6), alpha: [.58, .50, .42, .34, .28, .22][i] }))
const TRANSPARENT_CLOUD_POTENTIAL = { min: 6, max: Infinity, label: 'Dry', color: 'rgba(0,0,0,0)', alpha: 0 }

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
  const spread = value == null ? NaN : Number(value)
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
