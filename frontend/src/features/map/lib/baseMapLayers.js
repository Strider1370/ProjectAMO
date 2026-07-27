import { setMapLayerVisible, addLazyGeoJsonSource, ensureGeoJsonSourceLoaded } from './mapLayerUtils.js'
import { buildAirportStationMarkerModel } from './airportStationModel.js'

export const AIRPORT_SOURCE_ID = 'kma-weather-airports'
export const AIRPORT_CIRCLE_LAYER = 'kma-weather-airports-circle'
export const AIRPORT_STATION_CENTER_LAYER = 'kma-weather-airports-station-center'
export const AIRPORT_WIND_LAYER = 'kma-weather-airports-wind-barb'
export const AIRPORT_VISIBILITY_LAYER = 'kma-weather-airports-visibility'
export const AIRPORT_WEATHER_LAYER = 'kma-weather-airports-weather'
export const AIRPORT_CEILING_LAYER = 'kma-weather-airports-ceiling'
export const AIRPORT_LABEL_LAYER = 'kma-weather-airports-label'
export const AIRPORT_INTERACTIVE_LAYERS = [
  AIRPORT_CIRCLE_LAYER,
  AIRPORT_STATION_CENTER_LAYER,
  AIRPORT_WIND_LAYER,
  AIRPORT_VISIBILITY_LAYER,
  AIRPORT_WEATHER_LAYER,
  AIRPORT_CEILING_LAYER,
  AIRPORT_LABEL_LAYER,
]

export const GEO_BOUNDARY_COLOR = '#111827'
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
  AIRPORT_STATION_CENTER_LAYER,
  AIRPORT_WIND_LAYER,
  AIRPORT_VISIBILITY_LAYER,
  AIRPORT_WEATHER_LAYER,
  AIRPORT_CEILING_LAYER,
  AIRPORT_LABEL_LAYER,
  ...GEO_LAYERS.map((layer) => layer.layerId),
]

export function createAirportGeoJSON(airports, metarData = null) {
  return {
    type: 'FeatureCollection',
    features: airports
      .filter((a) => Number.isFinite(a.lon) && Number.isFinite(a.lat))
      .map((a) => {
        const markerModel = buildAirportStationMarkerModel({
          airport: a,
          metar: metarData?.airports?.[a.icao] || null,
        })
        return {
          type: 'Feature',
          id: a.icao,
          properties: {
            icao: a.icao,
            name: a.nameKo || a.name || a.icao,
            ...markerModel,
          },
          geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        }
      }),
  }
}

export function addAirportLayers(map, data) {
  if (!map.getSource(AIRPORT_SOURCE_ID)) {
    map.addSource(AIRPORT_SOURCE_ID, { type: 'geojson', data })
  }
  if (!map.getLayer(AIRPORT_CIRCLE_LAYER)) {
    map.addLayer({
      id: AIRPORT_CIRCLE_LAYER, type: 'circle', source: AIRPORT_SOURCE_ID, slot: 'top', minzoom: 0,
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 12, 10],
        'circle-color': '#ffffff',
        'circle-opacity': 0,
        'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#2563eb', '#2563eb'],
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 0],
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.95, 0],
      },
    })
  }
  if (!map.getLayer(AIRPORT_STATION_CENTER_LAYER)) {
    map.addLayer({
      id: AIRPORT_STATION_CENTER_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top', minzoom: 0,
      layout: {
        'icon-image': ['get', 'stationIconId'],
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          5, 0.78,
          8, 0.92,
          12, 1.0,
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  }
  // if (!map.getLayer(AIRPORT_VISIBILITY_LAYER)) {
  //   map.addLayer({
  //     id: AIRPORT_VISIBILITY_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top',
  //     filter: ['!=', ['get', 'visibilityText'], ''],
  //     layout: {
  //       'text-field': ['get', 'visibilityText'],
  //       'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
  //       'text-offset': [-1.25, 0],
  //       'text-anchor': 'right',
  //       'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 11, 12, 12],
  //       'text-allow-overlap': true,
  //       'text-ignore-placement': true,
  //     },
  //     paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  //   })
  // }
  // if (!map.getLayer(AIRPORT_WEATHER_LAYER)) {
  //   map.addLayer({
  //     id: AIRPORT_WEATHER_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top', minzoom: 6,
  //     filter: ['!=', ['get', 'weatherIconId'], ''],
  //     layout: {
  //       'icon-image': ['get', 'weatherIconId'],
  //       'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.58, 8, 0.68, 12, 0.78],
  //       'icon-offset': [1.3, 0],
  //       'icon-anchor': 'left',
  //       'icon-allow-overlap': true,
  //       'icon-ignore-placement': true,
  //     },
  //   })
  // }
  // if (!map.getLayer(AIRPORT_CEILING_LAYER)) {
  //   map.addLayer({
  //     id: AIRPORT_CEILING_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top',
  //     filter: ['!=', ['get', 'ceilingText'], ''],
  //     layout: {
  //       'text-field': ['get', 'ceilingText'],
  //       'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
  //       'text-offset': [0, 1],
  //       'text-anchor': 'top',
  //       'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 10, 12, 11],
  //       'text-allow-overlap': true,
  //       'text-ignore-placement': true,
  //     },
  //     paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  //   })
  // }
  if (!map.getLayer(AIRPORT_LABEL_LAYER)) {
    map.addLayer({
      id: AIRPORT_LABEL_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top', minzoom: 6,
      layout: {
        'text-field': ['get', 'icao'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-offset': [
          'case',
          ['boolean', ['get', 'labelAbove'], false],
          ['literal', [0, -1.1]],
          ['literal', [0, 1.1]],
        ],
        'text-anchor': [
          'case',
          ['boolean', ['get', 'labelAbove'], false],
          'bottom',
          'top',
        ],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    })
  }
  if (!map.getLayer(AIRPORT_WIND_LAYER)) {
    map.addLayer({
      id: AIRPORT_WIND_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top', minzoom: 4,
      filter: ['!=', ['get', 'windIconId'], ''],
      layout: {
        'icon-image': ['get', 'windIconId'],
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          6, 0.74,
          9, 0.86,
          12, 0.96,
        ],
        'icon-rotate': ['get', 'windDirection'],
        'icon-rotation-alignment': 'map',
        'icon-anchor': 'center',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  }
}

export function addGeoBoundaryLayers(map) {
  GEO_LAYERS.forEach(({ sourceId, layerId, minzoom, maxzoom }) => {
    // 처음엔 항상 숨김(visibility:'none') 상태로 시작하는 레이어라 데이터도 지연 로딩 —
    // setGeoBoundaryVisibility가 실제로 보여줄 때 dataUrl로 소스를 채운다.
    addLazyGeoJsonSource(map, sourceId, undefined, { eager: false })
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

// mapbox 레이어 가시 규칙과 동일: minzoom 이상, maxzoom 미만일 때만 실제로 그려진다.
export function geoLayerInZoomRange(layer, zoom) {
  if (layer.minzoom !== undefined && zoom < layer.minzoom) return false
  if (layer.maxzoom !== undefined && zoom >= layer.maxzoom) return false
  return true
}

// 지금 확대 단계에서 실제로 그려지는 레이어의 데이터만 받는다. sigungu.json은 4.4MB인데
// 시작 zoom 6에서는 그려지지도 않으므로(minzoom 9) 예전엔 통째로 낭비됐다.
// ensureGeoJsonSourceLoaded가 이미 로드된 소스를 걸러내므로 반복 호출은 Set 조회 한 번.
function loadGeoSourcesForZoom(map) {
  const zoom = map.getZoom()
  GEO_LAYERS.forEach((layer) => {
    if (geoLayerInZoomRange(layer, zoom)) ensureGeoJsonSourceLoaded(map, layer.sourceId, layer.url)
  })
}

// 경계선을 켜 둔 동안에는 확대할 때마다 범위에 새로 들어온 레이어를 받아야 한다.
// 이 연결이 없으면 확대해도 시군구 경계가 영영 안 나온다.
const geoZoomHandlers = new WeakMap()

export function setGeoBoundaryVisibility(map, show) {
  if (show) {
    loadGeoSourcesForZoom(map)
    if (!geoZoomHandlers.has(map)) {
      const onZoom = () => loadGeoSourcesForZoom(map)
      geoZoomHandlers.set(map, onZoom)
      map.on('zoom', onZoom)
    }
  } else {
    const onZoom = geoZoomHandlers.get(map)
    if (onZoom) {
      map.off('zoom', onZoom)
      geoZoomHandlers.delete(map)
    }
  }
  GEO_LAYERS.forEach(({ layerId }) => setMapLayerVisible(map, layerId, show))
}

export function shouldShowGeoBoundaries({ basemapId, metVisibility = {}, enableWindOverlay = true } = {}) {
  const hasRasterWeather = !!(metVisibility.radar || metVisibility.radarOverseas || metVisibility.satellite)
  const hasNwpOverlay = !!(
    enableWindOverlay
    && (metVisibility.wind || metVisibility.temp || metVisibility.cloud || metVisibility.icing)
  )
  return basemapId === 'dark' || hasRasterWeather || hasNwpOverlay
}
