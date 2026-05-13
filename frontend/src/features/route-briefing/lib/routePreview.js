export const ROUTE_PREVIEW_SOURCE = 'briefing-route-preview'
export const ROUTE_PREVIEW_LINE = 'briefing-route-preview-line'
export const ROUTE_PREVIEW_POINT = 'briefing-route-preview-point'
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
  return waypoints.map((wp) => wp.fixed ? wp : { ...wp, id: `WP${++wpCount}` })
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
    const iapFixes = (iap.fixes ?? []).filter((f) => f.coordinates?.lat != null)
    if (iapFixes.length >= 2) {
      features.push({ type: 'Feature', properties: { role: 'iap-line' }, geometry: iap.geometry })
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

  // 1. Process SID: replace [dep, entryFix] with the full SID geometry
  const sidCoords = getProcedureLineCoordinates(sid)
  if (sidCoords.length > 0) {
    combined = [...sidCoords, ...combined.slice(2)]
  }

  // 2. Process STAR & IAP: replace [exitFix, arr] with [...starCoords, ...iapTail]
  const starCoords = getProcedureLineCoordinates(star)
  const iapCoords = iap?.geometry?.coordinates ?? []
  const iapTail = iapCoords.length > 1 ? iapCoords.slice(1) : []

  if (starCoords.length > 0) {
    // starCoords starts at exitFix
    const tail = iapTail.length > 0 ? iapTail : [arrCoord]
    combined = [...combined.slice(0, -2), ...starCoords, ...tail]
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

export function addRoutePreviewLayers(map) {
  if (!map.getSource(ROUTE_PREVIEW_SOURCE)) {
    map.addSource(ROUTE_PREVIEW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(ROUTE_PREVIEW_LINE)) {
    map.addLayer({
      id: ROUTE_PREVIEW_LINE, type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-line'],
      paint: { 'line-color': '#f97316', 'line-width': 4, 'line-opacity': 0.9 },
    })
  }
  if (!map.getLayer(ROUTE_PREVIEW_POINT)) {
    map.addLayer({
      id: ROUTE_PREVIEW_POINT, type: 'circle', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-point'],
      paint: { 'circle-color': '#f97316', 'circle-radius': 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
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
      paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [5, 3] },
    })
  }
  if (!map.getLayer(PROC_STAR_LINE)) {
    map.addLayer({
      id: PROC_STAR_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'star-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [5, 3] },
    })
  }
  if (!map.getLayer(PROC_IAP_LINE)) {
    map.addLayer({
      id: PROC_IAP_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'iap-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#0ea5e9', 'line-width': 2, 'line-dasharray': [3, 3] },
    })
  }
  if (!map.getLayer(PROC_WP_CIRCLE)) {
    map.addLayer({
      id: PROC_WP_CIRCLE, type: 'circle', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['any', ['==', ['get', 'role'], 'sid-wp'], ['==', ['get', 'role'], 'star-wp'], ['==', ['get', 'role'], 'iap-wp']],
      paint: {
        'circle-radius': 4,
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
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
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
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#2563eb', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    })
  }
}

export function bindVfrInteractions(map, vfrWaypointsRef, setVfrWaypoints) {
  let draggingIdx = -1

  map.on('mousedown', VFR_WP_CIRCLE, (e) => {
    e.preventDefault()
    const wpIdx = e.features[0].properties.wpIndex
    if (vfrWaypointsRef.current[wpIdx]?.fixed) return
    draggingIdx = wpIdx
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  })

  map.on('mousedown', ROUTE_PREVIEW_LINE, (e) => {
    if (vfrWaypointsRef.current.length < 2) return
    const wpHit = map.queryRenderedFeatures(e.point, { layers: [VFR_WP_CIRCLE] })
    if (wpHit.length > 0) return
    e.preventDefault()
    const wps = vfrWaypointsRef.current
    const insertIdx = findInsertIndex(wps, e.lngLat)
    const wpCount = wps.filter((wp) => !wp.fixed).length
    const newWp = { id: `WP${wpCount + 1}`, lon: e.lngLat.lng, lat: e.lngLat.lat }
    const next = relabeledWaypoints([...wps.slice(0, insertIdx), newWp, ...wps.slice(insertIdx)])
    vfrWaypointsRef.current = next
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(next))
    draggingIdx = insertIdx
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  })

  map.on('mousemove', ROUTE_PREVIEW_LINE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = 'crosshair'
  })
  map.on('mouseleave', ROUTE_PREVIEW_LINE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = ''
  })
  map.on('mousemove', VFR_WP_CIRCLE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = 'grab'
  })
  map.on('mouseleave', VFR_WP_CIRCLE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = ''
  })

  map.on('mousemove', (e) => {
    if (draggingIdx < 0) return
    const updated = vfrWaypointsRef.current.map((wp, i) =>
      i === draggingIdx ? { ...wp, lon: e.lngLat.lng, lat: e.lngLat.lat } : wp
    )
    vfrWaypointsRef.current = updated
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(updated))
  })

  map.on('mouseup', () => {
    if (draggingIdx < 0) return
    setVfrWaypoints([...vfrWaypointsRef.current])
    draggingIdx = -1
    map.dragPan.enable()
    map.getCanvas().style.cursor = ''
  })
}
