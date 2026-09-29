import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWafsChartRenderer } from './wafsChartRenderer.js'
import { wafsChartPalette } from './wafsChartPalette.js'
import { selectHazardFill } from './wafsHazardFill.js'
import { installHighLayers, removeHighLayers, HIGH_LAYERS } from './sigwxHighLayers.js'
import { HIGH_DEFAULT_FILTER, HIGH_HOUR_MS, highStamp, highTimelineEntries, pickHighFrame } from './sigwxHighModel.js'

const ROOT = '/data/sigwx-high/'
const requests = new Map()
function readSample(file) {
  if (!requests.has(file)) requests.set(file, fetch(ROOT + file).then(response => {
    if (!response.ok) throw new Error(`샘플 불러오기 실패 (${response.status})`)
    return response.json()
  }).catch(error => { requests.delete(file); throw error }))
  return requests.get(file)
}
const EMPTY = { type: 'FeatureCollection', features: [], areas: [], metadata: { bounds: [75, -20, 170, 70] } }

export function useSigwxHighOverlay({ mapRef, isStyleReady, styleRevision, enabled, selectedMs, basemapId, tz,
  priorityLayers = [], canPick, pausePlayback }) {
  const [index, setIndex] = useState(null)
  const [loaded, setLoaded] = useState(null)
  const [problem, setProblem] = useState(null)
  const [retry, setRetry] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [filter, setFilter] = useState(HIGH_DEFAULT_FILTER)
  const [selection, setSelection] = useState(null)
  const renderer = useRef(null)
  const interaction = useRef(null)
  interaction.current = { priorityLayers, canPick, pausePlayback }
  const palette = wafsChartPalette(basemapId)

  useEffect(() => {
    if (!enabled) return undefined
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [enabled])
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    setProblem(null)
    readSample('index.json').then(value => {
      if (!Array.isArray(value.frames) || !value.frames.length) throw new Error('샘플 시간 목록이 비어 있습니다.')
      if (!cancelled) setIndex(value)
    }).catch(error => { if (!cancelled) setProblem(error.message) })
    return () => { cancelled = true }
  }, [enabled, retry])
  const picked = useMemo(() => enabled ? pickHighFrame(index?.frames, selectedMs ?? nowMs) : null, [enabled, index, selectedMs, nowMs])
  const file = picked?.frame.file
  useEffect(() => {
    if (!enabled || !file) return undefined
    let cancelled = false
    setProblem(null)
    readSample(file).then(data => {
      if (!Array.isArray(data.features) || !data.metadata?.frameId) throw new Error('샘플 형식이 올바르지 않습니다.')
      if (!cancelled) setLoaded({ file, data })
    }).catch(error => { if (!cancelled) setProblem(error.message) })
    return () => { cancelled = true }
  }, [enabled, file, retry])
  // Warm the next frame only; the whole XML-derived series is never in the JS bundle.
  useEffect(() => {
    if (!enabled || !loaded || loaded.file !== file || !index) return
    const position = index.frames.findIndex(frame => frame.file === file)
    const next = index.frames[(position + 1) % index.frames.length]
    if (next) readSample(next.file).catch(() => {})
  }, [enabled, loaded, file, index])
  // Before the index arrives, both file values are undefined. They must not
  // count as a matching loaded frame (loaded is still null at that point).
  const frame = enabled && file && loaded?.file === file ? loaded.data : null
  const data = useMemo(() => frame ? { ...frame,
    features: frame.features.filter(feature => filter[feature.properties.phenomenon]),
    areas: frame.areas.filter(area => filter[area.phenomenon]),
  } : EMPTY, [frame, filter])
  const selectionKey = frame ? `${frame.metadata.frameId}/${picked.ms}` : null
  const currentSelection = enabled && selection?.key === selectionKey ? selection : null

  useEffect(() => { setSelection(null) }, [enabled, selectionKey, filter])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !enabled) return undefined
    renderer.current = createWafsChartRenderer(map, setProblem)
    return () => {
      renderer.current?.destroy(); renderer.current = null
      removeHighLayers(map)
    }
  }, [mapRef, isStyleReady, enabled])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !enabled || !renderer.current) return
    try {
      installHighLayers(map, data, palette)
      renderer.current.setData(data, palette)
    } catch (error) { setProblem(error.message) }
  }, [mapRef, isStyleReady, styleRevision, enabled, data, palette])
  useEffect(() => {
    if (!isStyleReady || !enabled || !mapRef.current) return
    const id = currentSelection?.activeId || null
    renderer.current?.selectArea(id)
    selectHazardFill(mapRef.current, id, palette)
  }, [mapRef, isStyleReady, styleRevision, enabled, data, palette, currentSelection])

  const hit = useCallback(event => {
    const map = mapRef.current
    if (!map || !renderer.current || interaction.current.canPick?.() === false) return null
    const priority = interaction.current.priorityLayers.filter(id => map.getLayer(id))
    if (priority.length && map.queryRenderedFeatures(event.point, { layers: priority }).length) return null
    const annotation = renderer.current.hitTest(event.point)
    if (annotation) return [annotation.properties]
    const areas = renderer.current.hitAreas(event.point)
    if (areas.length) return areas.map(f => f.properties)
    const layers = HIGH_LAYERS.filter(id => map.getLayer(id))
    const { x, y } = event.point
    const features = layers.length ? map.queryRenderedFeatures([[x - 4, y - 4], [x + 4, y + 4]], { layers }) : []
    return features.length ? [features[0].properties] : null
  }, [mapRef])
  const shouldSkipLowerPriorityClick = useCallback(event => Boolean(enabled && hit(event)), [enabled, hit])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !enabled || !frame) return undefined
    const click = event => {
      const items = hit(event)
      if (!items) { setSelection(null); return }
      interaction.current.pausePlayback?.()
      setSelection({ key: selectionKey, items, activeId: items[0].objectId })
    }
    map.on('click', click)
    return () => map.off('click', click)
  }, [mapRef, isStyleReady, enabled, frame, selectionKey, hit])

  const bucket = Math.floor(nowMs / (3 * HIGH_HOUR_MS)) * 3 * HIGH_HOUR_MS
  const entries = useMemo(() => enabled ? highTimelineEntries(index?.frames, bucket) : [], [enabled, index, bucket])
  const timestamp = enabled ? {
    key: 'sigwxHigh', label: 'SIGWX HIGH · 고정 샘플', timeLabel: '발표',
    issueLabel: picked ? highStamp(picked.frame.issueTime, tz) : '불러오는 중',
    validLabel: picked ? highStamp(picked.frame.validTime, tz) : null,
    validTimeLabel: '유효',
    note: problem || (!frame ? '샘플 불러오는 중' : '주의: SIGWX HIGH는 현재 기상 자료가 아닙니다. 고정 샘플을 48시간 주기로 반복 표시합니다.'),
    noteTone: 'warning',
    onRetry: problem ? () => setRetry(value => value + 1) : null,
  } : null
  return {
    frame, picked, filter, palette, selection: currentSelection, timestamp, entries,
    count: new Set(data.features.map(feature => feature.properties.objectId)).size,
    toggleType: id => setFilter(previous => ({ ...previous, [id]: !previous[id] })),
    clearSelection: () => setSelection(null),
    choose: id => setSelection(previous => previous ? { ...previous, activeId: id } : null),
    shouldSkipLowerPriorityClick,
  }
}
