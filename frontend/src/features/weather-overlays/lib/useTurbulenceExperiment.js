import { useEffect, useMemo, useRef, useState } from 'react'
import { destroyExperimentOverlay, sampleExperimentField, syncExperimentOverlay } from './turbulenceExperimentOverlay.js'
import { formatSigwxStamp, formatUtcTmfcStamp } from './weatherOverlayModel.js'
import { experimentFrameAt } from './turbulenceExperimentModel.js'

const URL = '/api/kim/turbulence-experiment'

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`experiment_${response.status}`)
  return response.json()
}

export function validateExperimentField(field, index, selection) {
  const frame = index.times.find((t) => t.hf === selection.hf)
  const diagnostic = index.diagnostics.find((d) => d.id === selection.diagnostic)
  if (field.type !== 'kim_turbulence_experiment_field' || field.experimental !== true
    || field.revision !== index.revision || field.tmfc !== index.tmfc || field.algorithm !== index.algorithm
    || field.diagnostic?.colorMax !== diagnostic?.colorMax || field.diagnostic?.unit !== diagnostic?.unit
    || field.hf !== selection.hf || field.validTime !== frame?.validTime
    || field.level?.id !== selection.level || field.diagnostic?.id !== selection.diagnostic
    || !['nx', 'ny', 'lonMin', 'lonMax', 'latMin', 'latMax'].every((k) => field.grid?.[k] === index.grid[k])
    || !Array.isArray(field.values) || field.values.length !== field.grid.nx * field.grid.ny
    || field.values.some((v) => v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0))) {
    throw new Error('Invalid experiment field identity or grid')
  }
  return field
}

export function useTurbulenceExperiment({ mapRef, isStyleReady, styleRevision, visible, allowed = true, tz, targetMs, onFrameTimeChange }) {
  const [index, setIndex] = useState(null)
  const [selection, setSelection] = useState({ level: '500hPa', diagnostic: 'gktg', hf: 6 })
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const [loaded, setLoaded] = useState(null)
  const [status, setStatus] = useState('idle')
  const [sample, setSample] = useState(null)
  const active = visible && allowed
  useEffect(() => {
    if (!active) return undefined
    const controller = new AbortController()
    setStatus('loading')
    fetchJson(URL, controller.signal).then((payload) => {
      if (controller.signal.aborted) return
      if (payload.type !== 'kim_turbulence_experiment_index' || !payload.experimental
        || !payload.times?.length || !payload.levels?.length || !payload.diagnostics?.length) throw new Error('Invalid experiment manifest')
      setIndex(payload)
      const previous = selectionRef.current
      const next = {
        hf: payload.times.some((t) => t.hf === previous.hf) ? previous.hf : payload.times[0].hf,
        level: payload.levels.some((l) => l.id === previous.level) ? previous.level : payload.levels[0].id,
        diagnostic: payload.diagnostics.some((d) => d.id === previous.diagnostic) ? previous.diagnostic : payload.diagnostics[0].id,
      }
      setSelection(next)
      onFrameTimeChange?.(Date.parse(payload.times.find((t) => t.hf === next.hf).validTime))
    }).catch((e) => { if (e.name !== 'AbortError') setStatus('unavailable') })
    return () => controller.abort()
  }, [active, onFrameTimeChange])
  const frameAtTarget = index ? experimentFrameAt(index.times, targetMs) : null
  const outsideTime = !!index && !frameAtTarget
  useEffect(() => {
    if (!active || !frameAtTarget) return
    setSelection((previous) => previous.hf === frameAtTarget.hf ? previous : { ...previous, hf: frameAtTarget.hf })
  }, [active, frameAtTarget?.hf])
  const request = useMemo(() => index ? `${URL}/field?${new URLSearchParams({ revision: index.revision, ...selection })}` : null, [index, selection])
  useEffect(() => {
    if (!active || !request) return undefined
    const controller = new AbortController()
    setStatus('loading')
    setSample(null)
    fetchJson(request, controller.signal).then((payload) => {
      if (controller.signal.aborted) return
      const field = validateExperimentField(payload, index, selection)
      setLoaded({ request, field })
      setStatus('ready')
    }).catch((e) => { if (e.name !== 'AbortError') setStatus('unavailable') })
    return () => controller.abort()
  }, [active, request, index, selection])
  // Never label the previous layer as a newly selected level/index/hour.
  const field = active && !outsideTime && status === 'ready' && loaded?.request === request
    && loaded.field.hf === frameAtTarget?.hf ? loaded.field : null
  useEffect(() => {
    if (isStyleReady) syncExperimentOverlay(mapRef.current, field, active)
  }, [mapRef, isStyleReady, styleRevision, field, active])
  useEffect(() => {
    const map = mapRef.current
    return () => destroyExperimentOverlay(map)
  }, [mapRef, isStyleReady])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !field) return undefined
    const onMove = ({ lngLat }) => setSample({ lng: lngLat.lng, lat: lngLat.lat, value: sampleExperimentField(field, lngLat.lng, lngLat.lat) })
    const onLeave = () => setSample(null)
    map.on('mousemove', onMove)
    map.getCanvas().addEventListener('mouseleave', onLeave)
    return () => {
      map.off('mousemove', onMove)
      map.getCanvas().removeEventListener('mouseleave', onLeave)
    }
  }, [mapRef, isStyleReady, field])
  const timestamp = useMemo(() => field ? {
    key: 'kimTurbulence', label: 'GKTG(시험이식)', issueLabel: formatUtcTmfcStamp(field.tmfc, tz),
    validLabel: formatSigwxStamp(field.validTime, tz), note: '과거 자료 · 24종 결합 · KIM 보정 미검증',
  } : null, [field, tz])
  const select = (key, value) => {
    setSelection((previous) => ({ ...previous, [key]: value }))
    if (key === 'hf') onFrameTimeChange?.(Date.parse(index.times.find((t) => t.hf === value).validTime))
  }
  return { index, selection, select, field, status: !allowed ? 'unsupported' : outsideTime ? 'outside' : status, sample, timestamp, tz }
}
