import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { distanceNm, pathLengthNm, trueBearing, magneticBearing, ringPolygon } from './geo.js'

// 측정 도구(좌표/거리/반경/방위/고도) 공용 오버레이. 폴리곤은 별도(usePolygonDraw).
// 한 번에 한 도구만 활성이며, 지도 클릭 핸들러는 활성 도구가 측정 도구일 때만 동작한다.
export const MEASURE_TOOLS = ['coordinate', 'distance', 'radius', 'bearing', 'elevation']
const MEASURE_SET = new Set(MEASURE_TOOLS)
const ACCENT = '#2563eb'
const SRC = 'mt-measure'
const L_FILL = 'mt-ring-fill'
const L_OUTLINE = 'mt-ring-outline'
const L_PATH = 'mt-path'
const L_POINTS = 'mt-points'

const LAYERS = [
  { id: L_FILL, type: 'fill', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ACCENT, 'fill-opacity': 0.08 } },
  { id: L_OUTLINE, type: 'line', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': ACCENT, 'line-width': 2, 'line-dasharray': [2, 1.5] } },
  { id: L_PATH, type: 'line', filter: ['==', '$type', 'LineString'], paint: { 'line-color': ACCENT, 'line-width': 2.5, 'line-join': 'round' } },
  { id: L_POINTS, type: 'circle', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2.5, 'circle-stroke-color': ACCENT } },
]

const fmtNm = (nm) => `${nm.toFixed(nm < 10 ? 2 : 1)} nm`

export function useMeasureOverlay(map, activeTool, panelOpen) {
  const toolRef = useRef(activeTool)
  const panelOpenRef = useRef(panelOpen)
  const stRef = useRef({ verts: [], mouse: null, center: null, rings: [], point: null, done: false, dragging: false, dragRadius: 0 })
  const mapRef = useRef(null)
  const labelsRef = useRef([])

  const [coord, setCoord] = useState(null)          // {lng,lat}
  const [distance, setDistance] = useState(null)    // {totalNm, segsNm:[], count}
  const [distanceDone, setDistanceDone] = useState(false)
  const [bearingInfo, setBearingInfo] = useState(null) // {mn,tn,nm}
  const [center, setCenter] = useState(null)        // {lng,lat}
  const [rings, setRings] = useState([])            // [nm,...]
  const [elevation, setElevation] = useState(null)  // {ft, loading, error, lng, lat}

  useEffect(() => { toolRef.current = activeTool }, [activeTool])
  useEffect(() => { panelOpenRef.current = panelOpen }, [panelOpen])

  // ── 렌더: refs → 지도 소스 + DOM 라벨 ──────────────────────────────────
  function clearLabels() {
    labelsRef.current.forEach((m) => m.remove())
    labelsRef.current = []
  }
  function setLabels(m, labels) {
    clearLabels()
    for (const { lnglat, text } of labels) {
      const el = document.createElement('div')
      el.className = 'mt-label'
      el.textContent = text
      labelsRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'left', offset: [8, 0] }).setLngLat(lnglat).addTo(m))
    }
  }
  function render() {
    const m = mapRef.current
    const src = m?.getSource(SRC)
    if (!src) return
    const st = stRef.current
    const tool = toolRef.current
    const features = []
    const labels = []

    if (tool === 'coordinate' && st.point) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: st.point }, properties: {} })
    }
    if (tool === 'elevation' && st.point) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: st.point }, properties: {} })
    }
    if (tool === 'distance') {
      const coords = st.mouse ? [...st.verts, st.mouse] : [...st.verts]
      if (coords.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
      for (const v of st.verts) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: {} })
      if (st.verts.length >= 1) {
        const shown = st.mouse ? [...st.verts, st.mouse] : st.verts
        const total = pathLengthNm(shown)
        if (shown.length >= 2) labels.push({ lnglat: shown[shown.length - 1], text: `Σ ${fmtNm(total)}` })
      }
    }
    if (tool === 'bearing') {
      const coords = st.verts.length === 1 && st.mouse ? [st.verts[0], st.mouse] : [...st.verts]
      if (coords.length >= 2) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
        const a = coords[0]; const b = coords[1]
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        labels.push({ lnglat: mid, text: `MN ${Math.round(magneticBearing(a, b))}° / TN ${Math.round(trueBearing(a, b))}°` })
      }
      for (const v of st.verts) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: {} })
    }
    if (tool === 'radius' && st.center) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: st.center }, properties: {} })
      for (const nm of st.rings) {
        features.push(ringPolygon(st.center, nm))
        // 라벨은 원 정북 방향(위쪽) 가장자리에 반경 표기
        labels.push({ lnglat: [st.center[0], st.center[1] + nm * 1.852 / 111], text: fmtNm(nm) })
      }
      // 드래그 중인 미확정 원(실시간 미리보기)
      if (st.dragging && st.dragRadius > 0) {
        features.push(ringPolygon(st.center, st.dragRadius))
        labels.push({ lnglat: [st.center[0], st.center[1] + st.dragRadius * 1.852 / 111], text: fmtNm(st.dragRadius) })
      }
    }
    src.setData({ type: 'FeatureCollection', features })
    setLabels(m, labels)
  }

  // ── 지도 소스/레이어 설치 (map 교체 시 재설치) ───────────────────────────
  useEffect(() => {
    if (!map) return undefined
    mapRef.current = map
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      for (const l of LAYERS) map.addLayer({ ...l, slot: 'top', source: SRC })
    }

    function onClick(e) {
      const tool = toolRef.current
      if (!panelOpenRef.current || !MEASURE_SET.has(tool)) return
      const p = [e.lngLat.lng, e.lngLat.lat]
      const st = stRef.current
      if (tool === 'coordinate') {
        st.point = p; setCoord({ lng: p[0], lat: p[1] }); render()
      } else if (tool === 'elevation') {
        st.point = p; render(); fetchElevation(p)
      } else if (tool === 'distance') {
        // 완료 상태에서 다시 클릭하면 새 측정 시작.
        if (st.done) { st.verts = []; st.mouse = null; st.done = false; setDistanceDone(false) }
        // 더블클릭(두 번째 클릭 detail>=2)으로 완료 — 데스크톱용. 터치는 패널 "측정 완료" 버튼 사용.
        if (e.originalEvent.detail >= 2 && st.verts.length >= 2) { finishDistance(); return }
        st.verts.push(p); syncDistance(); render()
      } else if (tool === 'bearing') {
        if (st.verts.length >= 2) st.verts = []
        st.verts.push(p); syncBearing(); render()
      }
      // radius는 click이 아니라 mousedown/드래그로 처리(아래).
    }
    // 반경 드래그: 중심 누르고 끌면 그 거리만큼 원. 떼면 확정(움직임이 거의 없으면 중심만 지정).
    function onMouseDown(e) {
      if (!panelOpenRef.current || toolRef.current !== 'radius') return
      const st = stRef.current
      st.center = [e.lngLat.lng, e.lngLat.lat]
      st.dragging = true; st.dragRadius = 0
      setCenter({ lng: st.center[0], lat: st.center[1] })
      render()
    }
    function onMouseUp() {
      if (toolRef.current !== 'radius') return
      const st = stRef.current
      if (!st.dragging) return
      st.dragging = false
      if (st.dragRadius > 0.1) { st.rings = [...st.rings, st.dragRadius].sort((a, b) => a - b); setRings([...st.rings]) }
      st.dragRadius = 0
      render()
    }
    function onMouseMove(e) {
      const tool = toolRef.current
      if (!panelOpenRef.current) return
      const st = stRef.current
      if (tool === 'radius') {
        if (!st.dragging || !st.center) return
        st.dragRadius = distanceNm(st.center, [e.lngLat.lng, e.lngLat.lat])
        render()
        return
      }
      if (tool !== 'distance' && tool !== 'bearing') return
      if (st.verts.length === 0 || st.done) return
      if (tool === 'bearing' && st.verts.length >= 2) return
      st.mouse = [e.lngLat.lng, e.lngLat.lat]
      render()
    }

    map.on('click', onClick)
    map.on('mousedown', onMouseDown)
    map.on('mouseup', onMouseUp)
    map.on('mousemove', onMouseMove)
    render()

    return () => {
      map.off('click', onClick)
      map.off('mousedown', onMouseDown)
      map.off('mouseup', onMouseUp)
      map.off('mousemove', onMouseMove)
      clearLabels()
      try {
        for (const l of LAYERS) if (map.getLayer(l.id)) map.removeLayer(l.id)
        if (map.getSource(SRC)) map.removeSource(SRC)
      } catch { /* map already torn down */ }
      mapRef.current = null
    }
  }, [map])

  // 도구 전환 시 진행 상태 초기화 (새 도구는 깨끗하게 시작).
  useEffect(() => {
    stRef.current = { verts: [], mouse: null, center: null, rings: [], point: null, done: false, dragging: false, dragRadius: 0 }
    setCoord(null); setDistance(null); setDistanceDone(false); setBearingInfo(null); setCenter(null); setRings([]); setElevation(null)
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])

  // 패널 열림 + 도구 선택 시 커서를 십자(모드 표시). 어떤 도구든 적용 — 폴리곤 포함.
  // dcz(거리)·dragPan(반경)은 측정 도구만 관리한다. 폴리곤의 커서/더블클릭은 usePolygonDraw가 자체 관리.
  useEffect(() => {
    if (!map) return undefined
    const active = panelOpen && !!activeTool
    map.getCanvas().style.cursor = active ? 'crosshair' : ''
    if (MEASURE_SET.has(activeTool)) {
      if (active && activeTool === 'distance') map.doubleClickZoom.disable(); else map.doubleClickZoom.enable()
      if (active && activeTool === 'radius') map.dragPan.disable(); else map.dragPan.enable()
    }
    return () => {
      if (!map) return
      map.getCanvas().style.cursor = ''
      if (MEASURE_SET.has(activeTool)) { map.doubleClickZoom.enable(); map.dragPan.enable() }
    }
  }, [map, activeTool, panelOpen])

  function syncDistance() {
    const v = stRef.current.verts
    const segs = []
    for (let i = 1; i < v.length; i += 1) segs.push(distanceNm(v[i - 1], v[i]))
    setDistance({ totalNm: pathLengthNm(v), segsNm: segs, count: v.length })
  }
  function finishDistance() {
    const st = stRef.current
    if (st.verts.length < 2) return
    st.done = true; st.mouse = null
    setDistanceDone(true); syncDistance(); render()
  }
  function syncBearing() {
    const v = stRef.current.verts
    if (v.length < 2) { setBearingInfo(null); return }
    const [a, b] = v
    setBearingInfo({ mn: magneticBearing(a, b), tn: trueBearing(a, b), nm: distanceNm(a, b) })
  }

  async function fetchElevation(p) {
    setElevation({ loading: true, lng: p[0], lat: p[1] })
    try {
      const res = await fetch(`/api/terrain/elevation?lat=${p[1]}&lng=${p[0]}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.elevationM == null) { setElevation({ ft: null, lng: p[0], lat: p[1] }); return }
      setElevation({ ft: data.elevationM * 3.28084, lng: p[0], lat: p[1] })
    } catch (err) {
      setElevation({ error: err.message, lng: p[0], lat: p[1] })
    }
  }

  // ── 패널이 호출하는 액션들 ────────────────────────────────────────────
  function clear() {
    stRef.current = { verts: [], mouse: null, center: null, rings: [], point: null, done: false, dragging: false, dragRadius: 0 }
    setCoord(null); setDistance(null); setDistanceDone(false); setBearingInfo(null); setCenter(null); setRings([]); setElevation(null)
    render()
  }
  function undoVertex() {
    const st = stRef.current
    if (st.verts.length === 0) return
    st.verts.pop()
    if (toolRef.current === 'bearing') syncBearing(); else syncDistance()
    render()
  }
  function addRing(nm) {
    const st = stRef.current
    if (!(nm > 0)) return
    st.rings = [...st.rings, nm].sort((a, b) => a - b)
    setRings([...st.rings])
    render()
  }
  function removeRing(nm) {
    const st = stRef.current
    st.rings = st.rings.filter((r) => r !== nm)
    setRings([...st.rings])
    render()
  }

  return {
    coord, distance, distanceDone, bearingInfo, center, rings, elevation,
    clear, undoVertex, finishDistance, addRing, removeRing,
  }
}
