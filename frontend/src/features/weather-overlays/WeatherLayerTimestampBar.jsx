import { useEffect, useState } from 'react'

// ICAO requires the issue/valid time of met data to be clearly shown. This panel unifies every active
// forecast layer's 발표(issue)/유효(valid) time in one place (bottom-left, above the timeline).
// Observed layers (radar/satellite/lightning) are covered by the timeline + legends, so they are not listed here.
function WeatherLayerTimestampBar({ entries = [], tz = 'KST', isOpen: controlledIsOpen, onOpenChange }) {
  const validEntries = entries.filter((e) => e.issueLabel && e.issueLabel !== '-')
  const [selectedKey, setSelectedKey] = useState(null)
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(true)
  const isOpen = controlledIsOpen ?? uncontrolledIsOpen

  function setIsOpen(next) {
    const resolved = typeof next === 'function' ? next(isOpen) : next
    if (controlledIsOpen === undefined) setUncontrolledIsOpen(resolved)
    onOpenChange?.(resolved)
  }

  useEffect(() => {
    if (validEntries.length && !validEntries.some((entry) => entry.key === selectedKey)) {
      setSelectedKey(validEntries[0].key)
    }
  }, [validEntries, selectedKey])

  if (validEntries.length === 0) return null
  const selectedIndex = Math.max(0, validEntries.findIndex((entry) => entry.key === selectedKey))
  const entry = validEntries[selectedIndex]
  const hasValid = entry.validLabel && entry.validLabel !== '-'

  return (
    <div className="layer-timestamp-dock">
      <div className={`layer-timestamp-bar${isOpen ? ' is-open' : ''}`} aria-hidden={!isOpen} aria-label="기상자료 발표·유효 시각">
        <div className="layer-timestamp-header">
          {validEntries.length > 1 && <button type="button" className="layer-timestamp-layer-arrow" onClick={() => setSelectedKey(validEntries[selectedIndex - 1].key)} disabled={selectedIndex === 0} aria-label="이전 기상 레이어">‹</button>}
          <span>{entry.label}</span>
          {validEntries.length > 1 && <button type="button" className="layer-timestamp-layer-arrow" onClick={() => setSelectedKey(validEntries[selectedIndex + 1].key)} disabled={selectedIndex === validEntries.length - 1} aria-label="다음 기상 레이어">›</button>}
        </div>
        <div className="layer-timestamp-content">
          <div className="layer-timestamp-times">
            {entry.history && <button type="button" className="layer-timestamp-history-arrow" onClick={entry.history.onPrevious} disabled={entry.history.atOldest} aria-label="이전 SIGWX_LOW 자료 보기">‹</button>}
            <div>
              <span className="layer-timestamp-cell"><span className="layer-timestamp-label">발표</span>{entry.issueLabel}</span>
              {hasValid && <span className="layer-timestamp-cell"><span className="layer-timestamp-label">유효</span>{entry.validLabel}</span>}
            </div>
            {entry.history && <button type="button" className="layer-timestamp-history-arrow" onClick={entry.history.onNext} disabled={entry.history.atLatest} aria-label="다음 SIGWX_LOW 자료 보기">›</button>}
          </div>
        </div>
      </div>
      <button
        type="button"
        className={`map-legend-toggle layer-timestamp-toggle${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label="기상자료 시각"
      >
        시각 <span className="map-legend-toggle-caret" aria-hidden="true">{isOpen ? '▾' : '▴'}</span>
      </button>
    </div>
  )
}

export default WeatherLayerTimestampBar
