import { buildNwpTimeSegments, normalizeNwpTimeSelection } from '../../../../../shared/nwp-time-selection.js'

export function rebaseNwpTimeSelection(selection = {}, baseTime) {
  return {
    baseTime: Number.isFinite(Date.parse(baseTime)) ? new Date(baseTime).toISOString() : null,
    waypointOverrides: [...(selection.waypointOverrides ?? [])],
  }
}

export function setWaypointNwpOffset(selection = {}, waypointId, offsetHours, orderedWaypointIds = []) {
  const withoutWaypoint = (selection.waypointOverrides ?? []).filter((item) => item?.waypointId !== waypointId)
  const waypointOverrides = offsetHours == null
    ? withoutWaypoint
    : [...withoutWaypoint, { waypointId, offsetHours }]
  const normalized = normalizeNwpTimeSelection({ ...selection, waypointOverrides }, orderedWaypointIds)
  return {
    baseTime: normalized.baseTime,
    waypointOverrides: normalized.waypointOverrides,
  }
}

export function buildNwpTimeRail(markers, selection) {
  const overrideIds = new Set((selection?.waypointOverrides ?? []).map((item) => item.waypointId))
  return buildNwpTimeSegments({ markers, selection }).map((segment, index) => ({
    ...segment,
    showLabel: index === 0 || overrideIds.has(segment.startWaypointId),
  }))
}
