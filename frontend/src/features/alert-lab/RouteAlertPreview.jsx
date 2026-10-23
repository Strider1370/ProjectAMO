import { ArrowLeft } from 'lucide-react'

const periodTime = value => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(value)

export function SigmetSummary({ event }) {
  return <span className="ad-route-issues"><span><strong>경로상 SIGMET</strong><span>{event.sigmetMessage}</span></span>
    <small>유효 {periodTime(event.validFrom)}–{periodTime(event.validTo)} KST</small></span>
}

export default function RouteAlertPreview({ event, onBack }) {
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(event.time)
  return <section className="ad-route-panel" aria-label="비행경로 패널">
    <button className="ad-back" onClick={onBack}><ArrowLeft size={20} />돌아가기</button>
    <span className="ad-kicker">비행경로 알림 · {time} KST</span>
    <h1>{event.name}</h1>
    <p className="ad-management-note">RKSS → RKPC · 예시 경로</p>
    <h2>경로와 겹치는 SIGMET</h2>
    <SigmetSummary event={event} />
    <p className="ad-management-note">SIGMET 영역과 경로의 지리적 겹침을 알리는 예시입니다. 비행 중 조우 여부를 확정하지 않습니다.</p>
  </section>
}
