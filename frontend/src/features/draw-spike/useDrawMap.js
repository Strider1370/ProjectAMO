import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { MAP_CONFIG, BASEMAP_OPTIONS } from '../map/mapConfig.js'
import { pathLengthNm, areaKm2 } from '../map-tools/geo.js'
import { DEFAULT_ICON, iconById } from './lib/iconCatalog.js'
import { saveDraw, loadDraw } from './lib/drawStore.js'
import { emptyHistory, push, canUndo, canRedo, undo as undoStep, redo as redoStep } from './lib/history.js'
import { rebuild, translateGen, anchorOf, greatCircleNm } from './lib/shapeBuilders.js'
import { layersToFeatures } from './lib/importKml.js'
import { parseMyMapFile } from '../my-map/lib/parseMyMapFile.js'
import { declinationAt } from '../map-tools/geo.js'

const DEFAULT_STYLE = { color: '#2563eb', opacity: 1, width: 2, fillOpacity: 0.3 }
export const UNFILED = '(폴더 없음)'

// 값으로 정의되는 도형들. 손으로 찍는 점·선·면과 달리 지도에서 자리만 받고
// 나머지는 숫자로 정한다 — 공역 고시문이 그런 꼴이기 때문이다.
// 각 도구가 지도에서 클릭을 몇 번 받는지가 `clicks`다.
export const GEN_TOOLS = {
  circle: { clicks: 1, label: '원', defaults: { radiusNm: 5 } },
  sector: { clicks: 1, label: '섹터', defaults: { radiusNm: 5, fromDeg: 270, toDeg: 90, magnetic: true } },
  arc: { clicks: 1, label: '호', defaults: { radiusNm: 5, fromDeg: 270, toDeg: 90, magnetic: true } },
  arrow: { clicks: 2, label: '화살표', defaults: {} },
  corridor: { clicks: 0, label: '회랑', defaults: { widthNm: 4 } },
  text: { clicks: 1, label: '글자', defaults: {} },
}

// mapbox-gl-draw는 userProperties: true일 때만 우리가 심은 속성을 렌더링용 feature에
// 노출하고, 내부 속성(active/mode)과 충돌하지 않도록 `user_` 접두사를 붙인다.
// custom-area/usePolygonDraw.js와 같은 관례다.
const c = (prop, fallback) => ['coalesce', ['get', `user_${prop}`], fallback]

// slot: 'top'은 Mapbox Standard의 자체 레이어 위에 올리기 위한 관례.
const SLOT = 'top'

// mapbox-gl-draw는 우리가 준 스타일 id를 그대로 쓰지 않고 `.cold`/`.hot` 두 벌로
// 나눠 만든다(선택된 것과 아닌 것을 다른 소스에 둔다). 필터를 걸려면 이 이름으로
// 찾아야 한다 — 원래 id로 getLayer를 부르면 아무것도 못 찾고 조용히 넘어간다.
const realLayers = (map, id) => [`${id}.cold`, `${id}.hot`].filter((l) => map.getLayer(l))

const DRAW_STYLES = [
  {
    id: 'ds-fill', type: 'fill', slot: SLOT,
    filter: ['==', ['geometry-type'], 'Polygon'], folderAware: true,
    paint: { 'fill-color': c('color', DEFAULT_STYLE.color), 'fill-opacity': c('fillOpacity', DEFAULT_STYLE.fillOpacity) },
  },
  {
    id: 'ds-line', type: 'line', slot: SLOT,
    filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], folderAware: true,
    paint: {
      'line-color': c('color', DEFAULT_STYLE.color),
      // 고른 도형은 지도에서도 굵어진다. 목록에서만 표시하면 지도를 보면서
      // "지금 뭘 만지는 중인가"를 알 수 없다.
      'line-width': ['case', ['==', ['get', 'active'], 'true'],
        ['+', c('width', DEFAULT_STYLE.width), 2], c('width', DEFAULT_STYLE.width)],
      'line-opacity': c('opacity', DEFAULT_STYLE.opacity),
    },
    layout: { 'line-join': 'round', 'line-cap': 'round' },
  },
  // 선·면의 이름표. 점에만 이름을 붙이면 "훈련공역 A"라고 적어 둔 면이
  // 지도에서는 이름 없는 도형이 된다 — 공역 지도에서 이름이 핵심인데.
  //
  // 선용·면용을 따로 두는 이유: `symbol-placement`는 도형마다 다르게 줄 수 없는
  // 속성이라(데이터로 정할 수 없다), 한 레이어에 표현식으로 넣으면 레이어가
  // 통째로 버려진다. 오류도 안 나고 조용히 사라져서 알아채기 어렵다.
  ...['line', 'polygon'].map((kind) => ({
    id: `ds-label-${kind}`, type: 'symbol', slot: SLOT, folderAware: true,
    filter: ['all',
      ['==', ['geometry-type'], kind === 'line' ? 'LineString' : 'Polygon'],
      ['==', ['get', 'meta'], 'feature'],
      ['!=', ['coalesce', ['get', 'user_name'], ''], ''],
    ],
    layout: {
      'text-field': ['coalesce', ['get', 'user_name'], ''],
      'text-size': 12,
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      // 선은 선을 따라, 면은 가운데. 면에 line 배치를 주면 테두리에 붙어 읽기 어렵다.
      ...(kind === 'line' ? { 'symbol-placement': 'line-center' } : {}),
    },
    paint: { 'text-color': '#111827', 'text-halo-color': '#fff', 'text-halo-width': 1.8 },
  })),
  // 원은 아이콘이 못 뜰 때의 대비이자 좌표 자체를 찍는 점이다. 압정 아이콘은
  // 바닥이 좌표를 가리키므로 원 위에 얹혀 자연스럽게 붙는다.
  {
    id: 'ds-point', type: 'circle', slot: SLOT,
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'meta'], 'feature']], folderAware: true,
    paint: {
      'circle-radius': 4, 'circle-color': c('color', DEFAULT_STYLE.color),
      'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
      // 글자 도형은 점을 숨긴다 — 글자만 놓는 것이 목적이다.
      'circle-opacity': ['case', ['==', ['get', 'user_textOnly'], true], 0, 1],
      'circle-stroke-opacity': ['case', ['==', ['get', 'user_textOnly'], true], 0, 1],
    },
  },
  {
    id: 'ds-icon', type: 'symbol', slot: SLOT,
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'meta'], 'feature']], folderAware: true,
    layout: {
      'icon-image': ['coalesce', ['get', 'user_icon'], DEFAULT_ICON],
      'icon-size': 0.6,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'text-allow-overlap': true,
      // 이름표. 그리는 사람은 자기가 뭘 찍었는지 지도에서 바로 봐야 한다.
      'text-field': ['coalesce', ['get', 'user_name'], ''],
      'text-offset': ['case', ['==', ['get', 'user_textOnly'], true], ['literal', [0, 0]], ['literal', [0, 0.6]]],
      'text-anchor': ['case', ['==', ['get', 'user_textOnly'], true], 'center', 'top'],
      'text-size': ['case', ['==', ['get', 'user_textOnly'], true], 14, 11],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
    },
    paint: {
      'text-color': ['case', ['==', ['get', 'user_textOnly'], true], c('color', '#111827'), '#111827'],
      'text-halo-color': '#fff', 'text-halo-width': 1.5,
      'icon-opacity': ['case', ['==', ['get', 'user_textOnly'], true], 0, 1],
    },
  },
  // 꼭짓점 손잡이. CalTopo·Earth Web처럼 중간점을 끌면 꼭짓점이 생긴다 —
  // midpoint는 draw가 알아서 만들어 주므로 우리는 보이게만 하면 된다.
  {
    id: 'ds-midpoint', type: 'circle', slot: SLOT, handle: true,
    filter: ['all', ['==', ['get', 'meta'], 'midpoint'], ['==', ['geometry-type'], 'Point']],
    paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-opacity': 0.6, 'circle-stroke-width': 1, 'circle-stroke-color': '#111' },
  },
  {
    id: 'ds-vertex', type: 'circle', slot: SLOT, handle: true,
    filter: ['all', ['==', ['get', 'meta'], 'vertex'], ['==', ['geometry-type'], 'Point']],
    paint: {
      'circle-radius': 5,
      // 구글어스의 초록/파랑 신호를 그대로 가져온다 — 지금 뭘 건드리는지 눈으로 안다.
      'circle-color': ['case', ['==', ['get', 'active'], 'true'], '#2563eb', '#22c55e'],
      'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
    },
  },
]

const MODE = { point: 'draw_point', line: 'draw_line_string', polygon: 'draw_polygon' }
const TOOL_OF = Object.fromEntries(Object.entries(MODE).map(([k, v]) => [v, k]))

// 중심을 찍고 반경을 마우스로 늘리는 도구들. 셋 다 중심+반경이라 조작이 같아야 한다.
const RADIUS_TOOLS = new Set(['circle', 'sector', 'arc'])
// 반경 0은 그릴 것이 없다. 첫 클릭 직후의 최소값.
const MIN_RADIUS_NM = 0.05

// 아이콘을 지도에 등록한다. 목록 87종을 미리 다 받으면 첫 화면이 느려지므로
// 실제로 쓰이는 것만 그때그때 받는다.
//
// 구글 서버에서 직접 가져온다 — 앞선 스파이크에서 37종 전부 CORS를 통과함을
// 확인했다. 실패하면 원만 남는다(그래서 원 레이어를 지우지 않았다).
const loading = new Set()
function ensureIcon(map, id) {
  if (!map || !id || map.hasImage?.(id) || loading.has(id)) return
  loading.add(id)
  map.loadImage(iconById(id).url, (err, img) => {
    loading.delete(id)
    if (err || !img || map.hasImage?.(id)) return
    try { map.addImage(id, img) } catch { /* 경합으로 이미 등록됐으면 넘어간다 */ }
  })
}

// 자편각(동편차 +). 공역 고시문의 radial은 대개 자북 기준인데, 한국은 서편차
// 약 −8°다. 5NM 호에서 8°는 0.7NM이라 무시할 수 없다.
function declAt(pt) {
  try {
    return pt ? declinationAt(pt) : 0
  } catch {
    return 0
  }
}

/** 기하의 첫 좌표. 얼마나 옮겨졌는지 재는 기준으로 쓴다. */
function firstCoord(geom) {
  if (!geom) return null
  if (geom.type === 'Point') return geom.coordinates
  if (geom.type === 'LineString') return geom.coordinates[0]
  if (geom.type === 'Polygon') return geom.coordinates[0]?.[0]
  return null
}

function measure(feature) {
  const g = feature?.geometry
  if (!g) return null
  if (g.type === 'LineString' && g.coordinates.length >= 2) {
    return { kind: 'line', nm: pathLengthNm(g.coordinates), count: g.coordinates.length }
  }
  if (g.type === 'Polygon' && g.coordinates[0]?.length >= 4) {
    const ring = g.coordinates[0].slice(0, -1)
    return { kind: 'polygon', km2: areaKm2(ring), nm: pathLengthNm([...ring, ring[0]]), count: ring.length }
  }
  return null
}

export default function useDrawMap(containerRef) {
  const mapRef = useRef(null)
  const drawRef = useRef(null)
  // 방금 쓴 스타일. Earth Web의 "자동 스타일 물려받기" — 도형 종류별로 따로 기억한다.
  const lastStyleRef = useRef({ point: { ...DEFAULT_STYLE }, line: { ...DEFAULT_STYLE }, polygon: { ...DEFAULT_STYLE } })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [shapes, setShapes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [live, setLive] = useState(null)
  // 도구 상태는 우리가 따로 들고 있지 않고 지도의 실제 모드에서 읽는다.
  // draw는 도형을 완성하면 스스로 simple_select로 돌아가므로, 따로 들고 있으면
  // 단추는 켜져 있는데 실제로는 그리기가 꺼진 상태가 되어 다음 클릭이 헛돈다.
  const [activeTool, setActiveTool] = useState(null)
  // 방금 고른 도구. 도형 하나를 끝내면 draw가 스스로 선택 모드로 돌아가는데,
  // 점 1,491개를 찍는 도구에서 매번 단추를 다시 누르게 하면 아무도 안 쓴다.
  // 그래서 같은 도구를 곧바로 다시 물린다. 그만두려면 Esc나 단추를 다시 누른다.
  const armedRef = useRef(null)
  const [hiddenFolders, setHiddenFolders] = useState([])
  // null = 아직 저장한 적 없음, {ok:true, at} = 저장됨, {ok:false} = 저장 실패.
  // 실패를 조용히 넘기면 조종사가 두 시간 그린 것이 창을 닫는 순간 사라진다.
  const [saveState, setSaveState] = useState(null)
  const historyRef = useRef(emptyHistory())
  const [undoable, setUndoable] = useState({ undo: false, redo: false })
  // 되돌리기로 상태를 되돌리는 중에는 그 변화를 다시 이력에 쌓으면 안 된다.
  const restoringRef = useRef(false)

  // 이미 완성된 도형의 id. 그리는 중인 도형은 여기 없다는 것으로 찾아낸다 —
  // draw는 첫 클릭에 곧바로 feature를 만들어 getAll()에 넣지만 선택 상태로는
  // 잡히지 않아서, getSelectedIds()로는 그리는 중인 것을 집을 수 없다.
  const knownIdsRef = useRef(new Set())

  // 그린 것이 바뀔 때마다 부른다: 화면 목록 갱신 + 자동 저장 + 이력 쌓기.
  // Earth Web·Felt처럼 저장 단추가 없다 — 그린 순간 남는다.
  const sync = useCallback(({ coalesce = false } = {}) => {
    const draw = drawRef.current
    const map = mapRef.current
    if (!draw) return
    const all = draw.getAll()
    knownIdsRef.current = new Set(all.features.map((f) => f.id))

    for (const f of all.features) {
      if (f.geometry.type === 'Point') ensureIcon(map, f.properties?.icon ?? DEFAULT_ICON)
    }

    // 값 도형은 정의만 저장한다. 좌표는 정의에서 언제든 다시 만들 수 있으므로
    // 원 하나에 72쌍을 담을 이유가 없다 — 저장 공간도 읽는 시간도 그만큼 준다.
    const toSave = all.features.map((f) => (f.properties?.gen ? { ...f, geometry: null } : f))
    setSaveState(saveDraw({ features: toSave, folders: [] })
      ? { ok: true, at: Date.now() }
      : { ok: false })

    if (!restoringRef.current) {
      historyRef.current = push(historyRef.current, JSON.stringify(toSave), { coalesce })
      setUndoable({ undo: canUndo(historyRef.current), redo: canRedo(historyRef.current) })
    }

    setShapes(all.features.map((f) => ({
      id: f.id,
      kind: f.geometry.type === 'Point' ? 'point' : f.geometry.type === 'LineString' ? 'line' : 'polygon',
      name: f.properties?.name ?? '',
      description: f.properties?.description ?? '',
      color: f.properties?.color ?? DEFAULT_STYLE.color,
      opacity: f.properties?.opacity ?? DEFAULT_STYLE.opacity,
      width: f.properties?.width ?? DEFAULT_STYLE.width,
      fillOpacity: f.properties?.fillOpacity ?? DEFAULT_STYLE.fillOpacity,
      ceilFt: f.properties?.ceilFt ?? 0,
      floorFt: f.properties?.floorFt ?? 0,
      icon: f.properties?.icon ?? DEFAULT_ICON,
      folder: f.properties?.folder ?? UNFILED,
      gen: f.properties?.gen ?? null,
      textOnly: f.properties?.textOnly ?? false,
      coords: f.geometry.type === 'Point' ? [f.geometry.coordinates]
        : f.geometry.type === 'LineString' ? f.geometry.coordinates
          : f.geometry.coordinates[0],
      measure: measure(f),
    })))
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const token = import.meta.env.VITE_MAPBOX_TOKEN
    if (!token) { setError('VITE_MAPBOX_TOKEN이 필요합니다.'); return undefined }
    mapboxgl.accessToken = token
    const basemap = BASEMAP_OPTIONS[0]
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: basemap.style,
      config: { basemap: basemap.config },
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      language: 'ko',
    })
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    map.on('error', (e) => setError(e?.error?.message ?? '지도 오류'))
    mapRef.current = map
    window.__drawMap = map   // 스파이크 손잡이 — 개발 빌드 전용 페이지에서만 쓴다

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      userProperties: true,
      // folderAware는 우리 표시일 뿐 Mapbox 레이어 속성이 아니다. 그대로 넘기면
      // 스타일 검증에 걸린다.
      styles: DRAW_STYLES.map(({ folderAware, handle, ...layer }) => layer),
    })
    map.addControl(draw)
    drawRef.current = draw

    // 그린 직후 그 종류의 마지막 스타일을 입힌다. 안 그러면 지점 1,491개를
    // 찍는 동안 매번 색을 다시 골라야 한다.
    const onCreate = (e) => {
      // 회랑은 중심선을 그려 완성한 순간 띠(면)로 바꾼다. 중심선은 속성에 남겨
      // 두므로 폭을 나중에 고치면 다시 만들 수 있다.
      const pending = pendingRef.current
      if (pending?.kind === 'corridor' && e.features[0]?.geometry?.type === 'LineString') {
        const line = e.features[0]
        pendingRef.current = null
        setPendingTool(null)
        const gen = { type: 'corridor', centerline: line.geometry.coordinates, ...GEN_TOOLS.corridor.defaults }
        const geometry = rebuild(gen, declAt(line.geometry.coordinates[0]))
        if (geometry) {
          draw.delete(line.id)
          const [id] = draw.add({
            type: 'Feature',
            properties: { ...lastStyleRef.current.polygon, name: '', gen },
            geometry,
          })
          sync()
          setSelectedId(id)
          setActiveTool(null)
          armedRef.current = null
          return
        }
      }
      for (const f of e.features) {
        const kind = f.geometry.type === 'Point' ? 'point' : f.geometry.type === 'LineString' ? 'line' : 'polygon'
        const s = lastStyleRef.current[kind]
        for (const [k, v] of Object.entries(s)) draw.setFeatureProperty(f.id, k, v)
        draw.setFeatureProperty(f.id, 'name', '')
      }
      sync()
      setSelectedId(e.features[0]?.id ?? null)
      setLive(null)
      // 같은 도구를 다시 물린다. 물려 둔 것이 없으면(회랑처럼 한 번짜리) 내린다.
      const again = armedRef.current
      if (again && MODE[again]) {
        setTimeout(() => { if (armedRef.current === again) draw.changeMode(MODE[again]) }, 0)
      } else {
        setActiveTool(null)
      }
    }
    const onUpdateOrDelete = (e) => {
      // 값 도형을 끌어 옮겼으면 정의의 기준점도 같은 만큼 옮겨야 한다. 안 그러면
      // 화면에서는 옮겨졌는데 정의는 제자리라, 반경을 고치는 순간 원래 자리로 튄다.
      for (const f of e?.features ?? []) {
        const gen = f.properties?.gen
        if (!gen) continue
        const before = rebuild(gen, declAt(anchorOf(gen)))
        const p0 = firstCoord(before)
        const p1 = firstCoord(f.geometry)
        if (!p0 || !p1) continue
        const moved = translateGen(gen, p1[0] - p0[0], p1[1] - p0[1])
        draw.add({ ...f, properties: { ...f.properties, gen: moved } })
      }
      sync()
      setLive(null)
    }
    // 도구를 계속 물려 두면 draw가 그리기 모드로 돌아가면서 선택을 비운다.
    // 그때 선택을 같이 지우면 방금 그린 도형의 이름·색을 고칠 수가 없다.
    // 그리기 모드에서 온 빈 선택은 무시하고, 선택 모드에서 비운 것만 반영한다.
    const onSelect = (e) => {
      const picked = e.features[0]?.id ?? null
      if (picked) { setSelectedId(picked); return }
      if (draw.getMode() === 'simple_select') setSelectedId(null)
    }
    // 그리는 중 실시간 거리·면적 — Felt·onX가 하는 것. 구글어스는 다 그려야 보인다.
    const onRender = () => {
      const d = drawRef.current
      if (!d) return
      const mode = d.getMode()
      if (mode !== 'draw_line_string' && mode !== 'draw_polygon') return
      const wip = d.getAll().features.find((f) => !knownIdsRef.current.has(f.id))
      setLive(measure(wip))
    }

    const onModeChange = (e) => {
      setActiveTool(TOOL_OF[e.mode] ?? null)
      // 값으로 정의된 도형은 꼭짓점을 만지게 두지 않는다. 원은 중심과 반경으로
      // 정의되는데 72개 꼭짓점을 손잡이로 내놓으면 정의를 부정하는 꼴이고,
      // 하나라도 끌면 도형과 정의가 어긋난다. 숫자로만 고친다.
      if (e.mode !== 'direct_select') return
      const [id] = draw.getSelectedIds()
      if (id && draw.get(id)?.properties?.gen) {
        draw.changeMode('simple_select', { featureIds: [id] })
      }
    }

    map.on('draw.create', onCreate)
    map.on('draw.modechange', onModeChange)
    map.on('draw.update', onUpdateOrDelete)
    map.on('draw.delete', onUpdateOrDelete)
    map.on('draw.selectionchange', onSelect)
    map.on('draw.render', onRender)
    map.on('load', () => {
      // 지난번에 그린 것을 되살린다. 저장 단추가 없으므로 여는 순간 그대로 있어야 한다.
      const saved = loadDraw()
      if (saved?.features?.length) {
        try {
          const features = saved.features.map((f) => {
            const gen = f.properties?.gen
            if (!gen) return f
            return { ...f, geometry: rebuild(gen, declAt(anchorOf(gen))) }
          }).filter((f) => f.geometry)
          draw.set({ type: 'FeatureCollection', features })
        } catch { /* 저장본이 어긋나면 빈 지도로 시작한다 */ }
      }
      setReady(true)
      sync()
    })

    return () => {
      map.remove()
      mapRef.current = null
      drawRef.current = null
    }
  }, [containerRef, sync])

  // 이력에서 꺼낸 도형 목록으로 지도를 되돌린다.
  const restore = useCallback((json) => {
    const draw = drawRef.current
    if (!draw || json == null) return
    // 표시를 sync()가 끝난 뒤에 내려야 한다. 먼저 내리면 sync()가 되돌린 상태를
    // 새 이력으로 쌓으면서 다시하기 줄을 지워버려, 되돌리기는 되는데 다시하기가
    // 영영 안 되는 상태가 된다.
    restoringRef.current = true
    const features = JSON.parse(json).map((f) => {
      const gen = f.properties?.gen
      return gen ? { ...f, geometry: rebuild(gen, declAt(anchorOf(gen))) } : f
    }).filter((f) => f.geometry)
    draw.set({ type: 'FeatureCollection', features })
    setSelectedId(null)
    sync()
    // draw.set이 이벤트를 늦게 흘릴 수 있으므로 한 박자 뒤에 내린다.
    setTimeout(() => { restoringRef.current = false }, 0)
  }, [sync])

  const undo = useCallback(() => {
    const { history, snapshot } = undoStep(historyRef.current)
    historyRef.current = history
    setUndoable({ undo: canUndo(history), redo: canRedo(history) })
    restore(snapshot)
  }, [restore])

  const redo = useCallback(() => {
    const { history, snapshot } = redoStep(historyRef.current)
    historyRef.current = history
    setUndoable({ undo: canUndo(history), redo: canRedo(history) })
    restore(snapshot)
  }, [restore])

  // 폴더 켜고 끄기. draw가 만든 레이어에 필터를 얹는다 — 소스는 하나뿐이므로
  // my-map과 같은 방식(도형에 폴더 이름을 심어두고 필터로 거른다)이 그대로 통한다.
  const toggleFolder = useCallback((name) => {
    setHiddenFolders((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }, [])

  // 값 도형의 id. 이 도형들의 꼭짓점 손잡이를 숨기는 데 쓴다.
  const genIds = shapes.filter((s) => s.gen).map((s) => s.id)
  const genKey = genIds.join(',')

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const ids = genKey ? genKey.split(',') : []
    const notHidden = ['!', ['in', ['coalesce', ['get', 'user_folder'], UNFILED], ['literal', hiddenFolders]]]
    // 값 도형은 꼭짓점을 내놓지 않는다. 원은 중심과 반경으로 정의되는데 72개
    // 손잡이를 뿌리면 정의를 부정하는 꼴이고, 그 손잡이가 마우스를 가로채
    // 도형을 끌어 옮길 수조차 없게 만든다. 꼭짓점 feature는 부모 id를
    // `parent`로 달고 다니므로 그것으로 거른다.
    const notGen = ['!', ['in', ['coalesce', ['get', 'parent'], ''], ['literal', ids]]]

    for (const def of DRAW_STYLES) {
      const parts = [def.filter]
      if (def.folderAware && hiddenFolders.length) parts.push(notHidden)
      if (def.handle && ids.length) parts.push(notGen)
      const filter = parts.length > 1 ? ['all', ...parts] : def.filter
      for (const layer of realLayers(map, def.id)) map.setFilter(layer, filter)
    }
  }, [hiddenFolders, ready, genKey])

  const startTool = useCallback((kind) => {
    armedRef.current = kind
    drawRef.current?.changeMode(MODE[kind])
    setActiveTool(kind)
    setLive(null)
  }, [])

  const stopTool = useCallback(() => {
    armedRef.current = null
    drawRef.current?.changeMode('simple_select')
    setActiveTool(null)
    setLive(null)
  }, [])

  /** 고른 도형의 속성 하나를 고친다. 스타일이면 다음 도형이 물려받도록 기억한다. */
  const setProp = useCallback((id, key, value) => {
    const draw = drawRef.current
    if (!draw) return
    draw.setFeatureProperty(id, key, value)
    // setFeatureProperty는 내부 상태만 바꾼다. add로 되먹여야 화면이 다시 그려진다.
    const f = draw.get(id)
    if (f) draw.add(f)
    if (['color', 'opacity', 'width', 'fillOpacity'].includes(key)) {
      const kind = f?.geometry.type === 'Point' ? 'point' : f?.geometry.type === 'LineString' ? 'line' : 'polygon'
      lastStyleRef.current[kind] = { ...lastStyleRef.current[kind], [key]: value }
    }
    sync({ coalesce: true })
  }, [sync])

  const remove = useCallback((id) => {
    drawRef.current?.delete(id)
    if (selectedId === id) setSelectedId(null)
    sync()
  }, [sync, selectedId])

  const select = useCallback((id) => {
    drawRef.current?.changeMode('simple_select', { featureIds: [id] })
    setSelectedId(id)
  }, [])

  const fitTo = useCallback((id) => {
    const f = drawRef.current?.get(id)
    const map = mapRef.current
    if (!f || !map) return
    const b = new mapboxgl.LngLatBounds()
    const walk = (co) => { if (typeof co[0] === 'number') b.extend([co[0], co[1]]); else co.forEach(walk) }
    walk(f.geometry.coordinates)
    map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 400 })
  }, [])

  // --- 값으로 정의되는 도형 (원·호·섹터·화살표·회랑·글자) ---
  //
  // 손으로 찍는 도형과 흐름이 다르다: 지도에서는 자리만 받고, 나머지는 패널의
  // 숫자로 정한다. 그래서 mapbox-gl-draw의 그리기 모드를 쓰지 않고 지도 클릭을
  // 직접 받는다 — draw는 완성된 도형을 담아두는 그릇으로만 쓴다.
  const pendingRef = useRef(null)
  const [pendingTool, setPendingTool] = useState(null)
  // 중심을 찍고 반경을 늘리는 중인 도형. 첫 클릭에 최소 크기로 만들어 두고
  // 마우스가 움직이는 만큼 키운 뒤, 두 번째 클릭에서 확정한다.
  const sizingRef = useRef(null)
  const [sizing, setSizing] = useState(false)

  const addGenFeature = useCallback((genType, points, override = {}) => {
    const draw = drawRef.current
    if (!draw) return null
    const spec = GEN_TOOLS[genType]
    const gen = genType === 'arrow'
      ? { type: 'arrow', from: points[0], to: points[1], ...spec.defaults, ...override }
      : genType === 'corridor'
        ? { type: 'corridor', centerline: points, ...spec.defaults, ...override }
        : { type: genType, center: points[0], ...spec.defaults, ...override }

    const isText = genType === 'text'
    const geometry = isText ? { type: 'Point', coordinates: points[0] } : rebuild(gen, declAt(points[0]))
    if (!geometry) return null

    // 면이 되는 것은 면 스타일을, 선이 되는 것은 선 스타일을 물려받는다.
    const kind = geometry.type === 'Polygon' ? 'polygon' : geometry.type === 'LineString' ? 'line' : 'point'
    const [id] = draw.add({
      type: 'Feature',
      properties: {
        ...lastStyleRef.current[kind],
        name: '',
        ...(isText ? { textOnly: true, name: '글자' } : { gen }),
      },
      geometry,
    })
    sync()
    setSelectedId(id)
    draw.changeMode('simple_select', { featureIds: [id] })
    return id
  }, [sync])

  /** 반경 늘리는 중인 도형의 반경을 바꿔 다시 그린다. 이력은 한 칸으로 뭉친다. */
  const resizeTo = useCallback((lngLat) => {
    const draw = drawRef.current
    const state = sizingRef.current
    if (!draw || !state) return null
    const f = draw.get(state.id)
    if (!f?.properties?.gen) return null
    const nm = Math.max(MIN_RADIUS_NM, greatCircleNm(state.center, lngLat))
    const gen = { ...f.properties.gen, radiusNm: Math.round(nm * 100) / 100 }
    const geometry = rebuild(gen, declAt(state.center))
    if (!geometry) return null
    draw.add({ ...f, properties: { ...f.properties, gen }, geometry })
    return gen.radiusNm
  }, [])

  const startGenTool = useCallback((genType) => {
    // 반경을 잡던 중에 다른 도구를 누르면 만들다 만 도형을 버린다.
    if (sizingRef.current) {
      drawRef.current?.delete(sizingRef.current.id)
      sizingRef.current = null
      setSizing(false)
      setLive(null)
      sync()
    }
    drawRef.current?.changeMode('simple_select')
    setActiveTool(null)
    if (genType === 'corridor') {
      // 회랑은 중심선을 먼저 그린다. 선 그리기를 그대로 쓰고 완성될 때 띠로 바꾼다.
      pendingRef.current = { kind: 'corridor', points: [] }
      setPendingTool('corridor')
      drawRef.current?.changeMode('draw_line_string')
      return
    }
    pendingRef.current = { kind: genType, points: [] }
    setPendingTool(genType)
  }, [sync])

  const cancelGenTool = useCallback(() => {
    pendingRef.current = null
    setPendingTool(null)
    // 반경을 늘리던 중이면 만들다 만 도형을 지운다. 점 하나짜리 원이 남으면 안 된다.
    if (sizingRef.current) {
      drawRef.current?.delete(sizingRef.current.id)
      sizingRef.current = null
      setSizing(false)
      setSelectedId(null)
      sync()
    }
    setLive(null)
  }, [sync])

  // 지도 클릭으로 자리를 모은다. 필요한 수만큼 모이면 도형을 만든다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return undefined
    const onClick = (e) => {
      const pt = [e.lngLat.lng, e.lngLat.lat]

      // 반경을 늘리는 중이었다면 이 클릭이 확정이다.
      if (sizingRef.current) {
        const { tool } = sizingRef.current
        resizeTo(pt)
        sizingRef.current = null
        setSizing(false)
        setLive(null)
        sync()   // 뭉치지 않고 한 칸 쌓는다 — 여기까지가 "도형 하나 만들기"다
        // 같은 도구를 다시 물린다. 관제권을 여러 개 그릴 때 매번 단추를 누르지 않는다.
        if (tool) { pendingRef.current = { kind: tool, points: [] }; setPendingTool(tool) }
        return
      }

      const pending = pendingRef.current
      if (!pending || pending.kind === 'corridor') return
      pending.points.push(pt)

      // 중심을 찍는 도구는 곧바로 최소 크기로 만들고 반경 늘리기로 넘어간다.
      if (RADIUS_TOOLS.has(pending.kind)) {
        const { kind } = pending
        pendingRef.current = null
        setPendingTool(null)
        const id = addGenFeature(kind, [pt], { radiusNm: MIN_RADIUS_NM })
        if (id) {
          sizingRef.current = { id, center: pt, tool: kind }
          setSizing(true)
        }
        return
      }

      if (pending.points.length >= GEN_TOOLS[pending.kind].clicks) {
        const { kind, points } = pending
        addGenFeature(kind, points)
        // 화살표·글자도 같은 도구를 다시 물린다.
        pendingRef.current = { kind, points: [] }
        setPendingTool(kind)
      }
    }

    // 마우스가 움직이는 만큼 반경이 늘어난다. CalTopo·Felt와 같은 조작이다.
    const onMove = (e) => {
      if (!sizingRef.current) return
      const nm = resizeTo([e.lngLat.lng, e.lngLat.lat])
      if (nm != null) setLive({ kind: 'radius', nm })
    }

    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => { map.off('click', onClick); map.off('mousemove', onMove) }
  }, [ready, addGenFeature, resizeTo, sync])

  /** 값 도형의 숫자 하나를 고치고 도형을 다시 만든다. */
  const setGenProp = useCallback((id, key, value) => {
    const draw = drawRef.current
    if (!draw) return
    const f = draw.get(id)
    if (!f?.properties?.gen) return
    const gen = { ...f.properties.gen, [key]: value }
    const anchor = gen.center ?? gen.from ?? gen.centerline?.[0]
    const geometry = rebuild(gen, declAt(anchor))
    if (!geometry) return
    draw.add({ ...f, properties: { ...f.properties, gen }, geometry })
    sync({ coalesce: true })
  }, [sync])

  // --- 파일 불러오기 ---
  //
  // 읽는 일은 my-map의 파서가 이미 한다. 내보낸 파일을 되돌릴 길이 없으면
  // 다른 기기로 옮기지도, 동료에게 받지도 못한다.
  const [importing, setImporting] = useState(null)

  const importFile = useCallback(async (file) => {
    const draw = drawRef.current
    if (!draw || !file) return
    setImporting({ name: file.name })
    try {
      const { list, stats } = await parseMyMapFile(await file.arrayBuffer(), file.name)
      const features = layersToFeatures(list, UNFILED)
      if (!features.length) {
        setImporting({ error: '이 파일에서 그릴 수 있는 도형을 찾지 못했습니다.' })
        return
      }
      // 지금 그린 것을 지우지 않고 얹는다. 불러오기가 파괴적이면 무서워서 못 쓴다.
      for (const f of features) draw.add(f)
      sync()
      const b = new mapboxgl.LngLatBounds()
      const walk = (co) => { if (typeof co[0] === 'number') b.extend([co[0], co[1]]); else co.forEach(walk) }
      for (const f of features) walk(f.geometry.coordinates)
      if (!b.isEmpty()) mapRef.current?.fitBounds(b, { padding: 60, duration: 400 })
      setImporting({ done: `${file.name} — 도형 ${features.length}개를 더했습니다.` })
    } catch (e) {
      // 파서는 어느 단계에서 실패했는지 남긴다. 그걸 그대로 보여준다.
      setImporting({ error: `${e?.stage ? `${e.stage} 단계에서 실패: ` : ''}${e?.message ?? '파일을 읽지 못했습니다.'}` })
    }
  }, [sync])

  const clearImportMessage = useCallback(() => setImporting(null), [])

  /** 여러 도형을 한 폴더로 옮긴다. 폴더는 도형에 심는 이름표일 뿐 따로 만들지 않는다. */
  const moveToFolder = useCallback((ids, folder) => {
    const draw = drawRef.current
    if (!draw) return
    for (const id of ids) {
      draw.setFeatureProperty(id, 'folder', folder)
      const f = draw.get(id)
      if (f) draw.add(f)
    }
    sync({ coalesce: true })
  }, [sync])

  return {
    mapRef, ready, error, shapes, selectedId, live, activeTool,
    hiddenFolders, undoable, pendingTool, sizing, saveState,
    startTool, stopTool, setProp, remove, select, fitTo,
    undo, redo, toggleFolder, moveToFolder,
    startGenTool, cancelGenTool, setGenProp,
    importing, importFile, clearImportMessage,
  }
}
