export function mobilePressureSliderBounds(basemapRect, navigationRect, gap = 8) {
  if (!basemapRect || !navigationRect) return null
  const top = Math.ceil(basemapRect.bottom + gap)
  const bottom = Math.floor(navigationRect.top - gap)
  if (bottom <= top) return null
  return { top, height: bottom - top }
}
