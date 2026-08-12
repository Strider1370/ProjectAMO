import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { MAP_CONFIG, BASEMAP_OPTIONS } from '../map/mapConfig.js'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, LABEL_PAINT } from './lib/kmlPaint.js'

const SRC = 'kml-src'
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
  }

  const setLayers = (list, startedAt) => {
    const map = mapRef.current
    if (!map) return
    const started = performance.now()
    for (const def of LAYER_DEFS) if (map.getLayer(LYR(def.kind))) map.removeLayer(LYR(def.kind))
    if (map.getSource(SRC)) map.removeSource(SRC)

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

  return { ready, error, setLayers, setHidden, setLabelsOn, fitTo, addMs, displayMs }
}
