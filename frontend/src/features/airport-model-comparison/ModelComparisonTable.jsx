import { WindBarb } from '../../shared/ui/WeatherIcon.jsx'
import { forecastSummary } from './modelComparisonDetail.js'

function ConditionalCell({ text }) {
  if (!text) return null
  const short = text.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z–\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '').replace(/ +/g, ' ')
  return <><small className="mc-condition" title={text}>{short}</small><details><summary>TAF 조건 기간</summary><small>{text}</small></details></>
}

function WindCell({ cell }) {
  const rounded = Number.isFinite(cell.value) ? Math.round(cell.value / 5) * 5 : 0
  return <><strong className="mc-wind-value">{Number.isFinite(cell.value) && <WindBarb barbKey={rounded ? `barb_${rounded}` : 'calm'} rotation={Number.isFinite(cell.direction) ? cell.direction : 0} className="mc-wind-barb" />}{cell.text}</strong><small>{cell.subtext}</small><ConditionalCell text={cell.conditionText} /></>
}
function CeilingCell({ cell }) {
  return <>{Array.isArray(cell.clouds) ? <details className="mc-cell-disclosure"><summary aria-label={cell.text}><strong>{cell.text}</strong></summary><small>전/저/중/상 {cell.clouds.map(v => Number.isFinite(v) ? `${Math.round(v)}%` : v && typeof v === 'object' ? (v.amount || v.coverage || '—') : '—').join(' · ')}</small></details> : <strong>{cell.text}</strong>}<ConditionalCell text={cell.conditionText} /></>
}
function TemperatureCell({ cell }) {
  return <details className="mc-cell-disclosure"><summary aria-label={cell.text}><strong>{cell.text}</strong></summary><small>이슬점 {Number.isFinite(cell.dewPoint) ? `${cell.dewPoint.toFixed(1)}°C` : '자료 없음'} · 기압 {Number.isFinite(cell.pressure) ? `${Math.round(cell.pressure)} hPa` : '자료 없음'}</small></details>
}

export default function ModelComparisonTable({ section, rows, times, timeLabels, selectedValidAt, onSelectTime }) {
  const names = { wind: '지상 바람 시간별 비교', precipitation: '시간당 강수량 비교', ceiling: '운고와 운량 시간별 비교', temperatureRh: '기온과 상대습도 시간별 비교' }
  return (
    <div className="mc-table-scroll" tabIndex="0" aria-label={`${names[section]} 표 스크롤 영역`}>
      <table className="mc-table" aria-label={names[section]}>
        <caption>{names[section]}</caption>
        <colgroup><col style={{ width: `${128 / (128 + times.length * 72) * 100}%` }} />{times.map(time => <col key={time} />)}</colgroup>
        <thead><tr><th scope="col" className="mc-source-col">출처</th>{times.map((time, i) => <th scope="col" key={time} className={selectedValidAt === time ? 'is-selected' : ''}><button type="button" onClick={() => onSelectTime(time)} aria-pressed={selectedValidAt === time}>{timeLabels[i]}</button></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><th scope="row" aria-label={row.label} aria-describedby={section === 'ceiling' && row.cells.some(cell => cell?.method) ? `mc-method-${row.id}` : undefined}><span className="mc-series-key" style={{ '--series-color': row.color }} />{row.label}{section === 'ceiling' && row.cells.find(cell => cell?.method)?.method && <small id={`mc-method-${row.id}`} className="mc-method">{row.cells.find(cell => cell?.method).method}</small>}</th>{row.cells.map((cell, i) => <td key={times[i]} className={selectedValidAt === times[i] ? 'is-selected' : ''} title={cell?.detail ? [row.label, cell.valid_at, forecastSummary(cell)].join(' · ') : undefined}>{cell ? <>{section === 'wind' ? <WindCell cell={cell} /> : section === 'ceiling' ? <CeilingCell cell={cell} /> : section === 'temperatureRh' ? <TemperatureCell cell={cell} /> : <><strong>{cell.text}</strong><ConditionalCell text={cell.conditionText} /></>}</> : <span className="mc-missing">자료 없음</span>}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
