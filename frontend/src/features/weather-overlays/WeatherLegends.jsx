import { useState } from 'react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import { RAINVIEWER_LEGEND } from './lib/rainviewerLayers.js'

// 모바일 가로 범례: 세로 컬러바를 가로 그라데이션 바 + 성긴 눈금 라벨로. entries는 높음→낮음
// 순서라 좌→우 오름차순으로 뒤집는다.
function HLegend({ title, entries = [] }) {
  const cells = [...entries].reverse()
  const step = Math.max(1, Math.ceil(cells.length / 7))
  return (
    <div className="hlegend">
      <div className="hlegend-title">{title}</div>
      <div className="hlegend-bar" aria-hidden="true">
        {cells.map((e, i) => (
          <span key={i} className="hlegend-cell" style={{ backgroundColor: e.color }} />
        ))}
      </div>
      <div className="hlegend-labels" aria-hidden="true">
        {cells.map((e, i) => (
          <span key={i} className="hlegend-label">{i % step === 0 ? e.label : ''}</span>
        ))}
      </div>
    </div>
  )
}

function WeatherLegends({
  radarLegendVisible,
  radarOverseasLegendVisible,
  rainviewerOutOfRange = false,
  lightningLegendVisible,
  blinkLightning = false,
  onBlinkLightningChange,
  radarRainrateLegend,
  lightningLegendEntries,
  windSpeedLegendVisible,
  windSpeedLegendEntries = [],
  temperatureLegendVisible,
  temperatureLegendEntries = [],
  cloudLegendVisible,
  cloudLegendEntries = [],
  icingLegendVisible,
  icingLegendEntries = [],
  turbulenceLegendVisible,
  turbulenceLegendEntries = [],
  radarReferenceTimeMs,
  lightningReferenceTimeMs,
  formatReferenceTimeLabel,
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  if (!radarLegendVisible && !radarOverseasLegendVisible && !lightningLegendVisible && !windSpeedLegendVisible && !temperatureLegendVisible && !cloudLegendVisible && !icingLegendVisible && !turbulenceLegendVisible) return null

  const panel = (
    <div className="map-right-legends">
      {radarLegendVisible && (
        <div className="rainrate-legend" aria-label="Radar rain rate legend">
          <div className="rainrate-legend-title">mm/h</div>
          <div className="rainrate-legend-scale">
            {radarRainrateLegend.map((entry) => (
              <div key={entry.label} className="rainrate-legend-row">
                <span className="rainrate-legend-label">{entry.label}</span>
                <span
                  className="rainrate-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 해외 레이더(RainViewer): 우리는 픽셀만 받고 숫자가 없다 → mm/h 눈금을 붙이면 오독을 부른다.
          국내 레이더와 색 기준이 다르므로 정량 해석 불가임을 명시하고, 질적 강약만 보여준다. */}
      {radarOverseasLegendVisible && (
        <div className="rainviewer-legend" aria-label="Overseas radar legend">
          <div className="rainviewer-legend-title">해외 레이더 · dBZ</div>
          {rainviewerOutOfRange ? (
            <div className="rainviewer-legend-empty">
              해외 레이더 없음
              <span className="rainviewer-legend-note">최근 2시간만 제공</span>
            </div>
          ) : (
            <>
              {/* RainViewer 공식 색상표(스킴 2)에서 뽑은 실제 색. 단위는 dBZ(반사도) — 국내 범례(mm/h)와 다른 척도다. */}
              <div className="rainrate-legend-scale">
                {RAINVIEWER_LEGEND.map((entry) => (
                  <div key={entry.label} className="rainrate-legend-row">
                    <span className="rainrate-legend-label">{entry.label}</span>
                    <span
                      className="rainrate-legend-swatch"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden="true"
                    />
                  </div>
                ))}
              </div>
              <div className="rainviewer-legend-coverage">
                <span className="rainviewer-legend-swatch" aria-hidden="true" />
                레이더 미수신 지역
              </div>
            </>
          )}
          <div className="rainviewer-legend-note">
            반사도(dBZ) — 국내 레이더의 강수량(mm/h)과 다른 척도
          </div>
          <a
            className="rainviewer-legend-credit"
            href="https://www.rainviewer.com"
            target="_blank"
            rel="noreferrer noopener"
          >
            RainViewer
          </a>
        </div>
      )}
      {lightningLegendVisible && (
        <div className="lightning-time-legend" aria-label="Lightning time legend">
          <div className="lightning-time-legend-title">LIGHTNING</div>
          <div className="lightning-time-legend-sub">10 MIN</div>
          <div className="lightning-time-legend-current">
            {formatReferenceTimeLabel(radarLegendVisible ? radarReferenceTimeMs : lightningReferenceTimeMs)}
          </div>
          <div className="lightning-time-legend-scale">
            {lightningLegendEntries.map((entry) => (
              <div key={entry.iconId} className="lightning-time-legend-row">
                <span className="lightning-time-legend-label">{entry.label}</span>
                <span
                  className="lightning-time-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
          {isMobile && (
            <button
              type="button"
              className={`lightning-legend-blink${blinkLightning ? ' is-on' : ''}`}
              onClick={() => onBlinkLightningChange?.((prev) => !prev)}
              aria-pressed={blinkLightning}
            >
              깜빡임 {blinkLightning ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      )}
      {windSpeedLegendVisible && (
        <div className="wind-speed-legend" aria-label="Wind speed legend">
          <div className="wind-speed-legend-title">kt</div>
          <div className="wind-speed-legend-scale">
            {windSpeedLegendEntries.map((entry) => (
              <div key={entry.label} className="wind-speed-legend-row">
                <span className="wind-speed-legend-label">{entry.label}</span>
                <span
                  className="wind-speed-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {temperatureLegendVisible && (
        <div className="temperature-legend" aria-label="Temperature legend">
          <div className="temperature-legend-title">C</div>
          <div className="temperature-legend-scale">
            {temperatureLegendEntries.map((entry) => (
              <div key={entry.label} className="temperature-legend-row">
                <span className="temperature-legend-label">{entry.label}</span>
                <span
                  className="temperature-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {cloudLegendVisible && (
        <div className="temperature-legend" aria-label="Dewpoint spread legend">
          <div className="temperature-legend-title">T-Td C</div>
          <div className="temperature-legend-scale">
            {cloudLegendEntries.map((entry) => (
              <div key={entry.label} className="temperature-legend-row">
                <span className="temperature-legend-label">{entry.label}</span>
                <span
                  className="temperature-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {icingLegendVisible && (
        <div className="temperature-legend" aria-label="Icing potential legend">
          <div className="temperature-legend-title">Icing Potential</div>
          <div className="temperature-legend-scale">
            {icingLegendEntries.map((entry) => (
              <div key={entry.label} className="temperature-legend-row">
                <span className="temperature-legend-label">{entry.label}</span>
                <span
                  className="temperature-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {turbulenceLegendVisible && (
        <div className="temperature-legend" aria-label="Turbulence legend">
          <div className="temperature-legend-title">Turbulence</div>
          <div className="temperature-legend-scale">
            {turbulenceLegendEntries.map((entry) => (
              <div key={entry.label} className="temperature-legend-row">
                <span className="temperature-legend-label">{entry.label}</span>
                <span
                  className="temperature-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // 모바일: 세로 컬러바 대신 하단(타임라인 위) 가로 범례 바 + '범례' 칩 토글(슬라이드업).
  if (!isMobile) return panel

  const mobileLegends = [
    radarLegendVisible && { key: 'radar', title: 'mm/h', entries: radarRainrateLegend },
    lightningLegendVisible && { key: 'ltg', title: 'LIGHTNING · 10 MIN', entries: lightningLegendEntries },
    windSpeedLegendVisible && { key: 'wind', title: 'kt', entries: windSpeedLegendEntries },
    temperatureLegendVisible && { key: 'temp', title: '°C', entries: temperatureLegendEntries },
    cloudLegendVisible && { key: 'cloud', title: 'T-Td °C', entries: cloudLegendEntries },
    icingLegendVisible && { key: 'icing', title: 'Icing', entries: icingLegendEntries },
    turbulenceLegendVisible && { key: 'turb', title: 'Turbulence', entries: turbulenceLegendEntries },
  ].filter(Boolean)

  return (
    <div className="map-legend-mobile-dock">
      <div className={`map-legends-bottom${open ? ' is-open' : ''}`} aria-hidden={!open}>
        {mobileLegends.map((l) => (
          <HLegend key={l.key} title={l.title} entries={l.entries} />
        ))}
      </div>
      <button
        type="button"
        className={`map-legend-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        범례 <span className="map-legend-toggle-caret" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
    </div>
  )
}

export default WeatherLegends
