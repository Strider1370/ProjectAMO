import { useEffect, useRef, useState } from 'react'
import { queryCiAtPoint, syncConvectiveLayers } from './convectiveLayers.js'
import { canApplyConvectiveResponse, makeConvectiveRequestKey } from './convectiveSelectionModel.js'

export function useConvectiveOverlay({ mapRef, isStyleReady, styleRevision, ciVisible, ctpsVisible, ciFrame, ctpsFrame, fetchCtpsPoint, timeZone }) {
  const [minFl, setMinFl] = useState('all')
  const [selection, setSelection] = useState(null)
  const [point, setPoint] = useState(null)
  const requestTokenRef = useRef(0)
  const currentKeyRef = useRef(null)

  useEffect(() => {
    const map = mapRef.current
    if (map && isStyleReady) syncConvectiveLayers(map, { ciFrame, ctpsFrame, minFl, ciVisible, ctpsVisible })
  }, [mapRef, isStyleReady, styleRevision, ciFrame, ctpsFrame, minFl, ciVisible, ctpsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined
    const onClick = (event) => setPoint({ lng: event.lngLat.lng, lat: event.lngLat.lat, mapPoint: event.point })
    map.on('click', onClick)
    return () => map.off?.('click', onClick)
  }, [mapRef, isStyleReady])

  useEffect(() => {
    if (!ciVisible && !ctpsVisible) {
      requestTokenRef.current += 1
      currentKeyRef.current = null
      setPoint(null)
      setSelection(null)
      return undefined
    }
    const map = mapRef.current
    if (!map || !point) return undefined
    const ci = ciVisible && ciFrame ? queryCiAtPoint(map, point.mapPoint) : null
    const ciSelection = ci && { ...ci, observedAt: ciFrame?.observedAt ?? null }
    if (!ctpsVisible || !ctpsFrame || !fetchCtpsPoint) {
      setSelection(ciSelection ? { lng: point.lng, lat: point.lat, ci: ciSelection, ctps: null } : null)
      return undefined
    }
    const key = makeConvectiveRequestKey({ tm: ctpsFrame.tm, lat: point.lat, lon: point.lng, minFl })
    const token = ++requestTokenRef.current
    currentKeyRef.current = key
    const controller = new AbortController()
    setSelection(ciSelection ? { lng: point.lng, lat: point.lat, ci: ciSelection, ctps: null } : null)
    fetchCtpsPoint({ tm: ctpsFrame.tm, lat: point.lat, lon: point.lng, minFl }, { signal: controller.signal })
      .then((ctps) => {
        if (!canApplyConvectiveResponse({ requestToken: token, currentToken: requestTokenRef.current, requestKey: key, currentKey: currentKeyRef.current, aborted: controller.signal.aborted })) return
        setSelection({ lng: point.lng, lat: point.lat, ci: ciSelection, ctps })
      })
      .catch(() => {
        if (!canApplyConvectiveResponse({ requestToken: token, currentToken: requestTokenRef.current, requestKey: key, currentKey: currentKeyRef.current, aborted: controller.signal.aborted })) return
        setSelection(ciSelection ? { lng: point.lng, lat: point.lat, ci: ciSelection, ctps: null } : null)
      })
    return () => controller.abort()
  }, [mapRef, point, minFl, ciVisible, ctpsVisible, ciFrame, ctpsFrame, fetchCtpsPoint, timeZone])

  const clearSelection = () => {
    requestTokenRef.current += 1
    currentKeyRef.current = null
    setPoint(null)
    setSelection(null)
  }

  return { minFl, setMinFl, selection, clearSelection }
}
