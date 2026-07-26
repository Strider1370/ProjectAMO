import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getMonitoringSlideshowStatus,
  nextMonitoringSlide,
  resolveMonitoringSlides,
} from './lib/monitoringSlideshow.js'

const CLOCK_INTERVAL_MS = 30000

export function useMonitoringSlideshow(config, imageBlob, imageRevision, { hasWxInfo = false } = {}) {
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

  const slides = useMemo(
    () => resolveMonitoringSlides(config, { wxinfo: hasWxInfo, image: Boolean(imageUrl) }),
    [config, hasWxInfo, imageUrl]
  )

  useEffect(() => {
    if (status !== 'active' && !previewOn) setVisibleSlide('live')
  }, [status, previewOn])

  // The visible slide can lose its content mid-rotation (airport switched to one with no bulletin,
  // image removed). Snap to whatever is still there instead of holding a blank panel until the
  // dwell timer happens to fire.
  useEffect(() => {
    if (slides.length === 0) {
      setVisibleSlide('live')
      return
    }
    setVisibleSlide((prev) => (slides.some((slide) => slide.id === prev) ? prev : slides[0].id))
  }, [slides])

  useEffect(() => {
    const running = status === 'active' || previewOn
    // One slide left means there is nothing to rotate to — leave it up rather than burn a timer.
    if (!running || slides.length < 2) return undefined
    const current = slides.find((slide) => slide.id === visibleSlide) || slides[0]
    const dwellMs = Math.max(5, Number(current.durationSec) || 30) * 1000
    const id = setTimeout(() => setVisibleSlide((prev) => nextMonitoringSlide(prev, slides) ?? 'live'), dwellMs)
    return () => clearTimeout(id)
  }, [status, previewOn, slides, visibleSlide])

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
    setVisibleSlide((prev) => {
      const overlays = slides.filter((slide) => slide.id !== 'live')
      // Preview exists to check the overlay, so jump past the live map straight to the first one.
      return overlays.length > 0 ? overlays[0].id : prev
    })
  }, [slides])

  const clearPreview = useCallback(() => {
    setPreviewOn(false)
    setVisibleSlide('live')
  }, [])

  const stop = useCallback(() => {
    setPreviewOn(false)
    setVisibleSlide('live')
  }, [])

  return { status, visibleSlide, slides, imageUrl, persistenceError, preview, stop, clearPreview }
}

export default useMonitoringSlideshow
