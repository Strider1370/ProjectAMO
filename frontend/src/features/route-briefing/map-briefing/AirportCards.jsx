import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { formatBriefingTime } from '../lib/briefingTime.js'
import { airportCards, changeLines } from './airportCardModel.js'
import { placeAirportCards } from './airportCardPlacement.js'

const CARD_SIZE = { w: 300, h: 92 }
// 카드가 피할 화면 요소(지도 위에 뜬 것들). 공항 패널이 열려 있으면 그 자리도 피한다.
const OBSTACLE_SELECTORS = ['.mb-panel', '.mb-dock', '.mb-dock-tab', '.mb-toast', '.mb-popover', '.vertical-level-rail-stack', '.weather-time-card', '.mobile-map-layer-btns', '.map-bottom-control-dock', '.airport-panel']

const shortName = (name) => String(name ?? '').replace('국제공항', '').replace('공항', '')

// 지도형 브리핑 공항 카드(spec §2.3): 출발·도착·교체 공항 옆에 지시선으로 붙는 접힌 3줄. "상세"는 기존 공항 패널을 연다.
// 지도를 움직이면 공항을 따라가고, 자리는 경로선·패널·독·슬라이더·다른 카드를 피해 고른다(airportCardPlacement.js).
export default function AirportCards({ briefing, mapRef, airports = [], routeSamples = null, onOpenAirport }) {
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
    if (!map || !layer) { setLayout([]); return }
    const origin = layer.getBoundingClientRect()
    const toLocal = (rect) => ({ left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top })
    const wrapper = layer.closest('.map-view-wrapper') ?? document
    const obstacles = OBSTACLE_SELECTORS.flatMap((selector) => [...(selector === '.airport-panel' ? document : wrapper).querySelectorAll(selector)])
      .map((el) => el.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0).map(toLocal)
    const step = Math.max(1, Math.floor((routeSamples?.length ?? 0) / 60))
    const route = (routeSamples ?? []).filter((_, index) => index % step === 0)
      .filter((sample) => Number.isFinite(sample?.lon) && Number.isFinite(sample?.lat))
      .map((sample) => { const p = map.project([sample.lon, sample.lat]); return [p.x, p.y] })
    const anchors = cards.filter((card) => card.position).map((card) => { const p = map.project(card.position); return { key: card.icao, x: p.x, y: p.y } })
    const bounds = { left: 8, top: 8, right: origin.width - 8, bottom: origin.height - 8 }
    setLayout(placeAirportCards(anchors, { size: CARD_SIZE, bounds, obstacles, route }))
  }, [cards, mapRef, routeSamples, frame])

  const byKey = new Map(layout.map((place) => [place.key, place]))
  return (
    <div ref={layerRef} className="mb-airport-layer" aria-label="공항 카드">
      <svg className="mb-airport-leaders" aria-hidden="true">
        {layout.map((place) => <line key={place.key} x1={place.anchor[0]} y1={place.anchor[1]} x2={place.lineEnd[0]} y2={place.lineEnd[1]} />)}
      </svg>
      {cards.map((card) => {
        const place = byKey.get(card.icao)
        if (!place) return null
        const changes = changeLines(card.taf.changes, hhmm)
        return (
          <article key={card.icao} className={`mb-airport-card is-${card.categoryLevel}`} style={{ left: place.left, top: place.top, width: CARD_SIZE.w, height: CARD_SIZE.h }}
            aria-label={`${card.roleLabel} ${card.icao} ${card.name}`}>
            <header className="mb-ac-head">
              <span className={`mb-ac-role is-${card.role}`}>{card.roleLabel}</span>
              <strong>{card.icao}</strong>
              <span className="mb-ac-name">{card.name}</span>
              {card.category && <span className="mb-ac-cat">{card.category}</span>}
              {card.flags.windshear && <span className="mb-ac-flag is-red" title="윈드시어 경보">윈드시어</span>}
              {card.flags.warnings.length > 0 && <span className="mb-ac-flag" title={card.flags.warnings.join(' · ')}>경보 {card.flags.warnings.length}</span>}
              {card.flags.notams > 0 && <span className="mb-ac-flag is-notam" title="공항 NOTAM">NOTAM {card.flags.notams}</span>}
              <button type="button" className="mb-ac-more" disabled={!card.canOpenPanel} onClick={() => onOpenAirport?.(card.icao)}
                title={card.canOpenPanel ? '공항 패널 열기' : '공항 정보 없음'} aria-label={`${card.icao} 상세`}>
                상세<ChevronRight size={13} aria-hidden="true" />
              </button>
            </header>
            <p className="mb-ac-line" title={card.metar.text ?? undefined}>
              <span className="mb-ac-key">{card.metar.speci ? 'SPECI' : 'METAR'}{card.metar.time ? ` ${hhmm(card.metar.time)}` : ''}</span>
              <span className="mb-ac-text">{card.metar.text ?? '자료 없음'}</span>
            </p>
            <p className="mb-ac-line" title={[card.taf.text, ...changes].filter(Boolean).join('\n') || undefined}>
              <span className="mb-ac-key" title={card.taf.previous ? '새 TAF가 아직 발효 전이라 그 시각에 유효한 직전 발표' : undefined}>TAF {card.taf.basis}±1h{card.taf.previous ? ' · 직전' : ''}</span>
              <span className="mb-ac-text">{card.taf.text ?? '자료 없음'}</span>
              {changes.length > 0 && <span className="mb-ac-changes">변화 {changes.length}</span>}
            </p>
          </article>
        )
      })}
    </div>
  )
}
