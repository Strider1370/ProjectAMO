import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { BASEMAP_OPTIONS } from '../../map/mapConfig.js'
import { coordinatesForGrid } from '../lib/overlayUtils.js'
import { createTropopauseJetRenderer } from '../lib/tropopauseJetRenderer.js'
import { describeTropopauseJetPoint } from '../lib/tropopauseJetModel.js'
import { buildComparisonModels } from './comparisonModel.js'
import './TropopauseJetComparison.css'

const stamp = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + ' KST'
const images = new WeakMap()
function rasterUrl(raster) {
  if (images.has(raster)) return images.get(raster)
  const canvas = document.createElement('canvas'); canvas.width = raster.width; canvas.height = raster.height
  canvas.getContext('2d').putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0)
  const url = canvas.toDataURL('image/png'); images.set(raster, url); return url
}

function CompareMap({ side, model, field, registry, onMove, onReady, view, bands, label, summary }) {
  const container = useRef(null), renderer = useRef(null), mapRef = useRef(null), fieldRef = useRef(field)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  fieldRef.current = field
  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN
    if (!token) { setError('로컬 지도 토큰 설정을 확인해 주세요.'); return undefined }
    const base = BASEMAP_OPTIONS[0]
    const map = new mapboxgl.Map({ container: container.current, accessToken: token, style: base.style,
      config: { basemap: base.config }, projection: 'mercator', center: [125, 33], zoom: 3.2,
      attributionControl: true, dragRotate: false, pitchWithRotate: false, fadeDuration: 0 })
    mapRef.current = map; registry.current[side] = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    const move = () => onMove(side, map)
    map.on('move', move)
    map.on('load', () => {
      renderer.current = createTropopauseJetRenderer(map)
      setReady(true); onReady(side)
    })
    map.on('error', event => { if (!map.isStyleLoaded()) setError(event.error?.message ?? '지도를 불러오지 못했습니다.') })
    map.on('click', event => {
      const report = fieldRef.current && describeTropopauseJetPoint(fieldRef.current, event.lngLat.lng, event.lngLat.lat)
      if (!report) return
      const text = document.createElement('div')
      const trop = report.tropopause
      text.textContent = `원자료 권계면 ${trop.aboveTop ? '모델 상단 이상' : trop.unavailable ? '확인 불가' : `FL${trop.flightLevel}`} · 최대풍 ${Math.round(report.maxWind.speedKt)}kt / FL${report.maxWind.flightLevel}`
      new mapboxgl.Popup().setLngLat(event.lngLat).setDOMContent(text).addTo(map)
    })
    return () => { renderer.current?.destroy(); renderer.current = null; delete registry.current[side]; map.remove(); mapRef.current = null }
  }, [side, registry, onMove, onReady])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (!model) {
      renderer.current?.setModel(null)
      if (map.getLayer('comparison-tropopause-fill')) map.setLayoutProperty('comparison-tropopause-fill', 'visibility', 'none')
      return
    }
    const image = { url: rasterUrl(model.raster), coordinates: coordinatesForGrid(model.grid) }
    const source = map.getSource('comparison-tropopause')
    if (source) { source.updateImage(image); map.setLayoutProperty('comparison-tropopause-fill', 'visibility', 'visible') }
    else {
      map.addSource('comparison-tropopause', { type: 'image', ...image })
      map.addLayer({ id: 'comparison-tropopause-fill', type: 'raster', source: 'comparison-tropopause', slot: 'middle',
        paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } })
    }
    renderer.current?.setModel(model)
  }, [model, ready])
  useEffect(() => {
    if (!ready) return
    const frame = requestAnimationFrame(() => { mapRef.current?.resize(); if (mapRef.current) onMove(side, mapRef.current) })
    return () => cancelAnimationFrame(frame)
  }, [view, ready, side, onMove])
  return <section className={`tjc-map-panel tjc-${side}`} aria-label={label}>
    <div className="tjc-panel-title"><strong>{label}</strong><span>{summary}</span></div>
    <div className="tjc-map" ref={container} data-testid={`comparison-map-${side}`} />
    {error && <p className="tjc-map-error" role="alert">{error}</p>}
    <div className="tjc-legend" aria-label={`${label} 권계면 범례`}>
      <span>권계면 FL</span>{bands?.map(band => <span key={band.to}><i style={{ background: band.color }} />{band.label}</span>)}<span>450 이상 무색</span>
    </div>
  </section>
}

export default function TropopauseJetComparison() {
  const [manifest, setManifest] = useState(null), [selected, setSelected] = useState(null), [field, setField] = useState(null)
  const [error, setError] = useState(''), [pending, setPending] = useState(true)
  const [fiveThousand, setFiveThousand] = useState(true), [cleanJets, setCleanJets] = useState(true), [showHidden, setShowHidden] = useState(false)
  const [view, setView] = useState('split'), [readyMaps, setReadyMaps] = useState({})
  const maps = useRef({}), syncing = useRef(false)
  useEffect(() => {
    window.__tropopauseComparisonMaps = maps.current
    return () => { delete window.__tropopauseComparisonMaps }
  }, [])
  const onReady = useCallback(side => setReadyMaps(value => ({ ...value, [side]: true })), [])
  const onMove = useCallback((side, map) => {
    if (syncing.current) return
    const other = maps.current[side === 'current' ? 'proposed' : 'current']
    if (!other || !other.isStyleLoaded()) return
    syncing.current = true
    other.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() })
    syncing.current = false
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    fetch('/__local_tropopause/index.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('로컬 비교 자료가 없습니다. 운영 자료 사본을 먼저 준비해 주세요.')
      return response.json()
    }).then(value => { setManifest(value); setSelected(value.cases.find(item => item.hf === 10) ?? value.cases[0]) })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setPending(false) } })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!selected) return undefined
    const controller = new AbortController()
    setPending(true); setError(''); setField(null)
    fetch(`/__local_tropopause/${selected.filename}`, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('선택한 운영 자료 사본을 읽지 못했습니다.')
      return response.json()
    }).then(value => {
      if (value.time.tmfc !== selected.tmfc || value.time.hf !== selected.hf || value.revision !== selected.revision) throw new Error('비교 자료의 시각·판본이 일치하지 않습니다.')
      setField(value); setPending(false)
    }).catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setPending(false) } })
    return () => controller.abort()
  }, [selected])
  const models = useMemo(() => field ? buildComparisonModels(field) : null, [field])
  const proposed = useMemo(() => models ? { ...models.proposed, key: `${models.proposed.key}:${fiveThousand}:${cleanJets}:${showHidden}`,
    raster: fiveThousand ? models.proposed.raster : models.current.raster,
    edges: fiveThousand ? models.proposed.edges : models.current.edges,
    jets: cleanJets ? models.proposed.jets : models.current.jets,
    declutter: cleanJets, cores: cleanJets ? models.selection.cores : [],
    hiddenJets: cleanJets && showHidden ? models.selection.rejected.filter(item => item.jet.axisShown).map(item => item.jet) : [],
  } : null, [models, fiveThousand, cleanJets, showHidden])
  const preset = (center, zoom) => {
    const map = maps.current.current
    if (map) { map.jumpTo({ center, zoom: zoom + (view === 'split' ? 0 : 1) }); onMove('current', map) }
  }
  const stats = models?.selection.stats
  const available = Boolean(models && readyMaps.current && readyMaps.proposed)
  return <main className={`tjc-page tjc-view-${view}`} data-ready={available ? 'true' : 'false'}>
    <header className="tjc-header">
      <div><h1>권계면·제트 표시 비교</h1><p>같은 KIM 운영 자료로 비교합니다. 지도를 움직이거나 확대하면 두 화면이 함께 움직입니다.</p></div>
      <label>유효시각<select aria-label="비교 유효시각" disabled={!manifest || pending} value={selected?.filename ?? ''}
        onChange={event => setSelected(manifest.cases.find(item => item.filename === event.target.value))}>
        {manifest?.cases.map(item => <option key={item.filename} value={item.filename}>{stamp(item.validTime)} · F{String(item.hf).padStart(3, '0')}</option>)}
      </select></label>
    </header>
    <div className="tjc-toolbar">
      <div className="tjc-switches"><label><input type="checkbox" checked={fiveThousand} onChange={event => setFiveThousand(event.target.checked)} />권계면 5,000ft</label>
        <label><input type="checkbox" checked={cleanJets} onChange={event => setCleanJets(event.target.checked)} />제트 축 정리</label>
        <label><input type="checkbox" checked={showHidden} disabled={!cleanJets} onChange={event => setShowHidden(event.target.checked)} />숨긴 축 확인</label></div>
      <div className="tjc-presets"><button onClick={() => preset([125, 33], 3.2)}>동아시아</button><button onClick={() => preset([127, 37], 5.2)}>한반도</button><button onClick={() => preset([120, 39.5], 4.8)}>짧은 축 밀집 구역</button></div>
      <div className="tjc-views" role="group" aria-label="비교 화면 배치">{[['split', '나란히'], ['current', '기존 크게'], ['proposed', '제안 크게']].map(([key, text]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{text}</button>)}</div>
    </div>
    <p className="tjc-source" role="status">{error || (pending ? '운영 자료 사본을 불러오는 중…' : field ? `발표 ${stamp(`${field.time.tmfc.slice(0, 4)}-${field.time.tmfc.slice(4, 6)}-${field.time.tmfc.slice(6, 8)}T${field.time.tmfc.slice(8, 10)}:00:00Z`)} · 유효 ${stamp(field.time.validTime)} · 로컬 사본 고정 · 지도 클릭: 원자료 값` : '')}</p>
    <div className="tjc-maps">
      <CompareMap side="current" model={models?.current} field={field} registry={maps} onMove={onMove} onReady={onReady} view={view}
        bands={models?.currentBands} label="기존 표시" summary={models ? `제트 축 ${models.current.jets.length}개 · FL300/340/380/420/450` : '준비 중'} />
      <CompareMap side="proposed" model={proposed} field={field} registry={maps} onMove={onMove} onReady={onReady} view={view}
        bands={fiveThousand ? models?.proposedBands : models?.currentBands} label="제안 표시" summary={stats ? `제트 축 ${cleanJets ? stats.axes : stats.original}개${cleanJets ? ` · 짧은 강풍 중심 ${stats.cores}개(확대 시)` : ''}` : '준비 중'} />
    </div>
    {stats && <details className="tjc-diagnostics"><summary>제트 판정표 · 기존 {stats.original}개 → 축 {stats.axes}개 + 강풍 중심 {stats.cores}개 · 연결 {stats.joined}건</summary>
      <p>축 500km 이상 유지 · 300~500km는 독립적인 120kt 이상 중심만 유지 · 연결은 100km / 방향 25° / 고도 3,000ft 이내 및 연결 구간 80kt 이상 · 강풍 중심은 확대 수준 4.5부터 표시</p>
      <div><table><thead><tr><th>축 길이</th><th>최대풍</th><th>표시 제외 이유</th></tr></thead><tbody>{models.selection.rejected.filter(item => item.jet.axisShown).map((item, i) => <tr key={i}><td>{Math.round(item.jet.lengthKm)}km</td><td>{item.jet.core.speedKt}kt</td><td>{item.reason}</td></tr>)}</tbody></table></div>
      <small>사본 수신 {stamp(manifest.capturedAt)} · 원자료 SHA-256: {selected.sha256} · 운영 서비스 표시·계산은 변경하지 않았습니다.</small>
    </details>}
  </main>
}
