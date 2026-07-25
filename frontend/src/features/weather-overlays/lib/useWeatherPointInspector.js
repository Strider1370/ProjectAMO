import { useEffect, useMemo, useState } from 'react'
import { buildWeatherPointRows, chooseWeatherPointPlacement, createWeatherPointSamplers } from './weatherPointInspector.js'

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
}) {
  const [selection, setSelection] = useState(null)
  const samplers = useMemo(() => createWeatherPointSamplers(fields), [fields])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !enabled) {
      setSelection(null)
      return undefined
    }

    function onMapClick(event) {
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
      setSelection(rows.length ? { lng, lat, point: event.point, placement, rows } : null)
    }

    map.on('click', onMapClick)
    return () => map.off?.('click', onMapClick)
  }, [enabled, fields, isStyleReady, issueLabel, mapRef, samplers, turbulenceIssueLabel, turbulenceValidLabel, validLabel, visibility])

  return { selection, clearSelection: () => setSelection(null) }
}
