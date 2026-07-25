import { useEffect, useRef, useState } from 'react'
import { syncEchoTopLayer } from './echoTopLayers.js'

export function useEchoTopOverlay({ mapRef, isStyleReady, styleRevision, visible, frame, fetchPoint }) {
  const [selection, setSelection] = useState(null)
  const [point, setPoint] = useState(null)
  const requestTokenRef = useRef(0)

  useEffect(() => {
    const map = mapRef.current
    if (map && isStyleReady) syncEchoTopLayer(map, { frame, visible })
  }, [mapRef, isStyleReady, styleRevision, frame, visible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined
    const onClick = (event) => setPoint({ lng: event.lngLat.lng, lat: event.lngLat.lat, mapPoint: event.point })
    map.on('click', onClick)
    return () => map.off?.('click', onClick)
  }, [mapRef, isStyleReady])

  useEffect(() => {
    // OFF이거나 이 시각에 프레임이 없으면 값도 함께 사라져야 한다(UI 계약: Toggle off, No matching frame).
    if (!visible || !frame?.tm || !fetchPoint) {
      requestTokenRef.current += 1
      setPoint(null)
      setSelection(null)
      return undefined
    }
    if (!point) return undefined

    const token = ++requestTokenRef.current
    const controller = new AbortController()
    fetchPoint({ tm: frame.tm, lat: point.lat, lon: point.lng }, { signal: controller.signal })
      .then((value) => {
        if (token !== requestTokenRef.current || controller.signal.aborted) return
        setSelection({ lng: point.lng, lat: point.lat, point: point.mapPoint, echoTop: value, partial: Boolean(frame.partial), stale: Boolean(frame.stale) })
      })
      .catch(() => {
        if (token !== requestTokenRef.current || controller.signal.aborted) return
        setSelection(null)
      })
    return () => controller.abort()
  }, [visible, frame, point, fetchPoint])

  const clearSelection = () => { requestTokenRef.current += 1; setPoint(null); setSelection(null) }
  return { selection, clearSelection }
}
