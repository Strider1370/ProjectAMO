import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { formatBriefingTime } from '../lib/briefingTime.js'
import { useAirportHistory } from '../../../shared/weather/useAirportHistory.js'
import { airportCards, cardLineSegments, changeLines, chipWidth, hasAlertFlag, metarText, tafTextAt } from './airportCardModel.js'
import { placeAirportCards } from './airportCardPlacement.js'

const CARD_W = 360
const CARD_H = 140 // 머리 · METAR · TAF · 깃발/상세 네 줄(최소 높이). METAR·TAF가 길면 줄을 바꿔 늘어나고, 자리 계산은 잰 높이를 쓴다.
const CHIP_H = 28 // 접은 칩
const LATEST_TAF = {} // TAF 이력 줄의 최신 칸 자리(글은 카드의 ±1시간 한 줄을 쓴다)
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
  const [heights, setHeights] = useState({}) // 펼친 카드의 실제 높이(ICAO별)
  const reportHeight = useCallback((icao, height) => setHeights((prev) => (prev[icao] === height ? prev : { ...prev, [icao]: height })), [])
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
      const size = collapsedRoles.includes(card.role) ? { w: chipWidth(card), h: CHIP_H } : { w: CARD_W, h: heights[card.icao] ?? CARD_H }
      return { key: card.icao, x: p.x, y: p.y, size }
    })
    const bounds = { left: 8, top: 8, right: origin.width - 8, bottom: origin.height - 8 }
    setLayout(placeAirportCards(anchors, { size: { w: CARD_W, h: CARD_H }, bounds, obstacles, route }))
  }, [cards, mapRef, routeSamples, frame, collapsedRoles, heights])

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
        return <AirportCard key={card.icao} card={card} place={place} changes={changes} hhmm={hhmm} onOpenAirport={onOpenAirport} onToggleCollapse={onToggleCollapse} onHeight={reportHeight} />
      })}
    </div>
  )
}

// 이력 점: 이름 칸 아래 한 줄, 왼쪽 = 과거 → 오른쪽 = 최신. METAR 점 색 = 비행등급, 고른 점은 테두리. 누르면 그 줄이 그 보고로.
function HistoryDots({ history, label, describe }) {
  if (history.entries.length < 2) return null
  return (
    <span className="mb-ac-dots" role="listbox" aria-label={`${label} 이력`}>
      {history.entries.map((entry) => {
        const selected = entry.key === history.selected?.key
        return (
          <button key={entry.key} type="button" role="option" aria-selected={selected} aria-label={describe(entry)} title={describe(entry)}
            className={`is-${(entry.category ?? 'none').toLowerCase()}${selected ? ' is-selected' : ''}${entry.latest ? ' is-latest' : ''}`}
            onClick={() => history.select(entry.key)} />
        )
      })}
    </span>
  )
}

function AirportCard({ card, place, changes, hhmm, onOpenAirport, onToggleCollapse, onHeight }) {
  const cardRef = useRef(null)
  // 줄바꿈으로 늘어난 높이를 알려 자리 계산(다른 카드·패널 피하기)에 쓰게 한다.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return undefined
    const report = () => onHeight?.(card.icao, Math.ceil(el.offsetHeight))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [card.icao, onHeight])
  const metarHistory = useAirportHistory(card.icao, 'metar', { latest: card.metar.report, latestTime: card.metar.time, latestKind: card.metar.speci ? 'SPECI' : 'METAR' })
  const tafHistory = useAirportHistory(card.icao, 'taf', { latest: card.taf.issued ? LATEST_TAF : null, latestTime: card.taf.issued })
  const pastMetar = metarHistory.selected && !metarHistory.selected.latest ? metarHistory.selected : null
  const pastTaf = tafHistory.selected && !tafHistory.selected.latest ? tafHistory.selected : null
  const metarShown = pastMetar ? (metarText(pastMetar.report) ?? '자료 없음') : (card.metar.text ?? '자료 없음')
  const tafShown = pastTaf ? (tafTextAt(pastTaf.report, card.taf.time) ?? '자료 없음') : (card.taf.text ?? '자료 없음')
  const zHour = (iso) => `${String(new Date(iso).getUTCHours()).padStart(2, '0')}Z`
  const metarKind = (pastMetar?.kind ?? (card.metar.speci ? 'SPECI' : 'METAR')) === 'SPECI' ? 'SPECI' : 'METAR'
  return (
    <article ref={cardRef} className={`mb-airport-card is-${card.categoryLevel}`} style={{ left: place.left, top: place.top, width: CARD_W, minHeight: CARD_H }}
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
        <dt className={pastMetar ? 'is-past' : undefined}>
          <span>{metarKind} <small>{pastMetar ? hhmm(pastMetar.time) : (card.metar.time ? hhmm(card.metar.time) : '')}</small></span>
          <HistoryDots history={metarHistory} label="METAR" describe={(entry) => `${hhmm(entry.time)} ${entry.kind}${entry.category ? ` · ${entry.category}` : ''}${entry.latest ? ' · 최신' : ''}`} />
        </dt>
        <dd className={pastMetar ? 'is-past' : undefined}><span title={metarShown}><TacLine text={metarShown} icao={card.icao} /></span></dd>
        <dt className={pastTaf ? 'is-past' : undefined} title={!pastTaf && card.taf.previous ? '새 TAF가 아직 발효 전이라 그 시각에 유효한 직전 발표' : undefined}>
          <span>TAF <small>{pastTaf ? `${zHour(pastTaf.time)}${pastTaf.kind === 'AMD' ? ' AMD' : ''}` : `${card.taf.basis}±1h${card.taf.issued ? ` ${zHour(card.taf.issued)}` : ''}`}</small></span>
          <HistoryDots history={tafHistory} label="TAF" describe={(entry) => `${zHour(entry.time)} ${entry.latest ? '발표 · 지금 기준' : `${entry.kind === 'AMD' ? 'AMD' : 'TAF'} 발표`}`} />
        </dt>
        <dd className={pastTaf ? 'is-past' : undefined}>
          <span title={pastTaf ? tafShown : ([card.taf.text, ...changes].filter(Boolean).join('\n') || undefined)}><TacLine text={tafShown} icao={card.icao} /></span>
          {!pastTaf && changes.length > 0 && <em>변화 {changes.length}</em>}
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
}

// 공항 패널 원문과 같은 기준으로 기준 미달 시정·운고, 강풍, CB·뇌전·안개, 강수를 칠한다.
function TacLine({ text, icao }) {
  return cardLineSegments(text, icao).map((segment, index) => (segment.className
    ? <mark key={index} className={`mb-ac-hl ${segment.className}`}>{segment.text}</mark>
    : segment.text))
}
