// 관리자 콘솔 메뉴. 1단계 여섯 개다.
//
// 로그 화면은 목업에 그려져 있지만 3단계라 여기 없다 — 목업은 최종 모습을 담은 문서이고,
// 이 배열이 지금 실제로 만드는 것이다.
export const MENUS = [
  { id: 'overview', label: '개요', group: 'ops' },
  { id: 'data', label: '자료 수집', group: 'ops' },
  { id: 'server', label: '서버 자원', group: 'ops' },
  { id: 'api', label: 'API 사용량', group: 'ops' },
  { id: 'users', label: '이용자', group: 'usage' },
  { id: 'accounts', label: '계정 관리', group: 'usage' },
  { id: 'alerts', label: '알림 감시', group: 'usage' },
]

export const MENU_GROUPS = [
  { id: 'ops', label: '운영' },
  { id: 'usage', label: '이용' },
]

export function menusIn(group) {
  return MENUS.filter((menu) => menu.group === group)
}

// 상단 신호등 넷. 색만으로 알리지 않으므로 이름과 건수를 함께 낸다.
// 재시작 임계는 10회 — 정상 배포로도 몇 번은 오르지만, 그보다 잦으면 뭔가 죽고 있다는 뜻이다.
export const RESTART_WARN_THRESHOLD = 10

export function topSignals({ health, server } = {}) {
  const counts = health?.counts
  const broken = (counts?.stopped ?? 0) + (counts?.never ?? 0)
  const late = counts?.late ?? 0
  const failing = (health?.rows ?? []).filter((row) => row.failing).length
  const restarts = server?.process?.bootCount ?? 0
  return [
    { id: 'data', label: '자료', tone: broken > 0 ? 'bad' : late > 0 ? 'warn' : 'ok', count: broken || late },
    { id: 'collect', label: '수집', tone: failing > 0 ? 'warn' : 'ok', count: failing },
    { id: 'api', label: 'API', tone: 'ok', count: 0 },
    { id: 'server', label: '서버', tone: restarts > RESTART_WARN_THRESHOLD ? 'warn' : 'ok', count: restarts > RESTART_WARN_THRESHOLD ? 1 : 0 },
  ]
}

// 메뉴에 붙는 건수 배지. 0이면 배지를 달지 않는다.
export function menuBadges({ health, pending } = {}) {
  const counts = health?.counts
  const broken = (counts?.stopped ?? 0) + (counts?.never ?? 0)
  return {
    overview: broken + (counts?.late ?? 0),
    data: broken,
    accounts: pending?.length ?? 0,
  }
}

export default { MENUS, MENU_GROUPS, menusIn, topSignals, menuBadges, RESTART_WARN_THRESHOLD }
