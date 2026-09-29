// viewportWidth/sliderWidth let the caller line the slider's own center up with the
// zoom control's center (the slider has no right-side tick labels on mobile, so it can
// sit closer to the control stack it's paired with instead of hugging the screen edge).
export function mobilePressureSliderBounds(basemapRect, navigationRect, { gap = 8, viewportWidth = null, sliderWidth = 56 } = {}) {
  if (!basemapRect || !navigationRect) return null
  const top = Math.ceil(basemapRect.bottom + gap)
  const bottom = Math.floor(navigationRect.top - gap)
  if (bottom <= top) return null
  const bounds = { top, height: bottom - top }
  if (Number.isFinite(viewportWidth) && Number.isFinite(navigationRect.left) && Number.isFinite(navigationRect.width)) {
    const navCenterX = navigationRect.left + navigationRect.width / 2
    bounds.right = Math.round(viewportWidth - navCenterX - sliderWidth / 2)
  }
  return bounds
}

// Card/rail rectangles are viewport coordinates. Return map-relative offsets.
export function sigwxRailLayout({ mapRect, cardRect, sliderRects = [], lowerTop = mapRect.bottom - 100 }) {
  const top = Math.max(108, Math.ceil((cardRect?.bottom ?? mapRect.top) - mapRect.top) + 12)
  const clearance = sliderRects.length ? Math.ceil(mapRect.right - Math.min(...sliderRects.map(rect => rect.left))) + 12 : 12
  return { top, clearance, trackHeight: Math.max(40, Math.min(400, Math.floor(lowerTop - mapRect.top - top - 64))) }
}
