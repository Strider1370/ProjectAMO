import { ChevronLeft, ChevronRight, MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import { buildMetarViewModel, buildMetarTacSegments } from '../lib/metarViewModel.js'
import { formatRvr } from '../../../shared/weather/helpers.js'
import { useAirportHistory } from '../../../shared/weather/useAirportHistory.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import './MetarHistory.css'

// 과거 관측 보기(◀▶): 최근 3시간 보관 METAR·SPECI를 한 건씩. 과거를 보는 동안 위에 주황 띠.
function MetarHistoryBar({ history }) {
  const { tz } = useTimeZone()
  const item = history.item
  const time = item ? new Date(item.time) : null
  const hhmm = time ? (tz === 'KST'
    ? `${String((time.getUTCHours() + 9) % 24).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')} KST`
    : `${String(time.getUTCHours()).padStart(2, '0')}${String(time.getUTCMinutes()).padStart(2, '0')}Z`) : null
  return (
    <div className={`ap-metar-history${item ? ' is-past' : ''}`}>
      <span>{item ? `과거 관측 보는 중 · ${history.offset}건 전${item.kind === 'SPECI' ? ' SPECI' : ''} · ${hhmm}` : '최신 관측'}</span>
      {item && <button type="button" className="ap-metar-history-latest" onClick={history.latest}>최신으로</button>}
      <button type="button" onClick={history.older} disabled={!history.canOlder} aria-label="이전 관측" title={history.canOlder ? '이전 관측' : '최근 3시간까지만 보관'}><ChevronLeft size={16} aria-hidden="true" /></button>
      <button type="button" onClick={history.newer} disabled={!history.canNewer} aria-label="다음 관측"><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  )
}

export default function MetarTab({ metar: latestMetar, amosData, icao, airportMeta }) {
  const history = useAirportHistory(icao, 'metar', { currentTime: latestMetar?.header?.observation_time })
  if (!latestMetar) return <div className="ap-empty">METAR 데이터 없음</div>
  const metar = history.item?.report ?? latestMetar

  const vm = buildMetarViewModel({ metar, amosData, icao, airportMeta })
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
  } = vm

  // METAR 본문 뒤 보조정보(ICAO Supplementary Information): 윈드시어(WS)·경향(NOSIG 등)을 원문 영어 그대로
  const windShearText = obs?.wind_shear
    ? (obs.wind_shear.all_runways ? 'WS ALL RWY' : (obs.wind_shear.runways || []).map((r) => `WS R${r}`).join(' '))
    : ''
  const metarTail = [windShearText, obs?.trend].filter(Boolean).join(' ')

  const rawText = metar?.header?.raw_text || ''
  const tacSegments = rawText ? buildMetarTacSegments(rawText, vm) : []

  return (
    <div className="ap-metar-v2">
      {icao && <MetarHistoryBar history={history} />}
      {/* ── TAC 원문 — 임계값 색칠, 비행조건 배지는 섹션 헤더에 표시 ── */}
      {rawText && (
        <div className="ap-metar-tac-block">
          <code className="ap-metar-tac">
            {tacSegments.map((seg, i) => (
              <span key={i} className={seg.className}>{seg.text}</span>
            ))}
          </code>
        </div>
      )}

      {/* ── 해독 카드 — 기본 접힘, 필요할 때만 펼침 ── */}
      <details className="ap-metar-detail">
        <summary>해독 카드 보기</summary>

        {/* 비행규칙 세로 배너(좌) + 해독 카드(우) */}
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
      </details>
    </div>
  )
}
