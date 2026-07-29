export const ROUTE_PREVIEW_SOURCE = 'briefing-route-applied'
export const ROUTE_BASELINE_SOURCE = 'briefing-route-baseline'
export const ROUTE_PENDING_SOURCE = 'briefing-route-pending'
export const ROUTE_BASELINE_LINE = 'briefing-route-baseline-line'
export const ROUTE_PENDING_LINE = 'briefing-route-pending-line'
export const ROUTE_DRAW_SOURCE = 'briefing-route-draw'
export const ROUTE_DRAW_LINE = 'briefing-route-draw-line'
export const ROUTE_PREVIEW_LINE = 'briefing-route-preview-line'
export const ROUTE_PREVIEW_LINE_HIT = 'briefing-route-preview-line-hit'
export const ROUTE_DESIGN_LINE = 'briefing-route-design-line'
export const ROUTE_DESIGN_LINE_HIT = 'briefing-route-design-line-hit'
export const ROUTE_PREVIEW_POINT = 'briefing-route-preview-point'
export const ROUTE_PREVIEW_LABEL = 'briefing-route-preview-label'
export const ROUTE_PENDING_POINT = 'briefing-route-pending-point'
export const ROUTE_PENDING_LABEL = 'briefing-route-pending-label'
export const VFR_WP_CIRCLE = 'vfr-wp-circle'
export const VFR_WP_LABEL = 'vfr-wp-label'
export const PROC_PREVIEW_SOURCE = 'procedure-preview'
export const PROC_SID_LINE = 'procedure-sid-line'
export const PROC_STAR_LINE = 'procedure-star-line'
export const PROC_IAP_LINE = 'procedure-iap-line'
export const PROC_WP_CIRCLE = 'procedure-wp-circle'
export const PROC_WP_LABEL = 'procedure-wp-label'

const emptyGeoJSON = { type: 'FeatureCollection', features: [] }

export function greatCircleNm(lon1, lat1, lon2, lat2) {
  const R = 3440.065
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function calcVfrDistance(waypoints) {
  let total = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += greatCircleNm(waypoints[i].lon, waypoints[i].lat, waypoints[i + 1].lon, waypoints[i + 1].lat)
  }
  return Number(total.toFixed(2))
}

export function segmentPointDistSq(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
}

export function findInsertIndex(waypoints, lngLat) {
  const { lng, lat } = lngLat
  let minDist = Infinity
  let insertIdx = 1
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1]
    const d = segmentPointDistSq(a.lon, a.lat, b.lon, b.lat, lng, lat)
    if (d < minDist) { minDist = d; insertIdx = i + 1 }
  }
  return insertIdx
}

export function relabeledWaypoints(waypoints) {
  let wpCount = 0
  // fixed (출/도착) keep id; named (검색-추가 fix) keep their fix name; only
  // anonymous map-clicked points get the WP1.. running label.
  return waypoints.map((wp) => (wp.fixed || wp.named) ? wp : { ...wp, id: `WP${++wpCount}` })
}

export function buildVfrGeoJSON(waypoints) {
  if (waypoints.length < 2) return emptyGeoJSON
  const coords = waypoints.map((wp) => [wp.lon, wp.lat])
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: coords } },
      ...waypoints.map((wp, i) => ({
        type: 'Feature',
        properties: { role: 'vfr-waypoint', wpIndex: i, fixed: wp.fixed ? 1 : 0, label: wp.id },
        geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
      })),
    ],
  }
}

export function getProcedureLineCoordinates(proc) {
  const geometryCoords = proc?.geometry?.coordinates
  if (Array.isArray(geometryCoords) && geometryCoords.length >= 2) {
    return geometryCoords
  }

  const fixes = (proc?.fixes ?? []).filter((f) => f.lat != null && f.lon != null)
  if (fixes.length < 2) return []
  return fixes.map((f) => [f.lon, f.lat])
}

export function buildProcedureGeoJSON(sid, star, iap) {
  const features = []
  function addProc(proc, role) {
    if (!proc) return
    const fixes = proc.fixes.filter((f) => f.lat != null && f.lon != null)
    const coords = getProcedureLineCoordinates(proc)
    if (coords.length < 2 || fixes.length < 2) return
    features.push({ type: 'Feature', properties: { role: `${role}-line` }, geometry: { type: 'LineString', coordinates: coords } })
    fixes.forEach((f) => features.push({
      type: 'Feature',
      properties: { role: `${role}-wp`, label: f.id },
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
    }))
    ;(proc.displayPoints ?? [])
      .filter((p) => p.lat != null && p.lon != null)
      .forEach((p) => features.push({
        type: 'Feature',
        properties: { role: `${role}-wp`, label: p.id },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      }))
  }
  addProc(sid, 'sid')
  addProc(star, 'star')
  if (iap) {
    const iapFixes = (iap.fixes ?? []).filter((f) => f.coordinates?.lat != null && f.coordinates?.lon != null)
    if (iapFixes.length >= 2) {
      const iapCoordinates = iapFixes.map((f) => [f.coordinates.lon, f.coordinates.lat])
      features.push({
        type: 'Feature',
        properties: { role: 'iap-line' },
        geometry: iap.geometry ?? { type: 'LineString', coordinates: iapCoordinates },
      })
      iapFixes.forEach((f) => features.push({
        type: 'Feature',
        properties: { role: 'iap-wp', label: f.id },
        geometry: { type: 'Point', coordinates: [f.coordinates.lon, f.coordinates.lat] },
      }))
    }
  }
  return { type: 'FeatureCollection', features }
}

export function augmentRouteWithProcedures(previewGeojson, sid, star, iap) {
  if (!sid && !star && !iap) return previewGeojson
  const lineFeature = previewGeojson.features.find((f) => f.properties.role === 'route-preview-line')
  if (!lineFeature) return previewGeojson

  // baseCoords = [depAirport, entryFix, ...airways..., exitFix, arrAirport]
  let combined = [...lineFeature.geometry.coordinates]
  const arrCoord = combined[combined.length - 1]
  const sameCoordinate = (a, b) => Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6

  // 1. Process SID: replace [dep, entryFix] with the full SID geometry
  const sidCoords = getProcedureLineCoordinates(sid)
  if (sidCoords.length > 0) {
    combined = sameCoordinate(sidCoords.at(-1), combined[1])
      ? [...sidCoords, ...combined.slice(2)]
      : [...sidCoords, ...combined.slice(1)]
  }

  // 2. Process STAR & IAP: replace [exitFix, arr] with [...starCoords, ...iapTail]
  const starCoords = getProcedureLineCoordinates(star)
  const iapCoords = iap?.geometry?.coordinates
    ?? (iap?.fixes ?? [])
      .filter((fix) => fix.coordinates?.lat != null && fix.coordinates?.lon != null)
      .map((fix) => [fix.coordinates.lon, fix.coordinates.lat])
  const iapTail = iapCoords.length > 1 ? iapCoords.slice(1) : []

  if (starCoords.length > 0) {
    // starCoords starts at exitFix
    const tail = iapTail.length > 0 ? iapTail : (sameCoordinate(starCoords.at(-1), arrCoord) ? [] : [arrCoord])
    combined = sameCoordinate(starCoords[0], combined.at(-2))
      ? [...combined.slice(0, -2), ...starCoords, ...tail]
      : [...combined.slice(0, -1), ...starCoords, ...tail]
  } else if (iapTail.length > 0) {
    // No STAR but have IAP (starts at exitFix)
    combined = [...combined.slice(0, -1), ...iapTail]
  }

  if (combined.length < 2) return previewGeojson
  return {
    ...previewGeojson,
    features: previewGeojson.features.map((f) =>
      f.properties.role === 'route-preview-line'
        ? { ...f, geometry: { ...f.geometry, coordinates: combined } }
        : f
    ),
  }
}

// 여러 설계안을 비교할 때 route-design-line은 절차 병합 없이 원본 선을 쓴다(routePreviewSync.js).
// 하지만 원본 선은 "출발공항→진입fix"/"이탈fix→도착공항" 구간을 직선으로 잇고 있어서,
// SID/STAR가 있으면 그 구간만 PROC_PREVIEW_SOURCE가 곡선으로 따로 그리는데도 이 직선이
// 위에 겹쳐 그려져 "SID/STAR를 무시하고 직선으로 간다"처럼 보인다. 그 구간을 잘라낸다 —
// 절차 좌표를 새로 넣는 게 아니라 원본 선 양끝만 자르므로 augmentRouteWithProcedures와 다르다.
export function trimRouteLineForProcedures(previewGeojson, sid, star) {
  if (!sid && !star) return previewGeojson
  const lineFeature = previewGeojson?.features?.find((f) => f.properties?.role === 'route-preview-line')
  if (!lineFeature) return previewGeojson
  let coords = lineFeature.geometry.coordinates
  if (sid && coords.length > 2) coords = coords.slice(1)
  if (star && coords.length > 2) coords = coords.slice(0, -1)
  if (coords.length < 2 || coords.length === lineFeature.geometry.coordinates.length) return previewGeojson
  return {
    ...previewGeojson,
    features: previewGeojson.features.map((f) =>
      f.properties?.role === 'route-preview-line'
        ? { ...f, properties: { ...f.properties, sourceIndexOffset: sid ? 1 : 0 }, geometry: { ...f.geometry, coordinates: coords } }
        : f
    ),
  }
}

export function addRoutePreviewLayers(map) {
  if (!map.getSource(ROUTE_BASELINE_SOURCE)) {
    map.addSource(ROUTE_BASELINE_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getSource(ROUTE_PREVIEW_SOURCE)) {
    map.addSource(ROUTE_PREVIEW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getSource(ROUTE_PENDING_SOURCE)) {
    map.addSource(ROUTE_PENDING_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(ROUTE_BASELINE_LINE)) {
    map.addLayer({
      id: ROUTE_BASELINE_LINE, type: 'line', source: ROUTE_BASELINE_SOURCE, slot: 'top',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['boolean', ['get', 'selected'], false], ['coalesce', ['get', 'color'], '#f97316'], ['boolean', ['get', 'comparison'], false], '#475569', '#f97316'],
        'line-width': 3, 'line-opacity': 0.9,
      },
    })
  }
  if (!map.getLayer(ROUTE_PENDING_LINE)) {
    map.addLayer({
      id: ROUTE_PENDING_LINE, type: 'line', source: ROUTE_PENDING_SOURCE, slot: 'top',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#f97316', 'line-width': 5, 'line-opacity': 1 },
    })
  }
  if (!map.getSource(ROUTE_DRAW_SOURCE)) {
    map.addSource(ROUTE_DRAW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(ROUTE_DRAW_LINE)) {
    map.addLayer({
      id: ROUTE_DRAW_LINE, type: 'line', source: ROUTE_DRAW_SOURCE, slot: 'top',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-dasharray': [2, 1] },
    })
  }
  // 투명 굵은 "히트 라인" — VFR 경로선 클릭/드래그(WP 추가) 충돌판정 확대용.
  // opacity 0이어도 Mapbox 이벤트/queryRenderedFeatures는 잡힘. 보이는 선 아래에 깐다.
  if (!map.getLayer(ROUTE_PREVIEW_LINE_HIT)) {
    map.addLayer({
      id: ROUTE_PREVIEW_LINE_HIT, type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-line'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 20 },
    })
  }
  if (!map.getLayer(ROUTE_PREVIEW_LINE)) {
    map.addLayer({
      id: ROUTE_PREVIEW_LINE, type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-line'],
      paint: { 'line-color': '#f97316', 'line-width': 4, 'line-opacity': 0.9 },
    })
  }
  if (!map.getLayer(ROUTE_DESIGN_LINE_HIT)) {
    map.addLayer({
      id: ROUTE_DESIGN_LINE_HIT, type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-design-hit'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 20 },
    })
  }
  if (!map.getLayer(ROUTE_DESIGN_LINE)) {
    map.addLayer({
      id: ROUTE_DESIGN_LINE, type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-design-line'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['boolean', ['get', 'selected'], false], ['coalesce', ['get', 'color'], '#f97316'], '#475569'],
        'line-width': ['case', ['boolean', ['get', 'selected'], false], 5, 3],
        'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 1, 0.6],
      },
    })
  }
  if (!map.getLayer(ROUTE_PREVIEW_POINT)) {
    map.addLayer({
      id: ROUTE_PREVIEW_POINT, type: 'circle', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-point'],
      paint: {
        'circle-color': '#f97316',
        'circle-radius': ['case', ['boolean', ['get', 'editable'], false], 7, 4],
        'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
      },
    })
  }
  if (!map.getLayer(ROUTE_PREVIEW_LABEL)) {
    map.addLayer({
      id: ROUTE_PREVIEW_LABEL, type: 'symbol', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-point'],
      layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans CJK JP Bold'], 'text-variable-anchor': ['top', 'bottom', 'right', 'left', 'top-right', 'top-left', 'bottom-right', 'bottom-left'], 'text-radial-offset': 0.9, 'text-justify': 'auto', 'text-allow-overlap': false, 'text-ignore-placement': false },
      paint: { 'text-color': '#c2410c', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    })
  }
  if (!map.getLayer(ROUTE_PENDING_POINT)) {
    map.addLayer({
      id: ROUTE_PENDING_POINT, type: 'circle', source: ROUTE_PENDING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-point'],
      paint: { 'circle-color': '#d946ef', 'circle-radius': 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
    })
  }
  if (!map.getLayer(ROUTE_PENDING_LABEL)) {
    map.addLayer({
      id: ROUTE_PENDING_LABEL, type: 'symbol', source: ROUTE_PENDING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-point'],
      layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans CJK JP Bold'], 'text-variable-anchor': ['top', 'bottom', 'right', 'left', 'top-right', 'top-left', 'bottom-right', 'bottom-left'], 'text-radial-offset': 0.9, 'text-justify': 'auto', 'text-allow-overlap': false, 'text-ignore-placement': false },
      paint: { 'text-color': '#d946ef', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    })
  }
}

export function addProcedurePreviewLayers(map) {
  if (!map.getSource(PROC_PREVIEW_SOURCE)) {
    map.addSource(PROC_PREVIEW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(PROC_SID_LINE)) {
    map.addLayer({
      id: PROC_SID_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'sid-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 },
    })
  }
  if (!map.getLayer(PROC_STAR_LINE)) {
    map.addLayer({
      id: PROC_STAR_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'star-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#7c3aed', 'line-width': 4, 'line-opacity': 0.9 },
    })
  }
  if (!map.getLayer(PROC_IAP_LINE)) {
    map.addLayer({
      id: PROC_IAP_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'iap-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#0ea5e9', 'line-width': 4, 'line-opacity': 0.9 },
    })
  }
  if (!map.getLayer(PROC_WP_CIRCLE)) {
    map.addLayer({
      id: PROC_WP_CIRCLE, type: 'circle', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['any', ['==', ['get', 'role'], 'sid-wp'], ['==', ['get', 'role'], 'star-wp'], ['==', ['get', 'role'], 'iap-wp']],
      paint: {
        'circle-radius': 3,
        'circle-color': ['case',
          ['==', ['get', 'role'], 'sid-wp'], '#2563eb',
          ['==', ['get', 'role'], 'iap-wp'], '#0ea5e9',
          '#7c3aed',
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }
  if (!map.getLayer(PROC_WP_LABEL)) {
    map.addLayer({
      id: PROC_WP_LABEL, type: 'symbol', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['any', ['==', ['get', 'role'], 'sid-wp'], ['==', ['get', 'role'], 'star-wp'], ['==', ['get', 'role'], 'iap-wp']],
      layout: {
        visibility: 'none',
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 10,
        'text-variable-anchor': ['top', 'bottom', 'right', 'left', 'top-right', 'top-left', 'bottom-right', 'bottom-left'],
        'text-radial-offset': 0.9,
        'text-justify': 'auto',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': ['case',
          ['==', ['get', 'role'], 'sid-wp'], '#2563eb',
          ['==', ['get', 'role'], 'iap-wp'], '#0ea5e9',
          '#7c3aed',
        ],
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }
}

export function addVfrWaypointLayers(map) {
  if (!map.getLayer(VFR_WP_CIRCLE)) {
    map.addLayer({
      id: VFR_WP_CIRCLE, type: 'circle', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'vfr-waypoint'],
      paint: {
        'circle-radius': 7,
        'circle-color': ['case', ['==', ['get', 'fixed'], 1], '#f97316', '#ffffff'],
        'circle-stroke-color': ['case', ['==', ['get', 'fixed'], 1], '#ffffff', '#2563eb'],
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      },
    })
  }
  if (!map.getLayer(VFR_WP_LABEL)) {
    map.addLayer({
      id: VFR_WP_LABEL, type: 'symbol', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['all', ['==', ['get', 'role'], 'vfr-waypoint'], ['==', ['get', 'fixed'], 0]],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 10,
        'text-variable-anchor': ['top', 'bottom', 'right', 'left', 'top-right', 'top-left', 'bottom-right', 'bottom-left'],
        'text-radial-offset': 0.9,
        'text-justify': 'auto',
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: { 'text-color': '#2563eb', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    })
  }
}

export function bindVfrInteractions(map, vfrWaypointsRef, onWaypointDrop, isComparisonRef = { current: false }, onDesignWaypointDrop = { current: null }) {
  let draggingIdx = -1
  let beforeDrag = null
  let designDrag = null
  let designCoordinates = null
  let designSourceData = null

  const redrawDesignDrag = () => {
    if (!designDrag || !designSourceData || !designCoordinates) return
    const source = map.getSource(ROUTE_PREVIEW_SOURCE)
    if (!source) return
    const data = structuredClone(designSourceData)
    const hitLine = designSourceData.features.find((feature) => feature.properties?.role === 'route-design-hit' && feature.properties?.designId === designDrag.designId)
    const reference = hitLine?.geometry?.coordinates?.[designDrag.sourceIndex]
    data.features = data.features.map((feature) => {
      if (feature.properties?.role !== 'route-design-line' || feature.properties?.designId !== designDrag.designId) return feature
      const coordinates = [...feature.geometry.coordinates]
      const displayIndex = reference ? coordinates.findIndex((coordinate) => coordinate[0] === reference[0] && coordinate[1] === reference[1]) : -1
      if (displayIndex < 0) return feature
      if (designDrag.kind === 'insert') coordinates.splice(displayIndex, 0, designCoordinates)
      else coordinates[displayIndex] = designCoordinates
      return { ...feature, geometry: { ...feature.geometry, coordinates } }
    })
    if (designDrag.kind === 'insert') {
      data.features.push({
        type: 'Feature',
        properties: { role: 'route-preview-point', designId: designDrag.designId, selected: true, editable: true, waypointIndex: designDrag.sourceIndex, label: 'WP' },
        geometry: { type: 'Point', coordinates: designCoordinates },
      })
    }
    source.setData(data)
  }

  const beginDesignLineDrag = (e, { snapToNavpoint = true } = {}) => {
    if (!isComparisonRef.current || designDrag) return
    const feature = e.features?.[0]
    const properties = feature?.properties ?? {}
    const coordinates = feature?.geometry?.coordinates ?? []
    if (!properties.designId || !properties.selected || coordinates.length < 2) return
    const sourceData = map.getSource(ROUTE_PREVIEW_SOURCE)?.serialize?.().data
    if (!sourceData || !Array.isArray(sourceData.features)) return
    const sourceLine = sourceData.features.find((item) => item.properties?.role === 'route-design-hit' && item.properties?.designId === properties.designId)
    if (!Array.isArray(sourceLine?.geometry?.coordinates) || sourceLine.geometry.coordinates.length < 2) return
    e.preventDefault()
    const sourceIndex = findInsertIndex(sourceLine.geometry.coordinates.map(([lon, lat]) => ({ lon, lat })), e.lngLat)
    const modelIndex = sourceIndex + (Number(properties.sourceIndexOffset) || 0)
    designDrag = { designId: properties.designId, kind: 'insert', index: modelIndex - 1, sourceIndex, snapToNavpoint }
    designCoordinates = [e.lngLat.lng, e.lngLat.lat]
    designSourceData = sourceData
    redrawDesignDrag()
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  }

  const beginDesignDrag = (e) => {
    if (!isComparisonRef.current) return
    if (designDrag) return
    const feature = e.features?.[0]
    const properties = feature?.properties ?? {}
    if (!properties.designId || !properties.selected || !properties.editable) return
    e.preventDefault()
    designDrag = {
      designId: properties.designId,
      kind: 'move',
      index: Number(properties.waypointIndex),
      sourceIndex: Number(properties.sourceIndex ?? properties.waypointIndex),
      startCoordinates: [e.lngLat.lng, e.lngLat.lat],
    }
    designCoordinates = [e.lngLat.lng, e.lngLat.lat]
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  }
  map.on('mousedown', ROUTE_PREVIEW_POINT, beginDesignDrag)
  map.on('mousedown', ROUTE_PREVIEW_LABEL, beginDesignDrag)
  map.on('mousedown', ROUTE_DESIGN_LINE_HIT, beginDesignLineDrag)
  map.on('touchstart', ROUTE_DESIGN_LINE_HIT, (event) => beginDesignLineDrag(event, { snapToNavpoint: false }))

  map.on('mousedown', VFR_WP_CIRCLE, (e) => {
    e.preventDefault()
    const wpIdx = e.features[0].properties.wpIndex
    if (vfrWaypointsRef.current[wpIdx]?.fixed) return
    beforeDrag = vfrWaypointsRef.current
    draggingIdx = wpIdx
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  })

  map.on('mousedown', ROUTE_PREVIEW_LINE_HIT, (e) => {
    if (isComparisonRef.current) return
    if (vfrWaypointsRef.current.length < 2) return
    const wpHit = map.queryRenderedFeatures(e.point, { layers: [VFR_WP_CIRCLE] })
    if (wpHit.length > 0) return
    e.preventDefault()
    const wps = vfrWaypointsRef.current
    beforeDrag = wps
    const insertIdx = findInsertIndex(wps, e.lngLat)
    const wpCount = wps.filter((wp) => !wp.fixed).length
    const newWp = { id: `WP${wpCount + 1}`, uid: crypto.randomUUID(), lon: e.lngLat.lng, lat: e.lngLat.lat }
    const next = relabeledWaypoints([...wps.slice(0, insertIdx), newWp, ...wps.slice(insertIdx)])
    vfrWaypointsRef.current = next
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(next))
    draggingIdx = insertIdx
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  })

  map.on('mousemove', ROUTE_PREVIEW_LINE_HIT, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = 'crosshair'
  })
  map.on('mouseleave', ROUTE_PREVIEW_LINE_HIT, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = ''
  })
  map.on('mousemove', ROUTE_DESIGN_LINE_HIT, () => {
    if (!designDrag) map.getCanvas().style.cursor = 'crosshair'
  })
  map.on('mouseleave', ROUTE_DESIGN_LINE_HIT, () => {
    if (!designDrag) map.getCanvas().style.cursor = ''
  })
  map.on('mousemove', VFR_WP_CIRCLE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = 'grab'
  })
  map.on('mouseleave', VFR_WP_CIRCLE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = ''
  })

  const moveDrag = (e) => {
    if (designDrag) {
      designCoordinates = [e.lngLat.lng, e.lngLat.lat]
      redrawDesignDrag()
      return
    }
    if (draggingIdx < 0) return
    const updated = vfrWaypointsRef.current.map((wp, i) =>
      i === draggingIdx ? { ...wp, lon: e.lngLat.lng, lat: e.lngLat.lat } : wp
    )
    vfrWaypointsRef.current = updated
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(updated))
  }
  map.on('mousemove', moveDrag)
  map.on('touchmove', moveDrag)

  const finishDrag = () => {
    if (designDrag) {
      const isClick = designDrag.kind === 'move'
        && Math.abs(designCoordinates[0] - designDrag.startCoordinates[0]) < 1e-8
        && Math.abs(designCoordinates[1] - designDrag.startCoordinates[1]) < 1e-8
      const { startCoordinates, sourceIndex, snapToNavpoint, ...drop } = designDrag
      onDesignWaypointDrop.current?.({ ...drop, kind: isClick ? 'delete' : drop.kind, coordinates: designCoordinates, ...(snapToNavpoint === false ? { snapToNavpoint: false } : {}) })
      designDrag = null
      designCoordinates = null
      designSourceData = null
      map.dragPan.enable()
      map.getCanvas().style.cursor = ''
      return
    }
    if (draggingIdx < 0) return
    onWaypointDrop.current?.({
      waypoints: [...vfrWaypointsRef.current],
      previousWaypoints: beforeDrag,
      waypointIndex: draggingIdx,
    })
    draggingIdx = -1
    beforeDrag = null
    map.dragPan.enable()
    map.getCanvas().style.cursor = ''
  }
  const cancelDesignDrag = () => {
    if (!designDrag) return
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(designSourceData)
    designDrag = null
    designCoordinates = null
    designSourceData = null
    map.dragPan.enable()
    map.getCanvas().style.cursor = ''
  }
  map.on('mouseup', finishDrag)
  map.on('touchend', finishDrag)
  map.on('touchcancel', cancelDesignDrag)
}

export function bindIfrClickInteraction(map, modeRef, addPointRef, statusRef) {
  const documentRef = map.getContainer().ownerDocument
  const windowRef = documentRef.defaultView
  const status = document.createElement('div')
  status.className = 'route-map-interaction-status'
  status.hidden = true
  map.getContainer().append(status)
  statusRef.current = (message) => {
    status.textContent = message
    status.hidden = !message
  }
  const confirmation = document.createElement('div')
  confirmation.className = 'route-map-interaction-confirm'
  confirmation.hidden = true
  // Keep confirmations above map chrome and mobile sheets; controls are not map clicks.
  confirmation.addEventListener('mousedown', (event) => event.stopPropagation())
  confirmation.addEventListener('touchstart', (event) => event.stopPropagation())
  confirmation.addEventListener('click', (event) => event.stopPropagation())
  documentRef.body.append(confirmation)
  statusRef.current.showConfirmation = ({ message, coordinates, onApply, onCancel, isTouch = false } = {}) => {
    if (!message || !Array.isArray(coordinates)) { confirmation.hidden = true; return }
    const point = map.project(coordinates)
    const bounds = map.getContainer().getBoundingClientRect()
    confirmation.classList.toggle('is-touch', isTouch)
    confirmation.replaceChildren()
    const text = document.createElement('span')
    text.className = 'route-map-interaction-confirm-text'
    text.textContent = message
    const actions = document.createElement('div')
    actions.className = 'route-map-interaction-confirm-actions'
    const apply = document.createElement('button')
    apply.type = 'button'; apply.className = 'route-map-interaction-confirm-apply'; apply.textContent = '적용'; apply.onclick = (event) => { event.stopPropagation(); confirmation.hidden = true; onApply?.() }
    const cancel = document.createElement('button')
    cancel.type = 'button'; cancel.className = 'route-map-interaction-confirm-cancel'; cancel.textContent = '취소'; cancel.onclick = (event) => { event.stopPropagation(); confirmation.hidden = true; onCancel?.() }
    actions.append(apply, cancel)
    confirmation.append(text, actions)
    confirmation.style.left = isTouch ? '' : `${bounds.left + point.x}px`
    confirmation.style.right = ''
    confirmation.style.top = isTouch ? '0px' : `${bounds.top + point.y}px`
    confirmation.hidden = false
    if (isTouch) {
      const topBarrier = bounds.top + 72
      const barriers = [windowRef.innerHeight - 12, bounds.bottom - 12]
      for (const selector of ['.mobile-taskbar', '.mobile-sheet']) {
        const element = documentRef.querySelector(selector)
        if (element) barriers.push(element.getBoundingClientRect().top - 12)
      }
      const maxTop = Math.max(topBarrier, Math.min(...barriers) - confirmation.getBoundingClientRect().height)
      confirmation.style.top = `${Math.min(Math.max(bounds.top + point.y, topBarrier), maxTop)}px`
    }
  }

  map.on('click', (event) => {
    if (modeRef.current === 'click-add') addPointRef.current?.([event.lngLat.lng, event.lngLat.lat])
  })

  let drawing = null
  map.on('mousedown', (event) => {
    if (modeRef.current !== 'draw') return
    event.preventDefault()
    drawing = [[event.lngLat.lng, event.lngLat.lat]]
    map.getSource(ROUTE_DRAW_SOURCE)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawing } }] })
    map.dragPan.disable()
    statusRef.current?.('그리는 중… FIX를 지나는 선을 그리세요')
  })
  map.on('mousemove', (event) => {
    if (drawing) {
      drawing.push([event.lngLat.lng, event.lngLat.lat])
      map.getSource(ROUTE_DRAW_SOURCE)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawing } }] })
    }
  })
  map.on('mouseup', (event) => {
    if (!drawing) return
    drawing.push([event.lngLat.lng, event.lngLat.lat])
    const coordinates = drawing
    drawing = null
    map.dragPan.enable()
    if (coordinates.length > 1) {
      statusRef.current?.('선에서 항로 FIX를 찾는 중…')
      addPointRef.current?.({ type: 'draw', coordinates })
    }
  })

  let detourStart = null
  const beginDetour = (event) => {
    if (modeRef.current !== 'segment-detour') return
    event.preventDefault()
    detourStart = event.point
    map.dragPan.disable()
    statusRef.current?.('새 중간 지점까지 끌어 놓으세요')
  }
  map.on('mousedown', ROUTE_DESIGN_LINE_HIT, beginDetour)
  map.on('mousedown', ROUTE_PREVIEW_LINE_HIT, beginDetour)
  map.on('mouseup', (event) => {
    if (!detourStart) return
    detourStart = null
    map.dragPan.enable()
    statusRef.current?.('우회 지점을 항로 FIX로 확인하는 중…')
    addPointRef.current?.({ type: 'segment-detour', coordinates: [event.lngLat.lng, event.lngLat.lat] })
  })

  map.on('mousemove', () => {
    if (drawing || detourStart) return
    const cursor = modeRef.current === 'draw' || modeRef.current === 'click-add' ? 'crosshair' : modeRef.current === 'segment-detour' ? 'copy' : ''
    map.getCanvas().style.cursor = cursor
  })

  return () => { status.remove(); confirmation.remove() }
}
