export const GRATICULE_SOURCE_ID = 'map-graticule'
export const GRATICULE_LINE_LAYER_ID = 'map-graticule-lines'
export const GRATICULE_LABEL_LAYER_ID = 'map-graticule-labels'

const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] }
const MAX_GRID_ZOOM = 10

function niceStep(span, pixels) {
  const target = span / Math.max(1, pixels / 260)
  const power = 10 ** Math.floor(Math.log10(Math.max(target, 1e-6)))
  return [1, 2, 5, 10].map((factor) => factor * power)
    .find((step) => step >= target) ?? 10 * power
}

function gridValues(min, max, step) {
  const values = []
  for (let index = Math.ceil(min / step); index * step <= max + step * 1e-7; index += 1) {
    values.push(Number((index * step).toFixed(6)))
  }
  return values
}

function coordinateLabel(value, axis, step) {
  const direction = axis === 'longitude'
    ? (value < 0 ? 'W' : 'E')
    : (value < 0 ? 'S' : 'N')
  const magnitude = Math.abs(value)
  if (step >= 1) return `${Math.round(magnitude)}°${direction}`
  const degrees = Math.floor(magnitude)
  const minutes = Math.round((magnitude - degrees) * 60)
  return `${degrees + Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, '0')}′${direction}`
}

export function createGraticuleData({ west, east, south, north, width, height, labelLatitude, labelLongitude, labelWest, labelEast, zoom }) {
  if (zoom >= MAX_GRID_ZOOM || ![west, east, south, north, width, height].every(Number.isFinite)) return EMPTY_COLLECTION
  const lonStep = niceStep(east - west, width)
  const latStep = niceStep(north - south, height)
  const longitudes = gridValues(Math.max(-180, west - lonStep), Math.min(180, east + lonStep), lonStep)
  const latitudes = gridValues(Math.max(-80, south - latStep), Math.min(80, north + latStep), latStep)
  const features = []

  for (const longitude of longitudes) {
    features.push({
      type: 'Feature', properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: [[longitude, Math.max(-80, south - latStep)], [longitude, Math.min(80, north + latStep)]] },
    })
    if (longitude > labelWest && longitude < labelEast && Number.isFinite(labelLatitude)) {
      features.push({
        type: 'Feature', properties: { kind: 'label', text: coordinateLabel(longitude, 'longitude', lonStep) },
        geometry: { type: 'Point', coordinates: [longitude, labelLatitude] },
      })
    }
  }
  for (const latitude of latitudes) {
    features.push({
      type: 'Feature', properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: [[west - lonStep, latitude], [east + lonStep, latitude]] },
    })
    if (latitude > south && latitude < north && Number.isFinite(labelLongitude)) {
      features.push({
        type: 'Feature', properties: { kind: 'label', text: coordinateLabel(latitude, 'latitude', latStep) },
        geometry: { type: 'Point', coordinates: [labelLongitude, latitude] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function installGraticule(map, basemapId) {
  const dark = basemapId !== 'standard'
  const lineColor = dark ? '#dbeafe' : '#475569'
  const labelColor = dark ? '#f8fafc' : '#334155'
  const haloColor = dark ? '#142033' : '#ffffff'
  if (!map.getSource(GRATICULE_SOURCE_ID)) {
    map.addSource(GRATICULE_SOURCE_ID, { type: 'geojson', data: EMPTY_COLLECTION })
  }
  if (!map.getLayer(GRATICULE_LINE_LAYER_ID)) {
    map.addLayer({
      id: GRATICULE_LINE_LAYER_ID, type: 'line', source: GRATICULE_SOURCE_ID, slot: 'top',
      filter: ['==', ['get', 'kind'], 'line'],
      paint: { 'line-color': lineColor, 'line-opacity': dark ? 0.45 : 0.32, 'line-width': 1, 'line-dasharray': [2, 4] },
    })
  }
  if (!map.getLayer(GRATICULE_LABEL_LAYER_ID)) {
    map.addLayer({
      id: GRATICULE_LABEL_LAYER_ID, type: 'symbol', source: GRATICULE_SOURCE_ID, slot: 'top',
      filter: ['==', ['get', 'kind'], 'label'],
      layout: { 'text-field': ['get', 'text'], 'text-size': 10, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] },
      paint: { 'text-color': labelColor, 'text-halo-color': haloColor, 'text-halo-width': 1.5 },
    })
  }

  const update = () => {
    const source = map.getSource(GRATICULE_SOURCE_ID)
    if (!source) return
    const bounds = map.getBounds()
    const canvas = map.getCanvas()
    source.setData(createGraticuleData({
      west: bounds.getWest(), east: bounds.getEast(), south: bounds.getSouth(), north: bounds.getNorth(),
      width: canvas.clientWidth, height: canvas.clientHeight, zoom: map.getZoom(),
      labelLatitude: map.unproject([0, 72]).lat,
      labelLongitude: map.unproject([72, 0]).lng,
      labelWest: map.unproject([80, 0]).lng,
      labelEast: map.unproject([canvas.clientWidth - 52, 0]).lng,
    }))
  }
  map.on('moveend', update)
  map.on('resize', update)
  update()
  return () => {
    map.off('moveend', update)
    map.off('resize', update)
  }
}
