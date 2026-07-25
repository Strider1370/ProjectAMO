import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatPressureFlightLevel,
  isMajorPressureLevel,
  pressureLevelPosition,
} from './lib/pressureLevelModel.js'
import { mobilePressureSliderBounds } from './lib/pressureSliderLayout.js'

function nearestLevelForPointer(event, track, levels) {
  const rect = track.getBoundingClientRect()
  const progress = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  return levels.reduce((nearest, level) => (
    Math.abs(pressureLevelPosition(level, levels) / 100 - progress)
      < Math.abs(pressureLevelPosition(nearest, levels) / 100 - progress)
      ? level
      : nearest
  ), levels[0])
}

export default function PressureLevelSlider({ levels = [], activeValue, onSelect }) {
  const trackRef = useRef(null)
  const [mobileBounds, setMobileBounds] = useState(null)
  const orderedLevels = useMemo(
    () => [...levels].filter((level) => level?.kind === 'pressure').sort((a, b) => Number(a.value) - Number(b.value)),
    [levels],
  )

  useEffect(() => {
    const track = trackRef.current
    const wrapper = track?.closest('.map-view-wrapper')
    if (!wrapper) return undefined

    const measure = () => {
      if (!window.matchMedia('(max-width: 719px)').matches) {
        setMobileBounds(null)
        return
      }
      const basemap = wrapper.querySelector('.basemap-switcher-toggle')
      const navigation = wrapper.querySelector('.mapboxgl-ctrl-geolocate') || wrapper.querySelector('.mapboxgl-ctrl-zoom-in')
      setMobileBounds(mobilePressureSliderBounds(basemap?.getBoundingClientRect(), navigation?.getBoundingClientRect()))
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

  if (orderedLevels.length <= 1) return null

  const active = orderedLevels.find((level) => level.id === activeValue) || orderedLevels[orderedLevels.length - 1]
  const activeIndex = orderedLevels.indexOf(active)
  const selectFromPointer = (event) => {
    const next = nearestLevelForPointer(event, trackRef.current, orderedLevels)
    onSelect?.(next.id)
  }
  const onKeyDown = (event) => {
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1
      : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : 0
    if (!delta) return
    const next = orderedLevels[Math.max(0, Math.min(orderedLevels.length - 1, activeIndex + delta))]
    if (next && next !== active) onSelect?.(next.id)
    event.preventDefault()
  }

  return (
    <div
      className={`pressure-level-slider${mobileBounds ? ' is-mobile-measured' : ''}`}
      aria-label="KIM 등압면 고도 선택"
      style={mobileBounds ? { '--pressure-mobile-top': `${mobileBounds.top}px`, '--pressure-mobile-height': `${mobileBounds.height}px` } : undefined}
    >
      <div
        ref={trackRef}
        className="pressure-level-slider__track"
        role="slider"
        tabIndex={0}
        aria-label="KIM 등압면 고도"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={orderedLevels.length - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={`${formatPressureFlightLevel(active.value)} · ${active.value} hPa`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); selectFromPointer(event) }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) selectFromPointer(event) }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture?.(event.pointerId)}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className="pressure-level-slider__rail" aria-hidden="true" />
        {orderedLevels.map((level) => {
          const position = pressureLevelPosition(level, orderedLevels)
          const major = isMajorPressureLevel(level)
          return (
            <span key={level.id} className={`pressure-level-slider__tick${major ? ' is-major' : ''}`} style={{ top: `${position}%` }} aria-hidden="true">
              {major && <span>{formatPressureFlightLevel(level.value)}<small>{level.value} hPa</small></span>}
            </span>
          )
        })}
        <span className="pressure-level-slider__value" style={{ top: `${pressureLevelPosition(active, orderedLevels)}%` }} aria-hidden="true">
          <strong>{formatPressureFlightLevel(active.value)}</strong>
          <small>{active.value} hPa</small>
        </span>
        <span className="pressure-level-slider__thumb" style={{ top: `${pressureLevelPosition(active, orderedLevels)}%` }} aria-hidden="true" />
      </div>
    </div>
  )
}
