function formatObservedAt(observedAt, tz) {
  if (!observedAt) return null
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(observedAt))
}

export default function ConvectiveOverlayCard({ selection, tz }) {
  if (!selection?.ci && !selection?.ctps) return null
  const observedAt = selection.ci?.observedAt || selection.ctps?.observedAt
  return (
    <section className="convective-overlay-card" aria-label="선택 지점의 대류 가능성과 구름 꼭대기 상세">
      <strong>선택 지점</strong>
      {observedAt && <span className="convective-overlay-card__time">관측 {formatObservedAt(observedAt, tz)} {tz}</span>}
      {selection.ci && <div>대류 가능성: {selection.ci.label || (selection.ci.signal === 4 ? '강한 상승기류 신호' : '중간 상승기류 신호')}</div>}
      {selection.ctps && <div>구름 꼭대기: FL{selection.ctps.fl} · {selection.ctps.temperatureC}°C · {selection.ctps.quality || 'normal'}</div>}
    </section>
  )
}
