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
import { MoveUp } from 'lucide-react'
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
      <div className="ap-mv2-cat-banner" style={{ backgroundColor: flightCat.color }}>
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

const WARNING_LEVEL_COLOR = {
  1: '#f59e0b', 2: '#f97316', 3: '#ef4444', 4: '#dc2626',
}

function WarningTab({ warning }) {
  const warnings = warning?.warnings || []

  if (warnings.length === 0) return <div className="ap-empty">현재 활성 경보 없음</div>

  return (
    <div className="ap-warnings">
      {warnings.map((w, i) => (
        <div key={i} className="ap-warning-item" style={{ borderLeftColor: WARNING_LEVEL_COLOR[w.level] || '#94a3b8' }}>
          <div className="ap-warning-title">
            <span className="ap-warning-type">{w.type_label || w.type || '경보'}</span>
            {w.level && <span className="ap-warning-level">Level {w.level}</span>}
          </div>
          <div className="ap-warning-time">
            {fmtKst(w.start)} – {fmtKst(w.end)}
          </div>
          {w.text && <div className="ap-warning-text">{w.text}</div>}
        </div>
      ))}
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
          {tab === 'taf'   && <TafTab taf={taf} />}
          {tab === 'amos'  && <AmosTab amos={amos} />}
          {tab === 'warn'  && <WarningTab warning={warning} />}
          {tab === 'info'  && <AirportInfoTab info={airportInfo} />}
        </div>
      </div>
    </aside>
  )
}

export default AirportPanel
