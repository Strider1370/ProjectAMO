import { augmentRouteWithProcedures } from './routeGeometry.js'
import { routeLineDistanceNm } from '../route-model.js'

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

// 거리·소요시간·ETA가 모두 쓰는 총 거리. 경로 결과의 totalDistanceNm은 SID·STAR 대신
// 공항↔첫/끝 지점 직선이라 짧다 — 지도에 그리고 단면·NAVLOG가 쓰는 경로선 길이를 쓴다.
export function plannedRouteDistanceNm({ routeModel = null, routeResult, ...geometryInputs } = {}) {
  const fromModel = Number(routeModel?.routeAxis?.totalDistanceNm)
  if (fromModel > 0) return fromModel
  const drawable = routeResult?.flightRule === 'VFR' || routeResult?.previewGeojson
  const fromLine = drawable ? routeLineDistanceNm(getCurrentRouteLineString({ routeResult, ...geometryInputs })) : null
  if (fromLine > 0) return fromLine
  const fallback = Number(routeResult?.totalDistanceNm ?? routeResult?.distanceNm)
  return fallback > 0 ? fallback : null
}
