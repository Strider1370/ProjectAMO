export const ICING_FIELD_LABEL = 'Icing Potential'

export const ICING_COLOR_RAMP = [
  { grade: 0, label: 'None', color: 'rgba(0, 0, 0, 0)', alpha: 0 },
  { grade: 1, label: 'Trace potential', color: 'rgba(172, 199, 255, 1)', alpha: 1 },
  { grade: 2, label: 'Moderate potential', color: 'rgba(107, 136, 205, 1)', alpha: 1 },
  { grade: 3, label: 'Severe potential', color: 'rgba(56, 61, 111, 1)', alpha: 1 },
]

const TRANSPARENT_ICING = ICING_COLOR_RAMP[0]

function decodeScaledValue(value, encoding) {
  if (!Number.isFinite(value) || value === -32768) return null
  if (encoding?.encoding === 'int16-scaled-json-v1') {
    return Math.round((value * (encoding.scale ?? 1) + (encoding.offset ?? 0)) * 10000) / 10000
  }
  return value
}

export function decodeIcingScore(value, field) {
  return decodeScaledValue(value, field?.fieldEncoding?.icingScore || field)
}

export function decodeIcingGrade(value, field) {
  if (!Number.isFinite(value) || value === -32768) return null
  const encoding = field?.fieldEncoding?.icingGrade
  if (encoding?.encoding === 'int16-scaled-json-v1') {
    return Math.round(value * (encoding.scale ?? 1) + (encoding.offset ?? 0))
  }
  return Math.round(value)
}

export function pickIcingColor(grade) {
  const normalized = Number(grade)
  if (!Number.isFinite(normalized)) return TRANSPARENT_ICING
  return ICING_COLOR_RAMP.find((entry) => entry.grade === normalized) || TRANSPARENT_ICING
}

function gridStep(min, max, count, fallback) {
  if (Number.isFinite(min) && Number.isFinite(max) && count > 1) return (max - min) / (count - 1)
  return fallback
}

export function createIcingPotentialSampler(field) {
  const grid = field?.grid
  if (!field || !grid || !Array.isArray(field.icingScore) || !Array.isArray(field.icingGrade)) return { sample: () => null }
  const dx = gridStep(grid.lonMin, grid.lonMax, grid.nx, grid.dx)
  const dy = gridStep(grid.latMin, grid.latMax, grid.ny, grid.dy)

  function sample(lon, lat) {
    const x = Math.round((lon - grid.lonMin) / dx)
    const y = Math.round((lat - grid.latMin) / dy)
    if (x < 0 || y < 0 || x >= grid.nx || y >= grid.ny) return null
    const index = y * grid.nx + x
    const score = decodeIcingScore(field.icingScore[index], field)
    const grade = decodeIcingGrade(field.icingGrade[index], field)
    if (score == null || grade == null) return null
    return { score, grade, color: pickIcingColor(grade) }
  }

  return { sample }
}
