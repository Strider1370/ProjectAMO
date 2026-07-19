import { useState } from 'react'

// 연직단면도 레이어 토글 — VerticalProfileWindow와 BriefingView 인라인이 공유.
export const CROSS_SECTION_TOGGLES = [
  ['temp', '기온'],
  ['moisture', '습도'],
  ['icing', '착빙'],
  ['wind', '바람'],
  ['turbulence', '난류'],
  ['advisories', 'SIGMET/AIRMET'],
]

const DEFAULT_LAYERS = { temp: true, wind: true, icing: false, moisture: false, turbulence: true, advisories: false }

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

// keys 주면 그 레이어만 노출(데이터 없는 토글 숨김용). 기본은 전체.
export function CrossSectionToggles({ layers, onToggle, keys, trailing = null }) {
  const items = keys ? CROSS_SECTION_TOGGLES.filter(([k]) => keys.includes(k)) : CROSS_SECTION_TOGGLES
  return (
    <div className="cross-section-toggles" role="group" aria-label="레이어">
      <span className="cross-section-toggle-group">
        {items.map(([k, label]) => (
          <button key={k} type="button" className={`cs-toggle${layers[k] ? ' is-on' : ''}`} aria-pressed={layers[k]} onClick={() => onToggle(k)}>{label}</button>
        ))}
      </span>
      {trailing}
    </div>
  )
}
