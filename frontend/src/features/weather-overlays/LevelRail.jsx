import { useRef } from 'react'

// Vertical level (altitude) selector at the far-right map edge: a compact chip stack, highest on top.
// Shared by NWP pressure levels and turbulence altitude. Replaces the old range-slider level rail.
// Radiogroup with roving tabindex + arrow-key navigation (Up = higher level).
function LevelRail({ title, items = [], activeValue, onSelect, embedded = false }) {
  const btnRefs = useRef([])
  if (items.length <= 1) return null

  const ordered = [...items].reverse() // top = highest level
  const activeIndex = Math.max(0, ordered.findIndex((item) => item.value === activeValue))

  const move = (delta) => {
    const next = Math.min(ordered.length - 1, Math.max(0, activeIndex + delta))
    if (next !== activeIndex) {
      onSelect?.(ordered[next].value)
      btnRefs.current[next]?.focus()
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { move(-1); event.preventDefault() }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { move(1); event.preventDefault() }
  }

  return (
    <div className={`level-rail${embedded ? ' level-rail--embedded' : ''}`}>
      {title && <span className="level-rail__title">{title}</span>}
      <div className="level-rail__chips" role="radiogroup" aria-label={title || 'level'} onKeyDown={handleKeyDown}>
        {ordered.map((item, index) => {
          const isActive = item.value === activeValue
          return (
            <button
              key={item.value}
              ref={(el) => { btnRefs.current[index] = el }}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`level-rail__chip${isActive ? ' is-active' : ''}`}
              onClick={() => onSelect?.(item.value)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default LevelRail
