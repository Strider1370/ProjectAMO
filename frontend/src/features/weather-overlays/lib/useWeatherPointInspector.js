import { fetchKimAciPoint } from '../../../api/weatherApi.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildAciPointRow, buildWeatherPointRows, chooseWeatherPointPlacement, createWeatherPointSamplers } from './weatherPointInspector.js'

const NO_PRIORITY_LAYERS = Object.freeze([])

export function useWeatherPointInspector({
  mapRef,
  isStyleReady,
  enabled,
  visibility,
  fields,
  issueLabel,
  validLabel,
  turbulenceIssueLabel,
  turbulenceValidLabel,
  shouldSkipClick,
  aciTime = null,
  aciIssueLabel,
  aciValidLabel,
  canPick,
  aciPriorityLayers = NO_PRIORITY_LAYERS,
}) {
  const [selection, setSelection] = useState(null)
  const pending = useRef(null)
  const canPickRef = useRef(canPick)
  canPickRef.current = canPick
  const samplers = useMemo(() => createWeatherPointSamplers(fields), [fields])

  useEffect(() => {
    pending.current?.abort()
    setSelection(null)
    const map = mapRef.current
    if (!map || !isStyleReady || !enabled) {
      setSelection(null)
      return undefined
    }

    function onMapClick(event) {
      if (canPickRef.current && !canPickRef.current()) return
      pending.current?.abort()
      if (shouldSkipClick?.(event)) { setSelection(null); return }
      const { lng, lat } = event.lngLat
      const rows = buildWeatherPointRows({
        lon: lng,
        lat,
        visibility,
        fields,
        samplers,
        issueLabel,
        validLabel,
        turbulenceIssueLabel,
        turbulenceValidLabel,
      })
      const containerWidth = map.getContainer?.()?.clientWidth || map.getCanvas?.()?.clientWidth || 0
      const placement = chooseWeatherPointPlacement(event.point.x, containerWidth)
      const selected = { lng, lat, point: event.point, placement }
      setSelection(rows.length ? { ...selected, rows } : null)
      const priorityLayers = aciPriorityLayers.filter(id => map.getLayer(id))
      if (!aciTime || (priorityLayers.length && map.queryRenderedFeatures(event.point, { layers: priorityLayers }).length)) return
      const controller = new AbortController()
      pending.current = controller
      const showAciRow = point => {
        if (!controller.signal.aborted) setSelection({ ...selected, rows: [...rows, buildAciPointRow(point, { issueLabel: aciIssueLabel, validLabel: aciValidLabel })] })
      }
      fetchKimAciPoint(aciTime, { lon: lng, lat }, { signal: controller.signal })
        .then(showAciRow)
        .catch(() => showAciRow(null))
    }

    map.on('click', onMapClick)
    return () => { pending.current?.abort(); map.off?.('click', onMapClick) }
  }, [shouldSkipClick, enabled, fields, isStyleReady, issueLabel, mapRef, samplers, turbulenceIssueLabel, turbulenceValidLabel, validLabel, visibility, aciTime, aciIssueLabel, aciValidLabel, aciPriorityLayers])

  return { selection: enabled ? selection : null, clearSelection: () => { pending.current?.abort(); setSelection(null) } }
}
