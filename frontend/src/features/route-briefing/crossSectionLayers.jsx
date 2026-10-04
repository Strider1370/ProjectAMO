import { toggleCrossSectionLayer, showCrossSectionTurbulence, restoreCrossSectionLayers, CROSS_SECTION_TOGGLE_GROUPS } from './lib/crossSectionLayerState.js'
export { CROSS_SECTION_TOGGLE_GROUPS }
import { useEffect, useRef, useState } from 'react'
import ProfileLegend from './ProfileLegend.jsx'
import { formatNwpTimeTick } from '../weather-overlays/NwpSliderBarModel.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

// 연직단면도 레이어 토글 — VerticalProfileWindow와 BriefingView 인라인이 공유.
export const CROSS_SECTION_TOGGLES = [
  ['temp', '등온선'],
  ['moisture', '구름층 추정'],
  ['cloud', '모델 구름량 윤곽'],
  ['icing', '착빙'],
  ['wind', '바람'],
  ['turbulence', '난류'],
  ['tropopause', '권계면·제트'],
  ['advisories', 'SIGMET/AIRMET'],
]

const DEFAULT_LAYERS = { temp: true, wind: true, icing: true, moisture: true, cloud: false, turbulence: false, tropopause: true, advisories: true }

export function useCrossSectionLayers(initial = DEFAULT_LAYERS) {
  const [state, setState] = useState(() => ({ layers: initial, restore: null }))
  const toggle = key => setState(prev => toggleCrossSectionLayer(prev, key))
  return [state.layers, toggle, {
    turbulenceView: !!state.restore,
    showTurbulence: () => setState(showCrossSectionTurbulence),
    restoreLayers: () => setState(restoreCrossSectionLayers),
  }]
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

function ToggleMenu({ label, items, layers, onToggle, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const close = event => { if (!ref.current?.contains(event.target)) onClose() }
    const escape = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [onClose])
  return <div ref={ref} className="cs-toggle-menu" role="group" aria-label={`${label} 세부 항목`}>
    {items.map(([key, text]) => <label key={key}><input type="checkbox" checked={!!layers[key]} onChange={() => onToggle(key)} />{text}</label>)}
  </div>
}

// keys 주면 그 레이어만 노출(데이터 없는 토글 숨김용). 기본은 전체.
// legend면 범례를 버튼 줄 오른쪽에 함께 둔다(좁으면 다음 줄로 넘어감). 이때 차트에는 legendInToolbar를 넘겨 중복을 막는다.
export function CrossSectionToggles({ layers, onToggle, keys, trailing = null, compact = false, inline = false, legend = false }) {
  const [open, setOpen] = useState(null)
  const allowed = key => !keys || keys.includes(key)
  const groups = CROSS_SECTION_TOGGLE_GROUPS.map(group => group.map(item => item.children
    ? { ...item, children: item.children.filter(([k]) => allowed(k)) }
    : item).filter(item => item.children ? item.children.length : allowed(item.key))).filter(group => group.length)
  const isOn = item => item.children ? item.children.some(([k]) => layers[k]) : !!layers[item.key]
  const toggle = item => {
    if (!item.children) return onToggle(item.key)
    const on = item.children.filter(([k]) => layers[k]).map(([k]) => k)
    const keysToFlip = on.length ? on : item.defaults.filter(k => item.children.some(([c]) => c === k))
    keysToFlip.forEach(k => onToggle(k))
  }
  return (
    <div className={`cross-section-toggles${inline ? ' is-inline' : ''}`} role="group" aria-label="레이어">
      {groups.map((group, gi) => <span key={gi} className="cross-section-toggle-group">
        {group.map(item => {
          const menu = item.children ?? item.options
          return <span key={item.id} className={`cs-toggle-split${menu ? ' has-menu' : ''}`}>
            <button type="button" className={`cs-toggle${isOn(item) ? ' is-on' : ''}`} aria-label={item.label} aria-pressed={isOn(item)} onClick={() => toggle(item)}>
              {compact && item.id === 'advisories' ? <>SIGMET/<br />AIRMET</> : item.label}
            </button>
            {menu && <button type="button" className={`cs-toggle cs-toggle-caret${isOn(item) ? ' is-on' : ''}`} aria-label={`${item.label} 세부 항목`} aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>▾</button>}
            {menu && open === item.id && <ToggleMenu label={item.label} items={menu} layers={layers} onToggle={onToggle} onClose={() => setOpen(null)} />}
          </span>
        })}
      </span>)}
      {legend && <ProfileLegend layers={layers} inline />}
      {trailing}
    </div>
  )
}

