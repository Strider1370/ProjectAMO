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
  if (lineFeature.properties?.inlineProcedureGeometry) return previewGeojson

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
    const starStartIndex = combined.findIndex((coordinate) => sameCoordinate(coordinate, starCoords[0]))
    const importedApproachTail = starStartIndex >= 0 ? combined.slice(starStartIndex + 1) : []
    // 가져온 FPL은 STAR 마지막 FIX 뒤에 접근 절차의 자체 지점(VTF, FF07, RW07 등)을
    // 계속 담을 수 있다. 그때는 STAR 시작점부터만 교체해야 기존 DOTOL→VTF 직선이 남지 않는다.
    if (importedApproachTail.length > 1) {
      combined = [...combined.slice(0, starStartIndex), ...starCoords, ...importedApproachTail]
    } else {
      const tail = iapTail.length > 0 ? iapTail : (sameCoordinate(starCoords.at(-1), arrCoord) ? [] : [arrCoord])
      combined = sameCoordinate(starCoords[0], combined.at(-2))
        ? [...combined.slice(0, -2), ...starCoords, ...tail]
        : [...combined.slice(0, -1), ...starCoords, ...tail]
    }
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

// 가져온 FPL에서 절차 범위를 이미 공식 절차 좌표로 치환한 경우다. 이후 모든 지도 경로는
// 이 선을 그대로 쓰고 절차를 다시 덧붙이거나 양끝만 자르지 않는다.
export function inlineImportedProcedureGeometry(previewGeojson, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return previewGeojson
  return {
    ...previewGeojson,
    features: previewGeojson.features.map((feature) => feature.properties?.role === 'route-preview-line'
      ? { ...feature, properties: { ...feature.properties, inlineProcedureGeometry: true }, geometry: { ...feature.geometry, coordinates } }
      : feature),
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
  if (lineFeature.properties?.inlineProcedureGeometry) return previewGeojson
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
