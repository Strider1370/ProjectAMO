import airports from './airports.js'

const airportIds = new Set(airports.map(({ icao }) => icao))
export const ROUTE_SETTING_KEYS = ['departureAirport', 'arrivalAirport', 'flightRule', 'cruiseAltitudeFt', 'etd', 'eta']
const fail = (code) => { throw Object.assign(new Error(code), { code }) }
const canonicalTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

// Shared application boundary. No geometry, ETA estimation, procedures or
// arbitrary model-supplied fields can enter the existing route editor here.
export function validateRouteSettings(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some((key) => !ROUTE_SETTING_KEYS.includes(key))) fail('INVALID_ROUTE_SETTINGS')
  if (!airportIds.has(value.departureAirport) || !airportIds.has(value.arrivalAirport)) fail('AIRPORT_NOT_FOUND')
  if (value.departureAirport === value.arrivalAirport) fail('SAME_ROUTE_ENDPOINTS_UNSUPPORTED')
  if (value.flightRule !== undefined && value.flightRule !== 'IFR') fail('FLIGHT_RULE_UNSUPPORTED')
  if (value.cruiseAltitudeFt !== undefined && (!Number.isInteger(value.cruiseAltitudeFt) || value.cruiseAltitudeFt < 500 || value.cruiseAltitudeFt > 60000)) fail('INVALID_ROUTE_ALTITUDE')
  for (const key of ['etd', 'eta']) if (value[key] !== undefined && !canonicalTime(value[key])) fail('INVALID_ROUTE_TIME')
  if (value.eta !== undefined && value.etd === undefined) fail('DEPARTURE_TIME_REQUIRED')
  if (value.etd && value.eta && !(Date.parse(value.eta) > Date.parse(value.etd) && Date.parse(value.eta) - Date.parse(value.etd) <= 48 * 3600_000)) fail('INVALID_ROUTE_TIME_WINDOW')
  return { ...value }
}
