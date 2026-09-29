import { useEffect, useMemo, useRef, useState } from 'react'
import series from './fixtures/wafs-sigwx-series.json'
import './WafsSigwxSample.css'
import { createWafsChartRenderer, chartSymbolUrl } from './lib/wafsChartRenderer.js'

import { chartColor, wafsChartPalette } from './lib/wafsChartPalette.js'

import { HAZARD_SOURCE, HAZARD_LAYER, selectHazardFill } from './lib/wafsHazardFill.js'

import { installHighLayers as install, HIGH_LAYERS as LAYERS, HIGH_SOURCE as SOURCE } from './lib/sigwxHighLayers.js'
import { HIGH_TYPES as TYPES } from './lib/sigwxHighModel.js'
const BOUNDS = [[75, -20], [170, 70]]
const RUNS = [...new Set(series.frames.map(frame => frame.metadata.baseTime))].sort()

function stamp(value, tz) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)) + ` ${tz}`
}

function heightText(value) {
  if (!value) return '미제공'
  if (value.includes('inapplicable')) return '해당 없음'
  if (value.startsWith('?')) return '알 수 없음'
  return value
}

function SelectionDetails({ selection, onClose, onChoose, palette }) {
  const active = selection.items?.find(p => p.objectId === selection.activeId)
  return <div className="wafs-sample__selection" aria-label="WAFS 선택 상세">
    <div className="wafs-sample__header">
      <strong>{active ? `선택 위치의 난류·착빙 ${selection.items.length}개` : selection.label}</strong>
      <button type="button" aria-label="WAFS 상세 닫기" onClick={onClose}>닫기</button>
    </div>
    {active ? <>
      <div className="wafs-sample__area-list" aria-label="겹친 현상">
        {selection.items.map(p => <button type="button" key={p.objectId} aria-pressed={p.objectId === selection.activeId}
          onClick={() => onChoose(p.objectId)} style={{ '--hazard-color': chartColor(p, palette) }}>
          <img src={chartSymbolUrl(p)} alt="" />
          <span><strong>{p.severity} {p.phenomenon === 'TURBULENCE' ? '난류' : '착빙'}</strong>
            <small>하한 {heightText(p.lower)} · 상한 {heightText(p.upper)}</small></span>
        </button>)}
      </div>
      <p>선택한 영역의 면색을 강조합니다. 고도 범위를 함께 확인하세요.</p>
      <details><summary>원본 속성</summary><pre>{active.details}</pre></details>
    </> : <pre>{selection.details || selection.phenomenon}</pre>}
  </div>
}

export default function WafsSigwxSample({ mapRef, isStyleReady, styleRevision, tz, basemapId }) {
  const palette = wafsChartPalette(basemapId)
  const types = TYPES.map(type => ({ ...type, color: chartColor({ phenomenon: type.id, severity: 'SEV' }, palette) }))
  const [run, setRun] = useState(RUNS[0])
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const runFrames = useMemo(() => series.frames.filter(frame => frame.metadata.baseTime === run), [run])
  const sample = runFrames[frameIndex]
  const [visible, setVisible] = useState(true)
  const [enabled, setEnabled] = useState(() => Object.fromEntries(TYPES.map(type => [type.id, true])))
  const [selection, setSelection] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(() => !window.matchMedia('(max-width: 719px)').matches)
  const [problem, setProblem] = useState(null)
  const previousCameraLimits = useRef(null)
  const renderer = useRef(null)
  const data = useMemo(() => ({ type: 'FeatureCollection',
    metadata: sample.metadata,
    areas: visible ? (sample.areas || []).filter(area => enabled[area.phenomenon]) : [],
    features: visible ? sample.features.filter(feature => enabled[feature.properties.phenomenon]) : [],
  }), [visible, enabled, sample])
  const count = new Set(data.features.map(feature => feature.properties.objectId)).size

  useEffect(() => {
    setSelection(null)
  }, [sample.metadata.frameId])

  useEffect(() => {
    if (!playing || !visible) return undefined
    const timer = window.setInterval(() => setFrameIndex(index => (index + 1) % runFrames.length), 1500)
    return () => window.clearInterval(timer)
  }, [playing, visible, runFrames.length])

  useEffect(() => { renderer.current?.redraw() }, [filtersOpen, collapsed, selection])

  useEffect(() => {
    if (selection) setCollapsed(false)
  }, [selection])

  function selectFrame(index) {
    setPlaying(false)
    setFrameIndex(index)
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    try {
      if (previousCameraLimits.current && map.getProjection()?.name !== 'mercator') map.setProjection('mercator')
      install(map, data, palette)
      if (!renderer.current) renderer.current = createWafsChartRenderer(map, setProblem)
      renderer.current.setData(data, palette)
      setProblem(null)
    } catch (error) { setProblem(error.message) }
  }, [mapRef, isStyleReady, styleRevision, data, palette])

  useEffect(() => {
    if (!mapRef.current || !isStyleReady) return
    const id = selection?.frameId === sample.metadata.frameId ? selection.activeId : null
    renderer.current?.selectArea(id)
    selectHazardFill(mapRef.current, id, palette)
  }, [mapRef, selection, sample.metadata.frameId, isStyleReady, styleRevision, palette, data])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || previousCameraLimits.current) return
    previousCameraLimits.current = { bounds: map.getMaxBounds()?.toArray(), minZoom: map.getMinZoom(), projection: map.getProjection() }
    map.setProjection('mercator')
    map.setMinZoom(1)
    // A tight maxBounds forces a minimum zoom that can crop this tall region.
    // fitBounds shows the entire sample; restore the normal limits on unmount.
    map.setMaxBounds(null)
    map.fitBounds(BOUNDS, { padding: 40, duration: 0 })
  }, [mapRef, isStyleReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined
    const click = event => {
      const annotation = renderer.current?.hitTest(event.point)
      if (annotation) {
        setSelection({ ...annotation.properties, frameId: sample.metadata.frameId }); return
      }
      const areas = renderer.current?.hitAreas(event.point) || []
      if (areas.length) {
        setPlaying(false)
        setFiltersOpen(false)
        setSelection({ items: areas.map(f => f.properties), activeId: areas[0].properties.objectId, frameId: sample.metadata.frameId })
        return
      }
      const layers = LAYERS.filter(id => map.getLayer(id))
      if (!layers.length) return
      const { x, y } = event.point
      const hits = map.queryRenderedFeatures([[x - 4, y - 4], [x + 4, y + 4]], { layers })
      setSelection(hits[0] ? { ...hits[0].properties, frameId: sample.metadata.frameId } : null)
    }
    map.on('click', click)
    return () => map.off('click', click)
  }, [mapRef, isStyleReady, styleRevision, sample.metadata.frameId])

  useEffect(() => () => {
    const map = mapRef.current
    renderer.current?.destroy()
    renderer.current = null
    if (!map) return
    for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    if (map.getLayer(HAZARD_LAYER)) map.removeLayer(HAZARD_LAYER)
    if (map.getSource(HAZARD_SOURCE)) map.removeSource(HAZARD_SOURCE)
    const limits = previousCameraLimits.current
    if (limits) {
      map.setMaxBounds(limits.bounds || null)
      map.setMinZoom(limits.minZoom)
      map.setProjection(limits.projection)
      previousCameraLimits.current = null
    }
  }, [mapRef])

  return (
    <section className={`wafs-sample${filtersOpen ? ' is-open' : ''}${selection ? ' has-selection' : ''}${collapsed ? ' is-collapsed' : ''}`} aria-label="WAFS SIGWX 샘플">
      <div className="wafs-sample__header">
        <strong>WAFS SIGWX · 샘플</strong>
        <label><input type="checkbox" checked={visible} onChange={event => {
          setVisible(event.target.checked); setPlaying(false); setSelection(null)
        }} />표시</label>
        <button type="button" aria-label={collapsed ? 'WAFS 샘플 펼치기' : 'WAFS 샘플 접기'}
          aria-expanded={!collapsed} aria-controls="wafs-sample-body" onClick={() => setCollapsed(value => !value)}>
          {collapsed ? '펼치기' : '접기'}
        </button>
      </div>
      <div id="wafs-sample-body" hidden={collapsed}>
      <p>유효 {stamp(sample.metadata.validTime, tz)}</p>
      <p className="wafs-sample__note">과거 샘플 · 차트 표현 시험 중</p>
      <div className="wafs-sample__time">
        <label htmlFor="wafs-sample-run">예보 기준시각</label>
        <select id="wafs-sample-run" value={run} onChange={event => {
          setPlaying(false); setRun(event.target.value); setFrameIndex(0)
        }}>
          {RUNS.map(value => <option key={value} value={value}>{stamp(value, tz)}</option>)}
        </select>
        <div className="wafs-sample__actions">
          <button type="button" aria-label="WAFS 이전 시간" disabled={frameIndex === 0} onClick={() => selectFrame(frameIndex - 1)}>이전</button>
          <button type="button" disabled={!visible} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? '일시정지' : '시간 변화 재생'}</button>
          <button type="button" aria-label="WAFS 다음 시간" disabled={frameIndex === runFrames.length - 1} onClick={() => selectFrame(frameIndex + 1)}>다음</button>
        </div>
        <label htmlFor="wafs-sample-hour">T+{String(sample.metadata.forecastHour).padStart(2, '0')} · {frameIndex + 1}/{runFrames.length} · 3시간 간격</label>
        <input id="wafs-sample-hour" type="range" min="0" max={runFrames.length - 1} step="1" value={frameIndex}
          aria-label="WAFS 예보시간" aria-valuetext={`T+${sample.metadata.forecastHour}, ${stamp(sample.metadata.validTime, tz)}`}
          onChange={event => selectFrame(Number(event.target.value))} />
        {!sample.metadata.counts.TROPICAL_CYCLONE && <p>이 시간 샘플에는 태풍 객체가 없습니다.</p>}
      </div>
      {selection && <SelectionDetails palette={palette} selection={selection} onClose={() => setSelection(null)}
        onChoose={activeId => setSelection(previous => ({ ...previous, activeId }))} />}
      <button type="button" className="wafs-sample__summary" aria-expanded={filtersOpen}
        aria-controls="wafs-sample-filters" onClick={() => setFiltersOpen(open => !open)}>
        {filtersOpen ? '▾' : '▸'} 현상 {count}개 · 필터
      </button>
      {filtersOpen && <div id="wafs-sample-filters" className="wafs-sample__controls">
        <div className="wafs-sample__types">
          {types.map(type => <label key={type.id}>
            <input type="checkbox" checked={enabled[type.id]} onChange={event => {
              setEnabled(previous => ({ ...previous, [type.id]: event.target.checked })); setSelection(null)
            }} />
            <span className={`wafs-sample__swatch${type.fill ? ' is-fill' : ''}`} style={{ borderColor: type.color, backgroundColor: type.fill ? type.color : undefined, borderStyle: type.dash ? 'dashed' : 'solid' }} />
            {type.label} {sample.metadata.counts[type.id] || 0}
          </label>)}
        </div>
        <div className="wafs-sample__actions">
          <button type="button" onClick={() => mapRef.current?.fitBounds(BOUNDS, { padding: 40, duration: 500 })}>FIR 전체 범위</button>
          <button type="button" onClick={() => mapRef.current?.fitBounds([[115, 20], [150, 48]], { padding: 50, duration: 500 })}>한·중·일 확대</button>
        </div>
        <div className="wafs-sample__legend" style={{ '--wafs-legend-bg': palette.background }}>
          <span className="wafs-sample__cloud-key" style={{ color: palette.cloud }}>⌒ CB · OCNL / FRQ</span>
          {Object.entries(palette.hazards).flatMap(([kind, style]) => ['MOD', 'SEV'].map(severity =>
            <span className="wafs-sample__hazard-key" key={`${kind}-${severity}`}>
              <i aria-hidden="true"><b style={{ backgroundColor: style[severity], opacity: style.opacity }} /></i>
              {severity} {kind === 'TURBULENCE' ? '난류' : '착빙'}
            </span>))}
          <span>제트 깃발 50kt · 긴 깃털 10kt · 짧은 깃털 5kt</span>
        </div>
        <p>난류·착빙은 면색으로 표시합니다. 영역을 눌러 강도·고도를 확인하세요.</p>
        <p className="wafs-sample__credit">기호: <a href="https://github.com/OGCMetOceanDWG/WorldWeatherSymbols" target="_blank" rel="noreferrer">OGC / WMO·ICAO</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · 색상·크기 조정</p>
      </div>}
      {problem && <p role="alert">표시 오류: {problem}</p>}
      </div>
    </section>
  )
}
