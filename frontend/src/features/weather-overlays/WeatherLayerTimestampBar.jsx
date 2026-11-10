import { useEffect, useRef, useState } from 'react'

// Show each active layer's actual source time: forecast issue/valid, observation, or model valid time.
// 데스크톱은 지도 왼쪽 아래(타임라인 위) 상자 하나에 "레이어 고르기 · 시각" 한 줄과 그 레이어의 범례를 함께 둔다.
// 모바일(embedded)은 범례 시트 안에 시각만 넣고 화살표로 레이어를 넘긴다.
function WeatherLayerTimestampBar({ entries = [], children, embedded = false }) {
  const validEntries = entries.filter((e) => (e.issueLabel && e.issueLabel !== '-') || e.legend)
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

  // 상자 높이를 지도에 알린다 — 왼쪽 레이어 패널이 이 상자 위에서 멈춘다.
  useEffect(() => {
    const card = cardRef.current
    const container = card?.parentElement
    if (embedded || !card || !container) return undefined
    const update = () => container.style.setProperty('--weather-time-card-height', `${Math.ceil(card.getBoundingClientRect().height)}px`)
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(card)
    return () => {
      observer?.disconnect()
      container.style.removeProperty('--weather-time-card-height')
    }
  }, [validEntries.length > 0, embedded])

  if (validEntries.length === 0) return null
  const selectedIndex = Math.max(0, validEntries.findIndex((entry) => entry.key === selectedKey))
  const entry = validEntries[selectedIndex]
  const hasIssue = entry.issueLabel && entry.issueLabel !== '-'
  const hasValid = entry.validLabel && entry.validLabel !== '-'
  // 데스크톱 상자는 레이어 이름과 시각을 한 줄에 둔다 — 발표·유효가 같은 시간대면 시간대(KST/UTC)는 유효 뒤에 한 번만 적는다.
  const zone = / (KST|UTC)$/.exec(entry.validLabel ?? '')?.[0]
  const issueText = !embedded && hasValid && zone && entry.issueLabel.endsWith(zone) ? entry.issueLabel.slice(0, -zone.length) : entry.issueLabel
  const times = hasIssue && <div className="weather-time-card__content">
    {entry.history && <button type="button" className="layer-timestamp-history-arrow" onClick={entry.history.onPrevious} disabled={entry.history.atOldest} aria-label="이전 SIGWX LOW 자료 보기">‹</button>}
    <div className="weather-time-card__times">
      <span><small>{entry.timeLabel || '발표'}</small><strong>{issueText}</strong></span>
      {hasValid && <span><small>{entry.validTimeLabel || '유효'}</small><strong>{entry.validLabel}</strong></span>}
    </div>
    {entry.history && <button type="button" className="layer-timestamp-history-arrow" onClick={entry.history.onNext} disabled={entry.history.atLatest} aria-label="다음 SIGWX LOW 자료 보기">›</button>}
  </div>
  const note = entry.note && <div className="weather-time-card__note" data-tone={entry.noteTone} role="status">{entry.note}{entry.onRetry && <button type="button" onClick={entry.onRetry}>다시 시도</button>}</div>

  if (!embedded) return (
    <section ref={cardRef} className="weather-time-card" aria-label="기상자료 시각과 범례">
      <div className="weather-time-card__heading">
        {/* 보이는 알약은 지금 레이어 이름 폭만큼만 차지하고, 그 위에 투명한 선택 상자를 겹쳐 고르게 한다. */}
        <label className="weather-time-card__layer">
          <span className="weather-time-card__layer-chip" aria-hidden="true">{entry.label}{validEntries.length > 1 && <span className="weather-time-card__caret">▾</span>}</span>
          <select aria-label="기상 레이어 선택" value={entry.key} onChange={(event) => setSelectedKey(event.target.value)} disabled={validEntries.length < 2}>
            {validEntries.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          {validEntries.length > 1 && <small className="weather-time-card__count" aria-hidden="true">{selectedIndex + 1}/{validEntries.length}</small>}
        </label>
        {times}
      </div>
      {note}
      {entry.legend && <div className="weather-time-card__legend">{entry.legend}</div>}
      {children}
    </section>
  )

  return (
    <section ref={cardRef} className="weather-time-card weather-time-card--embedded" aria-label="기상자료 시각">
      <div className="weather-time-card__heading">
        <strong>자료 시각</strong>
        <div className="layer-timestamp-header">
          {validEntries.length > 1 && <button type="button" className="layer-timestamp-layer-arrow" onClick={() => setSelectedKey(validEntries[selectedIndex - 1].key)} disabled={selectedIndex === 0} aria-label="이전 기상 레이어">‹</button>}
          <span>{entry.label}</span>
          {validEntries.length > 1 && <button type="button" className="layer-timestamp-layer-arrow" onClick={() => setSelectedKey(validEntries[selectedIndex + 1].key)} disabled={selectedIndex === validEntries.length - 1} aria-label="다음 기상 레이어">›</button>}
        </div>
      </div>
      {times}
      {note}
      {children}
    </section>
  )
}

export default WeatherLayerTimestampBar
