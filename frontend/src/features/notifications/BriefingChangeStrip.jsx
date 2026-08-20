import useNotifications from './useNotifications.js'
import { briefingChangeLines, relTime } from './notificationFormat.js'
import { deeplinkFlightId } from './deeplinkFlight.js'

// 알림을 탭해 들어온 사람에게 "무엇이 바뀌어서 불렀는지"를 브리핑 맨 위 한 줄로 보여준다.
// 어느 비행인지는 딥링크(?flight=<routeId>)가 말해 준다 — 그 값이 곧 알림 행의 routeId다.
// 주소는 App이 지우지만 그 값은 페이지가 뜰 때 이미 집어 둔 것이라 여기서 계속 읽을 수 있다.
// 알림 없이 브리핑을 보러 온 사람에게는 아무것도 그리지 않는다(무소식이 희소식).

export default function BriefingChangeStrip() {
  const flightId = deeplinkFlightId()
  const { notifications } = useNotifications()
  // 같은 문장 접기·개수 제한은 notificationFormat.js가 한다(테스트 대상).
  const { lines, more, latestAt } = briefingChangeLines(notifications, flightId)
  if (lines.length === 0) return null

  return (
    <div className="bv-change-strip" role="status">
      <strong>변경점</strong>
      <span>{lines.join(' · ')}{more > 0 && ` 외 ${more}건`}</span>
      {latestAt && <span className="bv-change-strip-time">{relTime(latestAt)}</span>}
    </div>
  )
}
