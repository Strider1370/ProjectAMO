import { useEffect, useMemo, useState } from 'react'
import { DEFAULTS, validateSettings } from './aciExperimentScore.js'
import { ACI_LAYER, removeAciLayer } from './aciExperimentModel.js'
import { aciCellAt, buildAciRaster, decodeAciGrid, syncAciRaster } from './aciExperimentRaster.js'
import { formatSigwxStamp, formatUtcTmfcStamp } from './weatherOverlayModel.js'

// Fixed expanded-area preview, independent of the operational timeline and altitude selector.
export function useAciExperimentOverlay({ mapRef, isStyleReady, styleRevision, enabled, tz }) {
  const [data, setData] = useState(null)
  const [problem, setProblem] = useState(null)
  const [settings, setSettings] = useState(DEFAULTS)
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    if (!enabled || data) return
    const controller = new AbortController()
    async function load() {
      const response = await fetch('/data/aci-experiment/expanded-latest.json', { signal: controller.signal })
      if (!response.ok) throw new Error('확대 실험 자료를 불러오지 못했습니다')
      const meta = await response.json()
      if (!meta.binaryUrl?.startsWith('/data/aci-experiment/')) throw new Error('실험 자료 경로 오류')
      const binary = await fetch(meta.binaryUrl, { signal: controller.signal })
      if (!binary.ok) throw new Error('확대 실험 격자를 불러오지 못했습니다')
      const value = decodeAciGrid(meta, await binary.arrayBuffer())
      if (!controller.signal.aborted) { setData(value); setProblem(null) }
    }
    load().catch(error => { if (!controller.signal.aborted) setProblem(error.message) })
    return () => controller.abort()
  }, [enabled, data])
  const raster = useMemo(() => data ? buildAciRaster(data, settings) : null, [data, settings])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !raster || (!enabled && !map.getLayer(ACI_LAYER))) return
    syncAciRaster(map, raster, enabled)
    const onClick = event => {
      if (enabled) setSelected(aciCellAt(data,event.lngLat.lng,event.lngLat.lat,settings))
    }
    map.on('click', onClick)
    return () => { map.off('click', onClick); removeAciLayer(map) }
  }, [mapRef, isStyleReady, styleRevision, enabled, raster, data, settings])
  function updateSettings(next) {
    try { validateSettings(next); setSettings(next); setSelected(null); setProblem(null) }
    catch { setProblem('상한은 하한보다 커야 하며, 가중치 합은 0보다 커야 합니다.') }
  }
  const timestamp = useMemo(() => !enabled ? null : {
    key: 'aciExperiment', label: '대류 실험',
    issueLabel: data ? formatUtcTmfcStamp(data.tmfc, tz) : '자료 로딩 중',
    validLabel: data ? formatSigwxStamp(data.validAt, tz) : '-',
    note: problem || '확대영역 저장 사례 · 고도·타임라인과 독립', noteTone: problem ? 'warning' : undefined,
  }, [enabled, data, tz, problem])
  return { enabled, settings, updateSettings, selected, problem, timestamp, count: raster?.validCount ?? 0,
    caseLabel: data ? `${formatUtcTmfcStamp(data.tmfc,tz)} 발표 · ${formatSigwxStamp(data.validAt,tz)} 유효` : '자료 로딩 중' }
}
