import { useEffect, useRef, useState } from 'react'
import { mobilePressureSliderBounds } from './lib/pressureSliderLayout.js'
import LevelSlider from './LevelSlider.jsx'
import useIsMobile from '../../shared/ui/useIsMobile.js'

// 휴대폰 연직 막대의 최대 길이. 고도 단계(최대 10여 개)를 손가락으로 고르기에 충분한 길이다.
const MOBILE_RAIL_MAX_PX = 280

// Vertical level slider anchored top-right of the map (KIM, 난류, 운정고도 all share this).
// On mobile there's no room for tick labels, so it occupies the gap between
// the top controls and whichever bottom-right control begins first.
export default function LevelSliderPanel({ items, activeValue, onSelect, ariaLabel, decorations, header, valueNote }) {
  const wrapperRef = useRef(null)
  const [mobileBounds, setMobileBounds] = useState(null)
  // 휴대폰: 막대를 늘 펼쳐 두면 말풍선이 지도 오른쪽을 가린다. 평소엔 지금 고도 알약만 두고, 누르면 고도 목록을 펼친다.
  const isPhone = useIsMobile()
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => {
    if (!pickerOpen) return undefined
    // 펼칠 때 지금 고도 줄이 목록 가운데 보이게 한다(목록은 맨 위 FL450부터 시작하므로).
    const list = wrapperRef.current?.querySelector('.mobile-level-picker__list')
    const current = list?.querySelector('[aria-pressed="true"]')
    if (list && current) list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2
    const close = (event) => { if (!wrapperRef.current?.contains(event.target)) setPickerOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  useEffect(() => {
    if (isPhone) {
      setMobileBounds(null)
      return undefined
    }
    const wrapper = wrapperRef.current?.closest('.map-view-wrapper')
    if (!wrapper) return undefined

    const resizeObserver = new ResizeObserver(() => measure())
    const measure = () => {
      if (!window.matchMedia('(max-width: 719px)').matches) {
        setMobileBounds(null)
        return
      }
      // The mobile time card is docked at bottom-left; it must not push the
      // right-hand altitude rail below the bottom controls when expanded.
      const topBoundary = 64
      // 오른쪽 아래 도구 버튼 칸(지점 정보·지도) 또는 예전 지도 선택 버튼 중 먼저 시작하는 것 위에서 멈춘다.
      const basemap = wrapper.querySelector('.map-tool-pills') || wrapper.querySelector('.basemap-switcher-toggle')
      const navigation = wrapper.querySelector('.mapboxgl-ctrl-geolocate') || wrapper.querySelector('.mapboxgl-ctrl-zoom-in')
      const basemapRect = basemap?.getBoundingClientRect()
      const navigationRect = navigation?.getBoundingClientRect()
      // 범례 상자를 펼치면 막대는 상자 위에서 멈춘다(말풍선이 상자를 덮지 않게).
      const cardRect = wrapper.querySelector('.weather-time-card:not(.weather-time-card--embedded)')?.getBoundingClientRect()
      const lowerTop = Math.min(basemapRect?.top ?? Infinity, navigationRect?.top ?? Infinity, cardRect?.height ? cardRect.top : Infinity)
      const bounds = mobilePressureSliderBounds(
        { bottom: topBoundary },
        // 가로 위치는 화면 오른쪽 끝에 고정한다(아래 GPS·지도 아이콘은 재생 버튼 줄로 내려가 세로축이 다르다).
        Number.isFinite(lowerTop) ? { top: lowerTop } : null,
        { viewportWidth: window.innerWidth },
      )
      // 휴대폰 화면 높이를 다 쓰면 지도 오른쪽을 길게 가린다 — 위에서부터 최대 MOBILE_RAIL_MAX_PX까지만 쓴다.
      setMobileBounds(bounds ? { ...bounds, height: Math.min(bounds.height, MOBILE_RAIL_MAX_PX) } : null)
    }

    measure()
    const animationFrame = window.requestAnimationFrame(measure)
    const observer = new MutationObserver(measure)
    observer.observe(wrapper, { childList: true, subtree: true })
    resizeObserver.observe(wrapper)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [isPhone])

  if (items.length <= 1) return null

  if (isPhone) {
    const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeValue))
    const active = items[activeIndex] ?? items.at(-1)
    // 막대 위 위험 구간(브리핑)은 목록에서 해당 고도 줄 왼쪽 색 띠로 보여 준다.
    const markFor = (index) => {
      const position = (index / (items.length - 1)) * 100
      return decorations?.find((mark) => position >= mark.top - 0.01 && position <= mark.top + mark.height + 0.01)
    }
    return (
      <div ref={wrapperRef} className="mobile-level-picker">
        {header?.length > 0 && (
          <div className="mobile-level-picker__header">
            {header.map((chip) => <span key={chip.key} style={chip.color ? { '--chip-color': chip.color } : undefined}>{chip.text}</span>)}
          </div>
        )}
        <button type="button" className="mobile-level-picker__chip" aria-expanded={pickerOpen}
          aria-label={`${ariaLabel}: ${[active.primary, active.secondary].filter(Boolean).join(' ')}`}
          onClick={() => setPickerOpen((open) => !open)}>
          <strong>{active.primary}</strong>
          {active.secondary && <small>{active.secondary}</small>}
          <span className="mobile-level-picker__caret" aria-hidden="true">{pickerOpen ? '▴' : '▾'}</span>
        </button>
        {valueNote?.text && !pickerOpen && (
          <span className="mobile-level-picker__note" style={valueNote.hazard?.color ? { color: valueNote.hazard.color } : undefined}>{valueNote.text}</span>
        )}
        {pickerOpen && (
          <div className="mobile-level-picker__list" role="group" aria-label={ariaLabel}>
            {items.map((item, index) => {
              const mark = markFor(index)
              return (
                <button type="button" key={item.id} aria-pressed={item.id === active.id}
                  style={mark?.color ? { '--mark-color': mark.color } : undefined}
                  className={mark ? 'has-mark' : undefined}
                  onClick={() => { onSelect?.(item.id); setPickerOpen(false) }}>
                  <strong>{item.primary}</strong>
                  {item.secondary && <small>{item.secondary}</small>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className={`pressure-level-slider${mobileBounds ? ' is-mobile-measured' : ''}`}
      aria-label={ariaLabel}
      style={mobileBounds ? {
        '--pressure-mobile-top': `${mobileBounds.top}px`,
        '--pressure-mobile-height': `${mobileBounds.height}px`,
        ...(Number.isFinite(mobileBounds.right) ? { '--pressure-mobile-right': `${mobileBounds.right}px` } : null),
      } : undefined}
    >
      {header?.length > 0 && (
        <div className="pressure-level-slider__header">
          {header.map((chip) => <span key={chip.key} style={chip.color ? { '--chip-color': chip.color } : undefined}>{chip.text}</span>)}
        </div>
      )}
      <LevelSlider items={items} activeValue={activeValue} onSelect={onSelect} ariaLabel={ariaLabel} decorations={decorations} valueNote={valueNote} />
    </div>
  )
}
