import { useEffect, useRef, useState } from 'react'
import { syncConvectiveLayers } from './convectiveLayers.js'
import { canApplyConvectiveResponse, makeConvectiveRequestKey } from './convectiveSelectionModel.js'

export function useConvectiveOverlay({ mapRef, isStyleReady, styleRevision, inspectionEnabled, ctpsVisible, ctpsFrame, fetchCtpsPoint, timeZone }) {
  const [minFl, setMinFl] = useState('all')
  const [selection, setSelection] = useState(null)
  const [point, setPoint] = useState(null)
  const requestTokenRef = useRef(0)
  const currentKeyRef = useRef(null)

  useEffect(() => {
    const map = mapRef.current
    if (map && isStyleReady) syncConvectiveLayers(map, { ctpsFrame, minFl, ctpsVisible })
  }, [mapRef, isStyleReady, styleRevision, ctpsFrame, minFl, ctpsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !inspectionEnabled || !ctpsVisible) return undefined
    const onClick = (event) => setPoint({ lng: event.lngLat.lng, lat: event.lngLat.lat, mapPoint: event.point })
    map.on('click', onClick)
    return () => map.off?.('click', onClick)
  }, [mapRef, isStyleReady, inspectionEnabled, ctpsVisible])

  useEffect(() => {
    if (!inspectionEnabled || !ctpsVisible) {
      requestTokenRef.current += 1
      currentKeyRef.current = null
      setPoint(null)
      setSelection(null)
      return undefined
    }
    const map = mapRef.current
    if (!map || !point) return undefined
    if (!ctpsVisible || !ctpsFrame || !fetchCtpsPoint) {
      setSelection(null)
      return undefined
    }
    const key = makeConvectiveRequestKey({ tm: ctpsFrame.tm, lat: point.lat, lon: point.lng, minFl })
    const token = ++requestTokenRef.current
    currentKeyRef.current = key
    const controller = new AbortController()
    setSelection(null)
    fetchCtpsPoint({ tm: ctpsFrame.tm, lat: point.lat, lon: point.lng, minFl }, { signal: controller.signal })
      .then((ctps) => {
        if (!canApplyConvectiveResponse({ requestToken: token, currentToken: requestTokenRef.current, requestKey: key, currentKey: currentKeyRef.current, aborted: controller.signal.aborted })) return
        setSelection({ lng: point.lng, lat: point.lat, point: point.mapPoint, ctps })
      })
      .catch(() => {
        if (!canApplyConvectiveResponse({ requestToken: token, currentToken: requestTokenRef.current, requestKey: key, currentKey: currentKeyRef.current, aborted: controller.signal.aborted })) return
        setSelection(null)
      })
    return () => controller.abort()
  }, [mapRef, point, minFl, ctpsVisible, ctpsFrame, fetchCtpsPoint, timeZone, inspectionEnabled])

  const clearSelection = () => {
    requestTokenRef.current += 1
    currentKeyRef.current = null
    setPoint(null)
    setSelection(null)
  }

  return { minFl, setMinFl, selection: inspectionEnabled ? selection : null, clearSelection }
}
