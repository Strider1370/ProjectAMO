import { AVIATION_WFS_LAYERS } from '../../aviation-layers/aviationWfsLayers.js'
import {
  PROC_IAP_LINE,
  PROC_PREVIEW_SOURCE,
  PROC_SID_LINE,
  PROC_STAR_LINE,
  PROC_WP_CIRCLE,
  PROC_WP_LABEL,
  ROUTE_BASELINE_SOURCE,
  ROUTE_DRAW_SOURCE,
  ROUTE_PENDING_SOURCE,
  ROUTE_BASELINE_LINE,
  ROUTE_PENDING_LINE,
  ROUTE_PREVIEW_LINE,
  ROUTE_PREVIEW_LINE_HIT,
  ROUTE_DESIGN_LINE,
  ROUTE_DESIGN_LINE_HIT,
  ROUTE_PREVIEW_POINT,
  ROUTE_PREVIEW_LABEL,
  ROUTE_PENDING_POINT,
  ROUTE_PENDING_LABEL,
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
export const ROUTE_HL_OVW_ICON = 'route-hl-ovw-icon'
export const ROUTE_HL_OVW_LABEL = 'route-hl-ovw-label'
export const ROUTE_HL_LAYER_IDS = [ROUTE_HL_WP_ICON, ROUTE_HL_WP_LABEL, ROUTE_HL_NA_ICON, ROUTE_HL_NA_LABEL, ROUTE_HL_AW_LINE, ROUTE_HL_AW_LABEL, ROUTE_HL_OVW_ICON, ROUTE_HL_OVW_LABEL]
export const ROUTE_PREVIEW_SOURCE_IDS = [
  ROUTE_BASELINE_SOURCE,
  ROUTE_DRAW_SOURCE,
  ROUTE_PREVIEW_SOURCE,
  ROUTE_PENDING_SOURCE,
  PROC_PREVIEW_SOURCE,
  BOUNDARY_FIX_PREVIEW_SOURCE,
]
export const ROUTE_PREVIEW_LAYER_IDS = [
  ROUTE_BASELINE_LINE,
  ROUTE_PENDING_LINE,
  ROUTE_PREVIEW_LINE,
  ROUTE_PREVIEW_LINE_HIT,
  ROUTE_DESIGN_LINE,
  ROUTE_DESIGN_LINE_HIT,
  ROUTE_PREVIEW_POINT,
  ROUTE_PREVIEW_LABEL,
  ROUTE_PENDING_POINT,
  ROUTE_PENDING_LABEL,
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
  const baseLabelFilter = (ids) => ['all', ['==', ['geometry-type'], 'Point'], ['!', ['in', ['get', 'ident'], ['literal', ids]]]]

  const wpCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'waypoint')
  const naCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'navaid')
  const awCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'ats-route')
  if (!wpCfg || !naCfg || !awCfg) return

  ;[wpCfg, naCfg, AVIATION_WFS_LAYERS.find((l) => l.id === 'overseas-waypoint'), AVIATION_WFS_LAYERS.find((l) => l.id === 'overseas-navaid')]
    .filter((cfg) => cfg?.pointLabelLayerId && map.getLayer(cfg.pointLabelLayerId))
    .forEach((cfg) => map.setFilter(cfg.pointLabelLayerId, baseLabelFilter(navpointIds)))

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

  // 해외 웨이포인트: 경로 위 해외 지점(B576 등의 ATOTI/BOISO 등)에 세모 아이콘+이름 표시.
  // 국내 waypoint/navaid 소스에는 없고 해외 소스(aviation-overseas-waypoint)에 있으므로 별도 하이라이트.
  const ovwCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'overseas-waypoint')
  if (ovwCfg?.iconImageByProperty && map.getSource(ovwCfg.sourceId)) {
    addOrUpdate(ROUTE_HL_OVW_ICON, {
      type: 'symbol', source: ovwCfg.sourceId, slot: 'top',
      layout: { 'icon-image': buildIconExpr(ovwCfg), 'icon-size': ovwCfg.iconSize ?? 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    }, ptFilter(navpointIds))

    addOrUpdate(ROUTE_HL_OVW_LABEL, {
      type: 'symbol', source: ovwCfg.sourceId, slot: 'top',
      layout: { 'text-field': ['get', 'ident'], 'text-size': 10, 'text-font': ['Noto Sans CJK JP Bold'], 'text-anchor': 'top', 'text-offset': [0, 0.75], 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': ovwCfg.color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    }, ptFilter(navpointIds))
  }

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
  AVIATION_WFS_LAYERS
    .filter((cfg) => cfg.pointLabelLayerId && map.getLayer(cfg.pointLabelLayerId))
    .forEach((cfg) => map.setFilter(cfg.pointLabelLayerId, ['==', ['geometry-type'], 'Point']))
}

export function syncRoutePreviewLayers(map, model) {
  installRoutePreviewLayers(map)

  const {
    routeResult,
    routeDesigns = [],
    selectedRouteDesignId,
    vfrWaypoints = [],
    appliedVfrWaypoints = vfrWaypoints,
    draftVfrWaypoints = [],
    selectedSid,
    selectedStar,
    selectedIap,
    baselinePreview,
    pendingRouteResult,
    pendingSid,
    pendingStar,
    pendingIap,
  } = model
  const baseDesign = routeDesigns.find((design) => design.kind === 'base' || design.id === 'base')
  const selectedDesign = routeDesigns.find((design) => design.id === selectedRouteDesignId)
  if (baseDesign && routeDesigns.length > 1) {
    const displayPreview = (design, preview) => augmentRouteWithProcedures(preview, design.procedures?.sid ?? null, design.procedures?.star ?? null, design.procedures?.iapKey ? selectedIap : null)
    const baseDisplayPreview = displayPreview(baseDesign, baseDesign.routeResult?.previewGeojson ?? emptyGeoJSON)
    const basePreview = {
      ...baseDisplayPreview,
      features: (baseDisplayPreview.features ?? []).map((feature) => ({
        ...feature,
        properties: { ...feature.properties, comparison: true, selected: baseDesign.id === selectedRouteDesignId },
      })),
    }
    const rawDraftPreview = selectedDesign?.draftEditor?.preview?.previewGeojson ?? emptyGeoJSON
    const hasDraftPreview = rawDraftPreview.features?.some((feature) => feature.properties?.role === 'route-preview-line')
    const appliedFeatures = routeDesigns
      .filter((design) => design.kind === 'alternative')
      .flatMap((design) => {
        if (hasDraftPreview && design.id === selectedRouteDesignId) return []
        const rawPreview = design.routeResult?.previewGeojson ?? emptyGeoJSON
        const rawLine = rawPreview.features?.find((feature) => feature.properties?.role === 'route-preview-line')
        const displayLine = displayPreview(design, rawPreview).features?.find((feature) => feature.properties?.role === 'route-preview-line')
        const selected = design.id === selectedRouteDesignId
        const points = selected ? rawPreview.features.filter((feature) => feature.properties?.role === 'route-preview-point').map((feature) => ({
          ...feature,
          properties: { ...feature.properties, designId: design.id, selected, waypointIndex: Number(feature.properties?.sequence) - 1, sourceIndex: Number(feature.properties?.sequence), editable: Boolean(feature.properties?.editable) || (design.routeResult?.flightRule === 'VFR' && feature.properties?.sequence > 1 && feature.properties?.sequence < rawPreview.features.filter((item) => item.properties?.role === 'route-preview-point').length) },
        })) : []
        return [
          ...(rawLine ? [{ ...rawLine, properties: { ...rawLine.properties, designId: design.id, selected, role: 'route-design-hit' } }] : []),
          ...(displayLine ? [{ ...displayLine, properties: { ...displayLine.properties, designId: design.id, selected, role: 'route-design-line' } }] : []),
          ...points,
        ]
      })
    const draftLine = rawDraftPreview.features?.find((feature) => feature.properties?.role === 'route-preview-line')
    const selectedDraftLine = draftLine ? {
      ...draftLine,
      properties: { ...draftLine.properties, designId: selectedDesign.id, selected: true, role: 'route-design-hit' },
    } : null
    const selectedDraftDisplayLine = draftLine ? displayPreview(selectedDesign, rawDraftPreview).features?.find((feature) => feature.properties?.role === 'route-preview-line') : null
    const interactivePreview = selectedDesign?.draftEditor?.preview ?? selectedDesign?.routeResult
    const interactiveLine = interactivePreview?.previewGeojson?.features?.find((feature) => feature.properties?.role === 'route-preview-line')
    const interactiveCoordinates = interactiveLine?.geometry?.coordinates ?? []
    const interactivePoints = selectedDesign && interactivePreview?.flightRule === 'VFR'
      ? interactiveCoordinates.map((coordinates, index) => ({
          type: 'Feature',
          properties: { role: 'route-preview-point', designId: selectedDesign.id, selected: true, waypointIndex: index, sourceIndex: index, editable: index > 0 && index < interactiveCoordinates.length - 1, label: '' },
          geometry: { type: 'Point', coordinates },
        }))
      : (interactivePreview?.previewGeojson?.features ?? [])
        .filter((feature) => feature.properties?.role === 'route-preview-point' && feature.properties?.editable)
        .map((feature) => ({
          ...feature,
          properties: { ...feature.properties, designId: selectedDesign?.id, selected: true, waypointIndex: Number(feature.properties.sequence) - 1, sourceIndex: Number(feature.properties.sequence), editable: true },
        }))
    const selectedAppliedPoints = selectedDesign?.routeResult?.flightRule !== 'VFR'
      ? appliedFeatures.filter((feature) => feature.properties?.role === 'route-preview-point' && !feature.properties?.editable)
      : []
    map.getSource(ROUTE_BASELINE_SOURCE)?.setData(basePreview)
    const draftDisplayFeature = selectedDraftDisplayLine ? { ...selectedDraftDisplayLine, properties: { ...selectedDraftDisplayLine.properties, designId: selectedDesign.id, selected: true, role: 'route-design-line' } } : null
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData({ type: 'FeatureCollection', features: [...appliedFeatures.filter((feature) => feature.properties?.role !== 'route-preview-point'), ...(selectedDraftLine ? [selectedDraftLine] : []), ...(draftDisplayFeature ? [draftDisplayFeature] : []), ...selectedAppliedPoints, ...interactivePoints] })
    map.getSource(ROUTE_PENDING_SOURCE)?.setData(emptyGeoJSON)
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(buildProcedureGeoJSON(selectedDesign?.procedures?.sid ?? null, selectedDesign?.procedures?.star ?? null, pendingIap ?? selectedIap ?? null))
    return { fitCoordinates: appliedFeatures.flatMap((feature) => feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates) }
  }
  map.getSource('briefing-route-baseline')?.setData(baselinePreview ?? emptyGeoJSON)
  const pendingPreview = pendingRouteResult?.previewGeojson
    ? augmentRouteWithProcedures(pendingRouteResult.previewGeojson, pendingSid, pendingStar, pendingIap)
    : emptyGeoJSON
  map.getSource('briefing-route-pending')?.setData(pendingPreview)
  let fitCoordinates = []
  if (routeResult?.flightRule === 'VFR') {
    const appliedPreview = appliedVfrWaypoints.length >= 2 ? buildVfrGeoJSON(appliedVfrWaypoints) : routeResult.previewGeojson ?? emptyGeoJSON
    const draftPreview = draftVfrWaypoints.length >= 2 ? buildVfrGeoJSON(draftVfrWaypoints) : null
    map.getSource('briefing-route-baseline')?.setData(appliedPreview)
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(draftPreview ?? appliedPreview)
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
    fitCoordinates = (draftPreview ?? appliedPreview).features.flatMap((feature) =>
      feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
    )
  } else if (routeDesigns.length > 1) {
    const selectedPreview = routeResult?.previewGeojson?.features?.filter((feature) => feature.properties?.role !== 'route-preview-line') ?? []
    const designFeatures = routeDesigns.flatMap((design) => {
      const line = design.routeResult?.previewGeojson?.features?.find((feature) => feature.properties?.role === 'route-preview-line')
      const coordinates = line?.geometry?.coordinates
      return coordinates?.length > 1 ? [{
        ...line,
        geometry: { ...line.geometry, coordinates },
        properties: { role: 'route-design-line', designId: design.id, selected: design.id === selectedRouteDesignId, kind: 'design' },
      }] : []
    })
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData({ type: 'FeatureCollection', features: [...selectedPreview, ...designFeatures] })
    fitCoordinates = designFeatures.flatMap((feature) => feature.geometry.coordinates)
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap))
  } else if (routeResult?.flightRule === 'IFR' && (selectedSid || selectedStar || selectedIap)) {
    const augmented = augmentRouteWithProcedures(routeResult.previewGeojson, selectedSid, selectedStar, selectedIap)
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(augmented)
    fitCoordinates = augmented.features.flatMap((feature) =>
      feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
    )
    // Feed the full procedure geojson (lines + waypoints). The SID/STAR/IAP line
    // layers draw their phase colors on top of the orange enroute line; the
    // procedure waypoint layers are hidden (visibility:none), so only the
    // colored segments show — enroute stays orange, SID/STAR/IAP get their hue.
    const procGeojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(procGeojson)
  } else if (routeResult?.flightRule === 'IFR') {
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(routeResult.previewGeojson ?? emptyGeoJSON)
    map.getSource(PROC_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
    fitCoordinates = (routeResult.previewGeojson?.features ?? []).flatMap((feature) =>
      feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
    )
  } else if (!routeResult) {
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
    map.getSource(ROUTE_DRAW_SOURCE)?.setData(emptyGeoJSON)
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
  return syncRoutePreviewLayers(map, {
    ...model,
    routeResult: model.routeResult ?? model.pendingRouteResult ?? { flightRule: 'VFR', previewGeojson: emptyGeoJSON },
  })
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
  map.getSource(ROUTE_BASELINE_SOURCE)?.setData(emptyGeoJSON)
  map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
  map.getSource(ROUTE_PENDING_SOURCE)?.setData(emptyGeoJSON)
  map.getSource(ROUTE_DRAW_SOURCE)?.setData(emptyGeoJSON)
  map.getSource(PROC_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
  map.getSource(BOUNDARY_FIX_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
  clearRouteHighlight(map)
}
