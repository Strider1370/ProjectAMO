import { useId, useState, useMemo, useRef, useEffect } from 'react'
import { TOTAL_NM, terrain as fixtureTerrain, clamp, sampleWeather as fixtureWeather, tropopauseAltitude as fixtureTropopause, jetCores as fixtureJets } from './scenario.js'
import { nearestWaypoint, panRange, waypointLabels } from './routeNavigation.js'
import { buildIsotachs } from './isotachs.js'
import { formatProfileAltitude } from './altitudePresentation.js'
import useSize from './useSize.js'

const FL = formatProfileAltitude

export default function ProfileChart({ route, selectedWaypoint, onWaypoint, onRange, layers, hour, cruise, range, altitudeFocus, items, cursor, pinned, onCursor, onPin, selected }) {
  const [ref, size] = useSize()
  const drag = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [hoverWaypoint, setHoverWaypoint] = useState(null)
  const total = route.total, scale = total / TOTAL_NM
  const sampleWeather = (nm, ft, h) => fixtureWeather(nm / scale, ft, h)
  const terrain = nm => fixtureTerrain(nm / scale)
  const tropopauseAltitude = (nm, h) => fixtureTropopause(nm / scale, h)
  const plannedAltitude = (nm, cruiseFt) => Math.min(cruiseFt, nm / 44 * cruiseFt, (total - nm) / 62 * cruiseFt)
  const [hoveredJet, setHoveredJet] = useState(null)
  const [focusedJet, setFocusedJet] = useState(null)
  const isotachs = useMemo(() => layers.isotachs ? buildIsotachs(hour) : [], [hour, layers.isotachs])
  const id = useId().replace(/:/g, '')
  const width = Math.max(300, size.width), height = Math.max(220, size.height)
  const left = width < 600 ? 72 : 82, right = 32, top = 30, bottom = height - 54
  const plotWidth = width - left - right, plotHeight = bottom - top
  useEffect(() => {
    const element = ref.current
    if (!element) return
    function wheel(e) {
      // Keep browser zoom shortcuts; only plain vertical scrolling navigates the chart.
      if (e.ctrlKey || e.metaKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const bounds = element.getBoundingClientRect()
      const px = e.clientX - bounds.left, py = e.clientY - bounds.top
      if (px < left || px > width - right || py < top || py > height) return
      e.preventDefault()
      e.stopPropagation()
      if (drag.current) return
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? plotHeight : 1)
      const fraction = clamp((px - left) / plotWidth, 0, 1)
      const factor = Math.exp(clamp(delta, -240, 240) * .0025)
      onRange(current => {
        const span = current[1] - current[0]
        const nextSpan = clamp(span * factor, Math.min(45, total), total)
        if (Math.abs(nextSpan - span) < .000001) return current
        const anchor = current[0] + fraction * span
        const start = clamp(anchor - fraction * nextSpan, 0, total - nextSpan)
        return [start, start + nextSpan]
      })
    }
    // React wheel handlers are passive; a native listener allows preventing page scroll.
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [ref, onRange, total, left, right, top, width, height, plotWidth, plotHeight])
  const minFt = altitudeFocus ? 25000 : 0, maxFt = altitudeFocus ? 45000 : 47000
  const x = nm => left + (nm - range[0]) / (range[1] - range[0]) * plotWidth
  const y = ft => bottom - (ft - minFt) / (maxFt - minFt) * plotHeight
  const path = (points) => points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const points = [...new Set([0, 44, total - 62, total, ...Array.from({ length: 201 }, (_, i) => range[0] + i / 200 * (range[1] - range[0]))])].sort((a, b) => a - b)
  const flightPath = path(points.map(nm => [x(nm), y(plannedAltitude(nm, cruise))]))
  const terrainPath = path(points.map(nm => [x(nm), y(terrain(nm))])) + `L${x(total)},${y(0)}L${x(0)},${y(0)}Z`
  const jets = layers.tropopauseJet ? fixtureJets(hour).map(j => ({ ...j, nm: j.nm * scale })).filter(jet => jet.nm >= range[0] && jet.nm <= range[1] && jet.ft >= minFt && jet.ft <= maxFt) : []
  const activeJet = jets.find(jet => jet.id === hoveredJet || jet.id === focusedJet || (pinned && cursor.nm === jet.nm && cursor.ft === jet.ft))
  const isotachLabels = []
  for (const { kt, chains } of isotachs) for (const chain of chains) {
    const candidates = chain.map(p => ({ x: x(p.x * scale), y: y(p.y) })).filter(p => p.x > left + 26 && p.x < width - right - 26 && p.y > top + 15 && p.y < bottom - 15)
    const candidate = [.25, .75, .5, .1, .9].map(f => candidates[Math.floor((candidates.length - 1) * f)]).find(p => p &&
      !isotachLabels.some(q => Math.abs(q.x - p.x) < 66 && Math.abs(q.y - p.y) < 26) &&
      !jets.some(j => Math.hypot(x(j.nm) - p.x, y(j.ft) - p.y) < 32) &&
      Math.abs(y(plannedAltitude(range[0] + (p.x - left) / plotWidth * (range[1] - range[0]), cruise)) - p.y) > 16)
    if (candidate) isotachLabels.push({ ...candidate, kt })
  }
  const visibleHazards = items.filter(h => layers[h.type])
  const yTicks = Array.from({ length: 10 }, (_, i) => i * 5000).filter(ft => ft >= minFt && ft <= maxFt)
  const rawStep = (range[1] - range[0]) / Math.max(2, Math.floor(plotWidth / 90))
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const xStep = [1, 2, 5, 10].find(n => n * magnitude >= rawStep) * magnitude
  const distances = Array.from({ length: Math.ceil((range[1] - range[0]) / xStep) + 1 }, (_, i) => (Math.ceil(range[0] / xStep) + i) * xStep).filter(nm => nm <= range[1])
  const markers = waypointLabels(route.waypoints, range, left, width - right, selectedWaypoint)
  const waypointTicks = []
  let lastTick = -Infinity
  route.waypoints.forEach(p => { if (p.nm >= range[0] && p.nm <= range[1] && x(p.nm) - lastTick >= 3) { waypointTicks.push(p); lastTick = x(p.nm) } })
  function axisIndex(e) {
    const b = e.currentTarget.getBoundingClientRect()
    return nearestWaypoint(route.waypoints, clamp(range[0] + (e.clientX - b.left) / b.width * (range[1] - range[0]), range[0], range[1]))
  }
  function chooseWaypoint(index) {
    onWaypoint(index)
    const nm = route.waypoints[index].nm
    if (nm < range[0] || nm > range[1]) onRange(panRange(range, nm - (range[1] - range[0]) / 2, total))
  }
  function beginPan(e) {
    if (e.button !== 0 || drag.current) return
    drag.current = { id: e.pointerId, x: e.clientX, range: [...range], moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function movePan(e) {
    const d = drag.current
    if (d?.id === e.pointerId) {
      const dx = e.clientX - d.x
      if (Math.abs(dx) > 4) d.moved = true
      if (d.moved) { setDragging(true); onRange(panRange(d.range, d.range[0] - dx / plotWidth * (d.range[1] - d.range[0]), total)) }
    } else if (!d && !pinned && e.pointerType !== 'touch') onCursor(pointerPosition(e))
  }
  function endPan(e, cancelled = false) {
    const d = drag.current
    if (d?.id !== e.pointerId) return
    if (!cancelled && !d.moved) { onCursor(pointerPosition(e)); onPin(true) }
    drag.current = null; setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  function pointerPosition(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { nm: clamp(range[0] + ((e.clientX - rect.left) / rect.width) * (range[1] - range[0]), range[0], range[1]),
      ft: Math.round(clamp(maxFt - ((e.clientY - rect.top) / rect.height) * (maxFt - minFt), minFt, maxFt) / 500) * 500 }
  }
  function moveKey(e) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Enter', ' '].includes(e.key)) return
    e.preventDefault()
    if (e.key === 'Escape') return onPin(false)
    if (e.key === 'Enter' || e.key === ' ') return onPin(!pinned)
    onPin(true)
    onCursor({ nm: clamp(cursor.nm + (e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0), range[0], range[1]),
      ft: clamp(cursor.ft + (e.key === 'ArrowUp' ? 1000 : e.key === 'ArrowDown' ? -1000 : 0), minFt, maxFt) })
  }
  const cloudCells = []
  const cellWidth = 4 * scale
  if (layers.cloud) for (let nm = Math.floor(range[0] / cellWidth) * cellWidth; nm < range[1]; nm += cellWidth) {
    const fixtureNm = nm / scale
    const crest = 14000 + 5500 * Math.sin(fixtureNm / 44 + 0.4) + 2500 * Math.cos(fixtureNm / 19 + hour * .35)
    for (let ft = 4000; ft < Math.min(crest, 24000); ft += 1500) {
      const density = (Math.sin(fixtureNm / 32) + 1.5) * (1 - Math.abs(ft - crest * .55) / crest)
      cloudCells.push(<rect key={`${nm}-${ft}`} x={x(nm)} y={y(ft + 1500)} width={cellWidth / (range[1] - range[0]) * plotWidth + .3} height={1500 / (maxFt - minFt) * plotHeight + .3} fill="var(--accent)" opacity={Math.max(.04, density * .12)} />)
    }
  }
  const barbs = []
  if (layers.wind) {
    const dx = width < 600 ? 72 : 82, dy = 46
    for (let px = left + 28; px < width - right - 15; px += dx) for (let py = top + 50; py < bottom - 20; py += dy) {
      const ft = maxFt - (py - top) / plotHeight * (maxFt - minFt)
      if (ft > 42000) continue
      const nm = range[0] + (px - left) / plotWidth * (range[1] - range[0])
      const wind = sampleWeather(nm, ft, hour)
      let remaining = Math.round(wind.wind / 5) * 5, offset = -10
      const flags = [], feathers = []
      while (remaining >= 50) { flags.push(`M0 ${offset}L7 ${offset + 2}L0 ${offset + 5}Z`); offset += 6; remaining -= 50 }
      while (remaining >= 10) { feathers.push(`M0 ${offset}L7 ${offset - 3}`); offset += 3; remaining -= 10 }
      if (remaining >= 5) feathers.push(`M0 ${offset}L3.5 ${offset - 1.5}`)
      barbs.push(<g key={`${px}-${py}`} transform={`translate(${px} ${py}) rotate(${wind.direction})`} className="vpc-wind-barb"><path d={`M0 10V-10 ${feathers.join(' ')}`} /><path d={flags.join(' ')} fill="var(--accent)" /></g>)
    }
  }
  return <div className="vpc-chart" ref={ref} data-testid="profile-chart">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="항로의 거리별 고도와 기상 단면" role="group">
      <defs>
        <clipPath id={`${id}-plot`}><rect x={left} y={top} width={plotWidth} height={plotHeight} /></clipPath>
        <pattern id={`${id}-missing`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="var(--bg-3)" /><path d="M0 0V9" stroke="var(--stroke-1)" strokeWidth="1" /></pattern>
        <pattern id={`${id}-icing`} width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="var(--icing-2)" /><circle cx="4" cy="4" r=".85" fill="white" /></pattern>
      </defs>
      <text x={left} y="18" className="vpc-axis-heading">고도 · ft</text>
      <text x={width - right} y="18" textAnchor="end" className="vpc-axis-heading">{altitudeFocus ? '순항 고도 확대 · 25,000 ft 아래 생략' : '전체 고도'}</text>
      <g clipPath={`url(#${id}-plot)`}>
        <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="var(--bg-2)" />
        {cloudCells}
        <rect x={left} y={top} width={plotWidth} height={Math.max(0, y(42000) - top)} fill={`url(#${id}-missing)`} />
        {yTicks.map(ft => <line key={ft} x1={left} x2={width - right} y1={y(ft)} y2={y(ft)} className="vpc-grid" />)}
        {distances.map(nm => <line key={nm} x1={x(nm)} x2={x(nm)} y1={top} y2={bottom} className="vpc-grid is-vertical" />)}
        {visibleHazards.map(h => <g key={h.id} className={selected === h.id ? 'vpc-hazard-selected' : ''}>
          <rect x={x(h.start)} y={y(h.top)} width={x(h.end) - x(h.start)} height={y(h.bottom) - y(h.top)} fill={h.type === 'icing' ? `url(#${id}-icing)` : h.type === 'advisory' ? 'transparent' : h.color} stroke={h.type === 'icing' ? 'var(--icing-3)' : h.color} strokeWidth={h.type === 'advisory' ? 2 : 1} strokeDasharray={h.type === 'advisory' ? '6 4' : undefined} />
        </g>)}
        <g className="vpc-isotachs" aria-label="등풍속선 · 80 kt부터 20 kt 간격">
          {isotachs.flatMap(({ kt, chains }) => chains.map((chain, i) => <path key={`${kt}-${i}`} data-kt={kt} className={kt === 80 ? 'is-major' : undefined} d={path(chain.map(p => [x(p.x * scale), y(p.y)]))} />))}
          {isotachLabels.map((p, i) => <text key={i} x={p.x} y={p.y + 3} textAnchor="middle">{p.kt} kt</text>)}
        </g>
        {barbs}
        {layers.tropopauseJet && <path className="vpc-tropopause" d={path(points.map(nm => [x(nm), y(tropopauseAltitude(nm, hour))]))} />}
        {layers.temperature && [0, -20].map((temp, i) => {
          const tempPoints = points.map(nm => [x(nm), y(9500 + i * 12500 + 2400 * Math.sin(nm / scale / 100 + hour * .2))])
          const labelNm = range[0] + (range[1] - range[0]) * .83
          return <g key={temp} className="vpc-isotherm"><path d={path(tempPoints)} strokeDasharray={i ? '6 5' : undefined} /><text x={x(labelNm)} y={y(9500 + i * 12500 + 2400 * Math.sin(labelNm / scale / 100 + hour * .2)) - 7}>{temp}°C</text></g>
        })}
        <path d={terrainPath} className="vpc-terrain" />
        <path d={flightPath} stroke="white" strokeWidth="7" fill="none" />
        <path d={flightPath} className="vpc-flight-path" />
        {items.filter(h => layers[h.type]).map(h => <path key={h.id} d={path(points.filter(nm => nm >= h.start && nm <= h.end && plannedAltitude(nm, cruise) >= h.bottom && plannedAltitude(nm, cruise) <= h.top).map(nm => [x(nm), y(plannedAltitude(nm, cruise))]))} stroke={h.type === 'advisory' ? h.color : 'var(--level-amber)'} strokeWidth="4" fill="none" />)}
        {/* 착빙·난류는 연속적인 기상장으로 읽으며 영역별 이름표를 붙이지 않는다. */}
        {visibleHazards.filter(h => h.type === 'advisory').map(h => {
          const labelX = clamp(x(h.start) + 8, left + 8, width - 125)
          return x(h.end) >= left && x(h.start) <= width - right && h.top > minFt ? <g key={h.id} className="vpc-hazard-label"><rect x={labelX - 4} y={y(h.top) + 7} width={100} height="22" rx="3" /><text x={labelX + 2} y={y(h.top) + 22} fill="var(--level-red)">{h.short}</text></g> : null
        })}
        <text x={left + 10} y={top + 17} className="vpc-missing-label">42,000 ft 위 · 바람 / 착빙 / 난류 자료 없음</text>
        {range[0] < 80 && <g className="vpc-route-label"><text x={x(Math.max(46, range[0] + 8))} y={y(cruise) - 11}>계획 {FL(cruise)}</text></g>}
        {range[0] <= total - 62 && range[1] >= total - 62 && <g className="vpc-tod"><line x1={x(total - 62)} x2={x(total - 62)} y1={y(cruise) - 8} y2={bottom} /><circle cx={x(total - 62)} cy={y(cruise)} r="3.5" /><text x={x(total - 62) + 8} y={y(cruise) - 11}>TOD</text></g>}
        {cursor.nm >= range[0] && cursor.nm <= range[1] && <g className="vpc-crosshair">
          <line x1={x(cursor.nm)} x2={x(cursor.nm)} y1={top} y2={bottom} />
          <line x1={left} x2={width - right} y1={y(cursor.ft)} y2={y(cursor.ft)} className="is-horizontal" />
          <circle cx={x(cursor.nm)} cy={y(cursor.ft)} r="5" />
          <rect x={clamp(x(cursor.nm) - 72, left, width - right - 145)} y={bottom - 28} width="145" height="23" rx="4" />
          <text x={clamp(x(cursor.nm) - 72, left, width - right - 145) + 72.5} y={bottom - 12} textAnchor="middle">{Math.round(cursor.nm)} NM · {FL(cursor.ft)}</text>
        </g>}
      </g>
      {yTicks.map(ft => <text key={ft} x={left - 12} y={y(ft) + 4} textAnchor="end" className="vpc-axis-label">{formatProfileAltitude(ft)}</text>)}
      {!yTicks.some(ft => Math.abs(y(ft) - y(cruise)) < 16) && <text x={left - 12} y={y(cruise) + 4} textAnchor="end" className="vpc-axis-label is-cruise">{FL(cruise)}</text>}
      <line x1={left} x2={width - right} y1={bottom} y2={bottom} className="vpc-axis-line" />
      {waypointTicks.map(p => <line key={p.name} x1={x(p.nm)} x2={x(p.nm)} y1={bottom} y2={bottom + 5} className="vpc-axis-line" />)}
      {markers.map(p => <text key={p.index} data-index={p.index} x={p.labelX} y={bottom + 23} textAnchor="middle" className={`vpc-waypoint ${p.index === selectedWaypoint ? 'is-selected' : ''} ${p.index === 0 || p.index === route.waypoints.length - 1 ? 'is-airport' : ''}`}>{p.name}</text>)}
      {hoverWaypoint !== null && route.waypoints[hoverWaypoint]?.nm >= range[0] && route.waypoints[hoverWaypoint]?.nm <= range[1] && <g className="vpc-waypoint-detail" pointerEvents="none" transform={`translate(${clamp(x(route.waypoints[hoverWaypoint].nm) - 75, left, width - right - 150)} ${bottom - 32})`}>
        <rect width="150" height="26" rx="4" /><text x="75" y="17" textAnchor="middle">{route.waypoints[hoverWaypoint].name} · {route.waypoints[hoverWaypoint].nm} NM</text>
      </g>}
      <rect className="vpc-waypoint-target" x={left} y={bottom} width={plotWidth} height="44" fill="transparent" tabIndex="0" role="group" aria-label="웨이포인트 탐색. 터치로 선택, 좌우 방향키로 이전 다음 지점 선택"
        onPointerMove={e => { if (e.pointerType !== 'touch') setHoverWaypoint(axisIndex(e)) }} onPointerLeave={() => setHoverWaypoint(null)}
        onClick={e => { const index = axisIndex(e); setHoverWaypoint(index); chooseWaypoint(index) }}
        onBlur={() => setHoverWaypoint(null)} onKeyDown={e => {
          if (e.key === 'Escape') { setHoverWaypoint(null); return }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const current = selectedWaypoint ?? nearestWaypoint(route.waypoints, cursor.nm)
          const index = e.key === 'Home' ? 0 : e.key === 'End' ? route.waypoints.length - 1 : clamp(current + (e.key === 'ArrowLeft' ? -1 : 1), 0, route.waypoints.length - 1)
          setHoverWaypoint(index); chooseWaypoint(index)
        }} />
      {distances.map(nm => <text key={nm} x={x(nm)} y={bottom + 42} textAnchor={x(nm) > width - right - 25 ? 'end' : 'middle'} className="vpc-distance">{nm}</text>)}
      <text x={width - right + 10} y={bottom + 42} className="vpc-distance">NM</text>
      <rect x={left} y={top} width={plotWidth} height={plotHeight} fill="transparent" tabIndex="0" role="group" aria-roledescription="기상 단면 탐색기" aria-label="단면 탐색. 휠로 가리킨 지점 기준 확대 축소, 드래그로 좌우 이동. 방향키로 거리와 고도 이동, Enter로 선택 고정, Escape로 해제" className={`vpc-plot-target${dragging ? ' is-dragging' : ''}`}
        onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={e => endPan(e)} onPointerCancel={e => endPan(e, true)} onLostPointerCapture={() => { drag.current = null; setDragging(false) }} onKeyDown={moveKey} />
      <g clipPath={`url(#${id}-plot)`}>
        {jets.map(jet => <g key={jet.id} className="vpc-jet-core" transform={`translate(${x(jet.nm)} ${y(jet.ft)})`}
          role="button" tabIndex="0" aria-label={`제트 코어 ${Math.round(jet.nm)} NM · ${FL(jet.ft)} · ${sampleWeather(jet.nm, jet.ft, hour).wind} kt`}
          aria-pressed={pinned && cursor.nm === jet.nm && cursor.ft === jet.ft}
          onPointerEnter={() => setHoveredJet(jet.id)} onPointerLeave={() => setHoveredJet(null)}
          onFocus={() => setFocusedJet(jet.id)} onBlur={() => setFocusedJet(null)}
          onClick={() => { onCursor({ nm: jet.nm, ft: jet.ft }); onPin(true) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCursor({ nm: jet.nm, ft: jet.ft }); onPin(true) } else if (e.key === 'Escape') { onPin(false); setFocusedJet(null); setHoveredJet(null) } }}>
          <rect x="-22" y="-22" width="44" height="44" fill="transparent" />
          <circle r="8" /><text textAnchor="middle" y="3">J</text>
        </g>)}
        {activeJet && <g className="vpc-jet-detail" pointerEvents="none" transform={`translate(${clamp(x(activeJet.nm) - 82, left + 4, width - right - 168)} ${Math.max(top + 4, y(activeJet.ft) - 55)})`}>
          <rect width="164" height="28" rx="4" />
          <text x="82" y="18" textAnchor="middle">제트 · {FL(activeJet.ft)} · {sampleWeather(activeJet.nm, activeJet.ft, hour).wind} kt</text>
        </g>}
      </g>
    </svg>
  </div>
}
