import * as planner from './routePlanner.js'
import { buildEditorPreview as buildPreview } from '../../../../../shared/route-planning/editorPreview.js'
import { planRoute, prepareRouteDraft as prepareDraft } from '../../../../../shared/route-planning/planRoute.js'
import { KNOWN_AIRPORTS } from '../../../../../shared/route-planning/procedureData.js'

export { buildAppliedRouteInputs } from '../../../../../shared/route-planning/planRoute.js'
export async function prepareRouteDraft(options) {
  // A click may precede the panel's async option-state commit. Load by the
  // captured airport identities instead of treating a not-yet-loaded [] as a
  // completed "no procedure" result. The hook still owns cancellation.
  const { departureAirport, arrivalAirport } = options.routeForm
  const [sidOptions, starOptions, iapData] = await Promise.all([
    KNOWN_AIRPORTS.includes(departureAirport) ? planner.navdataProvider.getProcedures(departureAirport, 'SID') : options.sidOptions,
    KNOWN_AIRPORTS.includes(arrivalAirport) ? planner.navdataProvider.getProcedures(arrivalAirport, 'STAR') : options.starOptions,
    KNOWN_AIRPORTS.includes(arrivalAirport) ? planner.loadIapData(arrivalAirport) : options.iapData,
  ])
  return prepareDraft({ ...options, sidOptions, starOptions, iapData }, planner)
}
export const planBrowserRoute = (input) => planRoute(input, planner.navdataProvider)
export const buildEditorPreview = (editor, text, effectiveRouteType, pendingIntent = null) =>
  buildPreview(editor, text, { planner, effectiveRouteType, pendingIntent })
