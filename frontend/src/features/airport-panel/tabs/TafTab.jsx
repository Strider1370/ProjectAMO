import { useState } from 'react'
import { MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import { fmtTime } from '../lib/formatters.js'
import { buildTafViewModel, formatTafHour, groupTafSlots, TAF_CATEGORY_COLOR } from '../lib/tafViewModel.js'

const TAF_VIEWS = [
  { id: 'timeline', label: '타임라인' },
  { id: 'table', label: '테이블' },
  { id: 'grid', label: '그리드' },
]

export default function EnhancedTafTab({ taf, icao }) {
  const [view, setView] = useState('timeline')
  if (!taf) return <div className="ap-empty">TAF 데이터 없음</div>

  const { rawTimeline, slots, hdr } = buildTafViewModel(taf, icao)

  return (
    <div className="ap-taf">
      <div className="ap-taf-header">
        <div>
          <span className="ap-taf-badge">{hdr?.report_status === 'AMENDMENT' ? 'TAF AMD' : 'TAF'}</span>
          <span className="ap-taf-valid">{fmtTime(hdr?.valid_start)} - {fmtTime(hdr?.valid_end)}</span>
        </div>
        <div className="ap-taf-switch" role="tablist" aria-label="TAF view">
          {TAF_VIEWS.map((item) => (
            <button key={item.id} type="button" className={`ap-taf-switch-btn${view === item.id ? ' is-active' : ''}`} onClick={() => setView(item.id)} aria-pressed={view === item.id}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rawTimeline.length === 0 && <div className="ap-empty">TAF 시간대 데이터 없음</div>}
      {rawTimeline.length > 0 && slots.length === 0 && <div className="ap-empty">TAF 유효 기간 만료</div>}

      {slots.length > 0 && view === 'timeline' && (
        <div className="ap-taf-timeline">
          <div className="ap-taf-scale" style={{ '--taf-hour-count': slots.length }}>
            {slots.map((item, index) => <span key={index}>{index % 3 === 0 || index === 0 ? formatTafHour(item.time) : ''}</span>)}
          </div>
          {[
            ['비행조건', groupTafSlots(slots, (item) => item.flight.category), (item) => item.flight.category, (item) => ({ background: TAF_CATEGORY_COLOR[item.flight.category] || '#15803d', color: '#fff' })],
            ['날씨', groupTafSlots(slots, (item) => item.weatherLabel), (item) => item.weatherLabel, () => ({ background: '#f8fafc', color: '#0f172a' })],
            ['바람', groupTafSlots(slots, (item) => item.windText), (item) => item.windText, (item) => ({ background: item.highWind ? '#fff1f2' : '#f8fafc', color: item.highWind ? '#be123c' : '#0f172a' })],
            ['시정', groupTafSlots(slots, (item) => item.visibilityText), (item) => item.visibilityText, (item) => ({ background: item.visibilityCategory.bg, color: item.visibilityCategory.valueColor })],
            ['운고', groupTafSlots(slots, (item) => item.ceilingText), (item) => item.ceilingText, (item) => ({ background: item.ceilingCategory.bg, color: item.ceilingCategory.valueColor })],
          ].map(([label, groups, textFn, styleFn]) => (
            <div className="ap-taf-line" key={label}>
              <div className="ap-taf-line-label">{label}</div>
              <div className="ap-taf-line-track">
                {groups.map((group, index) => (
                  <div key={index} className="ap-taf-seg" style={{ width: group.width, ...styleFn(group.first) }} title={textFn(group.first)}>
                    {label === '날씨' && <WeatherIcon visual={group.first.visual} className="ap-taf-mini-icon" />}
                    {label === '바람' && <MoveUp className="ap-taf-mini-arrow" style={{ transform: `rotate(${group.first.windRotation}deg)` }} />}
                    <span>{textFn(group.first)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length > 0 && view === 'table' && (
        <table className="ap-taf-table">
          <thead><tr><th>시간</th><th>비행조건</th><th>날씨</th><th>바람</th><th>시정</th><th>운고</th></tr></thead>
          <tbody>
            {slots.map((item, index) => (
              <tr key={index}>
                <td>{formatTafHour(item.time)}</td>
                <td><span className="ap-taf-cat" style={{ background: TAF_CATEGORY_COLOR[item.flight.category] }}>{item.flight.category}</span></td>
                <td className="ap-taf-weather-cell"><WeatherIcon visual={item.visual} className="ap-taf-mini-icon" />{item.weatherLabel}</td>
                <td className={item.highWind ? 'is-alert' : ''}>{item.windText}</td>
                <td style={{ color: item.visibilityCategory.valueColor }}>{item.visibilityText}</td>
                <td style={{ color: item.ceilingCategory.valueColor }}>{item.ceilingText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {slots.length > 0 && view === 'grid' && (
        <div className="ap-taf-grid">
          {slots.map((item, index) => (
            <article key={index} className="ap-taf-card">
              <div className="ap-taf-card-head"><span>{formatTafHour(item.time)}</span><span className="ap-taf-cat" style={{ background: TAF_CATEGORY_COLOR[item.flight.category] }}>{item.flight.category}</span></div>
              <div className="ap-taf-card-weather"><WeatherIcon visual={item.visual} className="ap-taf-card-icon" />{item.weatherLabel}</div>
              <div className="ap-taf-card-row"><span>바람</span><strong className={item.highWind ? 'is-alert' : ''}>{item.windText}</strong></div>
              <div className="ap-taf-card-row"><span>시정</span><strong>{item.visibilityText}</strong></div>
              <div className="ap-taf-card-row"><span>운고</span><strong>{item.ceilingText}</strong></div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}


