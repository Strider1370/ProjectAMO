import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Info, MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import DataProvenance from '../../../shared/ui/DataProvenance.jsx'
import {
  buildCompactMetarModel,
  buildCompactTafModel,
  buildCurrentWarningModel,
} from '../lib/currentWeatherViewModel.js'
import { fmtKstShort } from '../lib/formatters.js'
import { TAF_CATEGORY_COLOR } from '../lib/tafViewModel.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

function tafWeatherClass(item, baseClass, { includeSpecial = true } = {}) {
  return [
    baseClass,
    item?.hasPrecipitation ? `${baseClass}--precip` : '',
    includeSpecial && item?.isSpecialWeather ? `${baseClass}--special` : '',
  ].filter(Boolean).join(' ')
}

function WarningSummary({ warning }) {
  const { tz } = useTimeZone()
  const model = useMemo(() => buildCurrentWarningModel(warning, tz), [warning, tz])
  const viewportRef = useRef(null)
  const measureRef = useRef(null)
  const [pages, setPages] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextPageIndex, setNextPageIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [pageHeight, setPageHeight] = useState(52)

  useEffect(() => {
    if (!model.active) {
      setPages([])
      setPageIndex(0)
      setNextPageIndex(0)
      setIsAnimating(false)
      return undefined
    }

    const updateLayout = () => {
      const viewport = viewportRef.current
      const measure = measureRef.current
      if (!viewport || !measure) return

      const itemNodes = Array.from(measure.children)
      const nextPages = []
      let currentTop = null
      let currentPage = []

      itemNodes.forEach((node, index) => {
        const top = Math.round(node.offsetTop)
        if (currentTop === null || top === currentTop) {
          currentTop = top
          currentPage.push(index)
          return
        }

        nextPages.push(currentPage)
        currentTop = top
        currentPage = [index]
      })

      if (currentPage.length > 0) nextPages.push(currentPage)

      const measuredHeight = itemNodes.length > 0
        ? Math.ceil(Math.max(...itemNodes.map((node) => node.getBoundingClientRect().height)) + 8)
        : Math.ceil(measure.getBoundingClientRect().height)

      if (measuredHeight > 0) setPageHeight(measuredHeight)
      setPages(nextPages)
    }

    updateLayout()
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateLayout) : null

    if (resizeObserver) {
      if (viewportRef.current) resizeObserver.observe(viewportRef.current)
      if (measureRef.current) resizeObserver.observe(measureRef.current)
      return () => resizeObserver.disconnect()
    }

    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [model.active, model.items])

  useEffect(() => {
    setPages([])
    setPageIndex(0)
    setNextPageIndex(0)
    setIsAnimating(false)
  }, [warning, model.count])

  useEffect(() => {
    if (pages.length <= 1) return undefined

    const interval = window.setInterval(() => {
      setNextPageIndex((pageIndex + 1) % pages.length)
      setIsAnimating(true)
    }, 4200)

    return () => window.clearInterval(interval)
  }, [pageIndex, pages])

  useEffect(() => {
    if (!isAnimating) return undefined

    const timer = window.setTimeout(() => {
      setPageIndex(nextPageIndex)
      setIsAnimating(false)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [isAnimating, nextPageIndex])

  if (!model.active) {
    return (
      <section className="ap-current-warning ap-current-warning--ok">
        <div className="ap-current-warning-side ap-current-warning-side--single">
          <Check className="ap-current-warning-icon" aria-hidden="true" />
          <span className="ap-current-warning-label">{model.label}</span>
        </div>
      </section>
    )
  }

  const normalizedPages = (pages.length > 0 ? pages : [model.items.map((_, index) => index)])
    .map((page) => page.filter((itemIndex) => itemIndex >= 0 && itemIndex < model.items.length))
    .filter((page) => page.length > 0)
  const activePage = normalizedPages[Math.min(pageIndex, normalizedPages.length - 1)] || []
  const incomingPage = normalizedPages[Math.min(nextPageIndex, normalizedPages.length - 1)] || activePage

  function renderItems(page, keyPrefix) {
    return page.map((itemIndex, index) => {
      const item = model.items[itemIndex]
      return (
        <span key={`${keyPrefix}-${item.key}-${index}`} className="ap-current-warning-item">
          <span className="ap-current-warning-entry">
            <strong className="ap-current-warning-name">{item.name}</strong>
            <span className="ap-current-warning-time">{item.timeText}</span>
          </span>
        </span>
      )
    })
  }

  return (
    <section className="ap-current-warning ap-current-warning--danger">
      <div className="ap-current-warning-side">
        <AlertTriangle className="ap-current-warning-icon ap-current-warning-icon--alert" aria-hidden="true" />
        <span className="ap-current-warning-label">{model.label}</span>
      </div>
      <div
        ref={viewportRef}
        className="ap-current-warning-text"
        style={{ '--ap-warning-page-height': `${pageHeight}px` }}
      >
        <div className={`ap-current-warning-page${isAnimating ? ' ap-current-warning-page--leave' : ' ap-current-warning-page--active'}`}>
          <div className="ap-current-warning-group">{renderItems(activePage, `page-${pageIndex}`)}</div>
        </div>
        {isAnimating && (
          <div className="ap-current-warning-page ap-current-warning-page--enter">
            <div className="ap-current-warning-group">{renderItems(incomingPage, `page-${nextPageIndex}`)}</div>
          </div>
        )}
        <div className="ap-current-warning-measure" aria-hidden="true">
          <div ref={measureRef} className="ap-current-warning-group">
            {renderItems(model.items.map((_, index) => index), 'measure')}
          </div>
        </div>
      </div>
    </section>
  )
}

function ProvenanceInfo({ source }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!source) return null

  return (
    <span className="ap-prov-info" ref={ref}>
      <button
        type="button"
        className="ap-prov-info-btn"
        aria-label="자료 출처 정보"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Info aria-hidden="true" />
      </button>
      {open ? (
        <div className="ap-prov-info-pop" role="dialog">
          <DataProvenance source={source} />
        </div>
      ) : null}
    </span>
  )
}

function MetarSummary({ metar, amosData, icao, airportMeta }) {
  const { tz } = useTimeZone()
  const model = buildCompactMetarModel({ metar, amosData, icao, airportMeta })

  if (model.empty) {
    return (
      <section className="ap-current-section">
        <div className="ap-empty">METAR 데이터 없음</div>
      </section>
    )
  }

  // ICAO Annex 3 / 조종사 스캔 순서: 바람 → 시정 → RVR → 현재기상 → 운고 → 기온 → QNH
  // (비행규칙 VFR은 아래 flight 카드로 별도 표시)
  const cardList = [
    model.cards.wind,
    model.cards.visibility,
    model.cards.rvr,
    model.cards.weather,
    model.cards.ceiling,
    model.cards.temperature,
    model.cards.qnh,
  ].filter(Boolean)

  function renderCardLabel(card) {
    if (card.id === 'weather') {
      return (
        <span className="ap-current-card-label ap-current-card-label--stack">
          <span>현재</span>
          <span>날씨</span>
        </span>
      )
    }

    if (card.id === 'temperature') {
      return (
        <span className="ap-current-card-label ap-current-card-label--stack">
          <span>기온/</span>
          <span>이슬점</span>
        </span>
      )
    }

    return <span className="ap-current-card-label">{card.label}</span>
  }

  function renderCardValue(card) {
    if (card.id === 'weather') {
      return (
        <strong className="ap-current-card-value ap-current-card-value--with-visual" style={card.color ? { color: card.color } : undefined}>
          {card.visual ? <WeatherIcon visual={card.visual} className="ap-current-card-value-icon" /> : null}
          <span>{card.value}</span>
        </strong>
      )
    }

    if (card.id === 'wind') {
      return (
        <strong className="ap-current-card-value ap-current-card-value--with-visual" style={card.color ? { color: card.color } : undefined}>
          {Number.isFinite(card.windRotation) ? <MoveUp className="ap-current-card-value-arrow" style={{ transform: `rotate(${card.windRotation}deg)` }} /> : null}
          <span>{card.value}</span>
        </strong>
      )
    }

    return (
      <strong className="ap-current-card-value" style={card.color ? { color: card.color } : undefined}>
        <span>{card.value}</span>
      </strong>
    )
  }

  return (
    <section className="ap-current-section ap-current-metar">
      <div className="ap-current-section-header">
        <span className="ap-current-section-badge">METAR</span>
        <span className="ap-current-section-time">{fmtKstShort(metar?.header?.observation_time || metar?.header?.issue_time, tz)}</span>
        <ProvenanceInfo source={metar?.header?.source} />
      </div>
      <div className="ap-current-metar-grid">
        <article
          className="ap-current-flight-card"
          style={{
            background: TAF_CATEGORY_COLOR[model.flight.category] || model.flight.bg,
            color: '#fff',
          }}
        >
          <strong className="ap-current-flight-code">{model.flight.category}</strong>
          <span className="ap-current-flight-label">{model.flight.labelKo}</span>
        </article>
        {cardList.map((card) => (
            <article
              key={card.id}
              className={`ap-current-card ap-current-card--${card.id}${card.highWind ? ' is-alert' : ''}`}
              style={card.background ? { backgroundColor: card.background, borderLeft: `3px solid ${card.border}` } : undefined}
            >
              <div className="ap-current-card-main">
                <div className="ap-current-card-meta">
                  {renderCardLabel(card)}
                </div>
                {renderCardValue(card)}
              </div>
              {card.secondary ? <span className="ap-current-card-secondary">{card.secondary}</span> : null}
            </article>
        ))}
      </div>
    </section>
  )
}

function TafSummary({ taf, icao }) {
  const { tz } = useTimeZone()
  const model = buildCompactTafModel({ taf, icao })

  if (model.empty) {
    return (
      <section className="ap-current-section">
        <div className="ap-empty">TAF 데이터 없음</div>
      </section>
    )
  }

  if (model.sourceSlotCount === 0) {
    return (
      <section className="ap-current-section">
        <div className="ap-empty">TAF 시간대 데이터 없음</div>
      </section>
    )
  }

  if (model.slots.length === 0) {
    return (
      <section className="ap-current-section">
        <div className="ap-empty">현재부터 6시간 내 TAF 없음</div>
      </section>
    )
  }

  const rows = [
    ['비행조건', model.groupTafSlots(model.slots, (item) => item.flight.category), (item) => item.flight.category, (item) => ({ background: model.categoryColor[item.flight.category] || '#15803d', color: '#fff' })],
    ['날씨', model.groupTafSlots(model.slots, (item) => item.weatherLabel), (item) => item.weatherLabel, (item) => ({ background: item.hasPrecipitation ? '#bae6fd' : '#f8fafc', color: item.hasPrecipitation ? '#0c4a6e' : '#0f172a' })],
    ['바람', model.groupTafSlots(model.slots, (item) => item.windText), (item) => item.windText, (item) => ({ background: item.highWind ? '#fff1f2' : '#f8fafc', color: item.highWind ? '#be123c' : '#0f172a' })],
    ['시정', model.groupTafSlots(model.slots, (item) => item.visibilityText), (item) => item.visibilityText, (item) => ({ background: item.visibilityCategory.bg, color: item.visibilityCategory.valueColor })],
    ['운고', model.groupTafSlots(model.slots, (item) => item.ceilingText), (item) => item.ceilingText, (item) => ({ background: item.ceilingCategory.bg, color: item.ceilingCategory.valueColor })],
  ]

  return (
    <section className="ap-current-section ap-current-taf">
      <div className="ap-current-section-header">
        <span className="ap-current-section-badge">{model.hdr?.report_status === 'AMENDMENT' ? 'TAF AMD' : 'TAF'}</span>
        <span className="ap-current-section-time">{fmtKstShort(model.slots[0]?.time, tz)} – {fmtKstShort(new Date(new Date(model.slots.at(-1)?.time).getTime() + 3600000).toISOString(), tz)}</span>
        <ProvenanceInfo source={taf?.header?.source} />
      </div>
      <div className="ap-taf-timeline">
        <div className="ap-taf-scale" style={{ '--taf-hour-count': model.slots.length }}>
          {model.slots.map((item, index) => (
            <span key={item.time || index}>{model.formatTafHour(item.time, tz)}</span>
          ))}
        </div>
        {rows.map(([label, groups, textFn, styleFn], rowIndex) => (
          <div className="ap-taf-line" key={label}>
            <div className="ap-taf-line-label">{label}</div>
            <div className="ap-taf-line-track">
              {groups.map((group, index) => (
                <div
                  key={index}
                  className={rowIndex === 1 ? tafWeatherClass(group.first, 'ap-taf-seg', { includeSpecial: false }) : 'ap-taf-seg'}
                  style={{ width: group.width, ...styleFn(group.first) }}
                  title={textFn(group.first)}
                >
                  {label === '날씨' ? <WeatherIcon visual={group.first.visual} className="ap-taf-mini-icon" /> : null}
                  {label === '바람' ? <MoveUp className="ap-taf-mini-arrow" style={{ transform: `rotate(${group.first.windRotation}deg)` }} /> : null}
                  <span>{textFn(group.first)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function CurrentWeatherTab({ icao, airportMeta, warning, metar, taf, amosData }) {
  return (
    <div className="ap-current-weather">
      <WarningSummary warning={warning} />
      <MetarSummary metar={metar} amosData={amosData} icao={icao} airportMeta={airportMeta} />
      <TafSummary taf={taf} icao={icao} />
    </div>
  )
}
