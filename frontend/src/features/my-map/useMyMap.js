import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, LABEL_PAINT, labelHaloFor, httpsIcon, CIRCLE_FILTER_EXTRA } from './lib/kmlPaint.js'
import { collectIconUrls, iconIdFor } from './lib/kmlIcons.js'
import { parseMyMapFile } from './lib/parseMyMapFile.js'
import { listMyMapFiles, saveMyMapFile, loadMyMapFile, deleteMyMapFile } from './lib/myMapStore.js'

const SRC = 'my-map-src'
// 기상 위험기상·낙뢰는 'top'에 있다. 이용자 지도는 그 아래여야 한다 — 조종사는
// 기상을 보러 왔고, 자기 지도는 그 기상을 어디에 놓고 볼지 알려주는 바탕이다.
const SLOT = 'middle'
const TERRAIN_LAYER = 'terrain-hazard-shade'

// 면 → 선 → 점 → 이름표. 전역으로 이 순서를 지켜야 점이 면에 가리지 않는다.
// 이름표는 Point에만 붙인다 — 도형 묶음은 하위 도형마다 쪼개지면서 속성이 복제되므로,
// 필터가 없으면 지점 하나가 이름표 수백 개가 된다.
const LAYER_DEFS = [
  { kind: 'fill', type: 'fill', geom: ['==', ['geometry-type'], 'Polygon'], paint: FILL_PAINT },
  { kind: 'line', type: 'line', geom: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: LINE_PAINT },
  { kind: 'circle', type: 'circle', geom: ['all', ['==', ['geometry-type'], 'Point'], CIRCLE_FILTER_EXTRA], paint: CIRCLE_PAINT },
  { kind: 'label', type: 'symbol', geom: ['==', ['geometry-type'], 'Point'], paint: LABEL_PAINT, layout: LABEL_LAYOUT },
]
const LYR = (kind) => `my-map-${kind}`

function boundsOf(features) {
  const bounds = new mapboxgl.LngLatBounds()
  let any = false
  const walk = (c) => { if (typeof c[0] === 'number') { bounds.extend([c[0], c[1]]); any = true } else c.forEach(walk) }
  const geom = (g) => {
    if (!g) return
    if (g.type === 'GeometryCollection') g.geometries?.forEach(geom)
    else if (g.coordinates) walk(g.coordinates)
  }
  for (const f of features) geom(f.geometry)
  return any ? bounds : null
}

export default function useMyMap(mapRef, isStyleReady) {
  const [files, setFiles] = useState(() => listMyMapFiles())
  const [activeFileIds, setActiveFileIds] = useState(() => new Set())
  const [layersByFile, setLayersByFile] = useState(() => new Map())
  const [hidden, setHidden] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const stateRef = useRef({ activeFileIds, layersByFile, hidden })
  stateRef.current = { activeFileIds, layersByFile, hidden }

  // 지도에 이미 올린 아이콘. 파일을 껐다 켜도 다시 받지 않는다.
  const loadedIconsRef = useRef(new Set())

  // 아이콘을 지도에 등록한다. 실패한 것은 그냥 두면 그 지점이 원으로 남는다.
  const ensureIcons = useCallback(async (list) => {
    const map = mapRef.current
    if (!map) return
    const wanted = collectIconUrls(list).filter(({ id }) => !loadedIconsRef.current.has(id))
    if (wanted.length === 0) return
    await Promise.all(wanted.map(({ url, id }) => new Promise((resolve) => {
      // mapbox-gl의 loadImage는 콜백 방식이다.
      map.loadImage(url, (error, image) => {
        if (!error && image) {
          if (!map.hasImage(id)) {
            try { map.addImage(id, image) } catch { /* 이미 올라와 있으면 그만이다 */ }
          }
          loadedIconsRef.current.add(id)
        }
        resolve()
      })
    })))
  }, [mapRef])

  // 켜진 파일의 도형을 모아 소스와 레이어를 다시 만든다.
  const rebuild = useCallback(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    const { activeFileIds: active, layersByFile: byFile, hidden: hiddenSet } = stateRef.current

    const features = []
    const visibleFolderIds = []
    for (const fileId of active) {
      const list = byFile.get(fileId)
      if (!list) continue
      for (const layer of list) {
        if (isLayerVisible(list, layer.id, hiddenSet)) visibleFolderIds.push(layer.id)
        for (const f of layer.features) {
          const iconUrl = httpsIcon(f.properties?.icon)
          const iconId = iconUrl ? iconIdFor(iconUrl) : null
          features.push({
            ...f,
            properties: {
              ...f.properties,
              __file: fileId,
              __folder: layer.id,
              // 글자색은 파일 것을 쓰고, 뒤에 깔리는 후광만 읽히도록 반대로 둔다.
              __labelHalo: labelHaloFor(f.properties?.['label-color']),
              // 지도에 실제로 올라간 아이콘만 심는다. 못 올라간 것은 원으로 남는다.
              ...(iconId && loadedIconsRef.current.has(iconId) ? { __icon: iconId } : {}),
            },
          })
        }
      }
    }

    const data = { type: 'FeatureCollection', features }
    if (map.getSource(SRC)) {
      map.getSource(SRC).setData(data)
    } else {
      map.addSource(SRC, { type: 'geojson', data })
    }
    for (const def of LAYER_DEFS) {
      const id = LYR(def.kind)
      const filter = ['all', def.geom, ['in', ['get', '__folder'], ['literal', visibleFolderIds]]]
      if (map.getLayer(id)) { map.setFilter(id, filter); continue }
      map.addLayer({
        id, type: def.type, source: SRC, slot: SLOT, filter, paint: def.paint,
        ...(def.layout ? { layout: def.layout } : {}),
      })
    }
  }, [mapRef, isStyleReady])

  useEffect(() => { rebuild() }, [rebuild, activeFileIds, layersByFile, hidden])

  // 지형 근접도 'middle'이라, 나중에 켜면 이용자 지도를 덮는다. 스타일이 바뀔 때마다
  // 순서를 다시 잡는다 — 기상 > 내 지도 > 지형 근접.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined
    const restack = () => {
      if (!map.getLayer(TERRAIN_LAYER) || !map.getLayer(LYR('fill'))) return
      const ids = map.getStyle()?.layers?.map((l) => l.id) ?? []
      if (ids.indexOf(TERRAIN_LAYER) > ids.indexOf(LYR('fill'))) {
        map.moveLayer(TERRAIN_LAYER, LYR('fill'))
      }
    }
    map.on('styledata', restack)
    return () => { map.off('styledata', restack) }
  }, [mapRef])

  const fitTo = useCallback((features) => {
    const map = mapRef.current
    const bounds = boundsOf(features)
    if (map && bounds) map.fitBounds(bounds, { padding: 60, duration: 0 })
  }, [mapRef])

  const openFile = useCallback(async (fileId, arrayBuffer, fileName) => {
    setError(null)
    let parsed
    try {
      setBusy('지도 내용 해석 중… 파일이 크면 시간이 걸릴 수 있습니다')
      parsed = await parseMyMapFile(arrayBuffer, fileName)
    } catch (e) {
      setBusy(null)
      setError(`${e?.stage ?? '파일 읽기'} 단계에서 실패: ${e?.message ?? e}`)
      return null
    }
    // 아이콘을 먼저 올린다. 순서가 바뀌면 첫 그리기에 아이콘이 빠진다.
    setBusy('아이콘 불러오는 중…')
    await ensureIcons(parsed.list)
    setBusy('지도에 올리는 중…')
    setLayersByFile((prev) => new Map(prev).set(fileId, parsed.list))
    setActiveFileIds((prev) => new Set(prev).add(fileId))
    setBusy(null)
    return parsed
  }, [ensureIcons])

  const addFile = useCallback(async (file) => {
    if (!file) return
    setError(null)
    setBusy('파일 읽는 중…')
    let buffer
    try {
      buffer = await file.arrayBuffer()
    } catch (e) {
      setBusy(null)
      setError(`파일 읽기 단계에서 실패: ${e?.message ?? e}`)
      return
    }
    const saved = await saveMyMapFile(file)
    // 보관에 실패해도 이번에 연 파일은 보여준다. 보관 실패가 표시 실패가 되면 안 된다.
    const entry = saved.ok
      ? saved.entry
      : { id: `tmp-${file.name}-${file.size}`, name: file.name, size: file.size, addedAt: 0 }
    if (!saved.ok) setError('파일을 보관하지 못했습니다. 이번에는 볼 수 있지만 다음에 다시 올려야 합니다.')
    setFiles((prev) => (prev.some((f) => f.id === entry.id) ? prev : [...prev, entry]))
    const parsed = await openFile(entry.id, buffer, file.name)
    if (parsed) fitTo(parsed.list.flatMap((l) => l.features))
  }, [openFile, fitTo])

  const toggleFile = useCallback(async (id) => {
    const { activeFileIds: active, layersByFile: byFile } = stateRef.current
    if (active.has(id)) {
      setActiveFileIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      return
    }
    if (byFile.has(id)) {
      setActiveFileIds((prev) => new Set(prev).add(id))
      return
    }
    setBusy('보관한 파일 여는 중…')
    const loaded = await loadMyMapFile(id)
    if (!loaded.ok) {
      setBusy(null)
      setError('보관한 파일을 찾지 못했습니다. 다시 올려주세요.')
      return
    }
    const entry = files.find((f) => f.id === id)
    const parsed = await openFile(id, loaded.buffer, entry?.name ?? '')
    if (parsed) fitTo(parsed.list.flatMap((l) => l.features))
  }, [files, openFile, fitTo])

  const removeFile = useCallback(async (id) => {
    await deleteMyMapFile(id)
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setActiveFileIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    setLayersByFile((prev) => { const next = new Map(prev); next.delete(id); return next })
  }, [])

  const toggleFolder = useCallback((folderId) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

  // 켜진 파일의 폴더를 한 번에 끄고 켠다. 폴더가 101개라 하나씩 누르게 두면 안 된다.
  const setAllFolders = useCallback((on) => {
    const { activeFileIds: active, layersByFile: byFile } = stateRef.current
    if (on) { setHidden(new Set()); return }
    const next = new Set()
    for (const fileId of active) {
      for (const layer of byFile.get(fileId) ?? []) next.add(layer.id)
    }
    setHidden(next)
  }, [])

  // 꺼져 있던 폴더면 켜면서 옮긴다 — 옮겨갔는데 아무것도 없으면 뜻이 없다.
  const flyToFolder = useCallback((folderId) => {
    const { layersByFile: byFile } = stateRef.current
    for (const list of byFile.values()) {
      const layer = list.find((l) => l.id === folderId)
      if (!layer) continue
      setHidden((prev) => {
        const next = new Set(prev)
        next.delete(folderId)
        let p = layer.parentId
        const byId = new Map(list.map((l) => [l.id, l]))
        while (p) { next.delete(p); p = byId.get(p)?.parentId ?? null }
        return next
      })
      const prefix = `${layer.path.join('/')}/`
      const own = list.filter((l) => l.id === folderId || l.path.join('/').startsWith(prefix))
      fitTo(own.flatMap((l) => l.features))
      return
    }
  }, [fitTo])

  return {
    files, activeFileIds, layersByFile, hidden, busy, error,
    addFile, toggleFile, removeFile, toggleFolder, setAllFolders, flyToFolder,
  }
}
