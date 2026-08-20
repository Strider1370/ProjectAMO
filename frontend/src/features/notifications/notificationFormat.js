// #13 알림센터 표시 포맷 — 피드 행(type/target/role/toVal)을 한 줄 문구로.
// 백엔드 sender.formatAlert 미러. 문구를 고칠 때 두 곳을 함께 고친다 —
// 다르면 같은 알림이 폰과 앱에서 다르게 읽힌다.

const ROLE_KO = { dep: '출발', dest: '도착', altn: '교체' }
const at = (n) => (n.role && ROLE_KO[n.role] ? `${ROLE_KO[n.role]} ${n.target}` : (n.target ?? ''))

// 어느 미니마가 걸렸는지는 toVal에 담겨 온다(백엔드 insertAlert).
const MINIMA_KO = {
  airport: '접근최저치 미만',
  personal: '내 미니마 미만',
  default: 'IFR 이하',
}

export function formatNotification(n) {
  switch (n.type) {
    case 'MINIMA': return `${at(n)} ${MINIMA_KO[n.toVal] ?? '최저치 미만'} 예보`
    case 'TS': return `${at(n)} 뇌전 예보`
    case 'FG': return `${at(n)} 안개 예보`
    case 'SN': return `${at(n)} 눈 예보`
    case 'SIGMET': return `경로상 신규 SIGMET (${n.target})`
    default: return `${at(n)} ${n.type}`
  }
}

// 다섯 종류가 전부 "울릴 만한 것"이라 등급이 없다. 색과 글자를 하나로 둔다.
export const severityLevel = () => 'amber'
export const severityTag = () => '알림'

// 브리핑 상단 변경점 띠에 올릴 줄들. 피드는 최신순이므로 앞에서부터 훑으면 최근 것이 남는다.
//
// **같은 문장은 한 번만 낸다.** 같은 조건이 풀렸다 다시 걸리면 행이 또 쌓이고(개발용 강제
// 발화는 중복 방지도 안 거친다), 그것을 그대로 이으면 "뇌전 예보 · 뇌전 예보"가 된다.
// 변경점은 무엇이 바뀌었는지의 목록이지 발생 기록이 아니다.
//
// 길어지면 한 줄이 아니라 문단이 된다 — 앞의 몇 개만 두고 나머지는 개수로 접는다.
// 전부 보려면 알림센터가 있다.
const CHANGE_LINE_LIMIT = 4

export function briefingChangeLines(notifications, flightId) {
  if (flightId == null) return { lines: [], more: 0, latestAt: null }
  const mine = (notifications ?? []).filter((n) => n.routeId === flightId)
  const seen = new Set()
  const lines = []
  for (const n of mine) {
    const text = formatNotification(n)
    if (seen.has(text)) continue
    seen.add(text)
    lines.push(text)
  }
  return {
    lines: lines.slice(0, CHANGE_LINE_LIMIT),
    more: Math.max(0, lines.length - CHANGE_LINE_LIMIT),
    latestAt: mine[0]?.detectedAt ?? null,
  }
}

export function relTime(iso) {
  const diff = Date.now() - Date.parse(iso)
  if (!Number.isFinite(diff)) return ''
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}
