// KIM 지상 일기도 오버레이 훅. 자료 fetch, 타임라인 시각 선택, 레이어 동기화, 바람 입자를 소유한다.
// 기존 오버레이 훅과 같은 인자를 받는다 — { mapRef, isStyleReady, styleRevision }.
import { useEffect, useMemo, useState } from 'react'
import CanvasWindRenderer from './canvasWindRenderer.js'
import WebGLWindRenderer from './webglWindRenderer.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'
import { syncSurfaceChartLayers } from './surfaceChartLayers.js'
import { registerAirportWindBarbImages } from '../../map/lib/airportStationImages.js'
import {
  SURFACE_CHART_LATEST_URL,
  listSurfaceChartTimes,
  pickSurfaceChartFrame,
  selectSurfaceChartBarbs,
  selectSurfaceChartRun,
  surfaceChartFrameUrls,
} from './surfaceChartModel.js'
import { formatSigwxStamp, formatUtcTmfcStamp } from './weatherOverlayModel.js'
import { pinnedModel } from '../../organization-lounge/lib/pinnedMapDataSelection.js'

const CLOCK_TICK_MS = 60_000
// 동아시아 전체를 보는 배율에서 기존 한반도 바람 레이어와 같은 꼬리 길이가 되도록 속도를 보정한다.
const FLOW_OPTIONS = Object.freeze({
  adaptiveParticleDensity: true,
  zoomAdaptiveDensity: true,
  samplerLod: true,
  flowColorMode: 'neutral',
  flowColor: 'rgba(255, 255, 255, 0.95)',
  flowOpacity: 0.9,
  flowWidth: 1.5,
  trailPersistence: 0.9,
  zoomSpeedReference: 6,
  desktopCap: 6000,
  particleDensityScale: 1,
})
const LOW_POWER_FLOW_OPTIONS = Object.freeze({ desktopCap: 800, mobileCap: 800, frameCap: 15, sampleStep: 4, pixelRatioCap: 1.5 })

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`kim_surface_chart_${response.status}`)
  return response.json()
}

function createFlowRenderer(map, options) {
  try {
    return new WebGLWindRenderer(map, options)
  } catch {
    try { return new CanvasWindRenderer(map, options) } catch { return null }
  }
}

export function useKimSurfaceChart({
  mapRef,
  isStyleReady,
  styleRevision,
  visible,
  show = { isobars: true, precip: true, barbs: true, flow: false },
  targetMs = null,
  dataMode = 'live',
  mapDataSelection = null,
  basemapId,
  lowPower = false,
  tz = 'KST',
}) {
  // 기관 브리핑은 특정 KIM 런·시각에 고정된다. 일기도도 같은 런과 유효시각을 쓴다.
  const pinned = dataMode === 'pinned'
  const pinnedKim = pinned ? pinnedModel(mapDataSelection, 'kim') : null
  const pinnedTmfc = pinned ? (pinnedKim?.tmfc ?? '') : null
  const pinnedTargetMs = pinned ? Date.parse(pinnedKim?.validTime) : Number.NaN
  const snapshotMeta = useKimSnapshotMeta(visible)
  const latestHash = snapshotMeta?.kimSurfaceChart?.hash ?? null
  const [latest, setLatest] = useState(null)
  const [status, setStatus] = useState('idle')
  const [frameData, setFrameData] = useState(null)
  const [barbs, setBarbs] = useState(null)
  const [clockMs, setClockMs] = useState(() => Date.now())

  useEffect(() => {
    if (!visible) return undefined
    const controller = new AbortController()
    setStatus((previous) => (previous === 'ready' ? previous : 'loading'))
    fetchJson(SURFACE_CHART_LATEST_URL, controller.signal)
      .then((payload) => { setLatest(payload); setStatus('ready') })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        // 받아 둔 자료가 있으면 유지한다. 처음부터 없으면 사용할 수 없음으로 둔다.
        setStatus((previous) => (previous === 'ready' ? previous : 'unavailable'))
      })
    return () => controller.abort()
  }, [visible, latestHash])

  useEffect(() => {
    if (!visible || Number.isFinite(targetMs)) return undefined
    const timer = setInterval(() => setClockMs(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [visible, targetMs])

  const run = useMemo(() => (pinned && !pinnedTmfc ? null : selectSurfaceChartRun(latest, { pinnedTmfc })), [latest, pinned, pinnedTmfc])
  const times = useMemo(() => (visible ? listSurfaceChartTimes(run) : []), [visible, run])
  const effectiveTargetMs = pinned ? pinnedTargetMs : Number.isFinite(targetMs) ? targetMs : clockMs
  const frame = useMemo(() => pickSurfaceChartFrame(run, effectiveTargetMs), [run, effectiveTargetMs])
  const urls = useMemo(() => surfaceChartFrameUrls(latest, frame, run), [latest, frame, run])

  useEffect(() => {
    if (!visible || !urls) { setFrameData(null); return undefined }
    const controller = new AbortController()
    Promise.all([
      fetchJson(urls.isobars, controller.signal),
      fetchJson(urls.centers, controller.signal),
      fetchJson(urls.wind, controller.signal),
    ])
      .then(([isobars, centers, wind]) => setFrameData({ key: urls.isobars, isobars, centers, wind, precipUrl: urls.precip }))
      .catch((error) => { if (error?.name !== 'AbortError') setFrameData(null) })
    return () => controller.abort()
  }, [visible, urls])

  // 바람깃은 화면 픽셀 간격으로 고르므로 지도 이동이 끝날 때마다 다시 고른다.
  useEffect(() => {
    const map = mapRef.current
    const windField = frameData?.wind
    if (!map || !isStyleReady || !visible || !show.barbs || !windField) { setBarbs(null); return undefined }
    const update = () => {
      const canvas = map.getCanvas?.()
      setBarbs(selectSurfaceChartBarbs(windField, {
        width: canvas?.clientWidth ?? 0,
        height: canvas?.clientHeight ?? 0,
        unproject: (point) => map.unproject(point),
      }))
    }
    update()
    map.on('moveend', update)
    map.on('resize', update)
    return () => {
      map.off('moveend', update)
      map.off('resize', update)
    }
  }, [mapRef, isStyleReady, styleRevision, visible, show.barbs, frameData])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    syncSurfaceChartLayers(map, {
      visible,
      show,
      frame: frameData ? { isobars: frameData.isobars, centers: frameData.centers, precipUrl: frameData.precipUrl, view: latest?.view } : null,
      barbs,
      basemapId,
      ensureBarbImages: registerAirportWindBarbImages,
    })
  }, [mapRef, isStyleReady, styleRevision, visible, show, frameData, barbs, basemapId, latest?.view])

  // 바람 입자: 기존 바람 레이어와 별개 인스턴스라 서로의 상태를 건드리지 않는다.
  useEffect(() => {
    const map = mapRef.current
    const windField = frameData?.wind
    if (!map || !isStyleReady || !visible || !show.flow || !windField) return undefined
    const options = { ...FLOW_OPTIONS, ...(lowPower ? LOW_POWER_FLOW_OPTIONS : {}) }
    const renderer = createFlowRenderer(map, options)
    if (!renderer) return undefined
    renderer.setData(windField)
    renderer.setVisibility({ flow: true })
    let frameId = null
    const resize = () => renderer.resize()
    const redraw = () => {
      if (frameId != null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        renderer.redrawForMapInteraction?.()
      })
    }
    // 줌이 끝나면 속도 보정과 입자 수를 새 배율에 맞춘다.
    const rescale = () => renderer.setOptions(options)
    map.on('resize', resize)
    for (const event of ['move', 'zoom', 'moveend']) map.on(event, redraw)
    map.on('zoomend', rescale)
    return () => {
      map.off('resize', resize)
      for (const event of ['move', 'zoom', 'moveend']) map.off(event, redraw)
      map.off('zoomend', rescale)
      if (frameId != null) window.cancelAnimationFrame(frameId)
      renderer.destroy()
    }
  }, [mapRef, isStyleReady, styleRevision, visible, show.flow, frameData, lowPower])

  const unavailableReason = !visible
    ? null
    : status === 'unavailable'
      ? '강수 예측 자료를 불러오지 못했습니다'
      : pinned && latest && !run
        ? '브리핑 시각의 강수 예측이 보관 기간이 지나 없습니다'
        : run && !frame
          ? '이 시각의 강수 예측이 없습니다(+3~+12시간만 제공)'
          : null

  return {
    status,
    times,
    run,
    frame,
    unavailableReason,
    issueLabel: run ? formatUtcTmfcStamp(run.tmfc, tz) : '-',
    validLabel: frame ? formatSigwxStamp(new Date(frame.validTimeMs).toISOString(), tz) : '-',
    precipStartLabel: frame ? formatSigwxStamp(new Date(frame.precipStartMs).toISOString(), tz) : '-',
  }
}

export default useKimSurfaceChart
