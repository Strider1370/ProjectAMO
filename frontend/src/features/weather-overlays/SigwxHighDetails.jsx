import { useEffect, useRef } from 'react'
import { HIGH_TYPES, highHeight } from './lib/sigwxHighModel.js'
import { chartColor } from './lib/wafsChartPalette.js'
import './SigwxHigh.css'

export default function SigwxHighDetails({ model }) {
  const { selection, frame, palette, clearSelection, choose } = model
  const closeRef = useRef(null)
  const key = selection?.key
  useEffect(() => { if (key) closeRef.current?.focus({ preventScroll: true }) }, [key])
  if (!selection || !frame) return null
  const active = selection.items.find(item => item.objectId === selection.activeId) || selection.items[0]
  const label = item => `${item.severity || item.distribution || ''} ${HIGH_TYPES.find(type => type.id === item.phenomenon)?.label || item.phenomenon}`.trim()
  const name = HIGH_TYPES.find(type => type.id === active.phenomenon)?.label || active.phenomenon
  const isArea = ['TURBULENCE', 'AIRFRAME_ICING', 'CLOUD'].includes(active.phenomenon)
  const strength = { MOD: '중간', SEV: '강함' }[active.severity]
  const level = active.windLevel || active.level
  const ink = chartColor(active, palette)
  return <section className="weather-point-inspector sigwx-high-details" role="dialog" aria-modal="false" aria-label="SIGWX HIGH 현상 정보"
    style={{ '--weather-point-accent': ink }}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); clearSelection() } }}>
    <header className="weather-point-inspector__header">
      <div><span>SIGWX HIGH</span><strong>{name}{isArea ? ' 영역' : ''}</strong></div>
      <button ref={closeRef} type="button" onClick={clearSelection} aria-label="SIGWX HIGH 정보 닫기">×</button>
    </header>
    {selection.items.length > 1 && <div className="sigwx-high-items" aria-label="겹친 현상 선택">
      {selection.items.map(item => <button type="button" key={item.objectId} onClick={() => choose(item.objectId)}
        aria-pressed={item.objectId === active.objectId} style={{ '--sigwx-color': chartColor(item, palette) }}>
        {label(item)} · {highHeight(item.lower)} ~ {highHeight(item.upper)}
      </button>)}
    </div>}
    <div className="sigwx-high-facts">
      {active.severity && <div className="sigwx-high-facts__primary">
        <span>강도</span><strong>{active.severity}{strength && <small>{strength}</small>}</strong>
      </div>}
      {active.distribution && <div className="sigwx-high-facts__primary"><span>분포</span><strong>{active.distribution}</strong></div>}
      {['VOLCANO', 'TROPICAL_CYCLONE'].includes(active.phenomenon) && <div className="sigwx-high-facts__primary">
        <span>이름</span><strong>{active.label?.split('\n').slice(1).join(' ') || '미제공'}</strong>
      </div>}
      {active.speedKt != null && <div className="sigwx-high-facts__primary"><span>풍속</span><strong>{active.speedKt}<small>kt</small></strong></div>}
      {level && <div className="sigwx-high-facts__primary"><span>고도</span><strong>{highHeight(level)}</strong></div>}
      {(isArea || active.lower || active.upper) && <dl className="sigwx-high-altitudes" aria-label="현상의 고도 범위">
        <div><dt>하한</dt><dd>{highHeight(active.lower)}</dd></div>
        <div><dt>상한</dt><dd>{highHeight(active.upper)}</dd></div>
      </dl>}
    </div>
    <details>
      <summary>원본 속성</summary>
      <pre>{active.details || '미제공'}</pre>
      <p className="sigwx-high-note">기호: <a href="https://github.com/OGCMetOceanDWG/WorldWeatherSymbols" target="_blank" rel="noreferrer">OGC / WMO·ICAO</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · 색상·크기 조정</p>
      <p className="sigwx-high-note">출처: WAFC Washington / WIFS 공개 샘플 (IWXXM 2025-2)</p>
    </details>
  </section>
}
