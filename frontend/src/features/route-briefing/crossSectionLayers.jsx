import { useState } from 'react'
import { formatNwpTimeTick } from '../weather-overlays/NwpSliderBarModel.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

// 연직단면도 레이어 토글 — VerticalProfileWindow와 BriefingView 인라인이 공유.
export const CROSS_SECTION_TOGGLES = [
  ['temp', '기온'],
  ['moisture', '습도'],
  ['icing', '착빙'],
  ['wind', '바람'],
  ['turbulence', '난류'],
  ['advisories', 'SIGMET/AIRMET'],
]

const DEFAULT_LAYERS = { temp: true, wind: true, icing: false, moisture: true, turbulence: false, advisories: true }

export function useCrossSectionLayers(initial = DEFAULT_LAYERS) {
  const [layers, setLayers] = useState(initial)
  const toggle = (key) => setLayers((prev) => {
    const next = { ...prev, [key]: !prev[key] }
    // icing↔moisture 상호배제(같은 영역 색 충돌).
    if (key === 'icing' && next.icing) next.moisture = false
    if (key === 'moisture' && next.moisture) next.icing = false
    return next
  })
  return [layers, toggle]
}

// KIM 예보시각 앞뒤 이동. 큰 창(VerticalProfileWindow)과 브리핑 인라인 단면도가 같이 쓴다 —
// 한쪽에만 있으면 "고도비교에선 시각을 바꿀 수 있는데 브리핑에선 못 바꾸는" 상태가 된다.
// availableTimes는 단면 응답에 실려 온다. 비어 있으면(=고를 시각이 하나뿐) 아무것도 그리지 않는다.
export function ForecastHourNav({ crossSection, onSelect, loading = false }) {
  const { tz } = useTimeZone()
  const availableTimes = crossSection?.availableTimes ?? []
  const currentHf = crossSection?.run?.hf
  const index = availableTimes.findIndex((time) => Number(time.hf) === Number(currentHf))
  if (!onSelect || availableTimes.length <= 1) return null
  const previous = index > 0 ? availableTimes[index - 1] : null
  const next = index >= 0 && index < availableTimes.length - 1 ? availableTimes[index + 1] : null
  const label = index >= 0
    ? formatNwpTimeTick(availableTimes[index], null, tz)
    : (Number.isFinite(currentHf) ? `+${currentHf}h` : null)
  return (
    <span className="vertical-profile-hour-nav" aria-label="예보시간 선택">
      <button type="button" onClick={() => onSelect(previous.hf)} disabled={!previous || loading} aria-label="이전 예보시간">‹</button>
      <strong>{loading ? '…' : label}</strong>
      <button type="button" onClick={() => onSelect(next.hf)} disabled={!next || loading} aria-label="다음 예보시간">›</button>
    </span>
  )
}

// keys 주면 그 레이어만 노출(데이터 없는 토글 숨김용). 기본은 전체.
export function CrossSectionToggles({ layers, onToggle, keys, trailing = null, compact = false, inline = false }) {
  const items = keys ? CROSS_SECTION_TOGGLES.filter(([k]) => keys.includes(k)) : CROSS_SECTION_TOGGLES
  return (
    <div className={`cross-section-toggles${inline ? ' is-inline' : ''}`} role="group" aria-label="레이어">
      <span className="cross-section-toggle-group">
        {items.map(([k, label]) => (
          <button key={k} type="button" className={`cs-toggle${layers[k] ? ' is-on' : ''}`} aria-label={label} aria-pressed={layers[k]} onClick={() => onToggle(k)}>{compact && k === 'advisories' ? <>SIGMET/<br />AIRMET</> : label}</button>
        ))}
      </span>
      {trailing}
    </div>
  )
}
