import { augmentRouteWithProcedures } from './routeGeometry.js'

export function getCurrentRouteLineString({ routeResult, vfrWaypoints = [], selectedSid = null, selectedStar = null, selectedIap = null }) {
  if (!routeResult) return null

  if (routeResult.flightRule === 'VFR') {
    if (vfrWaypoints.length < 2) return null
    return {
      type: 'LineString',
      coordinates: vfrWaypoints.map((wp) => [wp.lon, wp.lat]),
    }
  }

  const displayGeojson = augmentRouteWithProcedures(routeResult.previewGeojson, selectedSid, selectedStar, selectedIap)
  const lineFeature = displayGeojson.features.find((feature) => feature.properties.role === 'route-preview-line')
  return lineFeature?.geometry ?? null
}
