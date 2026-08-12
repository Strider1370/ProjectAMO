import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { MAP_CONFIG, BASEMAP_OPTIONS } from '../map/mapConfig.js'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, LABEL_PAINT } from './lib/kmlPaint.js'
import { buildWalls, EXTRUSION_PAINT, buildElevatedLines, ELEVATED_LINE_LAYOUT } from './lib/kmlWalls.js'

const SRC = 'kml-src'
// 고도 벽은 원본 도형이 아니라 거기서 되찾은 바닥 고리다. 기하가 다르므로 소스를
// 따로 둔다 — 43개뿐이라 부담이 없고, 평면 표시의 측정 경로를 건드리지 않는다.
const WALL_SRC = 'kml-wall-src'
const WALL_LYR = 'kml-wall'
// 오르내리는 선도 마찬가지로 원본과 기하가 다르다(갈래마다 쪼개고 고도를 속성으로 옮김).
const ELEV_SRC = 'kml-elev-src'
const ELEV_LYR = 'kml-elev'
// 3D에서만 나오는 레이어들. 켜고 끄기·필터를 한자리에서 돌린다.
const LYR_3D = [WALL_LYR, ELEV_LYR]
// slot: 'top'은 Mapbox Standard의 자체 레이어 위에 올리기 위한 관례다
// (custom-area/usePolygonDraw.js와 같음).
const SLOT = 'top'

// 면 → 선 → 점 → 라벨. 전역으로 이 순서를 지켜야 점이 면에 가리지 않는다.
// 이름표는 Point에만 붙인다 — Mapbox는 GeometryCollection을 하위 도형마다 별개
// feature로 쪼개면서 properties를 복제하므로, 필터가 없으면 VOR 하나가 이름표
// 1,389개가 된다.
const LAYER_DEFS = [
  { kind: 'fill', type: 'fill', geom: ['==', ['geometry-type'], 'Polygon'], paint: FILL_PAINT },
  { kind: 'line', type: 'line', geom: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: LINE_PAINT },
  { kind: 'circle', type: 'circle', geom: ['==', ['geometry-type'], 'Point'], paint: CIRCLE_PAINT },
  { kind: 'label', type: 'symbol', geom: ['==', ['geometry-type'], 'Point'], paint: LABEL_PAINT, layout: LABEL_LAYOUT },
]
const LYR = (kind) => `kml-${kind}`

export default function useKmlMap(containerRef) {
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [addMs, setAddMs] = useState(null)
  const [displayMs, setDisplayMs] = useState(null)
  const [wallCount, setWallCount] = useState(null)
  const [elevCount, setElevCount] = useState(null)
  const [wallMs, setWallMs] = useState(null)

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
    map.on('load', () => setReady(true))
    // 측정용 손잡이. 이 페이지는 개발 빌드에만 존재하므로 여기서만 쓴다 —
    // 특정 지점·축척으로 정확히 옮겨 놓고 재려면 지도를 직접 잡을 수 있어야 한다.
    window.__kmlMap = map
    map.on('error', (e) => setError(e?.error?.message ?? '지도 오류'))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [containerRef])

  const applyFilters = (hidden) => {
    const map = mapRef.current
    if (!map) return
    const visible = layersRef.current
      .filter((l) => isLayerVisible(layersRef.current, l.id, hidden))
      .map((l) => l.id)
    for (const def of LAYER_DEFS) {
      if (!map.getLayer(LYR(def.kind))) continue
      map.setFilter(LYR(def.kind), ['all', def.geom, ['in', ['get', '__folder'], ['literal', visible]]])
    }
    for (const id of LYR_3D) {
      if (map.getLayer(id)) map.setFilter(id, ['in', ['get', '__folder'], ['literal', visible]])
    }
  }

  const setLayers = (list, startedAt) => {
    const map = mapRef.current
    if (!map) return
    const started = performance.now()
    for (const def of LAYER_DEFS) if (map.getLayer(LYR(def.kind))) map.removeLayer(LYR(def.kind))
    for (const id of LYR_3D) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SRC)) map.removeSource(SRC)
    for (const id of [WALL_SRC, ELEV_SRC]) if (map.getSource(id)) map.removeSource(id)

    // feature마다 어느 폴더에서 왔는지 심는다. 이게 있어야 소스 하나로 두고
    // 필터만으로 폴더를 켜고 끌 수 있다.
    const features = []
    for (const layer of list) {
      for (const f of layer.features) {
        features.push({ ...f, properties: { ...f.properties, __folder: layer.id } })
      }
    }
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features } })
    const allIds = list.map((l) => l.id)
    for (const def of LAYER_DEFS) {
      map.addLayer({
        id: LYR(def.kind), type: def.type, source: SRC, slot: SLOT,
        filter: ['all', def.geom, ['in', ['get', '__folder'], ['literal', allIds]]],
        paint: def.paint,
        ...(def.layout ? { layout: def.layout } : {}),
      })
    }
    // 고도 벽은 평면 표시와 별개로 얹는다. 평면 도형은 그대로 두므로 스펙의
    // "어떤 도형도 숨기지 않는다"는 그대로 지켜진다.
    const wallStarted = performance.now()
    const walls = buildWalls(list)
    map.addSource(WALL_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: walls } })
    map.addLayer({
      id: WALL_LYR, type: 'fill-extrusion', source: WALL_SRC, slot: SLOT,
      filter: ['in', ['get', '__folder'], ['literal', allIds]],
      paint: EXTRUSION_PAINT,
      layout: { visibility: 'none' }, // 3D 보기를 켤 때만 나온다
    })
    // 출항절차·장주처럼 고도가 오르내리는 경로는 벽이 아니라 공중에 뜬 선이다.
    const elev = buildElevatedLines(list)
    map.addSource(ELEV_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: elev }, lineMetrics: true })
    map.addLayer({
      id: ELEV_LYR, type: 'line', source: ELEV_SRC, slot: SLOT,
      filter: ['in', ['get', '__folder'], ['literal', allIds]],
      paint: LINE_PAINT,
      layout: { ...ELEVATED_LINE_LAYOUT, visibility: 'none' },
    })
    setWallCount(walls.length)
    setElevCount(elev.length)
    setWallMs(Math.round(performance.now() - wallStarted))

    layersRef.current = list
    setAddMs(Math.round(performance.now() - started))

    // addSource는 워커에 일을 던지고 바로 돌아온다. 스펙의 판단 기준("10초 이내에
    // 표시")을 재려면 실제로 그리기가 끝나는 시점을 봐야 한다.
    setDisplayMs(null)
    map.once('idle', () => setDisplayMs(Math.round(performance.now() - startedAt)))
  }

  const setHidden = (hidden) => applyFilters(hidden)

  // 라벨은 도형보다 훨씬 무겁다(겹침 계산). 원인을 가르려면 따로 껐다 켤 수 있어야 한다.
  const setLabelsOn = (on) => {
    const map = mapRef.current
    if (!map || !map.getLayer(LYR('label'))) return
    map.setLayoutProperty(LYR('label'), 'visibility', on ? 'visible' : 'none')
  }

  // 3D는 두 가지가 함께 있어야 보인다: 기둥 레이어와, 지도를 기울이는 것.
  // 정면에서 내려다보면 기둥이 서 있어도 납작한 면과 구별되지 않는다.
  const set3d = (on) => {
    const map = mapRef.current
    if (!map) return
    for (const id of LYR_3D) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    }
    map.easeTo({ pitch: on ? 60 : 0, duration: 400 })
  }

  const fitTo = (list) => {
    const map = mapRef.current
    if (!map) return
    const bounds = new mapboxgl.LngLatBounds()
    let any = false
    const walk = (c) => { if (typeof c[0] === 'number') { bounds.extend([c[0], c[1]]); any = true } else c.forEach(walk) }
    const geom = (g) => { if (!g) return; if (g.type === 'GeometryCollection') g.geometries?.forEach(geom); else if (g.coordinates) walk(g.coordinates) }
    for (const layer of list) for (const f of layer.features) geom(f.geometry)
    if (any) map.fitBounds(bounds, { padding: 40, duration: 0 })
  }

  return { ready, error, setLayers, setHidden, setLabelsOn, set3d, fitTo, addMs, displayMs, wallCount, elevCount, wallMs }
}
