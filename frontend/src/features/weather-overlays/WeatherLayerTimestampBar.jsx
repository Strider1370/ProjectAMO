import { useEffect, useRef, useState } from 'react'

// Show each active layer's actual source time: forecast issue/valid, observation, or model valid time.
// Radar/satellite/lightning timestamps remain on the timeline and legends.
function WeatherLayerTimestampBar({ entries = [], children, embedded = false }) {
  const validEntries = entries.filter((e) => e.issueLabel && e.issueLabel !== '-')
  const [selectedKey, setSelectedKey] = useState(null)
  const previousKeysRef = useRef([])
  const cardRef = useRef(null)

  useEffect(() => {
    const keys = validEntries.map((entry) => entry.key)
    const added = keys.filter((key) => !previousKeysRef.current.includes(key))
    if (added.length) setSelectedKey(added.at(-1))
    else if (keys.length && !keys.includes(selectedKey)) setSelectedKey(keys[0])
    previousKeysRef.current = keys
  }, [validEntries, selectedKey])

  // Keep the adjacent HIGH details below this card as notes/legend rows wrap.
  useEffect(() => {
    const card = cardRef.current
    const container = card?.parentElement
    if (embedded || !card || !container) return undefined
    const update = () => container.style.setProperty('--weather-time-card-bottom', `${card.offsetTop + card.offsetHeight}px`)
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(card)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      container.style.removeProperty('--weather-time-card-bottom')
    }
  }, [validEntries.length > 0, embedded])

  if (validEntries.length === 0) return null
  const selectedIndex = Math.max(0, validEntries.findIndex((entry) => entry.key === selectedKey))
  const entry = validEntries[selectedIndex]
  const hasValid = entry.validLabel && entry.validLabel !== '-'

  return (
    <section ref={cardRef} className={`weather-time-card${embedded ? ' weather-time-card--embedded' : ''}`} aria-label="기상자료 시각">
      <div className="weather-time-card__heading">
        <strong>자료 시각</strong>
        <div className="layer-timestamp-header">
          {validEntries.length > 1 && <button type="button" className="layer-timestamp-layer-arrow" onClick={() => setSelectedKey(validEntries[selectedIndex - 1].key)} disabled={selectedIndex === 0} aria-label="이전 기상 레이어">‹</button>}
          <span>{entry.label}</span>
          {validEntries.length > 1 && <button type="button" className="layer-timestamp-layer-arrow" onClick={() => setSelectedKey(validEntries[selectedIndex + 1].key)} disabled={selectedIndex === validEntries.length - 1} aria-label="다음 기상 레이어">›</button>}
        </div>
      </div>
      <div className="weather-time-card__content">
        {entry.history && <button type="button" className="layer-timestamp-history-arrow" onClick={entry.history.onPrevious} disabled={entry.history.atOldest} aria-label="이전 SIGWX LOW 자료 보기">‹</button>}
        <div className="weather-time-card__times">
          <span><small>{entry.timeLabel || '발표'}</small><strong>{entry.issueLabel}</strong></span>
          {hasValid && <span><small>{entry.validTimeLabel || '유효'}</small><strong>{entry.validLabel}</strong></span>}
        </div>
        {entry.history && <button type="button" className="layer-timestamp-history-arrow" onClick={entry.history.onNext} disabled={entry.history.atLatest} aria-label="다음 SIGWX LOW 자료 보기">›</button>}
      </div>
      {entry.note && <div className="weather-time-card__note" data-tone={entry.noteTone} role="status">{entry.note}{entry.onRetry && <button type="button" onClick={entry.onRetry}>다시 시도</button>}</div>}
      {children}
    </section>
  )
}

export default WeatherLayerTimestampBar
