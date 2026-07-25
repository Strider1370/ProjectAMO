import { formatWeatherPointCoordinate } from './lib/weatherPointInspector.js'

export default function WeatherPointInspector({ selection, onClose }) {
  if (!selection) return null
  const style = {
    '--weather-point-x': `${selection.point.x}px`,
    '--weather-point-y': `${selection.point.y}px`,
    '--weather-point-accent': selection.rows[0]?.color || 'var(--stroke-1)',
  }

  return (
    <section className={`weather-point-inspector weather-point-inspector--${selection.placement || 'right'}`} aria-label="선택 지점의 KIM 기상 상세" style={style}>
      <header className="weather-point-inspector__header">
        <div>
          <strong>KIM 지점 자료</strong>
          <span>{formatWeatherPointCoordinate(selection.lat, 'N', 'S')} · {formatWeatherPointCoordinate(selection.lng, 'E', 'W')}</span>
        </div>
        <button type="button" aria-label="KIM 지점 자료 닫기" onClick={onClose}>×</button>
      </header>
      <div className="weather-point-inspector__rows">
        {selection.rows.map((row) => (
          <article key={row.key} className="weather-point-inspector__row" style={{ '--weather-point-row-color': row.color }}>
            <div className="weather-point-inspector__row-title">
              <strong>{row.label}</strong>
              <span className="weather-point-inspector__value">{row.value}</span>
            </div>
            <div className="weather-point-inspector__valid">
              <span>유효시간</span>
              <strong>{row.validLabel}</strong>
            </div>
            <div className="weather-point-inspector__meta">
              <span>발표 {row.issueLabel}</span>
              <span>고도 {row.altitude}</span>
              {row.geopotentialHeight && <span>{row.geopotentialHeight}</span>}
              {row.detail && row.key !== 'wind' && row.key !== 'temp' && <span>{row.detail}</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
