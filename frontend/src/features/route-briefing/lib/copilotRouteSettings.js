import { validateRouteSettings } from '../../../../../shared/route-settings.js'

function screenUtc(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('INVALID_ROUTE_TIME')
  const normalized = new Date(value).toISOString()
  // Existing editor timestamps omit .000; do not reinterpret an unzoned string
  // or normalize an impossible calendar date into a different day.
  if (value !== normalized && value !== normalized.replace('.000Z', 'Z')) throw new Error('INVALID_ROUTE_TIME')
  return normalized
}

export function previewCopilotRouteSettings(state, action) {
  if (state.organization) throw new Error('ORGANIZATION_CONTEXT_UNSUPPORTED')
  if (action?.type !== 'route_settings' || action.schemaVersion !== 1) throw new Error('INVALID_ROUTE_SETTINGS')
  const fields = validateRouteSettings(action.fields)
  const flightRule = fields.flightRule ?? state.routeForm.flightRule
  if (flightRule !== 'IFR') throw new Error('FLIGHT_RULE_UNSUPPORTED')
  const next = { ...fields, flightRule, cruiseAltitudeFt: fields.cruiseAltitudeFt ?? state.cruiseAltitudeFt,
    etd: fields.etd ?? screenUtc(state.etd) }
  // Screen state is not automatically trusted just because the model omitted it.
  validateRouteSettings(next)
  return { revision: JSON.stringify(state), fields, next,
    retained: ['flightRule', 'cruiseAltitudeFt', 'etd'].filter((key) => fields[key] === undefined),
    requiresConfirmation: Boolean(state.routeTokenTexts.length || state.routeForm.departureAirport || state.routeForm.arrivalAirport
      || state.routeEditor.rawText || state.routeEditor.procedures.sid || state.routeEditor.procedures.star || state.routeEditor.procedures.iapKey
      || state.designs.length || state.hasConditionEdits || state.alternateAirport),
  }
}
