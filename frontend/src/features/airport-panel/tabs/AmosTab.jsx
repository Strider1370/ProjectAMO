import { MoveUp, Plane } from 'lucide-react'
import {
  enrichAmosRunways,
  formatAmosTime,
  formatAmosValue,
  formatMsToKt,
  pickActiveRunwayLabel,
  runwayLabelsFromAirport,
} from '../lib/amosViewModel.js'

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

export default function AmosBoardTab({ amos, metar, airportMeta }) {
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


