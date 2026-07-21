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
  trimRouteLineForProcedures,
} from './routePreview.js'
import { routeDesignColor } from './routeDesignColors.js'

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
const EMPTY_HIDDEN_SET = new Set()

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

export function clearRouteHighlight(map) {
  ROUTE_HL_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
  })
}

export function syncRoutePreviewLayers(map, model) {
  installRoutePreviewLayers(map)

  const {
    routeResult,
    routeDesigns = [],
    selectedRouteDesignId,
    hiddenRouteDesignIds = EMPTY_HIDDEN_SET,
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
    // 색 구분·숨김은 en-route 구간에만 적용한다 — "우회안 만들기"는 SID/STAR/IAP를
    // 그대로 복사하고 이후 어떤 편집도 절차를 바꾸지 않으므로, 절차 구간은 모든
    // 설계안이 완전히 같은 좌표다. 그 구간까지 경로별로 칠하면 같은 자리에 여러
    // 색이 겹쳐 그려지는 착시만 생긴다. 그래서 route-design-line은 절차 병합
    // 전의 원본 선(rawLine/draftLine)을 그대로 쓴다 — 절차 자체는 기존대로
    // PROC_PREVIEW_SOURCE가 공통 스타일로 그린다.
    const baseHidden = hiddenRouteDesignIds.has(baseDesign.id)
    const baseRawPreview = trimRouteLineForProcedures(baseDesign.routeResult?.previewGeojson ?? emptyGeoJSON, baseDesign.procedures?.sid, baseDesign.procedures?.star)
    const basePreview = baseHidden ? emptyGeoJSON : {
      ...baseRawPreview,
      features: (baseRawPreview.features ?? []).map((feature) => ({
        ...feature,
        properties: { ...feature.properties, comparison: true, selected: baseDesign.id === selectedRouteDesignId, color: routeDesignColor(baseDesign, routeDesigns) },
      })),
    }
    const selectedHidden = selectedDesign && hiddenRouteDesignIds.has(selectedDesign.id)
    const rawDraftPreview = trimRouteLineForProcedures(selectedDesign?.draftEditor?.preview?.previewGeojson ?? emptyGeoJSON, selectedDesign?.procedures?.sid, selectedDesign?.procedures?.star)
    const hasDraftPreview = rawDraftPreview.features?.some((feature) => feature.properties?.role === 'route-preview-line')
    const appliedFeatures = routeDesigns
      .filter((design) => design.kind === 'alternative' && !hiddenRouteDesignIds.has(design.id))
      .flatMap((design) => {
        if (hasDraftPreview && design.id === selectedRouteDesignId) return []
        const rawPreview = trimRouteLineForProcedures(design.routeResult?.previewGeojson ?? emptyGeoJSON, design.procedures?.sid, design.procedures?.star)
        const rawLine = rawPreview.features?.find((feature) => feature.properties?.role === 'route-preview-line')
        const selected = design.id === selectedRouteDesignId
        const color = routeDesignColor(design, routeDesigns)
        const points = selected ? rawPreview.features.filter((feature) => feature.properties?.role === 'route-preview-point').map((feature) => ({
          ...feature,
          properties: { ...feature.properties, designId: design.id, selected, waypointIndex: Number(feature.properties?.sequence) - 1, sourceIndex: Number(feature.properties?.sequence), editable: Boolean(feature.properties?.editable) || (design.routeResult?.flightRule === 'VFR' && feature.properties?.sequence > 1 && feature.properties?.sequence < rawPreview.features.filter((item) => item.properties?.role === 'route-preview-point').length) },
        })) : []
        return [
          ...(rawLine ? [{ ...rawLine, properties: { ...rawLine.properties, designId: design.id, selected, color, role: 'route-design-hit' } }] : []),
          ...(rawLine ? [{ ...rawLine, properties: { ...rawLine.properties, designId: design.id, selected, color, role: 'route-design-line' } }] : []),
          ...points,
        ]
      })
    const draftLine = (!selectedHidden && rawDraftPreview.features?.find((feature) => feature.properties?.role === 'route-preview-line')) || null
    const selectedColor = selectedDesign ? routeDesignColor(selectedDesign, routeDesigns) : undefined
    const selectedDraftLine = draftLine ? {
      ...draftLine,
      properties: { ...draftLine.properties, designId: selectedDesign.id, selected: true, color: selectedColor, role: 'route-design-hit' },
    } : null
    const draftDisplayFeature = draftLine ? {
      ...draftLine,
      properties: { ...draftLine.properties, designId: selectedDesign.id, selected: true, color: selectedColor, role: 'route-design-line' },
    } : null
    const interactivePreview = selectedDesign?.draftEditor?.preview ?? selectedDesign?.routeResult
    const interactiveLine = interactivePreview?.previewGeojson?.features?.find((feature) => feature.properties?.role === 'route-preview-line')
    const interactiveCoordinates = !selectedHidden ? (interactiveLine?.geometry?.coordinates ?? []) : []
    const interactivePoints = selectedDesign && !selectedHidden && interactivePreview?.flightRule === 'VFR'
      ? interactiveCoordinates.map((coordinates, index) => ({
          type: 'Feature',
          properties: { role: 'route-preview-point', designId: selectedDesign.id, selected: true, waypointIndex: index, sourceIndex: index, editable: index > 0 && index < interactiveCoordinates.length - 1, label: '' },
          geometry: { type: 'Point', coordinates },
        }))
      : (!selectedHidden ? (interactivePreview?.previewGeojson?.features ?? []) : [])
        .filter((feature) => feature.properties?.role === 'route-preview-point' && feature.properties?.editable)
        .map((feature) => ({
          ...feature,
          properties: { ...feature.properties, designId: selectedDesign?.id, selected: true, waypointIndex: Number(feature.properties.sequence) - 1, sourceIndex: Number(feature.properties.sequence), editable: true },
        }))
    const selectedAppliedPoints = !selectedHidden && selectedDesign?.routeResult?.flightRule !== 'VFR'
      ? appliedFeatures.filter((feature) => feature.properties?.role === 'route-preview-point' && !feature.properties?.editable)
      : []
    map.getSource(ROUTE_BASELINE_SOURCE)?.setData(basePreview)
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

  clearRouteHighlight(map)

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
