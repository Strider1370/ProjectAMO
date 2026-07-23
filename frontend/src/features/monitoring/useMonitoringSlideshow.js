import { useCallback, useEffect, useRef, useState } from 'react'
import { getMonitoringSlideshowStatus, nextMonitoringSlide } from './lib/monitoringSlideshow.js'

const CLOCK_INTERVAL_MS = 30000

export function useMonitoringSlideshow(config, imageBlob, imageRevision) {
  const [status, setStatus] = useState(() => getMonitoringSlideshowStatus(config))
  const [visibleSlide, setVisibleSlide] = useState('live')
  const [imageUrl, setImageUrl] = useState(null)
  const [persistenceError, setPersistenceError] = useState(null)
  const [previewOn, setPreviewOn] = useState(false)
  const objectUrlRef = useRef(null)

  useEffect(() => {
    setStatus(getMonitoringSlideshowStatus(config))
    const id = setInterval(() => setStatus(getMonitoringSlideshowStatus(config)), CLOCK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [config])

  useEffect(() => {
    if (status !== 'active' && !previewOn) setVisibleSlide('live')
  }, [status, previewOn])

  useEffect(() => {
    const running = status === 'active' || previewOn
    if (!running) return
    const intervalMs = Math.max(5, Number(config?.intervalSeconds) || 30) * 1000
    const id = setInterval(() => setVisibleSlide((prev) => nextMonitoringSlide(prev)), intervalMs)
    return () => clearInterval(id)
  }, [status, previewOn, config?.intervalSeconds])

  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    if (!imageBlob) {
      setImageUrl(null)
      return undefined
    }
    try {
      const url = URL.createObjectURL(imageBlob)
      objectUrlRef.current = url
      setImageUrl(url)
      setPersistenceError(null)
    } catch (error) {
      setImageUrl(null)
      setPersistenceError(error)
    }
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
    // imageRevision forces a reload even if the caller reuses the same Blob reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageBlob, imageRevision])

  const preview = useCallback(() => {
    setPreviewOn(true)
    setVisibleSlide('image')
  }, [])

  const clearPreview = useCallback(() => {
    setPreviewOn(false)
    setVisibleSlide('live')
  }, [])

  const stop = useCallback(() => {
    setPreviewOn(false)
    setVisibleSlide('live')
  }, [])

  return { status, visibleSlide, imageUrl, persistenceError, preview, stop, clearPreview }
}

export default useMonitoringSlideshow
