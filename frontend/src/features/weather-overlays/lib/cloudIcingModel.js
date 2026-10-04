import { cellRegionRings, ringsToPolygons, isothermSegments, chainContourSegments } from '../../../shared/weather/gridContours.js'
import { BASIC_ISOTHERMS, DETAIL_ISOTHERMS } from '../../../shared/weather/cloudIcingPresentation.js'
import { decodeIcingGrade } from './icingPotentialField.js'
import { decodeTemperatureValue, kelvinToCelsius } from './temperatureField.js'

const empty = () => ({ type: 'FeatureCollection', features: [] })
const feature = (geometry, properties = {}) => ({ type: 'Feature', properties, geometry })
const caches = new WeakMap()

function geometry(field) {
  const g = field?.grid
  if (!g || g.nx < 2 || g.ny < 2 || ![g.lonMin, g.lonMax, g.latMin, g.latMax].every(Number.isFinite)) return null
  const dx = (g.lonMax - g.lonMin) / (g.nx - 1), dy = (g.latMax - g.latMin) / (g.ny - 1)
  return {
    ...g,
    xs: Array.from({ length: g.nx }, (_, i) => g.lonMin + i * dx),
    ys: Array.from({ length: g.ny }, (_, i) => g.latMin + i * dy),
    edgesX: Array.from({ length: g.nx + 1 }, (_, i) => i === 0 ? g.lonMin : i === g.nx ? g.lonMax : g.lonMin + (i - .5) * dx),
    edgesY: Array.from({ length: g.ny + 1 }, (_, i) => i === 0 ? g.latMin : i === g.ny ? g.latMax : g.latMin + (i - .5) * dy),
  }
}

export function buildIcingGeometry(field) {
  if (field && caches.has(field)) return caches.get(field)
  const grid = geometry(field), fills = empty(), outlines = empty()
  if (!grid || !Array.isArray(field.icingGrade)) return { fills, outlines }
  const grades = field.icingGrade.map(v => decodeIcingGrade(v, field))
  const mapRing = ring => ring.map(([x, y]) => [grid.edgesX[x], grid.edgesY[y]])
  for (let grade = 1; grade <= 3; grade++) {
    const { rings } = cellRegionRings(grid.nx, grid.ny, (x, y) => grades[y * grid.nx + x] === grade)
    for (const polygon of ringsToPolygons(rings)) fills.features.push(feature({ type: 'Polygon', coordinates: polygon.map(mapRing) }, { grade }))
  }
  const { outerRings } = cellRegionRings(grid.nx, grid.ny, (x, y) => Number.isFinite(grades[y * grid.nx + x]) && grades[y * grid.nx + x] > 0)
  for (const ring of outerRings) outlines.features.push(feature({ type: 'LineString', coordinates: mapRing(ring) }))
  const result = { fills, outlines }
  caches.set(field, result)
  return result
}

const temperatureCaches = new WeakMap()
export function buildTemperatureContours(field, detail = false) {
  if (!field) return empty()
  const cache = temperatureCaches.get(field) ?? new Map()
  if (cache.has(detail)) return cache.get(detail)
  const grid = geometry(field), result = empty()
  if (!grid || !Array.isArray(field.T)) return result
  const values = field.T.map(v => { const decoded = decodeTemperatureValue(v, field); return decoded == null ? null : kelvinToCelsius(decoded) })
  for (const temperature of detail ? DETAIL_ISOTHERMS : BASIC_ISOTHERMS) {
    const segments = isothermSegments({ ...grid, values }, temperature)
    if (segments.length) result.features.push(feature({ type: 'MultiLineString', coordinates: chainContourSegments(segments).map(s => s.map(p => [p.x, p.y])) }, { temperature, label: `${temperature}°C` }))
  }
  cache.set(detail, result); temperatureCaches.set(field, cache)
  return result
}

export function isCloudIcingVisible(visibility = {}) {
  return visibility.cloudIcingPresentationVersion >= 2 ? !!visibility.cloudIcing : !!(visibility.temp || visibility.cloud || visibility.icing)
}

export function pressureKimIndex(index) {
  if (!index) return null
  const levels = (index.levels ?? []).filter(level => level.kind === 'pressure')
  const ids = new Set(levels.map(level => level.id))
  const availability = Object.fromEntries(Object.entries(index.availability ?? {}).filter(([id]) => ids.has(id)))
  const times = (index.times ?? []).filter(time => levels.some(level => availability[level.id]?.[String(time.hf)]))
  return { ...index, levels, availability, times }
}

export function fieldMatchesSelection(field, selection) {
  if (!field || !selection) return false
  const time = field.time ?? field.run
  return String(time?.tmfc) === String(selection.tmfc) && Number(time?.hf) === Number(selection.hf) && field.level?.id === selection.level
}

export function compatibleKimFields(fields) {
  const available = fields.filter(Boolean)
  if (!available.length) return true
  const first = available[0], time = first.time ?? first.run
  return available.every(f => {
    const t = f.time ?? f.run
    return t?.tmfc === time?.tmfc && Number(t?.hf) === Number(time?.hf) && f.level?.id === first.level?.id
      && ['nx', 'ny', 'lonMin', 'lonMax', 'latMin', 'latMax'].every(k => f.grid?.[k] === first.grid?.[k])
  })
}
