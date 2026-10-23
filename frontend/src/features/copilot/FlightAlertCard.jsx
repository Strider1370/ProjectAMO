import { formatCopilotTime } from './floatingWindow.js'

// 저장된 대화에는 이전 예정 비행 알림 카드가 남을 수 있다. 실행 버튼을 되살리지 않는다.
export default function FlightAlertCard({ result, timezone }) {
  const flights = result.data?.flights
  const proposal = result.data?.proposal
  return <section className="copilot-fact" aria-label="이전 예정 비행 알림 기록">
    <strong>이전 예정 비행 알림</strong>
    {Array.isArray(flights) && flights.map((flight) => <p key={flight.alertId}>
      {flight.name} · 출발 {formatCopilotTime(flight.etd, timezone, { year: true })}
    </p>)}
    {proposal && <p>{proposal.name} · 출발 {formatCopilotTime(proposal.etd, timezone, { year: true })}</p>}
    <p>이 기능의 등록·해제는 종료되었습니다. 현재 감시와 새 알림은 알림 설정에서 관리하세요.</p>
    <a href="/alerts/settings">알림 설정 열기</a>
  </section>
}
