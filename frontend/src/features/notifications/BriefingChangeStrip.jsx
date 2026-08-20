import useNotifications from './useNotifications.js'
import { formatNotification, relTime } from './notificationFormat.js'

// 알림을 탭해 들어온 사람에게 "무엇이 바뀌어서 불렀는지"를 브리핑 맨 위 한 줄로 보여준다.
// 어느 비행인지는 딥링크(?flight=<routeId>)가 말해 준다 — 그 값이 곧 알림 행의 routeId다.
// 알림 없이 브리핑을 보러 온 사람에게는 아무것도 그리지 않는다(무소식이 희소식).
function deeplinkFlightId() {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('flight')
  const id = Number(raw)
  return Number.isFinite(id) && raw ? id : null
}

export default function BriefingChangeStrip() {
  const flightId = deeplinkFlightId()
  const { notifications } = useNotifications()
  if (flightId == null) return null

  // 피드는 최신순이다(me/alerts.js ORDER BY detected_at DESC).
  const mine = notifications.filter((n) => n.routeId === flightId)
  if (mine.length === 0) return null

  return (
    <div className="bv-change-strip" role="status">
      <strong>변경점</strong>
      <span>{mine.map((n) => formatNotification(n)).join(' · ')}</span>
      <span className="bv-change-strip-time">{relTime(mine[0].detectedAt)}</span>
    </div>
  )
}
