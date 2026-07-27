import { useEffect, useRef, useState } from 'react'
import { mobilePressureSliderBounds } from './lib/pressureSliderLayout.js'
import LevelSlider from './LevelSlider.jsx'

// Vertical level slider anchored top-right of the map (KIM, 난류, 운정고도 all share this).
// On mobile there's no room for tick labels, so it collapses to a fixed-position strip
// measured against the basemap switcher and nav controls instead of flowing in the rail stack.
export default function LevelSliderPanel({ items, activeValue, onSelect, ariaLabel }) {
  const wrapperRef = useRef(null)
  const [mobileBounds, setMobileBounds] = useState(null)

  useEffect(() => {
    const wrapper = wrapperRef.current?.closest('.map-view-wrapper')
    if (!wrapper) return undefined

    const measure = () => {
      if (!window.matchMedia('(max-width: 719px)').matches) {
        setMobileBounds(null)
        return
      }
      const basemap = wrapper.querySelector('.basemap-switcher-toggle')
      const navigation = wrapper.querySelector('.mapboxgl-ctrl-geolocate') || wrapper.querySelector('.mapboxgl-ctrl-zoom-in')
      setMobileBounds(mobilePressureSliderBounds(
        basemap?.getBoundingClientRect(),
        navigation?.getBoundingClientRect(),
        { viewportWidth: window.innerWidth },
      ))
    }

    measure()
    const animationFrame = window.requestAnimationFrame(measure)
    const observer = new MutationObserver(measure)
    observer.observe(wrapper, { childList: true, subtree: true })
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(wrapper)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  if (items.length <= 1) return null

  return (
    <div
      ref={wrapperRef}
      className={`pressure-level-slider${mobileBounds ? ' is-mobile-measured' : ''}`}
      aria-label={ariaLabel}
      style={mobileBounds ? {
        '--pressure-mobile-top': `${mobileBounds.top}px`,
        '--pressure-mobile-height': `${mobileBounds.height}px`,
        ...(Number.isFinite(mobileBounds.right) ? { '--pressure-mobile-right': `${mobileBounds.right}px` } : null),
      } : undefined}
    >
      <LevelSlider items={items} activeValue={activeValue} onSelect={onSelect} ariaLabel={ariaLabel} />
    </div>
  )
}
