function formatObservedAt(observedAt, tz) {
  if (!observedAt) return null
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(observedAt))
}

function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? positive : negative}`
}

function ctpsColor(fl) {
  if (!Number.isFinite(Number(fl))) return null
  if (fl < 100) return '#16A34A'
  if (fl < 200) return '#EAB308'
  if (fl < 300) return '#F97316'
  if (fl < 400) return '#DC2626'
  return '#7E22CE'
}

export default function ConvectiveOverlayCard({ selection, tz }) {
  if (!selection?.ci && !selection?.ctps) return null
  const observedAt = selection.ci?.observedAt || selection.ctps?.observedAt
  const borderColor = selection.ci?.color || ctpsColor(selection.ctps?.fl)
  const style = selection.point && {
    '--convective-card-x': `${selection.point.x}px`,
    '--convective-card-y': `${selection.point.y}px`,
    borderColor,
  }
  return (
    <section className="convective-overlay-card" aria-label="선택 지점의 대류 가능성과 구름 꼭대기 상세" style={style}>
      <strong>{formatCoordinate(selection.lat, 'N', 'S')}, {formatCoordinate(selection.lng, 'E', 'W')}</strong>
      {observedAt && <span className="convective-overlay-card__time">관측 {formatObservedAt(observedAt, tz)} {tz}</span>}
      {selection.ci && <div>대류 가능성: {selection.ci.label || (selection.ci.signal === 4 ? '강한 상승기류 신호' : '중간 상승기류 신호')}</div>}
      {selection.ctps && <div>운정고도: FL{selection.ctps.fl} · {selection.ctps.temperatureC}°C</div>}
    </section>
  )
}
