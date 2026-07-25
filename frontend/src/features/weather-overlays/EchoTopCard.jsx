function formatObservedAt(observedAt, tz) {
  if (!observedAt) return null
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(observedAt))
}

function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? positive : negative}`
}

export default function EchoTopCard({ selection, tz = 'KST' }) {
  const value = selection?.echoTop
  if (!value) return null
  const style = selection.point && {
    '--convective-card-x': `${selection.point.x}px`,
    '--convective-card-y': `${selection.point.y}px`,
  }
  return (
    <section className="convective-overlay-card" aria-label="선택 지점의 재산출 에코탑 상세" style={style}>
      <strong>{formatCoordinate(selection.lat, 'N', 'S')}, {formatCoordinate(selection.lng, 'E', 'W')}</strong>
      {value.observedAt && <span className="convective-overlay-card__time">관측 {formatObservedAt(value.observedAt, tz)} {tz}</span>}
      <div>에코탑: FL{value.fl} · {value.ft.toLocaleString('en-US')} ft MSL</div>
      <div className="convective-legend__note">
        재산출 · 18 dBZ · MSL · {value.quality === 'interpolated' ? '보간값' : '보수적 하한(빔 중심)'}
        {selection.partial ? ' · 일부 사이트 결측' : ''}
      </div>
    </section>
  )
}
