import { useRef } from 'react'

// Generic vertical drag-slider for a small ordered list of levels: same track/thumb/tick
// look as the KIM pressure slider, but works with any `items` list (already sorted).
// Ticks are spaced evenly by index, so the track always fills the same fixed height
// regardless of how many items exist (fewer items just means wider gaps).
function LevelSlider({ items = [], activeValue, onSelect, ariaLabel }) {
  const trackRef = useRef(null)

  if (items.length <= 1) return null

  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeValue))
  const active = items[activeIndex] ?? items[items.length - 1]
  const positionFor = (index) => (items.length <= 1 ? 50 : (index / (items.length - 1)) * 100)

  const selectFromPointer = (event) => {
    const rect = trackRef.current.getBoundingClientRect()
    const progress = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    const index = Math.min(items.length - 1, Math.max(0, Math.round(progress * (items.length - 1))))
    onSelect?.(items[index].id)
  }

  const onKeyDown = (event) => {
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1
      : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : 0
    if (!delta) return
    const next = items[Math.max(0, Math.min(items.length - 1, activeIndex + delta))]
    if (next && next.id !== active.id) onSelect?.(next.id)
    event.preventDefault()
  }

  return (
    <div
      ref={trackRef}
      className="pressure-level-slider__track"
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={items.length - 1}
      aria-valuenow={activeIndex}
      aria-valuetext={active.secondary ? `${active.primary} · ${active.secondary}` : active.primary}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); selectFromPointer(event) }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) selectFromPointer(event) }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture?.(event.pointerId)}
      onDragStart={(event) => event.preventDefault()}
    >
      <span className="pressure-level-slider__rail" aria-hidden="true" />
      {items.map((item, index) => (
        <span
          key={item.id}
          className={`pressure-level-slider__tick${item.major !== false ? ' is-major' : ''}`}
          style={{ top: `${positionFor(index)}%` }}
          aria-hidden="true"
        >
          {item.major !== false && (
            <span>{item.primary}{item.secondary ? <small>{item.secondary}</small> : null}</span>
          )}
        </span>
      ))}
      <span className="pressure-level-slider__value" style={{ top: `${positionFor(activeIndex)}%` }} aria-hidden="true">
        <strong>{active.primary}</strong>
        {active.secondary && <small>{active.secondary}</small>}
      </span>
      <span className="pressure-level-slider__thumb" style={{ top: `${positionFor(activeIndex)}%` }} aria-hidden="true" />
    </div>
  )
}

export default LevelSlider
