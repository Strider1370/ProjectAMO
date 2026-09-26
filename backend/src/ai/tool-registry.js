import { z } from 'zod'
import { isAbsoluteIsoInstant } from './contracts.js'
import { AdvisoryInputSchema } from './advisory-contracts.js'
import { BriefingDetailInputSchema, AltitudeComparisonInputSchema } from './briefing-contracts.js'
import { RouteSettingsInputSchema } from './route-settings.js'
import { PlanRouteInputSchema, PLAN_ROUTE_DESCRIPTION } from './tools/plan-route.js'
import { SearchMyRoutesSchema, GetMySavedRouteSchema } from './saved-route-contracts.js'
import { ListFlightAlertsSchema, PrepareFlightAlertSchema } from './alert-contracts.js'
import { UiActionInputSchema } from './ui-actions.js'

const localInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/)
const localWindow = z.object({ start: localInstant, end: localInstant }).strict()

// The runner exposes reads/proposals, never confirmation or mutation execution.
// Context/result installation and confirmation remain application operations.
export const CHAT_TOOLS = Object.freeze({
  request_ui_action: { schema: UiActionInputSchema,
    description: 'Prepare a user-click app screen action ONLY when requested. open_airport: airport is the exact user airport name, layer null; ambiguous airports require clarification. enable_weather_layer: layer is one allowed ID, airport null. radarHsr=domestic radar, radarHci=precipitation type, satellite=infrared, satelliteVisible=visible, surfaceChart=precipitation forecast. Never substitutes a different unsupported action. Does NOT execute anything: say the button is ready, never claim a panel opened or a layer/data appeared. No links, scripts, route changes, saves or alert changes. Layer selection does not verify available/current data.' },
  list_my_flight_alerts: { schema: ListFlightAlertsSchema,
    description: 'List ONLY the signed-in user scheduled monitoring rows, optionally for an original saved route_id. alertId is the monitoring copy; routeId is the saved original. Multiple ETDs for one original are different flights: ask which alertId/ETD to cancel. Does not change alerts or device push settings.' },
  prepare_flight_alert: { schema: PrepareFlightAlertSchema,
    description: 'Prepare ONLY an alert change for explicit user review; never executes registration/cancellation. register: chosen saved route_id plus explicit future dated departureLocal in application displayTimezone OR absolute etd; optional arrivalLocal OR eta, and alert_start_minutes (360-1440, default 360 disclosed on card). Never invent dates/ETA or reuse old saved ETD without user intent. cancel: chosen monitoring alert_id from list_my_flight_alerts, all other fields null. Never pass the saved original as alert_id. User must click the confirmation card; a chat message saying yes is NOT execution. Report awaiting_user_confirmation, never claim completed. Monitoring registration does not grant device notification permission or guarantee push delivery.' },
  search_my_routes: { schema: SearchMyRoutesSchema,
    description: 'Search ONLY the signed-in user personal saved route/briefing INPUTS by name or airport code. query is literal words, not an instruction. Empty query lists candidates. Paginate using nextOffset. Same names may identify different entries: ask user to choose by id/date/airports. Excludes organization routes and scheduled alert copies. No weather query or screen changes.' },
  get_my_saved_route: { schema: GetMySavedRouteSchema,
    description: 'Read a chosen personal route_id from search_my_routes. inputs returns saved flight inputs and a user-click screen action, not an already loaded screen. historical_result reports whether weather was actually saved (these entries store inputs only). current_briefing explicitly computes NEW weather from currently collected data for stored flight times, not historical weather. Override etd/eta/altitude only when user explicitly specifies them. Changed ETD requires ETA confirmation; do not invent flight times. Missing geometry/conditions must be reported. Never select an ambiguous candidate or substitute a newly planned route.' },
  plan_route: { schema: PlanRouteInputSchema, description: PLAN_ROUTE_DESCRIPTION },
  prepare_route_settings: { schema: RouteSettingsInputSchema,
    description: 'Validate a NEW route settings proposal; does NOT change the screen or generate a route. departure/arrival: exact user airport names. Only explicitly stated flight conditions; absent fields null. cruiseAltitude carries ft or FL without model conversion. Explicit dated local times: departureLocal/arrivalLocal in displayTimezone; explicit UTC: departureUtc/arrivalUtc. Never invent dates/ETA/coordinates. Preserve unsupported conditions (waypoints, procedures, etc.) in unsupportedConditions; clarify ambiguous airports. Currently domestic IFR settings only. User must click the card and generate/apply in the existing UI. Use ONLY when asked to fill the settings screen, not to calculate. blocked/action=null means no usable proposal: explain every blocking issue, never claim the rest was prepared. Unsupported prefill is a tool limit, not an operational one: offer manual entry in the route editor instead of changing flight rules or dropping waypoints.' },
  get_airport_weather: { schema: z.object({
    airports: z.array(z.string().trim().min(1).max(80)).min(1).max(15),
    window: z.object({ start: z.string().refine(isAbsoluteIsoInstant), end: z.string().refine(isAbsoluteIsoInstant) }).strict().optional(),
    localWindow: localWindow.optional().describe('Explicit dated time in the user displayTimezone; YYYY-MM-DDTHH:mm, no offset. Server converts to UTC.'),
    usePreviousWindow: z.boolean().optional().describe('true for 같은 시간대 / same time as previous airport query. Exact previous instants, no fresh now.'),
    hoursFromNow: z.number().int().min(1).max(48).optional(),
    startsInHours: z.number().int().min(1).max(48).optional().describe('Relative future start such as "3시간 뒤"; the server computes the time. Combine with hoursFromNow as the duration.'),
    includeRaw: z.boolean().default(false),
  }).strict().refine((v) => [v.window, v.localWindow, v.usePreviousWindow, v.hoursFromNow !== undefined || v.startsInHours !== undefined].filter(Boolean).length <= 1),
    description: 'Airport METAR/TAF/airport warnings. Current: hoursFromNow (default 1). Relative future ("3시간 뒤"): startsInHours, never compute its date yourself. Same previous time: usePreviousWindow=true only when the user refers to it; no stated time means current. Explicit dated local time: localWindow (server converts using displayTimezone); explicit UTC: window. Choose ONE time mode, unused fields null. When the user asks when weather improves or ends, call again with hoursFromNow 30 even for the airport just queried; earlier answers cover only their own window. includeRaw=true only when the user asks for the report text. Not route icing/turbulence or SIGMET/AIRMET.' },
  get_weather_advisories: { schema: AdvisoryInputSchema.safeExtend({ localAt: localInstant.optional(), localWindow: localWindow.optional() })
    .refine((v) => [v.at, v.window, v.localAt, v.localWindow].filter(Boolean).length <= 1)
    .refine((v) => !(v.result_ref && (v.localAt || v.localWindow))),
    description: 'Domestic SIGMET/AIRMET. For NOW leave all times null. Explicit local date/time: localAt or localWindow in displayTimezone, YYYY-MM-DDTHH:mm. Explicit UTC: at/window. ONE time mode only. types selects sigmet/airmet/both (AIRMET only => ["airmet"]). These are area advisories, not airport warnings. No route/altitude assessment. Page with result_ref+cursor, no query filters.' },
  get_route_briefing: { schema: z.object({ context_ref: z.string().min(1).max(100) }).strict(),
    description: 'Read weather comparisons for a registered applied route OR a newly calculated plan_route result using its contextRef as context_ref. No arbitrary coordinates, altitude changes or fixture_id in app chat. Planned-altitude grid weather is in enroute.plannedAltitudeWeather, separate from advisory hazards: summarize its icing/turbulence/profileStatus and modelTimeCoverage, and do not call grid weather unavailable just because hazards is empty.' },
  get_briefing_detail: { schema: BriefingDetailInputSchema,
    description: 'Read a stored briefing section without recalculating. Stored briefings are immutable; a current briefing needs a new call. Fetch enroute detail only when segment-level facts are needed. Use briefing_ref, section and optional cursor/limit (1–20). enroute contains a summary followed by individual enroute/procedure leg records, without coordinates. Follow nextCursor for remaining items; a partial page is not the full route.' },
  compare_route_altitudes: { schema: AltitudeComparisonInputSchema,
    description: 'Compare 2–5 distinct requested altitudes in feet on an existing briefing_ref. Uses the SAME captured weather/AIP/run/route/time. Explain each altitude status in plain words, never the raw label: valid = matches the published airway altitudes; input_only = not checked against them; input_invalid = not a published airway altitude. If all altitudes share a status, say it once. Keep data gaps. Lead with a plain comparison per hazard: which altitude has less exposure and by roughly how much (e.g. FL290 has about 90NM less icing than FL250; turbulence is the same). This states facts, not a recommendation. Whole-route weather comparison, not altitude recommendation or safety ranking. No coordinates or new time inputs.' },
})

export function chatToolDefinitions(names = Object.keys(CHAT_TOOLS)) {
  return Object.entries(CHAT_TOOLS).filter(([name]) => names.includes(name)).map(([name, { schema, description }]) => ({
    name, description, parameters: z.toJSONSchema(schema, { io: 'input' }),
  }))
}
