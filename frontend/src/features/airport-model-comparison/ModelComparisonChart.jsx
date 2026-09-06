import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import ModelComparisonTooltip from './ModelComparisonTooltip.jsx'
import { pathSegments } from './modelComparisonViewModel.js'
import { comparisonDetails } from './modelComparisonDetail.js'

const HEIGHT = 250, PAD_Y = 32
export default function ModelComparisonChart({ series, times, timeLabels, unit, selectedValidAt, secondaryUnit }) {
  const [detail, setDetail] = useState(null)
  const chartRef = useRef(null)
  const hideTimer = useRef(null)
  const tooltipId = useId()
  const keepDetail = useCallback(() => clearTimeout(hideTimer.current), [])
  const closeDetail = useCallback(() => { clearTimeout(hideTimer.current); setDetail(null) }, [])
  const leaveDetail = () => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setDetail(current => current?.mode === 'hover' ? null : current), 150) }
  useEffect(() => () => clearTimeout(hideTimer.current), [])
  const WIDTH = 128 + times.length * 72, PAD_X = 164
  const start = Date.parse(times[0]), end = Date.parse(times.at(-1))
  const all = series.flatMap(s => s.points.flatMap(p => [p.value, p.gust])).filter(Number.isFinite)
  const secondary = series.flatMap(s => s.points.map(p => p.secondary)).filter(Number.isFinite)
  const min = all.length ? Math.min(...all) : 0, max = all.length ? Math.max(...all) : 1
  const xAt = at => PAD_X + (Date.parse(at) - start) / Math.max(1, end - start) * (WIDTH - PAD_X - 36)
  const yAt = value => HEIGHT - PAD_Y - (value - min) / Math.max(1, max - min) * (HEIGHT - PAD_Y * 2)
  const ySecondary = value => HEIGHT - PAD_Y - (value - (secondary.length ? Math.min(...secondary) : 0)) / Math.max(1, secondary.length ? Math.max(...secondary) - Math.min(...secondary) : 1) * (HEIGHT - PAD_Y * 2)
  const selectedX = times.includes(selectedValidAt) ? xAt(selectedValidAt) : null
  const details = detail ? comparisonDetails(series, detail.at, unit) : []
  const showPoint = (event, point, mode) => {
    keepDetail()
    const box = event.currentTarget.getBoundingClientRect()
    setDetail({ at: point.at, x: mode === 'hover' ? event.clientX : box.x + box.width / 2, y: mode === 'hover' ? event.clientY : box.y + box.height / 2, anchor: mode === 'focus' ? event.currentTarget : null, mode })
  }
  const pointEvents = point => ({
    'aria-describedby': detail?.at === point.at ? tooltipId : undefined,
    onFocus: event => showPoint(event, point, 'focus'),
    onBlur: closeDetail,
    onPointerMove: event => { if (event.pointerType !== 'touch') { event.stopPropagation(); showPoint(event, point, 'hover') } },
  })
  const chartTime = event => {
    const box = chartRef.current.getBoundingClientRect()
    const x = (event.clientX - box.x) / box.width * WIDTH
    if (x < PAD_X - 36 || x > WIDTH || !times.length) return null
    return times.reduce((nearest, time) => Math.abs(xAt(time) - x) < Math.abs(xAt(nearest) - x) ? time : nearest, times[0])
  }
  const primaryTicks = [max, (min + max) / 2, min]
  const secondaryMin = secondary.length ? Math.min(...secondary) : 0, secondaryMax = secondary.length ? Math.max(...secondary) : 100
  const paths = useMemo(() => series.flatMap(s => {
    const points = s.points.map(p => ({ ...p, x: Number.isFinite(Date.parse(p.at)) ? xAt(p.at) : null }))
    const primary = pathSegments(points).map((segment, i) => ({ key: `${s.id}-p-${i}`, d: segment.map((p, j) => `${j ? 'L' : 'M'}${p.x},${yAt(p.value)}`).join(' '), color: s.color }))
    const gust = pathSegments(points.map(p => ({ ...p, value: p.gust }))).map((segment, i) => ({ key: `${s.id}-g-${i}`, d: segment.map((p, j) => `${j ? 'L' : 'M'}${p.x},${yAt(p.value)}`).join(' '), color: s.color, dash: '5 4' }))
    const second = pathSegments(points.map(p => ({ ...p, value: secondaryUnit ? p.secondary : null }))).map((segment, i) => ({ key: `${s.id}-s-${i}`, d: segment.map((p, j) => `${j ? 'L' : 'M'}${p.x},${ySecondary(p.value)}`).join(' '), color: s.color, dash: '2 4' }))
    return [...primary, ...gust, ...second]
  }), [series, start, end, min, max, secondaryUnit, secondary.join(',')])
  return (
    <div className="mc-chart-wrap">
      <svg ref={chartRef} onPointerMove={event => { if (event.pointerType === 'touch') return; keepDetail(); const at = chartTime(event); if (at) setDetail({ at, x: event.clientX, y: event.clientY, mode: 'hover' }); else closeDetail() }} onPointerLeave={leaveDetail} onPointerDown={event => event.preventDefault()} className="mc-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`모델별 ${unit} 추세 그래프`}>
        <line x1={PAD_X} y1={HEIGHT - PAD_Y} x2={WIDTH - 36} y2={HEIGHT - PAD_Y} className="mc-axis" />
        {primaryTicks.map((tick, i) => <text key={`y-${i}`} x={PAD_X - 7} y={PAD_Y + i * (HEIGHT - PAD_Y * 2) / 2 + 4} textAnchor="end" className="mc-axis-label">{Math.round(tick)} {unit}</text>)}
        {secondaryUnit && [secondaryMax, (secondaryMin + secondaryMax) / 2, secondaryMin].map((tick, i) => <text key={`ys-${i}`} x={WIDTH - 36 + 7} y={PAD_Y + i * (HEIGHT - PAD_Y * 2) / 2 + 4} className="mc-axis-label">{Math.round(tick)}%</text>)}
        {selectedX != null && <line x1={selectedX} y1={PAD_Y / 2} x2={selectedX} y2={HEIGHT - PAD_Y} className="mc-selected-line" />}
        {detail && <line x1={xAt(detail.at)} y1={PAD_Y / 2} x2={xAt(detail.at)} y2={HEIGHT - PAD_Y} className="mc-selected-line" strokeDasharray="3 3" pointerEvents="none" />}
        {paths.map(path => <path key={path.key} d={path.d} fill="none" stroke={path.color} strokeWidth="2" strokeDasharray={path.dash} />)}
        {series.flatMap(s => s.points.map((point, i) => Number.isFinite(point.value) && Number.isFinite(Date.parse(point.at)) ? <circle key={`${s.id}-${i}`} cx={xAt(point.at)} cy={yAt(point.value)} r="7" fill={s.color} className="mc-chart-point" tabIndex="0" role="img" aria-label={`${s.label} ${point.at}, ${point.value} ${unit}${Number.isFinite(point.gust) ? `, 돌풍 ${point.gust} ${unit}` : ''}`} {...pointEvents(point)} /> : null))}
        {series.flatMap(s => s.points.map((point, i) => Number.isFinite(point.gust) && Number.isFinite(Date.parse(point.at)) ? <circle key={`${s.id}-gust-${i}`} cx={xAt(point.at)} cy={yAt(point.gust)} r="5" fill="#fff" className="mc-chart-point mc-gust-point" style={{ '--point-stroke': s.color }} tabIndex="0" role="img" aria-label={`${s.label} 돌풍 ${point.at}, ${point.gust} ${unit}`} {...pointEvents(point)} /> : null))}
        {series.flatMap(s => s.points.map((point, i) => point.conditionText && Number.isFinite(Date.parse(point.at)) ? <path key={`${s.id}-condition-${i}`} d={`M${xAt(point.at) - 5},${PAD_Y - 8} l10,0 l-5,8 Z`} fill={s.color} tabIndex="0" role="img" aria-label={`${s.label} 조건 ${point.at}, ${point.conditionText}`} {...pointEvents(point)}><title>{point.conditionText}</title></path> : null))}
        {series.flatMap(s => s.points.map((point, i) => !Number.isFinite(point.value) && point.status && Number.isFinite(Date.parse(point.at)) ? <rect key={`${s.id}-state-${i}`} x={xAt(point.at) - 4} y={HEIGHT - PAD_Y - 8} width="8" height="8" fill="none" stroke={s.color} strokeWidth="2" className="mc-chart-point mc-state-point" style={{ '--point-stroke': s.color }} tabIndex="0" role="img" aria-label={`${s.label} ${point.at}, ${point.text || point.status}`} {...pointEvents(point)} /> : null))}
        {secondaryUnit && series.flatMap(s => s.points.map((point, i) => Number.isFinite(point.secondary) && Number.isFinite(Date.parse(point.at)) ? <circle key={`${s.id}-secondary-${i}`} cx={xAt(point.at)} cy={ySecondary(point.secondary)} r="6" fill="#fff" stroke={s.color} strokeWidth="2" className="mc-chart-point mc-secondary-point" style={{ '--point-stroke': s.color }} tabIndex="0" role="img" aria-label={`${s.label} ${secondaryUnit} ${point.at}, ${point.text || `${point.secondary}%`}`} {...pointEvents(point)} /> : null))}
        {times.map((time, i) => <text key={time} x={xAt(time)} y={HEIGHT - 8} textAnchor="middle" className="mc-axis-label">{timeLabels?.[i]?.split(' ')[1] || new Date(time).getUTCHours().toString().padStart(2, '0')}</text>)}
      </svg>
      <div className="mc-legend">{series.map(s => <span key={s.id}><i style={{ '--series-color': s.color }} />{s.label}{s.points.every(p => !Number.isFinite(p.value) && !Number.isFinite(p.gust) && !Number.isFinite(p.secondary)) ? ' (자료 없음)' : ''}</span>)}{series.some(s => s.points.some(p => Number.isFinite(p.gust))) && <span>긴 점선·빈 점 돌풍</span>}{series.some(s => s.points.some(p => p.conditionText)) && <span>▼ TAF 조건 구간</span>}{secondaryUnit && <span>점선 {secondaryUnit}</span>}</div>
      {detail && <ModelComparisonTooltip detail={detail} rows={details} label={timeLabels?.[times.indexOf(detail.at)] || detail.at} chartRef={chartRef} onClose={closeDetail} onPointerEnter={keepDetail} onPointerLeave={leaveDetail} tooltipId={tooltipId} />}
    </div>
  )
}
