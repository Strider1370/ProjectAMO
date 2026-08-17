// 저장용 추출 — 저장 시점의 routeResult에서 "다시 검색하지 않고 복원할 수 있는" 것만 뽑는다.
// routeGeometry = 절차 포함 최종선(브리핑·알림이 실제로 쓰는 것).
// enrouteGeometry = 절차 제외 스켈레톤. IFR만 — VFR은 최종선이 곧 스켈레톤이라 중복 저장하면 20KB 상한만 먹는다.
// routeModel/routeMarkers = 백엔드가 NAVLOG 구간표와 절차 그룹을 만드는 재료. 좌표 목록이 아니라 이름·거리라 싸다.
import { getCurrentRouteLineString } from './routeBriefingModel.js'
import { buildRouteProfileMarkersPayload } from './verticalProfileRequest.js'
import { buildCommonRouteModel } from '../../../../../shared/route-model.js'

const ROUTE_LINE_ROLE = 'route-preview-line'

// routeResult.previewGeojson은 절차 증강 **전** 상태다(증강은 표시 시점에 일어난다) → 그대로 스켈레톤.
function skeletonOf(routeResult) {
  const coordinates = routeResult?.previewGeojson?.features
    ?.find((feature) => feature.properties?.role === ROUTE_LINE_ROLE)?.geometry?.coordinates
  return Array.isArray(coordinates) && coordinates.length >= 2
    ? { type: 'LineString', coordinates }
    : null
}

// routeGeometry는 따로 저장하므로 routeModel에서 뺀다 — 안 빼면 같은 좌표선이 두 번 들어간다.
function modelWithoutGeometry(routeGeometry, routeResult) {
  try {
    const { routeGeometry: _dropped, ...rest } = buildCommonRouteModel({ routeGeometry, routeResult })
    return rest
  } catch {
    return null // 좌표가 2개 미만이면 buildCommonRouteModel이 던진다 — 저장은 계속되게 한다.
  }
}

export function buildSavedGeometry({
  routeResult = null,
  vfrWaypoints = [],
  selectedSid = null,
  selectedStar = null,
  selectedIap = null,
} = {}) {
  const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })
  if (!routeGeometry) return { routeGeometry: null, enrouteGeometry: null, routeModel: null, routeMarkers: [] }

  const routeModel = modelWithoutGeometry(routeGeometry, routeResult)
  const routeMarkers = buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints })

  if (routeResult?.flightRule === 'VFR') return { routeGeometry, enrouteGeometry: null, routeModel, routeMarkers }

  const skeleton = skeletonOf(routeResult)
  // 절차가 하나도 안 붙었으면 최종선 == 스켈레톤 → 두 번 저장할 이유가 없다.
  // ponytail: 길이 비교로 동일 판정. 좌표를 전부 비교할 만큼 값어치 있는 정확도가 아니다.
  const unchanged = skeleton && skeleton.coordinates.length === routeGeometry.coordinates.length
  return { routeGeometry, enrouteGeometry: unchanged ? null : skeleton, routeModel, routeMarkers }
}

export default { buildSavedGeometry }
