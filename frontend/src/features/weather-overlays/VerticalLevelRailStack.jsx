import { useEffect, useRef } from 'react'
import { sigwxRailLayout } from './lib/pressureSliderLayout.js'

// Publish the actual space occupied by one or more rails, including the active
// value labels that extend outside each track. Feature cards use these offsets.
export default function VerticalLevelRailStack({ children }) {
  const ref = useRef(null)
  useEffect(() => {
    const stack = ref.current
    const map = stack?.closest('.map-view-wrapper')
    if (!map) return undefined
    let pending = 0
    const observed = new Set()
    const resize = new ResizeObserver(schedule)
    function schedule() {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(measure)
    }
    function measure() {
      const card = map.querySelector('.weather-time-card')
      const sliders = [...stack.querySelectorAll('.pressure-level-slider, .pressure-level-slider__value')]
      const nodes = new Set([map, stack, ...(card ? [card] : []), ...sliders])
      for (const node of observed) if (!nodes.has(node)) { resize.unobserve(node); observed.delete(node) }
      for (const node of nodes) if (!observed.has(node)) { resize.observe(node); observed.add(node) }
      const rects = sliders.filter(node => getComputedStyle(node).visibility !== 'hidden')
        .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height)
      const mapRect = map.getBoundingClientRect()
      const controls = [...map.querySelectorAll('.basemap-switcher-toggle, .mapboxgl-ctrl-geolocate, .mapboxgl-ctrl-zoom-in, .timeline-rail__viewport')]
        .map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height)
      const layout = sigwxRailLayout({ mapRect, cardRect: card?.getBoundingClientRect(), sliderRects: rects,
        lowerTop: Math.min(mapRect.bottom - 100, ...controls.map(rect => rect.top)) })
      map.style.setProperty('--vertical-rail-clearance', `${layout.clearance}px`)
      map.style.setProperty('--sigwx-rail-top', `${layout.top}px`)
      map.style.setProperty('--sigwx-rail-track-height', `${layout.trackHeight}px`)
    }
    const mutation = new MutationObserver(schedule)
    mutation.observe(map, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', schedule)
    measure()
    return () => {
      cancelAnimationFrame(pending)
      resize.disconnect(); mutation.disconnect()
      window.removeEventListener('resize', schedule)
      for (const name of ['--vertical-rail-clearance', '--sigwx-rail-top', '--sigwx-rail-track-height']) map.style.removeProperty(name)
    }
  }, [])
  return <div ref={ref} className="vertical-level-rail-stack">{children}</div>
}
