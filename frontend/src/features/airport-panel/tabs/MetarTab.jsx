import { MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import { fmtKstShort } from '../lib/formatters.js'
import { buildMetarViewModel } from '../lib/metarViewModel.js'

export default function MetarTab({ metar, amosData, icao, airportMeta }) {
  if (!metar) return <div className="ap-empty">METAR 데이터 없음</div>

  const {
    obs,
    hdr,
    flightCat,
    visCat,
    ceilCat,
    runwayHdg,
    highWind,
    crosswindKt,
    crosswindSide,
    crosswindArrow,
    weatherKorean,
    weatherVisual,
    obsTime,
    visValue,
    ceilValue,
    windDir,
    windSpeedText,
    windGustText,
    windRotation,
    tempDisplay,
    rhDisplay,
    feelsLikeText,
    rainText,
    qnh,
  } = buildMetarViewModel({ metar, amosData, icao, airportMeta })

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

