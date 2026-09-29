import { chartColor } from './wafsChartPalette.js'

export const HAZARD_SOURCE = 'wafs-sigwx-hazard-fill'
export const HAZARD_LAYER = `${HAZARD_SOURCE}-areas`

// Clip complete rings, never the disconnected line fragments used for picking.
// Connecting edges lie on the preview boundary; holes retain their ring role.
export function clipHazardRing(ring, bounds) {
  let result = ring
  for (const [axis, limit, sign] of [[0, bounds[0], 1], [0, bounds[2], -1], [1, bounds[1], 1], [1, bounds[3], -1]]) {
    const output = []
    for (let i = 0; i < result.length; i++) {
      const a = result[(i + result.length - 1) % result.length], b = result[i]
      const aInside = (a[axis] - limit) * sign >= 0, bInside = (b[axis] - limit) * sign >= 0
      if (aInside !== bInside) {
        const t = (limit - a[axis]) / (b[axis] - a[axis])
        const p = a.map((value, index) => value + t * (b[index] - value))
        p[axis] = limit
        output.push(p)
      }
      if (bInside) output.push(b)
    }
    result = output
  }
  result = result.filter((p, i) => !i || p[0] !== result[i - 1][0] || p[1] !== result[i - 1][1])
  if (result.length < 3) return []
  const first = result[0], last = result.at(-1)
  if (first[0] !== last[0] || first[1] !== last[1]) result.push(first)
  const area = result.reduce((sum, p, i) => i ? sum + result[i - 1][0] * p[1] - p[0] * result[i - 1][1] : sum, 0)
  return Math.abs(area) > 1e-10 ? result : []
}

const cache = new WeakMap()
export function hazardFillData(data) {
  const boundaries = new Map(data.features.filter(f => f.properties.role === 'boundary').map(f => [f.properties.objectId, f.properties]))
  const features = []
  for (const area of data.areas || []) {
    const properties = boundaries.get(area.objectId)
    if (!properties) continue
    const boundsKey = data.metadata.bounds.join('/')
    let clipped = cache.get(area)
    if (clipped?.boundsKey !== boundsKey) {
      const polygons = area.polygons.map(([outer, ...holes]) => {
        const exterior = clipHazardRing(outer, data.metadata.bounds)
        return exterior.length ? [exterior, ...holes.map(r => clipHazardRing(r, data.metadata.bounds)).filter(r => r.length)] : null
      }).filter(Boolean)
      clipped = { boundsKey, polygons }; cache.set(area, clipped)
    }
    if (!clipped.polygons.length) continue
    features.push({ type: 'Feature', properties: {
      objectId: area.objectId, phenomenon: properties.phenomenon, severity: properties.severity,
      // MOD below SEV; within each severity, turbulence above icing.
      order: (properties.severity === 'SEV' ? 2 : 0) + (properties.phenomenon === 'TURBULENCE' ? 1 : 0),
    }, geometry: { type: 'MultiPolygon', coordinates: clipped.polygons } })
  }
  return { type: 'FeatureCollection', features }
}

export function selectHazardFill(map, id, palette) {
  if (!map.getLayer(HAZARD_LAYER)) return
  map.setPaintProperty(HAZARD_LAYER, 'fill-opacity', ['+',
    ['case', ['==', ['get', 'phenomenon'], 'TURBULENCE'], palette.hazards.TURBULENCE.opacity, palette.hazards.AIRFRAME_ICING.opacity],
    ['case', ['==', ['get', 'objectId'], id || ''], 0.12, 0],
  ])
}

export function installHazardFill(map, data, palette) {
  const geojson = hazardFillData(data)
  if (map.getSource(HAZARD_SOURCE)) map.getSource(HAZARD_SOURCE).setData(geojson)
  else map.addSource(HAZARD_SOURCE, { type: 'geojson', data: geojson })
  // Top slot puts this above middle-slot raster weather. First within top puts
  // it below FIR, routes, airports and all other aviation vectors in that slot.
  const before = map.getStyle().layers.find(layer => layer.slot === 'top' && layer.id !== HAZARD_LAYER)?.id
  if (!map.getLayer(HAZARD_LAYER)) map.addLayer({
    id: HAZARD_LAYER, type: 'fill', source: HAZARD_SOURCE, slot: 'top',
    layout: { 'fill-sort-key': ['get', 'order'] },
    paint: { 'fill-antialias': false },
  }, before)
  else if (before) map.moveLayer(HAZARD_LAYER, before)
  map.setPaintProperty(HAZARD_LAYER, 'fill-color', ['case', ['==', ['get', 'phenomenon'], 'TURBULENCE'],
    ['case', ['==', ['get', 'severity'], 'SEV'], chartColor({ phenomenon: 'TURBULENCE', severity: 'SEV' }, palette), chartColor({ phenomenon: 'TURBULENCE', severity: 'MOD' }, palette)],
    ['case', ['==', ['get', 'severity'], 'SEV'], chartColor({ phenomenon: 'AIRFRAME_ICING', severity: 'SEV' }, palette), chartColor({ phenomenon: 'AIRFRAME_ICING', severity: 'MOD' }, palette)],
  ])
  selectHazardFill(map, null, palette)
}
