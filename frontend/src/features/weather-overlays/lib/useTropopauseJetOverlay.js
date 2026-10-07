import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchKimTropopauseField, fetchKimTropopauseIndex, fetchKimTropopauseRuns } from '../../../api/weatherApi.js'
import { coordinatesForGrid } from './overlayUtils.js'
import { createTropopauseJetRenderer } from './tropopauseJetRenderer.js'
import { buildTropopauseJetModel, pickTropopauseTime } from './tropopauseJetModel.js'
import { formatSigwxStamp, formatUtcTmfcStamp } from './weatherOverlayModel.js'
import { kimFieldCache } from './kimFieldCache.js'

export const TROPOPAUSE_JET_SOURCE_ID = 'kim-tropopause-jet-source'
export const TROPOPAUSE_JET_LAYER_ID = 'kim-tropopause-jet-layer'
const INDEX_REFRESH_MS = 10 * 60 * 1000
// 다른 KIM 레이어와 같은 바이트 상한을 나눠 쓴다(kimFieldCache.js).
const fieldCache = kimFieldCache.view('tropopause')

function rasterUrl(raster) {
  const canvas = document.createElement('canvas')
  canvas.width = raster.width; canvas.height = raster.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0)
  return canvas.toDataURL('image/png')
}

export function removeTropopauseJetLayers(map) {
  if (map?.getLayer?.(TROPOPAUSE_JET_LAYER_ID)) map.removeLayer(TROPOPAUSE_JET_LAYER_ID)
  if (map?.getSource?.(TROPOPAUSE_JET_SOURCE_ID)) map.removeSource(TROPOPAUSE_JET_SOURCE_ID)
}

function installRaster(map, model, url) {
  const image = { url, coordinates: coordinatesForGrid(model.grid) }
  const source = map.getSource?.(TROPOPAUSE_JET_SOURCE_ID)
  if (source?.updateImage) source.updateImage(image)
  else map.addSource(TROPOPAUSE_JET_SOURCE_ID, { type: 'image', ...image })
  if (!map.getLayer?.(TROPOPAUSE_JET_LAYER_ID)) map.addLayer({
    id: TROPOPAUSE_JET_LAYER_ID, type: 'raster', source: TROPOPAUSE_JET_SOURCE_ID, slot: 'middle',
    paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
  })
}

/** 권계면·제트 레이어: 실시간 KIM 결과만 읽는다(기관 고정 자료는 아직 지원하지 않음).
 * 보기 시각에 가장 가까운 예보시각을 고르며, 다른 시각 자료로 대신하지 않는다.
 * listCases이면 저장된 결과 목록을 읽고, caseKey(`tmfc:hf:revision`)를 주면 그 결과를 그대로 보여 준다(개발용 사례 비교). */
export function useTropopauseJetOverlay({ mapRef, isStyleReady, styleRevision, enabled, selectedMs, tz, caseKey = null, listCases = false }) {
  const [index, setIndex] = useState(null)
  const [cases, setCases] = useState([])
  const [field, setField] = useState(null)
  const [problem, setProblem] = useState(null)
  const renderer = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    const load = () => fetchKimTropopauseIndex({ signal: controller.signal })
      .then(value => { setIndex(value); setProblem(null) })
      .catch(error => { if (!controller.signal.aborted) setProblem(/HTTP 503/.test(error?.message ?? '') ? '권계면·제트 자료 준비 중' : '권계면·제트 목록을 불러오지 못했습니다') })
    load()
    const timer = window.setInterval(load, INDEX_REFRESH_MS)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !listCases) return undefined
    const controller = new AbortController()
    fetchKimTropopauseRuns({ signal: controller.signal }).then(value => setCases(value?.fields ?? [])).catch(() => {})
    return () => controller.abort()
  }, [enabled, listCases])

  const picked = useMemo(() => enabled ? pickTropopauseTime(index?.times, selectedMs) : null, [enabled, index, selectedMs])
  const chosenCase = caseKey ? cases.find(c => `${c.tmfc}:${c.hf}:${c.revision}` === caseKey) ?? null : null
  const time = chosenCase ?? (picked ? { ...picked, tmfc: index.latestRun } : null)
  const requestKey = time ? `${time.tmfc}:${time.hf}:${time.revision}` : null
  useEffect(() => {
    if (!enabled || !requestKey) return undefined
    if (fieldCache.has(requestKey)) { setField(fieldCache.get(requestKey)); return undefined }
    const controller = new AbortController()
    fetchKimTropopauseField({ tmfc: time.tmfc, hf: time.hf, revision: time.revision }, { signal: controller.signal })
      .then(value => {
        fieldCache.set(requestKey, value); setField(value); setProblem(null)
      })
      .catch(() => { if (!controller.signal.aborted) setProblem('권계면·제트 자료를 불러오지 못했습니다') })
    return () => controller.abort()
  }, [enabled, requestKey, time?.tmfc, time?.hf, time?.revision])

  const current = enabled && field && `${field.time.tmfc}:${field.time.hf}:${field.revision}` === requestKey ? field : null
  const model = useMemo(() => current ? buildTropopauseJetModel(current) : null, [current])
  const url = useMemo(() => model ? rasterUrl(model.raster) : null, [model])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !enabled) return undefined
    renderer.current = createTropopauseJetRenderer(map)
    return () => {
      renderer.current?.destroy(); renderer.current = null
      removeTropopauseJetLayers(map)
    }
  }, [mapRef, isStyleReady, enabled])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !enabled) return
    try {
      if (model && url) installRaster(map, model, url)
      else removeTropopauseJetLayers(map)
      renderer.current?.setModel(model)
    } catch (error) { setProblem(error.message) }
  }, [mapRef, isStyleReady, styleRevision, enabled, model, url])

  const loaded = Boolean(current)
  const timestamp = useMemo(() => enabled ? {
    key: 'tropopauseJet', label: '권계면·제트',
    issueLabel: time ? formatUtcTmfcStamp(time.tmfc, tz) : '-',
    validLabel: time ? formatSigwxStamp(time.validTime, tz) : null,
    note: problem || (!loaded ? '불러오는 중' : null),
    noteTone: problem ? 'warning' : undefined,
  } : null, [enabled, time?.tmfc, time?.validTime, tz, problem, loaded])
  const times = useMemo(() => enabled && index ? index.times.map(t => ({ tmfc: index.latestRun, hf: t.hf, validTime: t.validTime })) : [], [enabled, index])

  return { times, timestamp, field: current, model, problem, cases, caseKey: chosenCase ? caseKey : null }
}

export default useTropopauseJetOverlay
