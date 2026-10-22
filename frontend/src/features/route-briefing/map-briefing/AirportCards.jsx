import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { formatBriefingTime } from '../lib/briefingTime.js'
import { airportCards, changeLines, chipWidth, hasAlertFlag } from './airportCardModel.js'
import { placeAirportCards } from './airportCardPlacement.js'

const CARD_W = 320
const CARD_H = 140 // 머리 · METAR · TAF · 깃발/상세 네 줄
const CHIP_H = 28 // 접은 칩
// 카드가 피할 화면 요소(지도 위에 뜬 것들). 공항 패널이 열려 있으면 카드는 숨긴다(아래).
const OBSTACLE_SELECTORS = ['.mb-panel', '.mb-dock', '.mb-dock-tab', '.mb-toast', '.mb-popover', '.vertical-level-rail-stack', '.weather-time-card', '.mobile-map-layer-btns', '.map-bottom-control-dock']

const shortName = (name) => String(name ?? '').replace('국제공항', '').replace('공항', '')

// 지도형 브리핑 공항 카드(spec §2.3): 출발·도착·교체 공항 옆에 지시선으로 붙는 접힌 3줄. "상세"는 기존 공항 패널을 연다.
// 지도를 움직이면 공항을 따라가고, 자리는 경로선·패널·독·슬라이더·다른 카드를 피해 고른다(airportCardPlacement.js).
// 접으면 같은 자리·같은 지시선 끝에 작은 칩(색 띠·ICAO·비행등급·경보 점·⌃)으로 줄어든다. collapsedRoles·onToggleCollapse는 MapBriefingView가 갖는다.
export default function AirportCards({ briefing, mapRef, airports = [], routeSamples = null, onOpenAirport, collapsedRoles = [], onToggleCollapse }) {
  const { tz } = useTimeZone()
  const layerRef = useRef(null)
  const [frame, setFrame] = useState(0)
  const [layout, setLayout] = useState([])
  const hhmm = (iso) => formatBriefingTime(iso, tz).replace(` ${tz}`, '').replace('Z', '')
  const cards = useMemo(() => airportCards(briefing, {
    airportList: airports,
    nameFor: (icao) => shortName(airports.find((airport) => airport.icao === icao)?.nameKo ?? icao),
  }), [briefing, airports])

  // 지도 이동·확대마다 다시 놓는다(한 프레임에 한 번).
  useEffect(() => {
    const map = mapRef?.current
    if (!map) return undefined
    let raf = 0
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setFrame((n) => n + 1)) }
    map.on('move', schedule)
    map.on('resize', schedule)
    window.addEventListener('resize', schedule)
    // 공항 패널·팝오버·안내처럼 지도 밖에서 뜨고 지는 것도 피해야 하므로 화면 구성이 바뀌면 다시 놓는다.
    const observer = new MutationObserver(schedule)
    for (const root of [layerRef.current?.closest('.app'), layerRef.current?.closest('.map-view-wrapper')]) {
      if (root) observer.observe(root, { childList: true })
    }
    return () => { cancelAnimationFrame(raf); observer.disconnect(); map.off('move', schedule); map.off('resize', schedule); window.removeEventListener('resize', schedule) }
  }, [mapRef])

  useLayoutEffect(() => {
    const map = mapRef?.current
    const layer = layerRef.current
    // 공항 패널이 열려 있으면 카드를 숨긴다 — 패널이 그 공항을 자세히 보여 주고, 카드가 패널에 반쯤 가려 어지러웠다.
    if (!map || !layer || document.querySelector('.airport-panel')) { setLayout([]); return }
    const origin = layer.getBoundingClientRect()
    const toLocal = (rect) => ({ left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top })
    const wrapper = layer.closest('.map-view-wrapper') ?? document
    const obstacles = OBSTACLE_SELECTORS.flatMap((selector) => [...wrapper.querySelectorAll(selector)])
      .map((el) => el.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0).map(toLocal)
    const step = Math.max(1, Math.floor((routeSamples?.length ?? 0) / 60))
    const route = (routeSamples ?? []).filter((_, index) => index % step === 0)
      .filter((sample) => Number.isFinite(sample?.lon) && Number.isFinite(sample?.lat))
      .map((sample) => { const p = map.project([sample.lon, sample.lat]); return [p.x, p.y] })
    const anchors = cards.filter((card) => card.position).map((card) => {
      const p = map.project(card.position)
      const size = collapsedRoles.includes(card.role) ? { w: chipWidth(card), h: CHIP_H } : { w: CARD_W, h: CARD_H }
      return { key: card.icao, x: p.x, y: p.y, size }
    })
    const bounds = { left: 8, top: 8, right: origin.width - 8, bottom: origin.height - 8 }
    setLayout(placeAirportCards(anchors, { size: { w: CARD_W, h: CARD_H }, bounds, obstacles, route }))
  }, [cards, mapRef, routeSamples, frame, collapsedRoles])

  const byKey = new Map(layout.map((place) => [place.key, place]))
  return (
    <div ref={layerRef} className="mb-airport-layer" aria-label="공항 카드">
      <svg className="mb-airport-leaders" aria-hidden="true">
        {/* 지도 위에서도 보이게: 흰 테두리 선 위에 진한 선, 공항 쪽 끝에 점. */}
        {layout.map((place) => (
          <g key={place.key}>
            <line className="is-halo" x1={place.anchor[0]} y1={place.anchor[1]} x2={place.lineEnd[0]} y2={place.lineEnd[1]} />
            <line x1={place.anchor[0]} y1={place.anchor[1]} x2={place.lineEnd[0]} y2={place.lineEnd[1]} />
            <circle cx={place.anchor[0]} cy={place.anchor[1]} r={3.5} />
          </g>
        ))}
      </svg>
      {cards.map((card) => {
        const place = byKey.get(card.icao)
        if (!place) return null
        const changes = changeLines(card.taf.changes, hhmm)
        if (collapsedRoles.includes(card.role)) {
          return (
            <button key={card.icao} type="button" className={`mb-airport-chip is-${card.categoryLevel}`} style={{ left: place.left, top: place.top, height: CHIP_H }}
              onClick={() => onToggleCollapse?.(card.role)} title={`${card.roleLabel} ${card.icao} 카드 펼치기`} aria-label={`${card.icao} 카드 펼치기`} aria-expanded="false">
              <strong>{card.icao}</strong>
              {card.category && <span className="mb-ac-cat">{card.category}</span>}
              {hasAlertFlag(card) && <i className="mb-chip-alert" title={card.flags.windshear ? '윈드시어 경보' : '공항경보'} />}
              <ChevronUp size={15} aria-hidden="true" />
            </button>
          )
        }
        return (
          <article key={card.icao} className={`mb-airport-card is-${card.categoryLevel}`} style={{ left: place.left, top: place.top, width: CARD_W, height: CARD_H }}
            aria-label={`${card.roleLabel} ${card.icao} ${card.name}`}>
            <header className="mb-ac-head">
              <span className={`mb-ac-role is-${card.role}`}>{card.roleLabel}</span>
              <strong>{card.icao}</strong>
              <span className="mb-ac-name">{card.name}</span>
              {card.category && <span className="mb-ac-cat">{card.category}</span>}
              <button type="button" className="mb-ac-fold" onClick={() => onToggleCollapse?.(card.role)} title="카드 접기" aria-label={`${card.icao} 카드 접기`} aria-expanded="true">
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </header>
            <dl className="mb-ac-rows">
              <dt>{card.metar.speci ? 'SPECI' : 'METAR'}<small>{card.metar.time ? hhmm(card.metar.time) : ''}</small></dt>
              <dd title={card.metar.text ?? undefined}>{card.metar.text ?? '자료 없음'}</dd>
              <dt title={card.taf.previous ? '새 TAF가 아직 발효 전이라 그 시각에 유효한 직전 발표' : undefined}>TAF<small>{card.taf.basis}±1h{card.taf.previous ? ' · 직전' : ''}</small></dt>
              <dd title={[card.taf.text, ...changes].filter(Boolean).join('\n') || undefined}>
                <span>{card.taf.text ?? '자료 없음'}</span>
                {changes.length > 0 && <em>변화 {changes.length}</em>}
              </dd>
            </dl>
            <footer className="mb-ac-foot">
              {card.flags.windshear && <span className="mb-ac-flag is-red" title="윈드시어 경보">윈드시어</span>}
              {card.flags.warnings.length > 0 && <span className="mb-ac-flag" title={card.flags.warnings.join(' · ')}>공항경보 {card.flags.warnings.length}</span>}
              {card.flags.notams > 0 && <span className="mb-ac-flag is-notam" title="공항 NOTAM">NOTAM {card.flags.notams}</span>}
              <button type="button" className="mb-ac-more" disabled={!card.canOpenPanel} onClick={() => onOpenAirport?.(card.icao)}
                title={card.canOpenPanel ? '공항 패널 열기' : '공항 정보 없음'} aria-label={`${card.icao} 상세`}>
                상세<ChevronRight size={15} aria-hidden="true" />
              </button>
            </footer>
          </article>
        )
      })}
    </div>
  )
}
