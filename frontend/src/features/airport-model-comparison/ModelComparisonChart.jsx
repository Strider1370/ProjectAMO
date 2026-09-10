import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import ModelComparisonTooltip from './ModelComparisonTooltip.jsx'
import { comparisonDetails } from './modelComparisonDetail.js'
import { chartDomain, chartPath, formatAxisTick, humidityColor, plotChartValue } from './modelComparisonChart.js'

export default function ModelComparisonChart({ series, times, timeLabels, unit, selectedValidAt, emptyState, cumulativeLabel }) {
  const [detail, setDetail] = useState(null)
  const [hiddenSeries, setHiddenSeries] = useState(() => new Set())
  const [showGust, setShowGust] = useState(true)
  const [measuredWidth, setMeasuredWidth] = useState(0)
  const wrapRef = useRef(null)
  const chartRef = useRef(null), hideTimer = useRef(null), tooltipId = useId()
  useLayoutEffect(() => {
    const element = wrapRef.current
    setMeasuredWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setMeasuredWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const keepDetail = useCallback(() => clearTimeout(hideTimer.current), [])
  const closeDetail = useCallback(() => { clearTimeout(hideTimer.current); setDetail(null) }, [])
  const leaveDetail = () => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setDetail(d => d?.mode === 'hover' ? null : d), 150) }
  useEffect(() => () => clearTimeout(hideTimer.current), [])
  const rain = unit === 'mm', ceiling = unit === 'ft', humidity = unit === '%', temperature = unit === '°C'
  const visible = series.filter(s => !hiddenSeries.has(s.id))
  const weather = rain ? visible.filter(s => s.categorical) : [], numeric = visible.filter(s => !s.categorical)
  // Expand only the time coordinates, keeping SVG units equal to CSS pixels.
  const logicalWidth = 128 + times.length * 72
  const width = measuredWidth || logicalWidth, scale = width / logicalWidth, left = 128 * scale
  const height = humidity ? Math.max(170, 66 + visible.length * 30) : 300
  const top = ceiling ? 48 : 28, bottom = height - 40 - weather.length * 26
  const start = Date.parse(times[0])
  const xAt = at => (164 + (Date.parse(at) - start) / 3_600_000 * 72) * scale
  const bandWidth = (s, i) => {
    const at = Date.parse(s.points[i].at)
    const gaps = [i > 0 ? at - Date.parse(s.points[i - 1].at) : NaN, i + 1 < s.points.length ? Date.parse(s.points[i + 1].at) - at : NaN]
    return Math.min(3_600_000, ...gaps.filter(gap => Number.isFinite(gap) && gap > 0)) / 3_600_000 * 64 * scale
  }
  // 히트맵은 칸이 곧 시각이라 관통선이 칸을 갈라놓는다. 대신 그 시각의 칸 열을 테두리로 감싼다.
  const columnOutline = at => {
    const index = times.indexOf(at)
    const band = index >= 0 && visible[0]?.points?.[index] ? bandWidth(visible[0], index) : 64 * scale
    return { x: xAt(at) - band / 2 - 2, y: top - 4, width: band + 4, height: visible.length * 30 + 2, rx: 3 }
  }
  const domain = chartDomain(numeric.flatMap(s => s.points.flatMap(p => [p.value, ...(unit === 'kt' && showGust ? [p.gust] : [])])), unit)
  const yAt = v => bottom - (plotChartValue(v, unit, domain.max) - domain.min) / (domain.max - domain.min) * (bottom - top)
  const ticks = Array.from({ length: Math.round((domain.max - domain.min) / domain.step) + 1 }, (_, i) => Number((domain.min + domain.step * i).toPrecision(10)))
  const focusedTime = () => times.includes(selectedValidAt) ? selectedValidAt : times[0]
  const details = detail ? comparisonDetails(visible, detail.at, unit) : []
  const chartMessage = !visible.length ? '표시할 요소 없음' : emptyState
  const showTime = (e, at, mode) => {
    keepDetail()
    const box = e.currentTarget.getBoundingClientRect()
    setDetail({ at, x: mode === 'hover' ? e.clientX : box.x + box.width / 2, y: mode === 'hover' ? e.clientY : box.y + box.height / 2, anchor: mode === 'focus' ? e.currentTarget : null, mode })
  }
  const pointEvents = p => ({
    onPointerMove: e => { if (e.pointerType !== 'touch') { e.stopPropagation(); showTime(e, p.at, 'hover') } },
    onFocus: e => { e.stopPropagation(); showTime(e, p.at, 'focus') },
  })
  const chartTime = e => {
    const box = chartRef.current.getBoundingClientRect(), x = (e.clientX - box.x) / box.width * width
    if (x < left || x > width || !times.length) return null
    return times.reduce((nearest, t) => Math.abs(xAt(t) - x) < Math.abs(xAt(nearest) - x) ? t : nearest, times[0])
  }
  const moveKeyboardTime = e => {
    const index = times.indexOf(detail?.at || focusedTime())
    const next = e.key === 'ArrowLeft' ? Math.max(0, index - 1) : e.key === 'ArrowRight' ? Math.min(times.length - 1, index + 1) : e.key === 'Home' ? 0 : e.key === 'End' ? times.length - 1 : null
    if (next === null || !times.length) return
    e.preventDefault(); showTime(e, times[next], 'focus')
  }
  const toggleSeries = id => { closeDetail(); setHiddenSeries(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  const hasValues = s => s.points.some(p => Number.isFinite(p.value) || Number.isFinite(p.gust) || p.text === 'NSC' || (s.categorical && p.text && !['자료 없음', '관측 전'].includes(p.text)))
  const plotPoints = s => s.points.map(p => ({ ...p, x: Number.isFinite(Date.parse(p.at)) ? xAt(p.at) : null }))
  const valid = p => Number.isFinite(Date.parse(p.at))
  const markLabel = (s, p) => s.label + ' ' + p.at + ', ' + p.value + ' ' + unit + (unit === 'kt' && Number.isFinite(p.gust) ? ', Gust ' + p.gust + ' ' + unit : '')
  const key = (s, i, suffix = '') => s.id + '-' + i + suffix
  return (
    <div ref={wrapRef} className={'mc-chart-wrap mc-chart-wrap--' + (rain ? 'rain' : ceiling ? 'ceiling' : humidity ? 'humidity' : temperature ? 'temperature' : 'wind')}>
      <div className="mc-legend" aria-label="그래프 요소 표시"><span className="mc-legend-help">그래프 표시</span>
        {series.map(s => <button key={s.id} type="button" className="mc-legend-toggle" aria-label={s.label + ' 그래프 표시'} aria-pressed={!hiddenSeries.has(s.id)} onClick={() => toggleSeries(s.id)}><i style={{ '--series-color': s.color }} />{s.label}{hasValues(s) ? '' : ' (자료 없음)'}</button>)}
        {unit === 'kt' && <label className="mc-gust-toggle"><input type="checkbox" checked={showGust} onChange={e => { closeDetail(); setShowGust(e.target.checked) }} />돌풍 점선</label>}
        {humidity && <span className="mc-humidity-scale">RH 0% <i style={{ background: humidityColor(0) }} /><i style={{ background: humidityColor(50) }} /><i style={{ background: humidityColor(100) }} /> 100%</span>}
      </div>
      {chartMessage ? <div className="mc-chart-empty-state" role="status" aria-label={chartMessage}><p>{chartMessage}</p></div> :
        <svg ref={chartRef} tabIndex="0" onFocus={e => showTime(e, focusedTime(), 'focus')} onBlur={closeDetail} onKeyDown={moveKeyboardTime}
          onPointerMove={e => { if (e.pointerType === 'touch') return; keepDetail(); const at = chartTime(e); if (at) setDetail({ at, x: e.clientX, y: e.clientY, mode: 'hover' }); else closeDetail() }}
          onPointerLeave={leaveDetail} onPointerDown={e => e.preventDefault()} className="mc-chart" style={{ height }} viewBox={'0 0 ' + width + ' ' + height}
          role="group" aria-label={'모델별 ' + unit + ' 추세 그래프'} aria-describedby={detail ? tooltipId : undefined}>
          {!humidity && <>{ticks.map(t => <g key={t}><line x1={left} x2={width} y1={yAt(t)} y2={yAt(t)} className="mc-grid-line" /><text x={left - 12} y={yAt(t) + 4} textAnchor="end" className="mc-axis-label">{formatAxisTick(t, unit, domain.max)}</text></g>)}
            {times.map(t => <line key={t} x1={xAt(t)} x2={xAt(t)} y1={top} y2={bottom} className="mc-grid-line mc-grid-line--vertical" />)}</>}
          {ceiling && <text x={left - 12} y="29" textAnchor="end" className="mc-axis-label">NSC</text>}
          {!rain && !humidity && numeric.map(s => <g key={s.id}>
            <path d={chartPath(plotPoints(s), yAt, ceiling || s.id === 'taf')} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" role={ceiling ? 'img' : undefined} aria-label={ceiling ? s.label + ' 운고 계단선' : undefined} />
            {unit === 'kt' && showGust && <path d={chartPath(plotPoints(s).map(p => ({ ...p, value: p.gust })), yAt, s.id === 'taf')} fill="none" stroke={s.color} strokeWidth="1.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />}
          </g>)}
          {rain && numeric.flatMap((s, k) => s.points.map((p, i) => {
            if (!Number.isFinite(p.value) || !valid(p)) return null
            const bw = Math.min(11, 54 / Math.max(1, numeric.length)), offset = (k - (numeric.length - 1) / 2) * bw
            return <rect key={key(s,i)} x={xAt(p.at) + offset - bw * .42} y={yAt(p.value)} width={bw * .84} height={Math.max(1, bottom - yAt(p.value))} fill={s.color} className="mc-precipitation-bar" tabIndex="-1" role="img" aria-label={markLabel(s,p)} {...pointEvents(p)} />
          }))}
          {!rain && !humidity && numeric.flatMap(s => s.points.map((p, i) => {
            if (!Number.isFinite(p.value) || !valid(p)) return null
            return ceiling && p.value > domain.max ?
              <path key={key(s,i)} d={'M' + xAt(p.at) + ',' + (yAt(domain.max) - 6) + ' l5,9 h-10 Z'} fill={s.color} className="mc-chart-point mc-overflow-point" tabIndex="-1" role="img" aria-label={s.label + ' ' + p.at + ', ' + p.value + ' ' + unit + ' (' + domain.max.toLocaleString('ko-KR') + ' ft 이상)'} {...pointEvents(p)} /> :
              <circle key={key(s,i)} cx={xAt(p.at)} cy={yAt(p.value)} r={temperature ? 3 : 2} fill={temperature ? 'var(--bg-1, #fff)' : s.color} stroke={s.color} strokeWidth={temperature ? 1.5 : 0} className="mc-chart-point" tabIndex="-1" role="img" aria-label={markLabel(s,p)} {...pointEvents(p)} />
          }))}
            {unit === 'kt' && showGust && numeric.flatMap(s => s.points.map((p,i) => Number.isFinite(p.gust) && valid(p) ? <circle key={key(s,i,'-gust')} cx={xAt(p.at)} cy={yAt(p.gust)} r="1.8" fill="var(--bg-1, #fff)" stroke={s.color} strokeWidth="1.2" className="mc-chart-point mc-gust-point" tabIndex="-1" role="img" aria-label={s.label + ' Gust ' + p.at + ', ' + p.gust + ' ' + unit} {...pointEvents(p)} /> : null))}
          {ceiling && visible.flatMap((s,k) => s.points.map((p,i) => p.text === 'NSC' && valid(p) ? <circle key={key(s,i,'-nsc')} cx={xAt(p.at) + (k - (visible.length - 1) / 2) * 7} cy="25" r="2.3" fill="var(--bg-1, #fff)" stroke={s.color} strokeWidth="1.5" className="mc-nsc-point" tabIndex="-1" role="img" aria-label={s.label + ' ' + p.at + ', NSC'} {...pointEvents(p)} /> : null))}
          {weather.map((s,row) => <g key={s.id}><text x={left - 12} y={bottom + 21 + row * 26} textAnchor="end" className="mc-axis-label">{s.id === 'taf' ? 'TAF' : 'METAR'}</text>
            {s.points.map((p,i) => valid(p) ? <g key={i}>
              <rect x={xAt(p.at) - bandWidth(s,i) / 2} y={bottom + 6 + row * 26} width={bandWidth(s,i)} height="21" rx="2" fill="var(--bg-3, #f5f5f5)" tabIndex="-1" role="img" aria-label={s.label + ' 현재날씨 ' + p.at + ', ' + (p.text || '자료 없음')} {...pointEvents(p)} />
              <text x={xAt(p.at)} y={bottom + 20 + row * 26} textAnchor="middle" className="mc-weather-band-text" pointerEvents="none">{(['NSW','현상 없음'].includes(p.text) ? '강수 없음' : p.text || '자료 없음')}</text>
            </g> : null)}</g>)}
          {humidity && visible.map((s,row) => <g key={s.id}><text x={left - 12} y={top + row * 30 + 17} textAnchor="end" className="mc-axis-label" style={{ fill: s.color }}>{s.label}</text>
            {s.points.map((p,i) => valid(p) && Number.isFinite(p.value) ? <g key={i}>
              <rect x={xAt(p.at) - bandWidth(s,i) / 2} y={top + row * 30} width={bandWidth(s,i)} height="24" rx="2" fill={humidityColor(p.value)} className="mc-humidity-cell" tabIndex="-1" role="img" aria-label={markLabel(s,p)} {...pointEvents(p)} />
              <text x={xAt(p.at)} y={top + row * 30 + 16} textAnchor="middle" className="mc-humidity-value" style={{ fill: p.value > 55 ? '#fff' : 'var(--text-1, #242424)' }} pointerEvents="none">{Math.round(p.value)}</text>
            </g> : null)}</g>)}
          {times.includes(selectedValidAt) && (humidity
            ? <rect {...columnOutline(selectedValidAt)} className="mc-selected-column" pointerEvents="none" />
            : <line x1={xAt(selectedValidAt)} y1={top - 8} x2={xAt(selectedValidAt)} y2={height - 40} className="mc-selected-line" pointerEvents="none" />)}
          {detail && (humidity
            ? <rect {...columnOutline(detail.at)} className="mc-hover-column" strokeDasharray="3 3" pointerEvents="none" />
            : <line x1={xAt(detail.at)} y1={top - 8} x2={xAt(detail.at)} y2={height - 40} className="mc-hover-line" strokeDasharray="3 3" pointerEvents="none" />)}
          {times.map((t,i) => <text key={t} x={xAt(t)} y={height - 16} textAnchor="middle" className="mc-axis-label">{timeLabels?.[i]?.split(' ')[1] || new Date(t).getUTCHours().toString().padStart(2,'0')}</text>)}
        </svg>}
      <div className="mc-chart-caption">{rain ? <><span>{cumulativeLabel ? cumulativeLabel + ' 이후 누적' : '표시 구간 누적 강수량'}</span><span>METAR·TAF는 현재날씨</span></> : ceiling ? <><span>계단형 운고 · NSC와 결측 구간은 선을 연결하지 않음</span><span>{'▲ ' + domain.max.toLocaleString('ko-KR') + ' ft 이상'}</span></> : <span>{humidity ? '모든 모델에 동일한 0–100% 색상 눈금' : temperature ? '기온은 점의 높이로 모델 간 차이 비교' : '실선 풍속 · 점선 돌풍 · 공통 풍속 눈금'}</span>}</div>
      {detail && <ModelComparisonTooltip detail={detail} rows={details} label={timeLabels?.[times.indexOf(detail.at)] || detail.at} chartRef={chartRef} onClose={closeDetail} onPointerEnter={keepDetail} onPointerLeave={leaveDetail} tooltipId={tooltipId} />}
    </div>
  )
}
