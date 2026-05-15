import { AVIATION_WFS_LAYERS } from '../../aviation-layers/aviationWfsLayers.js'
import {
  PROC_IAP_LINE,
  PROC_PREVIEW_SOURCE,
  PROC_SID_LINE,
  PROC_STAR_LINE,
  PROC_WP_CIRCLE,
  PROC_WP_LABEL,
  ROUTE_PREVIEW_LINE,
  ROUTE_PREVIEW_POINT,
  ROUTE_PREVIEW_SOURCE,
  VFR_WP_CIRCLE,
  VFR_WP_LABEL,
  addProcedurePreviewLayers,
  addRoutePreviewLayers,
  addVfrWaypointLayers,
  augmentRouteWithProcedures,
  buildProcedureGeoJSON,
  buildVfrGeoJSON,
} from './routePreview.js'

export const BOUNDARY_FIX_PREVIEW_SOURCE = 'boundary-fix-preview'
export const BOUNDARY_FIX_PREVIEW_POINT = 'boundary-fix-preview-point'
export const BOUNDARY_FIX_PREVIEW_LABEL = 'boundary-fix-preview-label'

export const ROUTE_HL_WP_ICON = 'route-hl-wp-icon'
export const ROUTE_HL_WP_LABEL = 'route-hl-wp-label'
export const ROUTE_HL_NA_ICON = 'route-hl-na-icon'
export const ROUTE_HL_NA_LABEL = 'route-hl-na-label'
export const ROUTE_HL_AW_LINE = 'route-hl-aw-line'
export const ROUTE_HL_AW_LABEL = 'route-hl-aw-label'
export const ROUTE_HL_LAYER_IDS = [ROUTE_HL_WP_ICON, ROUTE_HL_WP_LABEL, ROUTE_HL_NA_ICON, ROUTE_HL_NA_LABEL, ROUTE_HL_AW_LINE, ROUTE_HL_AW_LABEL]
export const ROUTE_PREVIEW_SOURCE_IDS = [
  ROUTE_PREVIEW_SOURCE,
  PROC_PREVIEW_SOURCE,
  BOUNDARY_FIX_PREVIEW_SOURCE,
]
export const ROUTE_PREVIEW_LAYER_IDS = [
  ROUTE_PREVIEW_LINE,
  ROUTE_PREVIEW_POINT,
  VFR_WP_CIRCLE,
  VFR_WP_LABEL,
  PROC_SID_LINE,
  PROC_STAR_LINE,
  PROC_IAP_LINE,
  PROC_WP_CIRCLE,
  PROC_WP_LABEL,
  BOUNDARY_FIX_PREVIEW_POINT,
  BOUNDARY_FIX_PREVIEW_LABEL,
  ...ROUTE_HL_LAYER_IDS,
]

const emptyGeoJSON = { type: 'FeatureCollection', features: [] }

export function addBoundaryFixPreviewLayers(map) {
  if (!map.getSource(BOUNDARY_FIX_PREVIEW_SOURCE)) {
    map.addSource(BOUNDARY_FIX_PREVIEW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(BOUNDARY_FIX_PREVIEW_POINT)) {
    map.addLayer({
      id: BOUNDARY_FIX_PREVIEW_POINT,
      type: 'circle',
      source: BOUNDARY_FIX_PREVIEW_SOURCE,
      slot: 'top',
      paint: {
        'circle-color': '#0f766e',
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }
  if (!map.getLayer(BOUNDARY_FIX_PREVIEW_LABEL)) {
    map.addLayer({
      id: BOUNDARY_FIX_PREVIEW_LABEL,
      type: 'symbol',
      source: BOUNDARY_FIX_PREVIEW_SOURCE,
      slot: 'top',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-anchor': 'top',
        'text-offset': [0, 0.9],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#0f766e',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }
}

export function installRoutePreviewLayers(map) {
  addRoutePreviewLayers(map)
  addBoundaryFixPreviewLayers(map)
  addVfrWaypointLayers(map)
  addProcedurePreviewLayers(map)
}

export function applyRouteHighlight(map, navpointIds = []) {
  const ptFilter = (ids) => ['all', ['==', ['geometry-type'], 'Point'], ['in', ['get', 'ident'], ['literal', ids]]]

  const wpCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'waypoint')
  const naCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'navaid')
  const awCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'ats-route')
  if (!wpCfg || !naCfg || !awCfg) return

  function buildIconExpr(cfg) {
    const { property, fallback, values } = cfg.iconImageByProperty
    const expr = ['match', ['get', property]]
    Object.entries(values).forEach(([v, icon]) => expr.push(v, icon.imageId))
    expr.push(values[fallback].imageId)
    return expr
  }

  function addOrUpdate(id, layerDef, filter) {
    if (!map.getLayer(id)) {
      map.addLayer({ id, ...layerDef, filter })
    } else {
      map.setFilter(id, filter)
      map.setLayoutProperty(id, 'visibility', 'visible')
    }
  }

  addOrUpdate(ROUTE_HL_WP_ICON, {
    type: 'symbol', source: wpCfg.sourceId, slot: 'top',
    layout: { 'icon-image': buildIconExpr(wpCfg), 'icon-size': wpCfg.iconSize ?? 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
  }, ptFilter(navpointIds))

  addOrUpdate(ROUTE_HL_WP_LABEL, {
    type: 'symbol', source: wpCfg.sourceId, slot: 'top',
    layout: { 'text-field': ['get', 'ident'], 'text-size': 10, 'text-font': ['Noto Sans CJK JP Bold'], 'text-anchor': 'top', 'text-offset': [0, 0.75], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': wpCfg.color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  }, ptFilter(navpointIds))

  addOrUpdate(ROUTE_HL_NA_ICON, {
    type: 'symbol', source: naCfg.sourceId, slot: 'top',
    layout: { 'icon-image': buildIconExpr(naCfg), 'icon-size': naCfg.iconSize ?? 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
  }, ptFilter(navpointIds))

  addOrUpdate(ROUTE_HL_NA_LABEL, {
    type: 'symbol', source: naCfg.sourceId, slot: 'top',
    layout: { 'text-field': ['get', 'ident'], 'text-size': 10, 'text-font': ['Noto Sans CJK JP Bold'], 'text-anchor': 'top', 'text-offset': [0, 0.75], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': naCfg.color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  }, ptFilter(navpointIds))

  const segFilter = ['==', ['get', 'role'], 'route-segment-line']

  addOrUpdate(ROUTE_HL_AW_LINE, {
    type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
    paint: { 'line-color': awCfg.color, 'line-width': awCfg.lineWidth, 'line-opacity': awCfg.lineOpacity },
  }, segFilter)

  addOrUpdate(ROUTE_HL_AW_LABEL, {
    type: 'symbol', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 200, 'text-field': ['get', 'routeId'], 'text-size': 10, 'text-font': ['Noto Sans CJK JP Bold'], 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'map', 'text-keep-upright': true, 'text-allow-overlap': false, 'text-ignore-placement': false },
    paint: { 'text-color': awCfg.color, 'text-halo-color': '#eef6ed', 'text-halo-width': 1.5 },
  }, segFilter)
}

export function clearRouteHighlight(map) {
  ROUTE_HL_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
  })
}

export function syncRoutePreviewLayers(map, model) {
  installRoutePreviewLayers(map)

  const { routeResult, selectedSid, selectedStar, selectedIap } = model
  let fitCoordinates = []
  if (routeResult?.flightRule === 'IFR' && (selectedSid || selectedStar || selectedIap)) {
    const augmented = augmentRouteWithProcedures(routeResult.previewGeojson, selectedSid, selectedStar, selectedIap)
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(augmented)
    fitCoordinates = augmented.features.flatMap((feature) =>
      feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
    )
    const procGeojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
    const wpOnly = { ...procGeojson, features: procGeojson.features.filter((f) => !f.properties.role.endsWith('-line')) }
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(wpOnly)
  } else if (routeResult?.flightRule === 'IFR') {
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(routeResult.previewGeojson ?? emptyGeoJSON)
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
    fitCoordinates = (routeResult.previewGeojson?.features ?? []).flatMap((feature) =>
      feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
    )
  } else if (!routeResult) {
    const procGeojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(procGeojson)
    fitCoordinates = procGeojson.features.flatMap((feature) =>
      feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
    )
  }

  if (routeResult?.flightRule === 'IFR') {
    applyRouteHighlight(map, routeResult.navpointIds)
  } else {
    clearRouteHighlight(map)
  }

  return { fitCoordinates }
}

export function syncVfrWaypointData(map, model) {
  installRoutePreviewLayers(map)
  const { vfrWaypoints = [] } = model
  map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(vfrWaypoints.length >= 2 ? buildVfrGeoJSON(vfrWaypoints) : emptyGeoJSON)
}

export function syncBoundaryFixPreview(map, model) {
  installRoutePreviewLayers(map)

  const {
    routeResult,
    selectedSid,
    selectedStar,
    selectedIap,
    selectedBoundaryFix,
    selectedBoundaryNavpoint,
  } = model
  const source = map.getSource(BOUNDARY_FIX_PREVIEW_SOURCE)

  if (!source || !selectedBoundaryNavpoint?.coordinates) {
    source?.setData(emptyGeoJSON)
    return { fitCoordinates: [] }
  }

  const boundaryCoord = [selectedBoundaryNavpoint.coordinates.lon, selectedBoundaryNavpoint.coordinates.lat]
  source.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          label: selectedBoundaryFix,
        },
        geometry: {
          type: 'Point',
          coordinates: boundaryCoord,
        },
      },
    ],
  })

  if (routeResult) return { fitCoordinates: [] }

  const procGeojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
  const procCoords = procGeojson.features.flatMap((feature) =>
    feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
  )
  return { fitCoordinates: [...procCoords, boundaryCoord] }
}

export function clearRoutePreviewLayers(map) {
  map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
  map.getSource(PROC_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
  map.getSource(BOUNDARY_FIX_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
  clearRouteHighlight(map)
}
