import { useEffect, useRef, useState, useId } from 'react'
import { Check, ChevronLeft, ChevronRight, Grip, Maximize2, Minus, Plus, ScanLine, Shrink, X, Pin } from 'lucide-react'
import RouteOverview from './RouteOverview.jsx'
import { ROUTES } from './routeNavigation.js'
import { formatProfileAltitude } from './altitudePresentation.js'
import ProfileChart from './ProfileChart.jsx'
import useFloatingWindow from './useFloatingWindow.js'
import { TOTAL_NM, LAYERS, DEFAULT_LAYERS, clamp, formatTime, hazards, sampleWeather } from './scenario.js'
import { GKTG_BANDS } from '../../../../shared/gktg.js'
import './vertical-profile-concept.css'

function Button({ label, children, active, ...props }) {
  return <button type="button" className={`vpc-button${active ? ' is-active' : ''}`} aria-label={label} title={label} {...props}>{children}</button>
}

function IcingSwatch({ grade = 2 }) {
  const id = useId().replace(/:/g, '')
  return <svg className="vpc-icing-swatch" width="18" height="12" aria-hidden="true"><defs><pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill={`var(--icing-${grade})`} /><circle cx="4" cy="4" r=".85" fill="white" /></pattern></defs><rect width="18" height="12" fill={`url(#${id})`} /></svg>
}

export default function VerticalProfileConcept() {
  const [open, setOpen] = useState(true)
  const [cruise, setCruise] = useState(35000)
  const [hour, setHour] = useState(0)
  const [tz, setTz] = useState('KST')
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [routeId, setRouteId] = useState(() => new URLSearchParams(window.location.search).get('route') === 'short' ? 'short' : 'long')
  const route = ROUTES[routeId]
  const total = route.total
  const [selectedWaypoint, setSelectedWaypoint] = useState(null)
  const [range, setRange] = useState(() => [0, route.total])
  const [cursor, setCursor] = useState({ nm: 145, ft: 35000 })
  const [pinned, setPinned] = useState(false)
  const floating = useFloatingWindow()
  const titleRef = useRef(null)
  const reopenRef = useRef(null)
  const weather = sampleWeather(cursor.nm * TOTAL_NM / total, cursor.ft, hour)
  const zoomed = range[0] !== 0 || range[1] !== total
  useEffect(() => { const previous = document.title; document.title = '연직단면도 창 시안 · ProjectAMO'; return () => { document.title = previous } }, [])
  function zoom(factor) {
    const span = clamp((range[1] - range[0]) * factor, 45, total)
    const center = clamp(cursor.nm, range[0], range[1])
    const start = clamp(center - span / 2, 0, total - span)
    setRange([start, start + span])
  }
  function changeRoute(id) {
    setRouteId(id); setRange([0, ROUTES[id].total]); setSelectedWaypoint(null); setPinned(false)
    setCursor({ nm: ROUTES[id].total / 2, ft: cruise })
  }
  function selectWaypoint(index) {
    setSelectedWaypoint(index); setCursor(p => ({ ...p, nm: route.waypoints[index].nm })); setPinned(true)
  }
  const items = hazards(hour).map(h => ({ ...h, start: h.start * total / TOTAL_NM, end: h.end * total / TOTAL_NM }))
  function close() { setOpen(false); requestAnimationFrame(() => reopenRef.current?.focus()) }
  function reopen() { setOpen(true); requestAnimationFrame(() => titleRef.current?.focus()) }

  return <div className="vpc-overlay">
    {!open && <button ref={reopenRef} className="vpc-reopen" onClick={reopen}><ScanLine size={17} />연직단면도</button>}
    {open && <section className={`vpc-window${floating.moving ? ' is-moving' : ''}${floating.maximized ? ' is-maximized' : ''}`} role="dialog" aria-modal="false" aria-labelledby="vpc-title"
      style={{ left: floating.rect.x, top: floating.rect.y, width: floating.rect.width, height: floating.rect.height }}>
      <header className="vpc-window-header" {...floating.handlers('move')} onDoubleClick={e => { if (!e.target.closest('button, select')) floating.toggleMaximize() }}>
        <div className="vpc-window-title" ref={titleRef} tabIndex="0" role="group" aria-label="창 이동. 드래그 또는 방향키로 이동" onKeyDown={e => floating.key(e, 'move')}>
          <Grip size={15} /><h1 id="vpc-title">연직단면도</h1><label className="vpc-fixture-control"><span>시안</span><select aria-label="시안 항로" value={routeId} onChange={e => changeRoute(e.target.value)}>{Object.entries(ROUTES).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}</select></label>
        </div>
        <div className="vpc-time-control">
          <Button label="이전 예보시간" disabled={hour === 0} onClick={() => setHour(h => h - 1)}><ChevronLeft size={16} /></Button>
          <strong data-testid="valid-time">{formatTime(hour, tz, true)}</strong>
          <Button label="다음 예보시간" disabled={hour === 3} onClick={() => setHour(h => h + 1)}><ChevronRight size={16} /></Button>
          <button className="vpc-timezone" aria-label="표시 시간대 변경" onClick={() => setTz(t => t === 'KST' ? 'UTC' : 'KST')}>{tz}</button>
        </div>
        <div className="vpc-window-actions"><Button label={floating.maximized ? '창 크기 복원' : '창 최대화'} onClick={floating.toggleMaximize}>{floating.maximized ? <Shrink size={17} /> : <Maximize2 size={17} />}</Button><Button label="연직단면도 닫기" onClick={close}><X size={18} /></Button></div>
      </header>
      <div className="vpc-toolbar">
        <div className="vpc-layer-controls" aria-label="기상 레이어">{['현상', '상층 바람', '기준선·특보'].map(group => <div className="vpc-layer-group" role="group" aria-label={group} key={group}>{LAYERS.filter(layer => layer.group === group).map(layer => <button key={layer.id} aria-pressed={Boolean(layers[layer.id])} className={`${layers[layer.id] ? 'is-on' : ''} ${layer.id === 'turbulence' ? 'is-turbulence' : ''}`} onClick={() => setLayers(p => ({ ...p, [layer.id]: !p[layer.id] }))}>
          <span className="vpc-layer-check" style={{ '--layer-tone': layer.tone }}>{layers[layer.id] && <Check size={10} />}</span>{layer.label}</button>)}</div>)}</div>
        <div className="vpc-chart-controls"><select aria-label="계획 순항고도" value={cruise} onChange={e => { setCruise(Number(e.target.value)); setCursor(p => ({ ...p, ft: Number(e.target.value) })) }}>{[10000, 14000, 15000, 25000, 31000, 35000, 39000, 43000].map(ft => <option key={ft} value={ft}>{formatProfileAltitude(ft)}</option>)}</select>
          <Button label="차트 축소" disabled={!zoomed} onClick={() => zoom(1.6)}><Minus size={15} /></Button><Button label="차트 확대" disabled={range[1] - range[0] <= 45} onClick={() => zoom(.6)}><Plus size={15} /></Button><Button label="전체 항로 맞춤" onClick={() => setRange([0, total])}><span>전체</span></Button>
        </div>
      </div>
      <div className="vpc-plot-column"><ProfileChart route={route} selectedWaypoint={selectedWaypoint} onWaypoint={selectWaypoint} onRange={setRange} layers={layers} hour={hour} cruise={cruise} range={range} altitudeFocus={false} items={items} cursor={cursor} pinned={pinned} onCursor={setCursor} onPin={setPinned} selected={null} /></div>
      <RouteOverview total={total} range={range} onRange={setRange} waypointCount={route.waypoints.length} />
      <footer className="vpc-window-footer">
        <div className="vpc-legend" aria-label="범례">{layers.icing && <span><IcingSwatch />착빙 MOD</span>}{layers.turbulence && <span><i style={{ background: GKTG_BANDS[2].color }} />난류 MOD</span>}{layers.advisory && <span><i className="is-advisory" />SIGMET</span>}{layers.tropopauseJet && <><span><i className="is-tropopause" />권계면</span><span><i className="is-jet">J</i>제트 코어</span></>}{layers.isotachs && <span><i className="is-isotach" />등풍속선 20 kt 간격</span>}{(layers.icing || layers.turbulence) && <details className="vpc-grade-legend" onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary').focus() } }}><summary>강도 범례</summary><div className="vpc-grade-content">
          {layers.icing && <div><strong>착빙</strong>{['LGT', 'MOD', 'SEV'].map((grade, i) => <span key={grade}><IcingSwatch grade={i + 1} />{grade}</span>)}</div>}
          {layers.turbulence && <div><strong>난류</strong>{['LGT', 'MOD', 'SEV'].map((grade, i) => <span key={grade}><i style={{ background: GKTG_BANDS[i + 1].color }} />{grade}</span>)}</div>}
        </div></details>}<span className="vpc-fixture-note">합성 자료</span></div>
        <div className="vpc-readout" aria-live={pinned ? 'polite' : 'off'}><span>{selectedWaypoint !== null && route.waypoints[selectedWaypoint].nm === cursor.nm ? `${route.waypoints[selectedWaypoint].name} · ` : ''}{Math.round(cursor.nm)} NM · {formatProfileAltitude(cursor.ft)}</span><span>{weather.missing ? '바람 자료 없음' : `${weather.direction}° / ${weather.wind} kt`}</span></div>
        <Button label="선택 고정 전환" active={pinned} aria-pressed={pinned} onClick={() => setPinned(v => !v)}><Pin size={13} /></Button>
      </footer>
      {!floating.maximized && <>{['n', 's', 'e', 'w', 'ne', 'nw', 'sw'].map(edge => <div key={edge} className={`vpc-resize is-${edge}`} aria-hidden="true" {...floating.handlers(edge)} />)}<div className="vpc-resize is-se" role="group" tabIndex="0" aria-label="창 크기 조절. 드래그 또는 방향키로 조절" {...floating.handlers('se')} onKeyDown={e => floating.key(e, 'resize')}><svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M3 11L11 3M7 11L11 7" /></svg></div></>}
    </section>}
  </div>
}
