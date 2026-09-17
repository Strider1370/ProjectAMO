import { pickActiveFlight } from '../me/alerts.js'

// 자동 알림 평가는 시간창에 들어온 모든 등록 경로를 평가하지 않는다. 같은 사용자의
// 후보 중 가장 이른 한 경로만 선택한다. 관리자 조회와 실제 스케줄러가 이 선택을
// 따로 구현하면 "감시중"이라는 표시가 실제 평가 대상을 잘못 설명하게 된다.
export function selectAlertEvaluationTargets(routes, now = Date.now()) {
  const byUser = new Map()
  for (const route of routes || []) {
    const userId = route?.user_id ?? route?.userId
    if (userId == null) continue
    if (!byUser.has(userId)) byUser.set(userId, [])
    byUser.get(userId).push(route)
  }

  const targets = []
  for (const routesForUser of byUser.values()) {
    const picked = pickActiveFlight(routesForUser.map((route) => ({
      id: route.id,
      etd: route.etd,
      alertStartMinBeforeEtd: route.alert_start_min_before_etd ?? route.alertStartMinBeforeEtd,
    })), now)
    if (picked) {
      const route = routesForUser.find((candidate) => candidate.id === picked.id)
      if (route) targets.push(route)
    }
  }
  return targets
}

export default { selectAlertEvaluationTargets }
