import { setMapLayerVisible } from './mapLayerUtils.js'

export const AIRPORT_SOURCE_ID = 'kma-weather-airports'
export const AIRPORT_CIRCLE_LAYER = 'kma-weather-airports-circle'
export const AIRPORT_LABEL_LAYER = 'kma-weather-airports-label'

export const GEO_BOUNDARY_COLOR = '#facc15'
export const GEO_BOUNDARY_WIDTH = 1
export const GEO_SIGUNGU_MIN_ZOOM = 9
export const GEO_LAYERS = [
  { sourceId: 'geo-neighbors', layerId: 'geo-neighbors-line', url: '/Geo/korea_neighbors_masked.v1.geojson', minzoom: 0 },
  { sourceId: 'geo-sido', layerId: 'geo-sido-line', url: '/Geo/sido.json', minzoom: 0, maxzoom: GEO_SIGUNGU_MIN_ZOOM },
  { sourceId: 'geo-sigungu', layerId: 'geo-sigungu-line', url: '/Geo/sigungu.json', minzoom: GEO_SIGUNGU_MIN_ZOOM },
]
export const BASE_MAP_SOURCE_IDS = [
  AIRPORT_SOURCE_ID,
  ...GEO_LAYERS.map((layer) => layer.sourceId),
]
export const BASE_MAP_LAYER_IDS = [
  AIRPORT_CIRCLE_LAYER,
  AIRPORT_LABEL_LAYER,
  ...GEO_LAYERS.map((layer) => layer.layerId),
]

export function createAirportGeoJSON(airports) {
  return {
    type: 'FeatureCollection',
    features: airports
      .filter((a) => Number.isFinite(a.lon) && Number.isFinite(a.lat))
      .map((a) => ({
        type: 'Feature',
        id: a.icao,
        properties: { icao: a.icao, name: a.nameKo || a.name || a.icao },
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      })),
  }
}

export function addAirportLayers(map, data) {
  if (!map.getSource(AIRPORT_SOURCE_ID)) {
    map.addSource(AIRPORT_SOURCE_ID, { type: 'geojson', data })
  }
  if (!map.getLayer(AIRPORT_CIRCLE_LAYER)) {
    map.addLayer({
      id: AIRPORT_CIRCLE_LAYER, type: 'circle', source: AIRPORT_SOURCE_ID, slot: 'top',
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 5],
        'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#f97316', '#0f766e'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.95,
      },
    })
  }
  if (!map.getLayer(AIRPORT_LABEL_LAYER)) {
    map.addLayer({
      id: AIRPORT_LABEL_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top',
      layout: {
        'text-field': ['get', 'icao'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-offset': [0, 0.8],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    })
  }
}

export function addGeoBoundaryLayers(map) {
  GEO_LAYERS.forEach(({ sourceId, layerId, url, minzoom, maxzoom }) => {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: url })
    }
    if (!map.getLayer(layerId)) {
      const layerDef = {
        id: layerId,
        type: 'line',
        source: sourceId,
        slot: 'top',
        minzoom,
        layout: { visibility: 'none' },
        paint: {
          'line-color': GEO_BOUNDARY_COLOR,
          'line-width': GEO_BOUNDARY_WIDTH,
          'line-opacity': 0.85,
        },
      }
      if (maxzoom !== undefined) layerDef.maxzoom = maxzoom
      map.addLayer(layerDef)
    }
  })
}

export function setGeoBoundaryVisibility(map, show) {
  GEO_LAYERS.forEach(({ layerId }) => setMapLayerVisible(map, layerId, show))
}
