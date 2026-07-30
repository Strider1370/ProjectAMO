import { useMemo } from 'react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { classifyVisibilityCategory, classifyCeilingCategory, formatRvr } from '../../shared/weather/helpers.js'
import { AIRPORT_CATEGORY_UNKNOWN_COLOR, getCeilingFeet, getVisibilityMeters } from './lib/airportStationModel.js'
import './AirportTooltip.css'

function formatWind(wind) {
  if (!wind) return '—'
  if (wind.calm) return 'CALM'
  const dir = wind.variable ? 'VRB' : Number.isFinite(wind.direction) ? String(wind.direction).padStart(3, '0') : '///'
  const spd = Number.isFinite(wind.speed) ? String(Math.round(wind.speed)).padStart(2, '0') : '//'
  const gust = Number.isFinite(wind.gust) ? ` G${Math.round(wind.gust)}` : ''
  return `${dir}/${spd}kt${gust}`
}

function formatVisibility(observation) {
  if (!observation) return '—'
  if (observation.visibility?.cavok || observation.cavok) return 'CAVOK'
  const val = observation.visibility?.value
  if (!Number.isFinite(val)) return '—'
  if (val >= 9999) return '9,999m+'
  return `${val.toLocaleString()}m`
}

function formatWeather(observation) {
  if (!observation?.weather?.length) return ''
  return observation.display?.weather || ''
}

function formatClouds(observation) {
  if (!observation) return '—'
  if (!observation.clouds?.length) {
    return observation.display?.clouds || 'SKC'
  }
  const significant = observation.clouds.filter((c) => {
    const amt = String(c?.amount || '').toUpperCase()
    return ['FEW', 'SCT', 'BKN', 'OVC', 'VV'].includes(amt)
  })
  if (!significant.length) return 'SKC'
  return significant.map((c) => {
    const base = Number.isFinite(c.base) ? String(Math.round(c.base / 100)).padStart(3, '0') : '///'
    // CB/TCU(대류운)는 운고와 함께 봐야 하는 정보 — 전문 표기 그대로 뒤에 붙인다.
    const type = c.type === 'CB' || c.type === 'TCU' ? c.type : ''
    return `${String(c.amount).toUpperCase()}${base}${type}`
  }).join(' ')
}

function formatTempDew(observation) {
  if (!observation) return '—'
  const t = Number.isFinite(observation.temperature?.air) ? `${Math.round(observation.temperature.air)}°` : '—'
  const d = Number.isFinite(observation.temperature?.dewpoint) ? `${Math.round(observation.temperature.dewpoint)}°` : '—'
  return `${t} / ${d}`
}

function formatQnh(observation) {
  if (!observation) return '—'
  const raw = observation.qnh
  const qnh = typeof raw === 'number' ? raw : raw?.value ?? observation.altimeter?.value ?? observation.altimeter
  if (!Number.isFinite(qnh)) return '—'
  return `Q${Math.round(qnh)}`
}

function formatObsTime(metar, tz) {
  const iso = metar?.header?.observation_time || metar?.header?.issue_time
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const display = tz === 'KST' ? new Date(d.getTime() + 9 * 3600 * 1000) : d
    const hh = String(display.getUTCHours()).padStart(2, '0')
    const mm = String(display.getUTCMinutes()).padStart(2, '0')
    return `${hh}:${mm} ${tz}`
  } catch {
    return '—'
  }
}

export default function AirportTooltip({ metar, airport, flightCategory, categoryColor, x, y, containerWidth, containerHeight }) {
  const { tz } = useTimeZone()

  const obs = metar?.observation || null
  const wind = formatWind(obs?.wind)
  const vis = formatVisibility(obs)
  const wx = formatWeather(obs)
  const clouds = formatClouds(obs)
  const tempDew = formatTempDew(obs)
  const qnh = formatQnh(obs)
  const obsTime = formatObsTime(metar, tz)

  const resolvedCategoryColor = categoryColor || AIRPORT_CATEGORY_UNKNOWN_COLOR
  const resolvedCategory = flightCategory && flightCategory !== 'UNKNOWN' ? flightCategory : null

  // 어떤 요소(시정/운고) 때문에 이 범주가 됐는지 — 각각 독립 판정해 전체 범주와 같은 쪽만 원인으로 표시.
  const visibilityMeters = obs?.visibility?.cavok || obs?.cavok ? 99999 : getVisibilityMeters(obs || {})
  const ceilingFeet = getCeilingFeet(obs || {})
  const visCategory = classifyVisibilityCategory(visibilityMeters, airport?.icao)?.category
  const ceilCategory = classifyCeilingCategory(ceilingFeet, airport?.icao)?.category
  const visIsDriver = resolvedCategory && resolvedCategory !== 'VFR' && visCategory === resolvedCategory
  const ceilIsDriver = resolvedCategory && resolvedCategory !== 'VFR' && ceilCategory === resolvedCategory
  const driverStyle = { color: resolvedCategoryColor, fontWeight: 700 }

  const TOOLTIP_W = 152
  const TOOLTIP_H = 210
  const OFFSET = 28

  const style = useMemo(() => {
    let left = x - TOOLTIP_W / 2
    let top = y - TOOLTIP_H - OFFSET
    if (top < 8) top = y + OFFSET
    if (containerWidth) {
      if (left < 8) left = 8
      if (left + TOOLTIP_W > containerWidth - 8) left = containerWidth - TOOLTIP_W - 8
    }
    return { left, top, borderColor: resolvedCategoryColor }
  }, [x, y, containerWidth, containerHeight, resolvedCategoryColor])

  return (
    <div className="airport-tooltip" style={style}>
      <div className="airport-tooltip-header">
        <span className="airport-tooltip-icao">{airport?.icao || '—'}</span>
        {resolvedCategory && (
          <span className="airport-tooltip-badge" style={{ color: resolvedCategoryColor }}>
            {resolvedCategory}
          </span>
        )}
      </div>
      <div className="airport-tooltip-name">{airport?.nameKo || airport?.name || ''}</div>

      <div className="airport-tooltip-divider" />

      <div className="airport-tooltip-rows">
        <div className="airport-tooltip-row">
          <span className="airport-tooltip-label">바람</span>
          <span className="airport-tooltip-value">{wind}</span>
        </div>
        <div className="airport-tooltip-row">
          <span className="airport-tooltip-label">시정</span>
          <span className="airport-tooltip-value" style={visIsDriver ? driverStyle : undefined}>{vis}</span>
        </div>
        {wx && (
          <div className="airport-tooltip-row">
            <span className="airport-tooltip-label">현상</span>
            <span className="airport-tooltip-value airport-tooltip-wx">{wx}</span>
          </div>
        )}
        <div className="airport-tooltip-row">
          <span className="airport-tooltip-label">운고</span>
          <span className="airport-tooltip-value" style={ceilIsDriver ? driverStyle : undefined}>{clouds}</span>
        </div>
        <div className="airport-tooltip-row">
          <span className="airport-tooltip-label">RVR</span>
          <span className="airport-tooltip-value">{formatRvr(obs)}</span>
        </div>
        <div className="airport-tooltip-row">
          <span className="airport-tooltip-label">기온</span>
          <span className="airport-tooltip-value">{tempDew}</span>
        </div>
        <div className="airport-tooltip-row">
          <span className="airport-tooltip-label">QNH</span>
          <span className="airport-tooltip-value">{qnh}</span>
        </div>
        {obsTime !== '—' && (
          <div className="airport-tooltip-row">
            <span className="airport-tooltip-label">시간</span>
            <span className="airport-tooltip-value airport-tooltip-time">{obsTime}</span>
          </div>
        )}
      </div>
    </div>
  )
}
