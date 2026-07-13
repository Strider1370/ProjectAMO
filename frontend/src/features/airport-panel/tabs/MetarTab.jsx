import { MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import { buildMetarViewModel } from '../lib/metarViewModel.js'
import { formatRvr } from '../../../shared/weather/helpers.js'
import { RAW_TAC_STYLE } from './TafTab.jsx'

export default function MetarTab({ metar, amosData, icao, airportMeta }) {
  if (!metar) return <div className="ap-empty">METAR 데이터 없음</div>

  const {
    obs,
    flightCat,
    visCat,
    ceilCat,
    highWind,
    weatherKorean,
    weatherVisual,
    precipitationWeather,
    specialWeather,
    visValue,
    ceilValue,
    windDir,
    windSpeedText,
    windGustText,
    windRotation,
    tempDisplay,
    rhDisplay,
    qnh,
  } = buildMetarViewModel({ metar, amosData, icao, airportMeta })

  // METAR 본문 뒤 보조정보(ICAO Supplementary Information): 윈드시어(WS)·경향(NOSIG 등)을 원문 영어 그대로
  const windShearText = obs?.wind_shear
    ? (obs.wind_shear.all_runways ? 'WS ALL RWY' : (obs.wind_shear.runways || []).map((r) => `WS R${r}`).join(' '))
    : ''
  const metarTail = [windShearText, obs?.trend].filter(Boolean).join(' ')

  return (
    <div className="ap-metar-v2">
      {/* 비행규칙 세로 배너(좌) + 해독 카드(우) — 시각은 섹션 제목바로 이관, 측풍·일강수량은 AMOS로 이관 */}
      <div className="ap-mv2-body">
        <div className={`ap-mv2-cat-banner ap-mv2-cat-banner--${flightCat.category}`}>
          <span className="ap-mv2-cat-code">{flightCat.category}</span>
          <span className="ap-mv2-cat-label">{flightCat.labelKo}</span>
        </div>

        {/* 지표 그리드 (순서: 시정 → 운고 → RVR → 바람 → 현재날씨 → 온도 → 습도 → QNH) */}
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

        {/* RVR */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-label">RVR</div>
          <div className="ap-mv2-card-value">{formatRvr(obs)}</div>
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

        {/* 현재날씨 */}
        <div
          className={[
            'ap-mv2-card',
            precipitationWeather ? 'ap-mv2-card--precip-weather' : '',
            specialWeather ? 'ap-mv2-card--special-weather' : '',
          ].filter(Boolean).join(' ')}
        >
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

        {/* 온도 */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-label">온도</div>
          <div className="ap-mv2-card-value">{tempDisplay}</div>
        </div>

        {/* 습도 */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-label">습도</div>
          <div className="ap-mv2-card-value">{rhDisplay}</div>
        </div>

        {/* QNH */}
        <div className="ap-mv2-card">
          <div className="ap-mv2-card-label">QNH</div>
          <div className="ap-mv2-card-value">{qnh}</div>
        </div>
        </div>
      </div>

      {/* ── 보조정보(ICAO Supplementary Information) — 원문 영어 그대로(WS·NOSIG 등) ── */}
      <div className="ap-mv2-trend">
        <span className="ap-mv2-trend-label">보조정보</span>
        <span className={`ap-mv2-trend-value${metarTail ? '' : ' is-empty'}`}>
          {metarTail || '해당 없음'}
        </span>
      </div>

      {/* ── 원문(TAC) — 접이식(기본 접힘). 국내는 재구성본 ── */}
      {metar?.header?.raw_text && (
        <details className="ap-raw-fold">
          <summary className="ap-raw-fold-summary">원문 (TAC)</summary>
          <code style={RAW_TAC_STYLE.text}>{metar.header.raw_text}</code>
        </details>
      )}
    </div>
  )
}

// ── TAF tab ──────────────────────────────────────────────────────────────────

