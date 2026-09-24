import { createRouteEditor } from './routeEditor.js'
import { parseVfrDraftText, parseManualRouteString, formatVfrDraftText, formatManualRouteString } from './manualRouteInput.js'

export async function buildEditorPreview(editor, text, { planner, effectiveRouteType = 'ALL', pendingIntent = null }) {
  const { buildVfrRoute, buildManualVfrRoute, buildManualIfrRoute } = planner
  const currentEnroute = editor.enroute
  const userWaypoints = [...(currentEnroute?.userWaypoints ?? [])]
  const parsed = editor.routeForm.flightRule === 'VFR'
    ? parseVfrDraftText(text, { departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, userWaypoints }).enroute
    : parseManualRouteString(text, { flightRule: editor.routeForm.flightRule, userWaypoints })
  let nextWaypointNumber = currentEnroute?.nextWaypointNumber ?? 1
  const terms = parsed.terms.map((term) => {
    if (term.kind !== 'coordinate') return term
    const waypoint = { id: `user-wp-${nextWaypointNumber}`, name: `WP${nextWaypointNumber}`, lon: term.coordinate.lon, lat: term.coordinate.lat }
    nextWaypointNumber += 1
    userWaypoints.push(waypoint)
    return { kind: 'user-waypoint', id: waypoint.id, name: waypoint.name }
  })
  const enroute = { terms, legIntents: parsed.legIntents, userWaypoints, nextWaypointNumber }
  const result = editor.routeForm.flightRule === 'VFR'
    ? (enroute.terms.length === 0
        ? await buildVfrRoute(editor.routeForm)
        : await buildManualVfrRoute({ departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, enroute, userWaypoints }))
    : await buildManualIfrRoute({ departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, routeType: editor.routeForm.routeType || effectiveRouteType, enroute, userWaypoints })
  const appliedEnroute = result.resolvedEnroute ? { ...result.resolvedEnroute, userWaypoints, nextWaypointNumber } : enroute
  return {
    editor: createRouteEditor({ ...editor, enroute: appliedEnroute, rawText: editor.routeForm.flightRule === 'VFR'
      ? formatVfrDraftText({ departureAirport: editor.routeForm.departureAirport, arrivalAirport: editor.routeForm.arrivalAirport, enroute: appliedEnroute })
      : formatManualRouteString(appliedEnroute), preview: result, pendingIntent }),
    result,
  }
}
