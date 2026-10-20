import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Grip, Maximize2, X } from 'lucide-react'
import VerticalProfileChart from './VerticalProfileChart.jsx'
import { useCrossSectionLayers } from './crossSectionLayers.jsx'
import ProfileLegend from './ProfileLegend.jsx'
import { formatBriefingTime } from './lib/briefingTime.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useFloatingWindow from './profile-ui/useFloatingWindow.js'
import RouteOverview from './profile-ui/RouteOverview.jsx'
import { clamp } from './profile-ui/profileNavigation.js'
import './profile-ui/profile-base.css'
import './RouteBriefing.css'
import './profile-ui/profile-viewer.css'

const EMPTY = []
const INITIAL_LAYERS = { temp: true, wind: true, icing: true, moisture: true, cloud: false, turbulence: true, isotachs: true, tropopause: true, advisories: true }

export default function VerticalProfileViewer(props) {
  if (props.isOpen === false || !props.profile) return null
  return <ProfileView {...props} />
}
function ProfileView({ embedded = false, layers: externalLayers, onToggleLayer, allowMissingTerrain = false,
  highlightRangeNm, linkedItems, activeLinkedItemId, onSelectLinkedItem, sourceNote, fillContainer = false, profile, crossSection, onClose, referenceAltitudeFt, advisories = EMPTY, selectedCandidateAltitudeFt,
  candidateAltitudes = EMPTY, onSelectCandidateAltitude, onSelectForecastHour, crossSectionHourLoading = false,
  nwpTimeSelection, onSetWaypointNwpOffset, statusMessage, previewLabel = null, retry = null, placement, onRangeChange, compact = false, compactTitle = null, compactActions = null, plotPaddingLeft = null }) {
  const floating = useFloatingWindow(placement)
  const { tz, setTz } = useTimeZone()
  const [localLayers, localToggle] = useCrossSectionLayers(INITIAL_LAYERS)
  const layers = externalLayers ?? localLayers
  const toggle = onToggleLayer ?? localToggle
  const isotachs = layers.isotachs !== false
  const chartLayers = useRef(null)
  if (!chartLayers.current || chartLayers.current.source !== layers || chartLayers.current.isotachs !== isotachs) chartLayers.current = { source: layers, isotachs, value: { ...layers, isotachs } }
  const [zoom, setZoom] = useState(1)
  const [range, setRange] = useState([0, profile?.axis?.totalDistanceNm || 1])
  // 지도형 브리핑 위험 막대가 "단면에 보이는 구간" 창을 그리도록 보이는 범위를 밖으로 알린다.
  const onRangeChangeRef = useRef(onRangeChange)
  onRangeChangeRef.current = onRangeChange
  useEffect(() => { onRangeChangeRef.current?.(range) }, [range])
  const [selected, setSelected] = useState(null)
  const focusSelected = useRef(false)
  const scrollRef = useRef(null), anchor = useRef(null), frame = useRef(null)
  const total = profile?.axis?.totalDistanceNm || 1
  const effectiveAltitude = referenceAltitudeFt ?? selectedCandidateAltitudeFt ?? profile?.flightPlan?.plannedCruiseAltitudeFt
  const markers = useMemo(() => {
    const counts = new Map()
    return (profile?.markers ?? []).map((m,index) => {
      const base = String(m.id ?? `marker:${index}`), count = counts.get(base) ?? 0
      counts.set(base,count+1)
      return { ...m, id:count ? `${base}:occurrence:${count}` : base }
    })
  }, [profile?.markers])
  useEffect(() => {
    if (!selected) return
    if (focusSelected.current) {
      focusSelected.current = false
      const svg = scrollRef.current?.querySelector('svg')
      const label = [...(svg?.querySelectorAll('[data-marker-id]') ?? [])].find(el => el.dataset.markerId === selected.id)
      label?.focus({ preventScroll:true })
    }
  }, [selected])
  const normalizedProfile = useMemo(() => ({ ...profile, markers }), [profile, markers])
  const updateRange = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const full = Math.max(1, el.scrollWidth - 138), visible = Math.max(1, el.clientWidth - 138)
    const start = clamp(el.scrollLeft / full * total, 0, total)
    const end = Math.min(total, start + visible / full * total)
    setRange(previous => previous[0] === start && previous[1] === end ? previous : [start, end])
  }, [total])
  useEffect(() => { setZoom(1); setSelected(null); if (scrollRef.current) scrollRef.current.scrollLeft = 0 }, [total])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && anchor.current) {
      const { fraction, pixel } = anchor.current
      el.scrollLeft = fraction * Math.max(1, el.scrollWidth - 138) - pixel
      anchor.current = null
    }
    updateRange()
  }, [zoom, updateRange, floating.rect.width, floating.rect.height, profile])
  const changeZoom = useCallback((factor, pixel) => {
    const el = scrollRef.current
    if (!el) return
    const p = pixel ?? Math.max(1, el.clientWidth - 138) / 2
    anchor.current = { fraction: (el.scrollLeft + p) / Math.max(1, el.scrollWidth - 138), pixel: p }
    setZoom(z => clamp(z * factor, 1, Math.max(1, total / 45)))
  }, [total])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let wheelFrame = null, wheelFactor = 1, wheelPixel = 0
    const wheel = e => {
      if (embedded || e.ctrlKey || e.metaKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const pixel = e.clientX - el.getBoundingClientRect().left - 80
      if (pixel < 0) return
      e.preventDefault(); e.stopPropagation()
      wheelFactor *= Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 200 : 1), -240, 240) * .0025)
      wheelPixel = pixel
      if (wheelFrame === null) wheelFrame = requestAnimationFrame(() => {
        wheelFrame = null
        changeZoom(wheelFactor, wheelPixel)
        wheelFactor = 1
      })
    }
    const scroll = () => { if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = null; updateRange() }) }
    const resize = new ResizeObserver(scroll); resize.observe(el)
    el.addEventListener('wheel', wheel, { passive:false }); el.addEventListener('scroll', scroll)
    return () => { cancelAnimationFrame(wheelFrame); resize.disconnect(); el.removeEventListener('wheel',wheel); el.removeEventListener('scroll',scroll); cancelAnimationFrame(frame.current); frame.current = null }
  }, [profile, changeZoom, updateRange, embedded])
  const selectMarker = useCallback(marker => {
    focusSelected.current = !!document.activeElement?.closest('.vertical-profile-plot-svg')
    setSelected(marker)
    const el = scrollRef.current
    if (el) {
      const x = marker.distanceNm / total * Math.max(1, el.scrollWidth - 138)
      if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 138) el.scrollLeft = x - (el.clientWidth - 138) / 2
    }
  }, [total])
  const setRangeFromOverview = next => {
    const el = scrollRef.current
    if (el) el.scrollLeft = next[0] / total * Math.max(1, el.scrollWidth - 138)
  }
  const missingLayers = [
    [layers.wind, 'wind', '바람깃'], [layers.icing, 'icing', '착빙'], [layers.moisture, 'moisture', '구름'], [layers.temp, 'T', '등온선'],
  ].filter(([enabled,key]) => enabled && crossSection?.coverage?.byVariable?.[key]?.available === false).map(([, ,label])=>label)
  if (!crossSection) missingLayers.push('기상 단면')
  if (layers.cloud && crossSection?.coverage?.byVariable?.cld?.available === false) missingLayers.push('모델 구름량')
  if (layers.turbulence && crossSection?.turbulence?.available === false) missingLayers.push('난류')
  if (layers.tropopause && crossSection?.tropopause?.available === false) missingLayers.push('권계면')
  const coverageNotes = Object.entries(crossSection?.coverage?.byVariable ?? {}).filter(([,v])=>v.available && Number.isFinite(v.topPressure)).map(([key,v])=>`${({T:'기온',wind:'바람',icing:'착빙',moisture:'구름',cld:'모델 구름량'})[key] ?? key}: ${v.topPressure} hPa까지`)
  const times = crossSection?.availableTimes ?? []
  const timeIndex = times.findIndex(time => Number(time.hf) === Number(crossSection?.run?.hf))
  const groups = [
    [['moisture', '구름', '#9ca3af'], ['icing', '착빙', '#6684c4'], ['turbulence', '난류', '#d6a400']],
    [['wind', '바람깃', '#64748b'], ['isotachs', '등풍속선', '#64748b'], ['tropopause', '권계면·제트', '#7c3aed']],
    [['temp', '등온선', '#d64b4b'], ['advisories', 'SIGMET/AIRMET', '#dc2626']],
  ]
  const candidates = [...new Set((candidateAltitudes.length ? candidateAltitudes : (profile?.candidateProfiles ?? []).map(candidate => candidate.plannedCruiseAltitudeFt)).filter(Number.isFinite))].sort((a, b) => a - b)
  const highlightedAltitude = selectedCandidateAltitudeFt ?? effectiveAltitude
  const timeControl = <div className="vpc-time-control vpc-operational-nav vertical-profile-hour-nav" aria-label="예보시간 선택">
        {onSelectForecastHour && <button className="vpc-button" aria-label="이전 예보시간" disabled={!onSelectForecastHour || timeIndex <= 0 || crossSectionHourLoading} onClick={()=>onSelectForecastHour(times[timeIndex-1].hf)}><ChevronLeft size={15}/></button>}
        <strong>{crossSection?.run?.validTime ? formatBriefingTime(crossSection.run.validTime,tz,{withDate:true}).replace(/ KST$|Z$/, '') : '기상자료 없음'}</strong>
        {onSelectForecastHour && <button className="vpc-button" aria-label="다음 예보시간" disabled={!onSelectForecastHour || timeIndex < 0 || timeIndex >= times.length-1 || crossSectionHourLoading} onClick={()=>onSelectForecastHour(times[timeIndex+1].hf)}><ChevronRight size={15}/></button>}
        <button className="vpc-timezone" aria-label="표시 시간대 변경" onClick={()=>setTz(tz==='KST'?'UTC':'KST')}>{tz}</button>
        {crossSectionHourLoading && <span role="status">갱신 중 · 이전 자료</span>}
      </div>
  const layerControls = <>
        <div className="vpc-layer-controls" role="group" aria-label="기상 레이어">
          {groups.map((group,i)=><div className="vpc-layer-group" key={i}>{group.map(([key,label,tone])=>{
            const enabled = key === 'isotachs' ? isotachs : layers[key]
            return <button key={key} className={enabled ? 'is-on' : ''} aria-pressed={!!enabled} onClick={()=>toggle(key)}><span className="vpc-layer-check" style={{'--layer-tone':tone}}>{enabled && <Check size={10}/>}</span>{label}</button>
          })}</div>)}
        </div>
        <details className="vpc-operational-options"><summary>세부 설정</summary><div>
          <label><input type="checkbox" checked={!!layers.cloud} onChange={()=>toggle('cloud')}/>모델 구름량 윤곽</label>
          <label><input type="checkbox" checked={!!layers.temperatureDetail} onChange={()=>toggle('temperatureDetail')}/>−10°C 등온선 추가</label>
        </div></details>
      </>
  const zoomControls = <div className="vpc-chart-controls">
          <button className="vpc-button" aria-label="차트 축소" disabled={zoom<=1} onClick={()=>changeZoom(1/1.6)}>−</button><button className="vpc-button" aria-label="차트 확대" disabled={zoom>=total/45} onClick={()=>changeZoom(1.6)}>+</button><button className="vpc-button vpc-fit" onClick={()=>{anchor.current={fraction:0,pixel:0};setZoom(1);if(scrollRef.current)scrollRef.current.scrollLeft=0}}>전체</button>
        </div>
  const sourceInfo = <>
        <p>{crossSection?.run?.validTime ? `자료 기준 ${formatBriefingTime(crossSection.run.validTime,tz,{withDate:true})}` : '기상자료 없음'}</p>
        {sourceNote && <p>{sourceNote}</p>}
        <p>{coverageNotes.join(' · ')}</p><p>고도는 원자료 기준입니다. 자료가 없는 영역은 별도로 표시합니다.</p>
      </>
  // 지도형 브리핑 독: 시각·레이어·확대를 머리 한 줄에 펼쳐 두고, 범례는 그림 왼쪽 칸(고도 눈금 왼쪽)에 세로로.
  // 미니맵(위험 막대가 대신)·범례 줄·비교 고도 줄은 뺀다.
  const compactHeader = compact && <header className="vpc-compact-header">
      {compactTitle}
      {timeControl}
      {layerControls}
      {zoomControls}
      <span className="vpc-compact-spacer"/>
      {compactActions}
    </header>
  const compactLegend = compact && <div className="vpc-compact-legend">
      <ProfileLegend layers={chartLayers.current.value} turbulenceOpacity={0.3}/>
      <details className="vpc-compact-info"><summary>자료 정보</summary><div>{sourceInfo}</div></details>
    </div>
  return <div className={embedded ? `profile-embedded${fillContainer ? ' is-fill' : ''}` : 'vpc-overlay'}><section className={`vpc-window vpc-operational${embedded ? ' is-embedded' : ''}`} role={embedded ? 'group' : 'dialog'} aria-label="연직단면도"
    style={embedded ? undefined : {left:floating.rect.x, top:floating.rect.y, width:floating.rect.width, height:floating.rect.height}}>
    {compactHeader}
    {!compact && <header className="vpc-window-header" {...(embedded ? {} : floating.handlers('move'))}>
      {!embedded && <div className="vpc-window-title" tabIndex={0} aria-label="창 이동" onKeyDown={e=>floating.key(e,'move')}><Grip size={15}/><h1>연직단면도</h1>{previewLabel && <span className="vpc-demo" title={previewLabel}>시안 · 저장 자료</span>}</div>}
      {timeControl}
      {!embedded && <button className="vpc-button" aria-label="창 최대화 또는 복원" onClick={floating.toggleMaximize}><Maximize2 size={16}/></button>}
      {!embedded && <button className="vpc-button" aria-label="연직단면도 닫기" onClick={onClose}><X size={18}/></button>}
    </header>}
    {!compact && <details className="vpc-operational-controls" open={window.innerWidth >= 800 && window.innerHeight >= 650 ? true : undefined}>
      <summary>표시·고도 설정</summary>
      <div className="vpc-operational-toolbar">
        {layerControls}
        {zoomControls}
      </div>
    </details>}
    {!compact && candidates.length > 0 && <div className="vpc-altitude-comparison" role="group" aria-label="비교 고도">
      <span className="vpc-altitude-caption">{candidates.length > 1 ? '비교 고도' : '계획 고도'}</span>
      {candidates.map(ft => onSelectCandidateAltitude
        ? <button key={ft} type="button" className="vpc-altitude-choice" aria-pressed={ft === highlightedAltitude} disabled={crossSectionHourLoading} onClick={() => onSelectCandidateAltitude(ft)}>{ft === highlightedAltitude && <Check size={12}/>}<span>{ft.toLocaleString()} ft</span></button>
        : <span key={ft} className={`vpc-altitude-choice${ft === highlightedAltitude ? ' is-selected' : ''}`}>{ft === highlightedAltitude && <Check size={12}/>}<span>{ft.toLocaleString()} ft</span></span>)}
    </div>}
    {statusMessage && <div className="vpc-operational-status" role="status">{statusMessage}{retry && <button onClick={retry}>다시 시도</button>}</div>}
    {missingLayers.length > 0 && <div className="vpc-operational-status" role="status">자료 없음: {missingLayers.join(', ')}</div>}
    <div className="vpc-operational-body">
      {compactLegend}
      <VerticalProfileChart profile={normalizedProfile} crossSection={crossSection} referenceAltitudeFt={effectiveAltitude} advisories={advisories}
        layers={chartLayers.current.value} legendInToolbar selectedCandidateAltitudeFt={selectedCandidateAltitudeFt} candidateAltitudes={candidateAltitudes}
        nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={crossSectionHourLoading ? undefined : onSetWaypointNwpOffset} allowMissingTerrain={allowMissingTerrain} fitHeight
        highlightRangeNm={highlightRangeNm} linkedItems={linkedItems} activeLinkedItemId={activeLinkedItemId} onSelectLinkedItem={onSelectLinkedItem}
        hideMeta={compact} plotPaddingLeft={plotPaddingLeft} showWaypointRail={!compact}
        showComparisonProfiles interactive zoom={zoom} scrollElementRef={scrollRef} selectedMarkerId={selected?.id} onSelectMarker={selectMarker} enableDragScroll />
    </div>
    {!compact && <RouteOverview total={total} range={range} onRange={setRangeFromOverview} waypointCount={markers.length}/>}
    {!compact && <footer className="vpc-operational-footer">
      <ProfileLegend layers={chartLayers.current.value} turbulenceOpacity={0.3}/>
      <details className="vpc-operational-info"><summary>자료 정보 · ft</summary><div>
        {sourceInfo}
      </div></details>
    </footer>}
    {!embedded && !floating.maximized && <>{['n','s','e','w','ne','nw','sw'].map(edge=><div key={edge} className={`vpc-resize is-${edge}`} {...floating.handlers(edge)}/>)}<div className="vpc-resize is-se" tabIndex={0} role="group" aria-label="창 크기 조절" {...floating.handlers('se')} onKeyDown={e=>floating.key(e,'resize')}>◢</div></>}
  </section></div>
}
