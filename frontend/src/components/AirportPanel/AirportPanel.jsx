import { useState } from 'react'
import { AIRPORT_NAME_KO } from '../../api/weatherApi.js'
import {
  getFlightCategory,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  computeRelativeHumidity,
  computeFeelsLikeC,
  hasHighWindCondition,
  getCrosswindComponentKt,
  getCrosswindSide,
  pickCrosswindArrow,
} from '../../utils/helpers.js'
import { convertWeatherToKorean } from '../../utils/visual-mapper.js'
import { resolveWeatherVisual } from '../../utils/weather-visual-resolver.js'
import WeatherIcon from '../WeatherIcon.jsx'
import { MoveUp, Plane } from 'lucide-react'
import './AirportPanel.css'

const TABS = [
  { id: 'metar', label: 'METAR' },
  { id: 'taf',   label: 'TAF' },
  { id: 'amos',  label: 'AMOS' },
  { id: 'warn',  label: 'WARNING' },
  { id: 'info',  label: '기상정보' },
]

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    return `${dd}/${hh}${mm}Z`
  } catch { return iso }
}

function fmtKst(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const kst = new Date(d.getTime() + 9 * 3600 * 1000)
    return kst.toISOString().replace('T', ' ').slice(0, 16) + ' KST'
  } catch { return iso }
}

function fmtKstShort(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const kst = new Date(d.getTime() + 9 * 3600 * 1000)
    const mo = String(kst.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(kst.getUTCDate()).padStart(2, '0')
    const hh = String(kst.getUTCHours()).padStart(2, '0')
    const mm = String(kst.getUTCMinutes()).padStart(2, '0')
    return `${mo}-${dd} ${hh}:${mm} KST`
  } catch { return iso }
}

function getWindDirectionRotation(wind) {
  if (!wind || wind.calm || !Number.isFinite(wind.direction)) return 0
  return ((wind.direction % 360) + 360 + 180) % 360
}

// ── METAR tab ────────────────────────────────────────────────────────────────

function MetarTab({ metar, amosData, icao, airportMeta }) {
  if (!metar) return <div className="ap-empty">METAR 데이터 없음</div>

  const obs  = metar.observation
  const disp = obs?.display
  const hdr  = metar.header

  // ── 계산 ────────────────────────────────────────────────────────────────────
  const wind       = obs?.wind || null
  const windSpeed  = wind?.speed
  const windGust   = wind?.gust
  const visibility = obs?.visibility?.value

  const clouds     = obs?.clouds || []
  const ceilingCloud = clouds
    .filter((c) => c.amount === 'BKN' || c.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]
  const ceilingFt  = ceilingCloud?.base ?? null

  const flightCat  = getFlightCategory(visibility, ceilingFt, icao)
  const visCat     = classifyVisibilityCategory(visibility, icao)
  const ceilCat    = classifyCeilingCategory(ceilingFt, icao)

  const tempC      = obs?.temperature?.air
  const dewpointC  = obs?.temperature?.dewpoint
  const rh         = computeRelativeHumidity(tempC, dewpointC)
  const feelsLike  = computeFeelsLikeC({ tempC, dewpointC, windKt: windSpeed, observedAt: hdr?.observation_time })

  const runwayHdg  = airportMeta?.runway_hdg ?? null
  const highWind   = hasHighWindCondition(wind)
  const crosswindKt = getCrosswindComponentKt(wind, runwayHdg)
  const crosswindSide = getCrosswindSide(wind, runwayHdg)
  const crosswindArrow = pickCrosswindArrow(wind, runwayHdg)

  const weatherKorean = convertWeatherToKorean(disp?.weather, obs?.cavok, clouds)
  const weatherVisual = resolveWeatherVisual(obs, hdr?.observation_time)

  const obsTime    = hdr?.observation_time || hdr?.issue_time
  const visValue   = disp?.visibility != null ? `${disp.visibility} m` : '—'
  const ceilValue  = Number.isFinite(ceilingFt) ? `${ceilingFt} ft` : 'NSC'
  const windDir    = wind?.calm ? 'CALM' : wind?.variable ? 'VRB' : Number.isFinite(wind?.direction) ? `${wind.direction}°` : '—'
  const windSpeedText = wind?.calm ? '0' : Number.isFinite(windSpeed) ? `${windSpeed}` : '—'
  const windGustText  = Number.isFinite(windGust) ? `G${windGust}` : null
  const windRotation  = getWindDirectionRotation(wind)
  const tempDisplay   = Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : '—'
  const rhDisplay     = Number.isFinite(rh) ? `${Math.round(rh)}%` : '—'
  const feelsLikeText = feelsLike.value != null ? `체감 ${feelsLike.value.toFixed(1)}°C` : null

  const amos       = amosData
  const rainMm     = amos?.daily_rainfall?.mm
  const rainText   = rainMm != null && rainMm > 0 ? `${rainMm.toFixed(1)} mm` : null

  const qnhRaw = disp?.qnh ?? '—'
  const qnh = qnhRaw.startsWith('Q') ? `${qnhRaw.substring(1)} hPa` : qnhRaw

  return (
    <div className="ap-metar-v2">
      {/* ── 헤더 ── */}
      <div className="ap-mv2-header">
        <div className="ap-mv2-header-left">
          <span className="ap-mv2-badge">{hdr?.report_type || 'METAR'}</span>
          <span className="ap-mv2-time">{fmtKstShort(obsTime)}</span>
        </div>
      </div>

      {/* ── 비행 규칙 배너 ── */}
      <div className={`ap-mv2-cat-banner ap-mv2-cat-banner--${flightCat.category}`}>
        <span className="ap-mv2-cat-code">{flightCat.category}</span>
        <span className="ap-mv2-cat-label">{flightCat.labelKo}</span>
      </div>

      {/* ── 지표 그리드 ── */}
      <div className="ap-mv2-grid">
        {/* 시정 */}
        <div
          className="ap-mv2-card"
          style={{
            backgroundColor: visCat.bg,
            borderLeft: `3px solid ${visCat.border}`,
          }}
        >
          <div className="ap-mv2-card-label">시정</div>
          <div className="ap-mv2-card-value" style={{ color: visCat.valueColor }}>{visValue}</div>
        </div>

        {/* 운고 */}
        <div
          className="ap-mv2-card"
          style={{
            backgroundColor: ceilCat.bg,
            borderLeft: `3px solid ${ceilCat.border}`,
          }}
        >
          <div className="ap-mv2-card-label">운고</div>
          <div className="ap-mv2-card-value" style={{ color: ceilCat.valueColor }}>{ceilValue}</div>
        </div>

        {/* 바람 */}
        <div className={`ap-mv2-card${highWind ? ' ap-mv2-card--alert' : ''}`}>
          <div className="ap-mv2-card-body">
            <div className="ap-mv2-card-content">
              <div className="ap-mv2-card-label">바람</div>
              <div className="ap-mv2-card-value">
                {`${windDir}/${windSpeedText}kt`}
                {windGustText && <span className="ap-mv2-card-sub">{windGustText}</span>}
              </div>
            </div>
            <div className="ap-mv2-card-aside">
              <MoveUp
                className="ap-mv2-wind-arrow"
                style={{ transform: `rotate(${windRotation}deg)` }}
              />
            </div>
          </div>
        </div>

        {/* 측풍 */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-body">
            <div className="ap-mv2-card-content">
              <div className="ap-mv2-card-label">측풍</div>
              <div className="ap-mv2-card-value">
                {Number.isFinite(crosswindKt)
                  ? `${crosswindSide ? crosswindSide + '/' : ''}${Math.round(crosswindKt)}kt`
                  : runwayHdg == null ? '활주로 미지정' : '—'}
              </div>
            </div>
            <div className="ap-mv2-card-aside">
              <MoveUp
                className="ap-mv2-crosswind-arrow"
                style={{ 
                  transform: `rotate(${
                    crosswindArrow === '←' ? 270 : 
                    crosswindArrow === '→' ? 90 : 0
                  }deg)` 
                }}
              />
            </div>
          </div>
        </div>

        {/* 현재날씨 */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-body">
            <div className="ap-mv2-card-content">
              <div className="ap-mv2-card-label">현재 날씨</div>
              <div className="ap-mv2-card-value ap-mv2-card-value--weather">{weatherKorean}</div>
            </div>
            <div className="ap-mv2-card-aside">
              <WeatherIcon visual={weatherVisual} className="ap-mv2-weather-icon" />
            </div>
          </div>
        </div>

        {/* 일강수량 */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-label">일강수량</div>
          <div className="ap-mv2-card-value">{rainText || '- mm'}</div>
        </div>

        {/* QNH */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-label">QNH</div>
          <div className="ap-mv2-card-value">{qnh}</div>
        </div>

        {/* 온도/습도 */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-label">온도/습도</div>
          <div className="ap-mv2-card-value">{tempDisplay} / {rhDisplay}</div>
          {feelsLikeText && <div className="ap-mv2-card-foot">{feelsLikeText}</div>}
        </div>
      </div>

      {/* ── 하단 보조 정보 ── */}
      <div className="ap-mv2-footer">
        {obs?.rvr?.length > 0 && (
          <div className="ap-mv2-footer-item">
            <span className="ap-mv2-footer-label">RVR</span>
            <span className="ap-mv2-footer-value">{obs.rvr.map((r) => `R${r.runway}/${r.mean}m`).join(' ')}</span>
          </div>
        )}
        {obs?.wind_shear && (
          <div className="ap-mv2-footer-item">
            <span className="ap-mv2-footer-label">Wind Shear</span>
            <span className="ap-mv2-footer-value">
              {obs.wind_shear.all_runways ? 'All Rwys' : obs.wind_shear.runways?.join(', ') || '—'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAF tab ──────────────────────────────────────────────────────────────────

function TafPeriod({ period }) {
  const typeLabel = {
    base: 'BASE', becmg: 'BECMG', tempo: 'TEMPO', prob30: 'PROB30', prob40: 'PROB40',
  }[period.type] || period.type?.toUpperCase() || '—'

  const wind = period.wind
    ? `${String(period.wind.direction).padStart(3, '0')}/${period.wind.speed}${period.wind.gust ? `G${period.wind.gust}` : ''}${period.wind.unit || 'KT'}`
    : null

  const vis = period.visibility?.value != null ? `${period.visibility.value} m` : null
  const clouds = period.clouds?.map((c) => `${c.amount}${c.height}`).join(' ') || null
  const wx = period.weather?.map((w) => w.raw || w).join(' ') || null

  return (
    <div className="ap-taf-period">
      <div className="ap-taf-period-header">
        <span className={`ap-taf-type ap-taf-type--${period.type}`}>{typeLabel}</span>
        <span className="ap-taf-time">{fmtTime(period.from)} – {fmtTime(period.to)}</span>
      </div>
      <div className="ap-taf-period-body">
        {wind && <span>{wind}</span>}
        {vis && <span>{vis}</span>}
        {wx && <span>{wx}</span>}
        {clouds && <span>{clouds}</span>}
      </div>
    </div>
  )
}

function TafTab({ taf }) {
  if (!taf) return <div className="ap-empty">TAF 데이터 없음</div>
  const hdr = taf.header
  const periods = taf.periods || []

  return (
    <div className="ap-taf">
      {hdr && (
        <div className="ap-taf-header">
          <span>발표: {fmtTime(hdr.issued)}</span>
          <span>유효: {fmtTime(hdr.valid_start)} – {fmtTime(hdr.valid_end)}</span>
        </div>
      )}
      {periods.length === 0
        ? <div className="ap-empty">예보 기간 없음</div>
        : periods.map((p, i) => <TafPeriod key={i} period={p} />)
      }
    </div>
  )
}

// ── AMOS tab ─────────────────────────────────────────────────────────────────

function AmosTab({ amos }) {
  if (!amos) return <div className="ap-empty">AMOS 데이터 없음</div>
  const rf = amos.daily_rainfall

  return (
    <div className="ap-amos">
      <dl className="ap-dl">
        <div><dt>관측소</dt><dd>{amos.amos_stn ?? '—'}</dd></div>
        <div><dt>일강수량</dt><dd>{rf?.mm != null ? `${rf.mm} mm` : '—'}</dd></div>
        <div><dt>관측시각</dt><dd>{rf?.observed_tm_kst ? fmtKst(rf.observed_tm_kst) : '—'}</dd></div>
        <div><dt>데이터 상태</dt><dd>{rf?.stale ? '⚠ 이전 데이터' : '최신'}</dd></div>
      </dl>
    </div>
  )
}

// ── WARNING tab ───────────────────────────────────────────────────────────────

const TAF_VIEWS = [
  { id: 'timeline', label: '타임라인' },
  { id: 'table', label: '테이블' },
  { id: 'grid', label: '그리드' },
]

const TAF_CATEGORY_COLOR = { VFR: '#15803d', MVFR: '#2563eb', IFR: '#f59e0b', LIFR: '#dc2626' }

function getTafCeiling(slot) {
  return slot?.clouds
    ?.filter((cloud) => cloud.amount === 'BKN' || cloud.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null
}

function formatTafCeiling(value) {
  return Number.isFinite(value) ? `${value} ft` : 'NSC'
}

function formatTafVisibility(slot) {
  const value = slot?.visibility?.value
  if (Number.isFinite(value)) return `${value} m`
  return slot?.display?.visibility || '-'
}

function formatTafWind(slot) {
  const wind = slot?.wind
  if (!wind) return '-'
  if (wind.calm) return 'CALM'
  const dir = wind.variable ? 'VRB' : Number.isFinite(wind.direction) ? String(wind.direction).padStart(3, '0') : '///'
  const speed = Number.isFinite(wind.speed) ? String(wind.speed).padStart(2, '0') : '//'
  return `${dir}${speed}${wind.gust ? `G${wind.gust}` : ''}${wind.unit || 'KT'}`
}

function tafSlotView(slot, icao) {
  const visibility = slot?.visibility?.value ?? null
  const ceiling = getTafCeiling(slot)
  const flight = getFlightCategory(visibility, ceiling, icao)
  const visibilityCategory = classifyVisibilityCategory(visibility, icao)
  const ceilingCategory = classifyCeilingCategory(ceiling, icao)
  const visual = resolveWeatherVisual(slot, slot?.time)
  const weatherLabel = convertWeatherToKorean(slot?.display?.weather, slot?.visibility?.cavok ?? slot?.cavok, slot?.clouds || [])
  const wind = slot?.wind
  const windRotation = Number.isFinite(wind?.direction) ? ((wind.direction % 360) + 180) % 360 : 0

  return {
    slot,
    time: slot?.time,
    flight,
    visibilityCategory,
    ceilingCategory,
    visual,
    weatherLabel,
    windText: formatTafWind(slot),
    windRotation,
    highWind: hasHighWindCondition(wind),
    visibilityText: formatTafVisibility(slot),
    ceilingText: formatTafCeiling(ceiling),
  }
}

function groupTafSlots(slots, keyFn) {
  const groups = []
  slots.forEach((slot) => {
    const key = keyFn(slot)
    const prev = groups[groups.length - 1]
    if (prev?.key === key) prev.items.push(slot)
    else groups.push({ key, items: [slot] })
  })
  return groups.map((group) => ({ ...group, width: `${(group.items.length / Math.max(1, slots.length)) * 100}%`, first: group.items[0] }))
}

function formatTafHour(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCHours()).padStart(2, '0')}Z`
}

function EnhancedTafTab({ taf, icao }) {
  const [view, setView] = useState('timeline')
  if (!taf) return <div className="ap-empty">TAF 데이터 없음</div>

  const rawTimeline = Array.isArray(taf.timeline) ? taf.timeline : []
  const timeline = rawTimeline.filter((slot) => new Date(slot.time).getTime() + 3600 * 1000 > Date.now())
  const slots = timeline.map((slot) => tafSlotView(slot, icao))
  const hdr = taf.header

  return (
    <div className="ap-taf">
      <div className="ap-taf-header">
        <div>
          <span className="ap-taf-badge">{hdr?.report_status === 'AMENDMENT' ? 'TAF AMD' : 'TAF'}</span>
          <span className="ap-taf-valid">{fmtTime(hdr?.valid_start)} - {fmtTime(hdr?.valid_end)}</span>
        </div>
        <div className="ap-taf-switch" role="tablist" aria-label="TAF view">
          {TAF_VIEWS.map((item) => (
            <button key={item.id} type="button" className={`ap-taf-switch-btn${view === item.id ? ' is-active' : ''}`} onClick={() => setView(item.id)} aria-pressed={view === item.id}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rawTimeline.length === 0 && <div className="ap-empty">TAF 시간대 데이터 없음</div>}
      {rawTimeline.length > 0 && slots.length === 0 && <div className="ap-empty">TAF 유효 기간 만료</div>}

      {slots.length > 0 && view === 'timeline' && (
        <div className="ap-taf-timeline">
          <div className="ap-taf-scale" style={{ '--taf-hour-count': slots.length }}>
            {slots.map((item, index) => <span key={index}>{index % 3 === 0 || index === 0 ? formatTafHour(item.time) : ''}</span>)}
          </div>
          {[
            ['비행조건', groupTafSlots(slots, (item) => item.flight.category), (item) => item.flight.category, (item) => ({ background: TAF_CATEGORY_COLOR[item.flight.category] || '#15803d', color: '#fff' })],
            ['날씨', groupTafSlots(slots, (item) => item.weatherLabel), (item) => item.weatherLabel, () => ({ background: '#f8fafc', color: '#0f172a' })],
            ['바람', groupTafSlots(slots, (item) => item.windText), (item) => item.windText, (item) => ({ background: item.highWind ? '#fff1f2' : '#f8fafc', color: item.highWind ? '#be123c' : '#0f172a' })],
            ['시정', groupTafSlots(slots, (item) => item.visibilityText), (item) => item.visibilityText, (item) => ({ background: item.visibilityCategory.bg, color: item.visibilityCategory.valueColor })],
            ['운고', groupTafSlots(slots, (item) => item.ceilingText), (item) => item.ceilingText, (item) => ({ background: item.ceilingCategory.bg, color: item.ceilingCategory.valueColor })],
          ].map(([label, groups, textFn, styleFn]) => (
            <div className="ap-taf-line" key={label}>
              <div className="ap-taf-line-label">{label}</div>
              <div className="ap-taf-line-track">
                {groups.map((group, index) => (
                  <div key={index} className="ap-taf-seg" style={{ width: group.width, ...styleFn(group.first) }} title={textFn(group.first)}>
                    {label === '날씨' && <WeatherIcon visual={group.first.visual} className="ap-taf-mini-icon" />}
                    {label === '바람' && <MoveUp className="ap-taf-mini-arrow" style={{ transform: `rotate(${group.first.windRotation}deg)` }} />}
                    <span>{textFn(group.first)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length > 0 && view === 'table' && (
        <table className="ap-taf-table">
          <thead><tr><th>시간</th><th>비행조건</th><th>날씨</th><th>바람</th><th>시정</th><th>운고</th></tr></thead>
          <tbody>
            {slots.map((item, index) => (
              <tr key={index}>
                <td>{formatTafHour(item.time)}</td>
                <td><span className="ap-taf-cat" style={{ background: TAF_CATEGORY_COLOR[item.flight.category] }}>{item.flight.category}</span></td>
                <td className="ap-taf-weather-cell"><WeatherIcon visual={item.visual} className="ap-taf-mini-icon" />{item.weatherLabel}</td>
                <td className={item.highWind ? 'is-alert' : ''}>{item.windText}</td>
                <td style={{ color: item.visibilityCategory.valueColor }}>{item.visibilityText}</td>
                <td style={{ color: item.ceilingCategory.valueColor }}>{item.ceilingText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {slots.length > 0 && view === 'grid' && (
        <div className="ap-taf-grid">
          {slots.map((item, index) => (
            <article key={index} className="ap-taf-card">
              <div className="ap-taf-card-head"><span>{formatTafHour(item.time)}</span><span className="ap-taf-cat" style={{ background: TAF_CATEGORY_COLOR[item.flight.category] }}>{item.flight.category}</span></div>
              <div className="ap-taf-card-weather"><WeatherIcon visual={item.visual} className="ap-taf-card-icon" />{item.weatherLabel}</div>
              <div className="ap-taf-card-row"><span>바람</span><strong className={item.highWind ? 'is-alert' : ''}>{item.windText}</strong></div>
              <div className="ap-taf-card-row"><span>시정</span><strong>{item.visibilityText}</strong></div>
              <div className="ap-taf-card-row"><span>운고</span><strong>{item.ceilingText}</strong></div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function formatNumber(value, suffix = '') {
  return Number.isFinite(value) ? `${value}${suffix}` : '-'
}

function formatQnh(display) {
  const qnh = display?.qnh
  if (!qnh) return '-'
  return String(qnh).startsWith('Q') ? `${String(qnh).slice(1)} hPa` : qnh
}

function formatAmosTime(value) {
  if (!value) return '관측시간 없음'
  const compact = String(value).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]} ${compact[4]}:${compact[5]} KST`
  return fmtKst(value)
}

function cloudRowsFromMetar(metar) {
  const clouds = metar?.observation?.clouds || []
  if (clouds.length === 0) return [{ layer: '1', value: metar?.observation?.display?.clouds || 'NSC' }]
  return clouds.map((cloud, index) => ({
    layer: String(index + 1),
    value: `${cloud.amount || '-'} ${Number.isFinite(cloud.base) ? `${cloud.base} ft` : ''}`.trim(),
  }))
}

function EnhancedAmosTab({ amos, metar, airportMeta }) {
  if (!amos && !metar) return <div className="ap-empty">AMOS 데이터 없음</div>
  const rf = amos?.daily_rainfall
  const amosObs = amos?.observation || null
  const obs = metar?.observation || null
  const wind = obs?.wind || null
  const temp = {
    air: amos?.weather?.temperature_c ?? obs?.temperature?.air,
    dewpoint: amos?.weather?.dewpoint_c ?? obs?.temperature?.dewpoint,
  }
  const rh = amos?.weather?.humidity_pct ?? computeRelativeHumidity(temp.air, temp.dewpoint)
  const clouds = cloudRowsFromMetar(metar)
  const runwayHdg = airportMeta?.runway_hdg
  const runwayOpposite = Number.isFinite(runwayHdg) ? (runwayHdg + 180) % 360 : null
  const runwayRows = Array.isArray(amos?.runways) && amos.runways.length > 0
    ? amos.runways
    : [
        { runway: Number.isFinite(runwayHdg) ? String(Math.round(runwayHdg / 10)).padStart(2, '0') : 'RWY', wind_direction: amosObs?.wind_direction ?? wind?.direction, wind_speed: amosObs?.wind_speed ?? wind?.speed, wind_gust: amosObs?.wind_gust ?? wind?.gust, mor: amosObs?.mor ?? obs?.visibility?.value, rvr: amosObs?.rvr ?? obs?.rvr?.[0]?.mean },
        { runway: Number.isFinite(runwayOpposite) ? String(Math.round(runwayOpposite / 10) || 36).padStart(2, '0') : 'RWY', wind_direction: amosObs?.wind_direction ?? wind?.direction, wind_speed: amosObs?.wind_speed ?? wind?.speed, wind_gust: amosObs?.wind_gust ?? wind?.gust, mor: amosObs?.mor ?? obs?.visibility?.value, rvr: amosObs?.rvr ?? obs?.rvr?.[1]?.mean ?? obs?.rvr?.[0]?.mean },
      ]
  const observedTime = rf?.observed_tm_kst || amosObs?.observed_tm_kst || metar?.header?.observation_time

  return (
    <div className="ap-amos">
      <div className="ap-amos-head">
        <div>
          <span className="ap-amos-eyebrow">AMOS</span>
          <h3>공항 관측 요약</h3>
        </div>
        <span className="ap-amos-time">{formatAmosTime(observedTime)}</span>
      </div>

      <div className="ap-amos-layout">
        <section className="ap-amos-section ap-amos-runway-section">
          <div className="ap-amos-section-head">
            <h3>활주로 관측</h3>
            <span>{amos?.amos_stn ? `관측소 ${amos.amos_stn}` : '관측소 미지정'}</span>
          </div>
          <div className="ap-amos-runways">
            {runwayRows.map((runway, index) => (
              <article key={index} className="ap-amos-runway">
                <div className="ap-amos-runway-head">
                  <strong>RWY {runway.runway || (index === 0 && Number.isFinite(runwayHdg) ? String(Math.round(runwayHdg / 10)).padStart(2, '0') : index === 1 && Number.isFinite(runwayOpposite) ? String(Math.round(runwayOpposite / 10) || 36).padStart(2, '0') : index + 1)}</strong>
                  <span>{amos?.runways?.length ? '활주로별 관측' : '대체 관측값'}</span>
                </div>
                <div className="ap-amos-primary">
                  <span>풍향/풍속</span>
                  <strong>{formatNumber(runway.wind_direction, '°')} / {formatNumber(runway.wind_speed, ' kt')}{runway.wind_gust ? ` G${runway.wind_gust}` : ''}</strong>
                </div>
                <div><span>MOR</span><strong>{formatNumber(runway.mor, ' m')}</strong></div>
                <div><span>RVR</span><strong>{formatNumber(runway.rvr, ' m')}</strong></div>
                <div><span>평균/최소/최대</span><strong>{runway.wind_speed || runway.wind_speed_min || runway.wind_speed_max ? `${runway.wind_speed ?? '-'} / ${runway.wind_speed_min ?? '-'} / ${runway.wind_speed_max ?? '-'} kt` : '데이터 없음'}</strong></div>
              </article>
            ))}
          </div>
        </section>

        <div className="ap-amos-side">
          <section className="ap-amos-section">
            <h3>기상 요소</h3>
            <div className="ap-amos-metrics">
              <div><span>기온</span><strong>{formatNumber(temp.air, '°C')}</strong></div>
              <div><span>이슬점</span><strong>{formatNumber(temp.dewpoint, '°C')}</strong></div>
              <div><span>습도</span><strong>{Number.isFinite(rh) ? `${Math.round(rh)}%` : '-'}</strong></div>
              <div><span>QNH</span><strong>{amos?.pressure?.qnh_hpa != null ? `${amos.pressure.qnh_hpa} hPa` : amosObs?.qnh != null ? `${amosObs.qnh} hPa` : formatQnh(obs?.display)}</strong></div>
              <div><span>일강수량</span><strong>{rf?.mm != null ? `${rf.mm} mm` : '-'}</strong></div>
              <div><span>적설</span><strong>{amos?.snow?.cm != null ? `${amos.snow.cm} cm` : amosObs?.snow_cm != null ? `${amosObs.snow_cm} cm` : '데이터 없음'}</strong></div>
            </div>
          </section>
          <section className="ap-amos-section">
            <h3>구름고도</h3>
            <div className="ap-amos-clouds">
              {clouds.map((cloud) => <div key={cloud.layer}><span>{cloud.layer}</span><strong>{cloud.value}</strong></div>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function formatAmosValue(value, suffix = '') {
  return Number.isFinite(value) ? `${value}${suffix}` : '-'
}

function formatMsToKt(value) {
  return Number.isFinite(value) ? `${(value * 1.943844).toFixed(1)}` : '-'
}

const AMOS_REPRESENTATIVE_RUNWAYS = {
  RKSI: ['15L', '33R'],
  RKSS: ['14R', '32L'],
  RKPC: ['07', '25'],
  RKJB: ['01', '19'],
  RKNY: ['15', '33'],
  RKPU: ['18', '36'],
  RKJY: ['17', '35'],
}

function enrichAmosRunways(amos) {
  const runways = Array.isArray(amos?.runways) ? amos.runways : []
  return [0, 1].map((index) => ({
    ...(runways[index] || {}),
    runway: runways[index]?.side || (index === 0 ? 'L' : 'R'),
  }))
}

function runwayNumberFromHeading(heading) {
  if (!Number.isFinite(heading)) return null
  const number = Math.round((((heading % 360) + 360) % 360) / 10) || 36
  return String(number).padStart(2, '0')
}

function runwayLabelsFromAirport(airportMeta) {
  const mapped = AMOS_REPRESENTATIVE_RUNWAYS[airportMeta?.icao]
  if (mapped) return mapped
  const first = runwayNumberFromHeading(airportMeta?.runway_hdg)
  const second = Number.isFinite(airportMeta?.runway_hdg)
    ? runwayNumberFromHeading((airportMeta.runway_hdg + 180) % 360)
    : null
  return [first || 'RWY', second || 'RWY']
}

function runwayHeadingFromLabel(label) {
  if (!label) return null
  const match = String(label).match(/^(\d{2})/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return (value % 36) * 10 || 360
}

function pickActiveRunwayLabel(labels, wind) {
  if (!Array.isArray(labels) || labels.length === 0) return null
  if (!Number.isFinite(wind?.direction)) return labels[0] || null
  const speed = Number.isFinite(wind?.speed) ? wind.speed : 0
  let bestLabel = labels[0] || null
  let bestHeadwind = -Infinity
  for (const label of labels) {
    const heading = runwayHeadingFromLabel(label)
    if (!Number.isFinite(heading)) continue
    const angleRad = ((wind.direction - heading) * Math.PI) / 180
    const headwind = Math.cos(angleRad) * speed
    if (headwind > bestHeadwind) {
      bestHeadwind = headwind
      bestLabel = label
    }
  }
  return bestLabel
}

function AmosRunwaySide({ runway, label, align = 'left', showArrow = true }) {
  const rotation = Number.isFinite(runway?.wind_direction) ? (runway.wind_direction + 180) % 360 : 0
  const runwayLabel = label || runway?.runway || '-'
  return (
    <section className={`ap-amos-board-side ap-amos-board-side--${align}`}>
      {showArrow ? (
        <div className="ap-amos-arrow-only">
          <MoveUp className="ap-amos-dial-arrow" style={{ transform: `rotate(${rotation}deg)` }} />
        </div>
      ) : null}

      <div className="ap-amos-block-title">{runwayLabel} 풍향/풍속</div>
      <table className="ap-amos-runway-table">
        <thead>
          <tr><th>{runwayLabel}</th><th>평균</th><th>최소</th><th>최대</th></tr>
        </thead>
        <tbody>
          <tr>
            <th>풍향(°)</th>
            <td>{formatAmosValue(runway?.wind_direction)}</td>
            <td>{formatAmosValue(runway?.wind_direction_min)}</td>
            <td>{formatAmosValue(runway?.wind_direction_max)}</td>
          </tr>
          <tr>
            <th>풍속(kt)</th>
            <td>{formatMsToKt(runway?.wind_speed)}</td>
            <td>{formatMsToKt(runway?.wind_speed_min)}</td>
            <td>{formatMsToKt(runway?.wind_speed_max)}</td>
          </tr>
        </tbody>
      </table>

      <div className="ap-amos-block-title ap-amos-block-title--spaced">{runwayLabel} 시정</div>
      <div className="ap-amos-vis-box">
        <div><span>{runwayLabel} VIS</span><strong>{formatAmosValue(runway?.visibility_m, ' m')}</strong></div>
        <div><span>{runwayLabel} RVR</span><strong>{formatAmosValue(runway?.rvr_m, ' m')}</strong></div>
      </div>
    </section>
  )
}

function AmosBoardTab({ amos, metar, airportMeta }) {
  if (!amos) return <div className="ap-empty">AMOS 데이터 없음</div>
  const runways = enrichAmosRunways(amos)
  const runwayLabels = runwayLabelsFromAirport(airportMeta)
  const runwayImageSrc = '/amos-runway-generic.png'
  const rf = amos.daily_rainfall
  const obs = amos.observation || {}
  const observedTime = rf?.observed_tm_kst || obs.observed_tm_kst
  const activeRunwayLabel = pickActiveRunwayLabel(runwayLabels, metar?.observation?.wind)
  const activeRunwaySide = activeRunwayLabel === runwayLabels[1] ? 'right' : 'left'
  const activePlaneHeading = activeRunwaySide === 'right' ? -135 : 45

  return (
    <div className="ap-amos ap-amos-board-wrap">
      <div className="ap-amos-head">
        <div>
          <h3>공항기상관측장비(AMOS)</h3>
        </div>
        <span className="ap-amos-time">{formatAmosTime(observedTime)}</span>
      </div>

      <section className="ap-amos-board-hero">
        <div className="ap-amos-arrow-only">
          <MoveUp className="ap-amos-dial-arrow" style={{ transform: `rotate(${Number.isFinite(runways[0]?.wind_direction) ? (runways[0].wind_direction + 180) % 360 : 0}deg)` }} />
        </div>

        <section className="ap-amos-board-center">
          {runwayImageSrc ? (
            <div className={`ap-amos-runway-hero-wrap ap-amos-runway-hero-wrap--${activeRunwaySide}`}>
              {activeRunwayLabel ? (
                <>
                  <span className={`ap-amos-active-runway-badge ap-amos-active-runway-badge--${activeRunwaySide}`} aria-hidden="true" />
                  <Plane
                    className={`ap-amos-active-runway-plane ap-amos-active-runway-plane--${activeRunwaySide}`}
                    style={{ transform: `rotate(${activePlaneHeading}deg)` }}
                  />
                </>
              ) : null}
              <span className="ap-amos-runway-overlay-label ap-amos-runway-overlay-label--left">
                {runwayLabels[0]}
              </span>
              <span className="ap-amos-runway-overlay-label ap-amos-runway-overlay-label--right">
                {runwayLabels[1]}
              </span>
              <img className="ap-amos-runway-image" src={runwayImageSrc} alt="RKSI runway diagram" />
            </div>
          ) : (
            <div className="ap-amos-runway-strip">
              <span>{runwayLabels[0]}</span>
              <div className="ap-amos-strip-body" />
              <span>{runwayLabels[1]}</span>
            </div>
          )}
        </section>

        <div className="ap-amos-arrow-only">
          <MoveUp className="ap-amos-dial-arrow" style={{ transform: `rotate(${Number.isFinite(runways[1]?.wind_direction) ? (runways[1].wind_direction + 180) % 360 : 0}deg)` }} />
        </div>
      </section>

      <section className="ap-amos-board-grid">
        <AmosRunwaySide runway={runways[0]} label={runwayLabels[0]} showArrow={false} />

        <section className="ap-amos-board-center">
          <table className="ap-amos-common-table">
            <tbody>
              <tr><th>최저운고(ft)</th><td>{formatAmosValue(amos.weather?.cloud_min_m, 'ft')}</td></tr>
              <tr><th>기온(°C)</th><td>{formatAmosValue(amos.weather?.temperature_c, '°C')}</td></tr>
              <tr><th>이슬점(°C)</th><td>{formatAmosValue(amos.weather?.dewpoint_c, '°C')}</td></tr>
              <tr><th>습도(%)</th><td>{formatAmosValue(amos.weather?.humidity_pct, '%')}</td></tr>
              <tr><th>해면기압(hPa)</th><td>{formatAmosValue(amos.pressure?.qnh_hpa, 'hPa')}</td></tr>
              <tr><th>현지기압(hPa)</th><td>{formatAmosValue(amos.pressure?.station_hpa, 'hPa')}</td></tr>
              <tr><th>강수량(mm)</th><td>{formatAmosValue(amos.weather?.rainfall_mm ?? rf?.mm, 'mm')}</td></tr>
            </tbody>
          </table>
        </section>

        <AmosRunwaySide runway={runways[1]} label={runwayLabels[1]} align="right" showArrow={false} />
      </section>

      {Array.isArray(amos.runways) && amos.runways.length > 0
        ? null
        : <div className="ap-amos-note">AMOS 활주로별 직접값이 없습니다.</div>}
    </div>
  )
}

const WARNING_LEVEL_COLOR = {
  1: '#f59e0b', 2: '#f97316', 3: '#ef4444', 4: '#dc2626',
}

function WarningTab({ warning }) {
  const warnings = warning?.warnings || []

  if (warnings.length === 0) return <div className="ap-empty">현재 활성 경보 없음</div>

  return (
    <div className="ap-warnings">
      {warnings.map((w, i) => {
        const title = w.wrng_type_name || w.type_label || w.type || '경보'
        const start = w.valid_start || w.start
        const end = w.valid_end || w.end
        const message = w.raw_message || w.text
        return (
          <div key={i} className="ap-warning-item" style={{ borderLeftColor: WARNING_LEVEL_COLOR[w.level] || '#94a3b8' }}>
            <div className="ap-warning-title">
              <span className="ap-warning-type">{title}</span>
              {w.wrng_type && <span className="ap-warning-level">Code {w.wrng_type}</span>}
              {w.level && <span className="ap-warning-level">Level {w.level}</span>}
            </div>
            <div className="ap-warning-time">
              {fmtKst(start)} – {fmtKst(end)}
            </div>
            {message && <div className="ap-warning-text">{message}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── 기상정보 tab ─────────────────────────────────────────────────────────────

function fmtBulletinTime(tm) {
  if (!tm) return '—'
  // "2026-05-07 06:00:00.0" → "2026년 05월 07일 06시"
  const m = tm.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})/)
  if (!m) return tm
  return `${m[1]}년 ${m[2]}월 ${m[3]}일 ${m[4]}시`
}

function AirportInfoTab({ info }) {
  if (!info) return <div className="ap-empty">기상정보 데이터 없음</div>

  const showSel3 = info.sel_val3 && info.sel_val3.trim()

  return (
    <div className="ap-info-doc">
      <div className="ap-info-logo-row">
        <img src="/logo3_01.png" alt="항공기상청" className="ap-info-logo" />
      </div>

      <h2 className="ap-info-title">{info.title || '—'}</h2>

      <p className="ap-info-date">[ {fmtBulletinTime(info.tm)} 발표 ]</p>

      {info.summary && (
        <p className="ap-info-summary">{info.summary}</p>
      )}

      <div className="ap-info-section">
        <h3 className="ap-info-section-head">▶ 일기개황</h3>
        <p className="ap-info-body-text">{info.outlook || '—'}</p>
      </div>

      {(info.sel_val1 || info.sel_val2) && (
        <table className="ap-info-table">
          <thead>
            <tr>
              <th>예상 최저/최고기온 (℃)</th>
              <th>예상 강수량(mm)</th>
              {showSel3 && <th></th>}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{info.sel_val1 || '—'}</td>
              <td>{info.sel_val2 || '—'}</td>
              {showSel3 && <td>{info.sel_val3}</td>}
            </tr>
          </tbody>
        </table>
      )}

      {info.forecast && (
        <div className="ap-info-section">
          <h3 className="ap-info-section-head">▶ 위험 기상예보</h3>
          <p className="ap-info-body-text">{info.forecast}</p>
        </div>
      )}

      {info.warn && (
        <div className="ap-info-section">
          <h3 className="ap-info-section-head">▶ 경보현황</h3>
          <p className="ap-info-body-text">{info.warn}</p>
        </div>
      )}

      <div className="ap-info-footnote">
        <p>※ 공항기상 및 경보에 대한 자세한 사항은 항공기상청 홈페이지(amo.kma.go.kr)에서 확인할 수 있습니다.</p>
        <p>※ 수신기관의 담당자, 전화번호 및 FAX번호가 변경되었을 때는 예보과로 알려주시기 바랍니다.</p>
      </div>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

function AirportPanel({ airport, weatherData, onClose }) {
  const [tab, setTab] = useState('metar')

  if (!airport) return null

  const icao = airport.icao
  const name = airport.nameKo || AIRPORT_NAME_KO[icao] || airport.name || icao

  const metar      = weatherData?.metar?.airports?.[icao] || null
  const taf        = weatherData?.taf?.airports?.[icao] || null
  const amos       = weatherData?.amos?.airports?.[icao] || null
  const warning    = weatherData?.warning?.airports?.[icao] || null
  const airportInfo = weatherData?.airportInfo?.airports?.[icao] || null
  const warnCount  = warning?.warnings?.length || 0

  return (
    <aside className="airport-panel">
      <header className="airport-panel-head">
        <div className="airport-panel-info">
          <span className="airport-panel-icao">{icao}</span>
          <span className="airport-panel-name">{name}</span>
        </div>
        <button className="airport-panel-close" onClick={onClose} aria-label="닫기">✕</button>
      </header>

      <div className="airport-panel-main">
        <nav className="airport-panel-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`airport-panel-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'warn' && warnCount > 0 && (
                <span className="ap-tab-badge">{warnCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="airport-panel-body">
          {tab === 'metar' && <MetarTab metar={metar} amosData={amos} icao={icao} airportMeta={airport} />}
          {tab === 'taf'   && <EnhancedTafTab taf={taf} icao={icao} />}
          {tab === 'amos'  && <AmosBoardTab amos={amos} metar={metar} airportMeta={airport} />}
          {tab === 'warn'  && <WarningTab warning={warning} />}
          {tab === 'info'  && <AirportInfoTab info={airportInfo} />}
        </div>
      </div>
    </aside>
  )
}

export default AirportPanel
