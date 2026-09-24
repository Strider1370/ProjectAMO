import { createNavdataProvider } from '../../../../../shared/route-planning/navdataProvider.js'
import { createRoutePlanner } from '../../../../../shared/route-planning/routePlanner.js'

export const navdataProvider = createNavdataProvider({
  readJson: async (path) => {
    const response = await fetch('/data/navdata/' + path)
    if (!response.ok) throw new Error('Failed to load ' + path)
    return response.json()
  },
})
export const {
  loadNavdata, loadNavpoints, loadRouteDirectionMetadata, loadOverseasAirports, loadOverseasLinks, loadIapData,
  buildVfrRoute, buildBriefingRoute, buildManualIfrRoute, buildManualVfrRoute, resolveNearestNavpoint, resolveMapInteraction, parseRouteString, formatRouteString, canBuildBriefingRoutePath,
} = createRoutePlanner(navdataProvider)
