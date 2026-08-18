function isoOrNull(value) {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

function validOffset(value) {
  return Number.isInteger(value) && value >= 0 && value <= 12
}

export function normalizeNwpTimeSelection(selection = {}, orderedWaypointIds = []) {
  const known = new Set(orderedWaypointIds.filter(Boolean))
  const offsetByWaypoint = new Map()
  const missingWaypointIds = []

  for (const item of selection?.waypointOverrides ?? []) {
    const waypointId = item?.waypointId
    if (!known.has(waypointId)) {
      if (waypointId) missingWaypointIds.push(waypointId)
      continue
    }
    if (validOffset(item?.offsetHours)) offsetByWaypoint.set(waypointId, item.offsetHours)
  }

  return {
    baseTime: isoOrNull(selection?.baseTime),
    waypointOverrides: orderedWaypointIds
      .filter((waypointId) => offsetByWaypoint.has(waypointId))
      .map((waypointId) => ({ waypointId, offsetHours: offsetByWaypoint.get(waypointId) })),
    missingWaypointIds: [...new Set(missingWaypointIds)],
  }
}

export function buildNwpTimeSegments({ markers = [], selection = {} } = {}) {
  const orderedMarkers = markers
    .filter((marker) => marker?.id && Number.isFinite(marker?.distanceNm))
    .slice()
    .sort((a, b) => a.distanceNm - b.distanceNm)
  if (orderedMarkers.length < 2) return []

  const normalized = normalizeNwpTimeSelection(selection, orderedMarkers.map((marker) => marker.id))
  const offsets = new Map(normalized.waypointOverrides.map((item) => [item.waypointId, item.offsetHours]))
  let offsetHours = 0

  return orderedMarkers.slice(0, -1).map((marker, index) => {
    if (offsets.has(marker.id)) offsetHours = offsets.get(marker.id)
    return {
      startWaypointId: marker.id,
      startDistanceNm: marker.distanceNm,
      endDistanceNm: orderedMarkers[index + 1].distanceNm,
      offsetHours,
    }
  })
}
