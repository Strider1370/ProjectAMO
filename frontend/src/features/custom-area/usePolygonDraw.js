import { useEffect, useRef, useState } from 'react'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'

// slot: 'top' keeps these above Mapbox Standard's own theme layers (e.g. the
// monochrome/dark basemap otherwise paints over unslotted custom layers) — same
// convention as useFirTickOverlay.js.
const DEFAULT_COLOR = '#2563eb'

// 사용자가 그리기 색으로 고를 수 있는 후보. 레이더 에코(초록~노랑~빨강 계열)와 겹쳐도
// 구별되도록 다양한 색상을 제공한다. checkColor는 스와치 위에 얹는 체크마크 대비색.
export const COLOR_OPTIONS = [
  { label: '빨강', value: '#ef4444', checkColor: '#ffffff' },
  { label: '파랑', value: DEFAULT_COLOR, checkColor: '#ffffff' },
  { label: '연두', value: '#84cc16', checkColor: '#111827' },
  { label: '주황', value: '#f97316', checkColor: '#ffffff' },
  { label: '노랑', value: '#eab308', checkColor: '#111827' },
  { label: '핑크', value: '#ec4899', checkColor: '#ffffff' },
  { label: '갈색', value: '#92400e', checkColor: '#ffffff' },
  { label: '하늘색', value: '#0ea5e9', checkColor: '#ffffff' },
  { label: '검정', value: '#000000', checkColor: '#ffffff' },
]

// 완성된 폴리곤은 finalize() 시점에 properties.color를 함께 저장하므로, 폴리곤마다
// 그릴 당시 고른 색을 유지한다. color가 없는(과거 세션에서 만든) feature는 DEFAULT_COLOR로 폴백.
// mapbox-gl-draw는 `userProperties: true`일 때만 커스텀 속성을 렌더링용 feature에 노출하며,
// 이때 내부 draw 전용 속성(active/mode 등)과 충돌을 피하려고 `user_` 접두사를 붙인다 — 그래서
// draw가 그리는 레이어(fill-active/stroke)는 'user_color'를, 우리가 직접 관리하는 preview
// 소스는(접두사 없이) 'color'를 읽는다.
const DRAW_FEATURE_COLOR_EXPR = ['coalesce', ['get', 'user_color'], DEFAULT_COLOR]
const PREVIEW_FEATURE_COLOR_EXPR = ['coalesce', ['get', 'color'], DEFAULT_COLOR]

const DRAW_STYLES = [
  {
    id: 'sb-poly-fill-inactive',
    type: 'fill',
    slot: 'top',
    filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'false']],
    paint: { 'fill-opacity': 0 },
  },
  {
    id: 'sb-poly-fill-active',
    type: 'fill',
    slot: 'top',
    filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
    paint: { 'fill-color': DRAW_FEATURE_COLOR_EXPR, 'fill-opacity': 0.3 },
  },
  {
    id: 'sb-poly-stroke',
    type: 'line',
    slot: 'top',
    filter: ['==', '$type', 'Polygon'],
    paint: { 'line-color': DRAW_FEATURE_COLOR_EXPR, 'line-width': 2, 'line-join': 'round' },
  },
]

const PREVIEW_SRC = 'sb-preview'
const PREVIEW_LINE_LAYER = 'sb-preview-line'
const PREVIEW_POINTS_LAYER = 'sb-preview-points'

function setPreview(map, verts, mousePos, color) {
  const src = map.getSource(PREVIEW_SRC)
  if (!src) return
  const features = []
  const coords = mousePos ? [...verts, mousePos] : [...verts]
  if (coords.length >= 2) {
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { color } })
  }
  for (const v of verts) {
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: { color } })
  }
  src.setData({ type: 'FeatureCollection', features })
}

/**
 * Reusable polygon-drawing controller for an existing Mapbox map instance.
 * Does not create or own the map; the caller is responsible for the map lifecycle.
 */
export function usePolygonDraw(map, { panelOpen, onFeatureSelect } = {}) {
  const drawRef = useRef(null)
  const isDrawingRef = useRef(false)
  const vertsRef = useRef([])
  const mousePosRef = useRef(null)
  // Finished polygons captured from the outgoing draw control when `map` swaps identity
  // (e.g. a basemap switch tears the old control down and this effect builds a fresh one
  // on the new style) — survives across effect runs so they can be reinstalled below.
  const savedFeaturesRef = useRef(null)
  // ref: 이벤트 핸들러(useEffect 클로저, [map]에만 의존)가 항상 최신 색을 읽기 위함.
  // state: 색상 스와치 UI가 선택 표시를 리렌더하기 위함. vertsRef/mousePosRef와 같은 패턴.
  const selectedColorRef = useRef(DEFAULT_COLOR)
  // ref: onFeatureSelect도 같은 이유로 ref에 최신값만 동기화한다 — [map] 이펙트의 deps에
  // 콜백을 직접 넣으면 호출부가 매 렌더 새 함수를 넘길 때마다 draw 컨트롤이 재구축된다.
  const onFeatureSelectRef = useRef(onFeatureSelect)
  const [drawing, setDrawing] = useState(false)
  const [vertCount, setVertCount] = useState(0)
  const [polyCount, setPolyCount] = useState(0)
  const [hasSelection, setHasSelection] = useState(false)
  const [selectedColor, setSelectedColorState] = useState(DEFAULT_COLOR)
  // 이미 그려진, 현재 선택된 폴리곤의 실제 색 — 새로 그릴 때 쓸 기본색인 selectedColor와는
  // 별개 개념이라 상태를 분리한다.
  const [selectedFeatureColor, setSelectedFeatureColor] = useState(null)

  useEffect(() => {
    onFeatureSelectRef.current = onFeatureSelect
  }, [onFeatureSelect])

  useEffect(() => {
    if (!map) return undefined

    const draw = new MapboxDraw({ displayControlsDefault: false, styles: DRAW_STYLES, userProperties: true })
    map.addControl(draw)
    drawRef.current = draw

    if (savedFeaturesRef.current?.length) {
      draw.set({ type: 'FeatureCollection', features: savedFeaturesRef.current })
      savedFeaturesRef.current = null
      setPolyCount(draw.getAll().features.length)
    }

    function addPreviewLayers() {
      if (map.getSource(PREVIEW_SRC)) return
      map.addSource(PREVIEW_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: PREVIEW_LINE_LAYER,
        type: 'line',
        slot: 'top',
        source: PREVIEW_SRC,
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': PREVIEW_FEATURE_COLOR_EXPR, 'line-width': 2, 'line-dasharray': [4, 2] },
      })
      map.addLayer({
        id: PREVIEW_POINTS_LAYER,
        type: 'circle',
        slot: 'top',
        source: PREVIEW_SRC,
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': PREVIEW_FEATURE_COLOR_EXPR },
      })
    }

    // `map`은 useCustomAreaOverlay가 isStyleReady일 때만 넘기므로 이 시점엔 스타일(소스/레이어
    // 정의)이 항상 준비돼 있다 — addSource/addLayer를 즉시 호출해도 안전하다. Mapbox의 'load'는
    // Map 인스턴스 생성 후 단 한 번만 발생해 재발화하지 않고, `isStyleLoaded()`는 이 지도에 걸린
    // 다른 소스(기상/ADS-B 등)가 갱신 중이면 스타일 자체가 준비된 뒤에도 계속 false를 반환할 수
    // 있어 둘 다 게이트로 쓸 수 없다.
    addPreviewLayers()

    function finalize() {
      const verts = vertsRef.current
      if (verts.length < 3) return
      draw.add({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...verts, verts[0]]] },
        properties: { color: selectedColorRef.current },
      })
      vertsRef.current = []
      mousePosRef.current = null
      isDrawingRef.current = false
      setDrawing(false)
      setVertCount(0)
      setPolyCount(draw.getAll().features.length)
      map.getCanvas().style.cursor = ''
      map.doubleClickZoom.enable()
      setPreview(map, [], null, selectedColorRef.current)
    }

    function onClick(e) {
      if (!isDrawingRef.current) return
      const { lng, lat } = e.lngLat
      const verts = vertsRef.current

      // 더블클릭 닫기 (click 이벤트가 detail=2로 두 번째 클릭으로 옴)
      if (e.originalEvent.detail >= 2) {
        if (verts.length >= 3) finalize()
        return
      }

      // 첫 번째 점 클릭 시 닫기 (15px 이내)
      if (verts.length >= 3) {
        const fp = map.project(verts[0])
        const cp = map.project([lng, lat])
        if (Math.hypot(fp.x - cp.x, fp.y - cp.y) < 15) {
          finalize()
          return
        }
      }

      verts.push([lng, lat])
      setVertCount(verts.length)
      setPreview(map, verts, mousePosRef.current, selectedColorRef.current)
    }

    function onDrawCreate() { setPolyCount(draw.getAll().features.length) }
    function onDrawDelete() {
      setPolyCount(draw.getAll().features.length)
      setHasSelection(false)
      setSelectedFeatureColor(null)
    }
    function onDrawSelectionChange(e) {
      const selected = e.features.length > 0
      setHasSelection(selected)
      setSelectedFeatureColor(selected ? (e.features[0].properties?.color || DEFAULT_COLOR) : null)
      // 지도 위 폴리곤을 클릭해 선택되면(다른 탭을 보는 중이어도) 패널을 열도록 알린다.
      if (selected) onFeatureSelectRef.current?.()
    }

    function onMouseMove(e) {
      if (!isDrawingRef.current) return
      mousePosRef.current = [e.lngLat.lng, e.lngLat.lat]
      setPreview(map, vertsRef.current, mousePosRef.current, selectedColorRef.current)
    }

    map.on('click', onClick)
    map.on('draw.create', onDrawCreate)
    map.on('draw.delete', onDrawDelete)
    map.on('draw.selectionchange', onDrawSelectionChange)
    map.on('mousemove', onMouseMove)

    return () => {
      map.off('click', onClick)
      map.off('draw.create', onDrawCreate)
      map.off('draw.delete', onDrawDelete)
      map.off('draw.selectionchange', onDrawSelectionChange)
      map.off('mousemove', onMouseMove)

      // An unfinished polygon-in-progress lives outside MapboxDraw (as loose vertices)
      // until closed, so it can't be captured/reinstalled below — cancel it instead of
      // leaving stale "drawing" UI state once this control/map is gone.
      if (isDrawingRef.current) {
        vertsRef.current = []
        mousePosRef.current = null
        isDrawingRef.current = false
        setDrawing(false)
        setVertCount(0)
      }
      setHasSelection(false)

      try {
        savedFeaturesRef.current = draw.getAll().features
        if (map.getLayer(PREVIEW_LINE_LAYER)) map.removeLayer(PREVIEW_LINE_LAYER)
        if (map.getLayer(PREVIEW_POINTS_LAYER)) map.removeLayer(PREVIEW_POINTS_LAYER)
        if (map.getSource(PREVIEW_SRC)) map.removeSource(PREVIEW_SRC)
        map.removeControl(draw)
      } catch {
        // map may already be torn down by the owning component
      }
      drawRef.current = null
    }
  }, [map])

  // 패널이 닫히거나(X버튼) 다른 탭으로 이동해도 완성된 폴리곤은 지도에 남아야 하지만,
  // 아직 마감(더블클릭)하지 않은 미완성 점들은 패널 없이는 이어 그릴 수 없으므로 취소한다.
  useEffect(() => {
    if (!panelOpen && isDrawingRef.current) handleCancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen])

  function handleStart() {
    if (!map) return
    vertsRef.current = []
    mousePosRef.current = null
    isDrawingRef.current = true
    setDrawing(true)
    setVertCount(0)
    map.getCanvas().style.cursor = 'crosshair'
    map.doubleClickZoom.disable()
  }

  function handleCancel() {
    if (!map) return
    vertsRef.current = []
    mousePosRef.current = null
    isDrawingRef.current = false
    setDrawing(false)
    setVertCount(0)
    map.getCanvas().style.cursor = ''
    map.doubleClickZoom.enable()
    setPreview(map, [], null, selectedColorRef.current)
  }

  function handleUndo() {
    if (!map || !isDrawingRef.current || vertsRef.current.length === 0) return
    vertsRef.current.pop()
    setVertCount(vertsRef.current.length)
    setPreview(map, vertsRef.current, mousePosRef.current, selectedColorRef.current)
  }

  function handleDeleteSelected() {
    const draw = drawRef.current
    if (!draw) return
    draw.trash()
    setPolyCount(draw.getAll().features.length)
    setHasSelection(false)
    setSelectedFeatureColor(null)
  }

  // setFeatureProperty는 store.render()를 직접 호출하지 않아 지도에 즉시 반영되지 않을 수
  // 있으므로, 이미 draw.add()가 렌더를 보장하는 "같은 id로 다시 add" 경로를 재사용한다
  // (finalize()가 새 폴리곤을 추가할 때 쓰는 것과 같은 API).
  function handleChangeSelectedColor(color) {
    const draw = drawRef.current
    if (!draw) return
    const selected = draw.getSelected()
    if (!selected.features.length) return
    selected.features.forEach((feature) => {
      draw.add({ ...feature, properties: { ...feature.properties, color } })
    })
    setSelectedFeatureColor(color)
  }

  function handleDeleteAll() {
    const draw = drawRef.current
    if (!draw) return
    draw.deleteAll()
    setPolyCount(0)
    setHasSelection(false)
  }

  function addVertex(lng, lat) {
    if (!map) return
    vertsRef.current.push([lng, lat])
    setVertCount(vertsRef.current.length)
    setPreview(map, vertsRef.current, mousePosRef.current, selectedColorRef.current)
  }

  function setColor(color) {
    selectedColorRef.current = color
    setSelectedColorState(color)
    // 그리는 도중 색을 바꾸면 현재 미리보기도 바로 새 색으로 다시 그린다.
    if (map) setPreview(map, vertsRef.current, mousePosRef.current, color)
  }

  return {
    drawing,
    vertCount,
    polyCount,
    hasSelection,
    selectedColor,
    selectedFeatureColor,
    handleStart,
    handleCancel,
    handleUndo,
    handleDeleteSelected,
    handleDeleteAll,
    handleChangeSelectedColor,
    addVertex,
    setColor,
  }
}
