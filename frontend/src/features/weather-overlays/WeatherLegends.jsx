import './WeatherLegends.css'
import CloudIcingLegend from './CloudIcingLegend.jsx'
import { useEffect, useRef, useState } from 'react'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import { RAINVIEWER_LEGEND } from './lib/rainviewerLayers.js'
import { WISSDOM_WIND_LEGEND } from './lib/weatherOverlayLayers.js'
import { entriesLeftToRight } from './lib/legendOrder.js'
import { QPF_LEGEND } from './lib/rasterLegendModel.js'

function HLegend({ title, entries = [], reverse = false, note = null }) {
  const cells = entriesLeftToRight(entries, reverse)
  const step = Math.max(1, Math.ceil(cells.length / 7))
  return (
    <div className="hlegend">
      <div className="hlegend-title">{title}</div>
      <div className="hlegend-bar" aria-hidden="true">
        {cells.map((e, i) => (
          <span key={i} className="hlegend-cell" style={{ backgroundColor: e.background || e.color }}>
            {e.background && <span style={{ display: 'block', width: '100%', height: '100%', backgroundColor: e.color }} />}
          </span>
        ))}
      </div>
      <div className="hlegend-labels" aria-hidden="true">
        {cells.map((e, i) => (
          <span key={i} className="hlegend-label">{i % step === 0 ? e.label : ''}</span>
        ))}
      </div>
      {note && <div className="hlegend-note">{note}</div>}
    </div>
  )
}

function TurbulenceLegend({ product, entries }) {
  const ranges = product === 'GKTG'
    ? ['0.15–<0.22', '0.22–<0.34', '≥0.34']
    : ['0.30–<0.475', '0.475–<0.75', '≥0.75']
  return (
    <section className="turbulence-legend" aria-label={`${product} 난류 범례`}>
      <strong className="hlegend-title">난류 · {product}</strong>
      <div className="turbulence-legend__scale">
        {entries.map((entry, index) => (
          <div className="turbulence-legend__band" key={entry.label}>
            <i style={{ backgroundColor: entry.color }} aria-hidden="true" />
            <strong>{['LGT', 'MOD', 'SEV'][index]}</strong>
            <span>{ranges[index]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function FlightCategoryBandLegend({ title, entries }) {
  return (
    <section className="flight-category-band-legend" aria-label={`${title} 범례`}>
      <strong className="hlegend-title">{title}</strong>
      <div className="flight-category-band-legend__scale" style={{ '--band-count': entries.length }}>
        {entries.map(entry => (
          <div className="flight-category-band-legend__band" key={entry.label}>
            <i style={{ backgroundColor: entry.color }} aria-hidden="true" />
            <span>{entry.compactLabel || entry.label}</span>
            {entry.detail && <small>{entry.detail}</small>}
          </div>
        ))}
      </div>
    </section>
  )
}

const CI_LEGEND = [{ label: '중간 상승기류 신호', color: '#F6C945' }, { label: '강한 상승기류 신호', color: '#E8751A' }]
const CTPS_LEGEND = [{ label: '< FL100', color: '#16A34A' }, { label: 'FL100–199', color: '#EAB308' }, { label: 'FL200–299', color: '#F97316' }, { label: 'FL300–399', color: '#DC2626' }, { label: '≥ FL400', color: '#7E22CE' }]
// Echo Top(재산출)은 위성 운정고도와 같은 물리량(높이)이라 같은 FL 밴드 색을 쓴다.
// 색은 높이만 뜻하며 위험등급·회피 권고가 아니다.
const ECHO_TOP_LEGEND = CTPS_LEGEND

function ConvectiveLegend({ title, entries, note }) {
  return <div className="temperature-legend convective-legend" aria-label={title + ' 범례'}><div className="temperature-legend-title">{title}</div><div className="temperature-legend-scale">{entries.map((entry) => <div key={entry.label} className="temperature-legend-row"><span className="temperature-legend-label">{entry.label}{entry.range ? ` ${entry.range}` : ''}</span><span className="temperature-legend-swatch" style={{ backgroundColor: entry.color }} aria-hidden="true" /></div>)}</div><div className="convective-legend__note">{note}</div></div>
}

function WeatherLegends({
  radarLegendVisible,
  hsrLegendVisible = false,
  hciLegendVisible = false,
  wissdomLegendVisible = false,
  hsrLegend = [],
  hciLegend = [],
  radarOverseasLegendVisible,
  rainviewerOutOfRange = false,
  echoTopOutOfRange = false,
  lightningLegendVisible,
  blinkLightning = false,
  onBlinkLightningChange,
  flightCategoryLegendVisible = false,
  flightCategoryVisibilityOn = false,
  flightCategoryCeilingOn = false,
  flightCategoryBands = [],
  flightCategoryCeilingBands = [],
  flightCategoryStationLegendVisible = false,
  flightCategoryStationBands = [],
  radarRainrateLegend,
  qpfStatus = null,
  qpfLegendPath = null,
  lightningLegendEntries,
  windSpeedLegendVisible,
  windSpeedLegendEntries = [],
  temperatureLegendVisible,
  temperatureLegendEntries = [],
  cloudLegendVisible,
  cloudLegendEntries = [],
  cloudIcingLevelId = null,
  icingLegendVisible,
  icingLegendEntries = [],
  turbulenceLegendVisible,
  turbulenceLegendEntries = [],
  turbulenceProduct = 'GKTG',
  ciLegendVisible = false,
  ctpsLegendVisible = false,
  echoTopLegendVisible = false,
  surfaceChartLegendVisible = false,
  surfaceChartLegendEntries = [],
  surfaceChartLegendNote = null,
  radarReferenceTimeMs,
  lightningReferenceTimeMs,
  radarWindLegendVisible = false,
  radarWindObservedAtMs,
  formatReferenceTimeLabel,
  bottomDock = false,
  open: controlledOpen,
  onOpenChange,
  onOpenPanelHeightChange,
  supplementalContent = null,
  aciLegendContent = null,
  tropopauseLegendContent = null,
  sampleWarning = false,
}) {
  const isMobile = useIsMobile()
  const bottomPanelRef = useRef(null)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  function setOpen(next) {
    const resolved = typeof next === 'function' ? next(open) : next
    if (controlledOpen === undefined) setUncontrolledOpen(resolved)
    onOpenChange?.(resolved)
  }
  const qpfLegendVisible = Boolean(qpfStatus && qpfLegendPath)
  // 색은 우리가 그리지만 시각은 기상청 분석 시각이다 — 어느 시점의 바람인지 함께 밝힌다.
  // 바람장이 꺼져 있으면 형식 함수 자체가 안 넘어올 수 있으므로 그때는 만들지 않는다.
  const wissdomNote = radarWindLegendVisible
    ? `KMA 관측 ${formatReferenceTimeLabel?.(radarWindObservedAtMs) ?? ''}`
    : null
  const panel = (
    <div className="map-right-legends">
      {hsrLegendVisible && (
        <div className="rainrate-legend" aria-label="HSR rain rate legend">
          <HLegend title="HSR · mm/h" entries={hsrLegend} />
          {wissdomLegendVisible && (
            <div className="radar-wind-control">
              <HLegend title="WISSDOM · m/s" entries={WISSDOM_WIND_LEGEND} note={wissdomNote} />
            </div>
          )}
        </div>
      )}
      {hciLegendVisible && (
        <div className="rainrate-legend" aria-label="HCI precipitation type legend">
          <HLegend title="HCI · 강수 형태" entries={hciLegend} />
        </div>
      )}
      {radarLegendVisible && (
        <div className="rainrate-legend" aria-label="Radar rain rate legend">
          <div className="rainrate-legend-title">mm/h</div>
          <div className="rainrate-legend-scale">
            {radarRainrateLegend.map((entry) => (
              <div key={entry.label} className="rainrate-legend-row">
                <span className="rainrate-legend-label">{entry.label}{entry.range ? ` ${entry.range}` : ''}</span>
                <span
                  className="rainrate-legend-swatch"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
          {radarWindLegendVisible && (
            <div className="radar-wind-control">
              <HLegend title="WISSDOM · m/s" entries={WISSDOM_WIND_LEGEND} note={wissdomNote} />
            </div>
          )}
        </div>
      )}
      {qpfLegendVisible && (
        <div className="rainrate-legend" aria-label="MAPLE 초단기 강수예측 범례">
          <HLegend title="초단기 강수예측 · MAPLE · mm/h" entries={QPF_LEGEND} />
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
                    <span className="rainrate-legend-label">{entry.label}{entry.range ? ` ${entry.range}` : ''}</span>
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
          <div className="lightning-time-legend-sub">5 MIN</div>
          <div className="lightning-time-legend-current">
            {formatReferenceTimeLabel(radarLegendVisible ? radarReferenceTimeMs : lightningReferenceTimeMs)}
          </div>
          <div className="lightning-time-legend-scale">
            {lightningLegendEntries.map((entry) => (
              <div key={entry.iconId} className="lightning-time-legend-row">
                <span className="lightning-time-legend-label">{entry.label}{entry.range ? ` ${entry.range}` : ''}</span>
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
                <span className="wind-speed-legend-label">{entry.label}{entry.range ? ` ${entry.range}` : ''}</span>
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
      <CloudIcingLegend cloud={cloudLegendVisible} icing={icingLegendVisible} temperature={temperatureLegendVisible} mode="map" cloudEntries={cloudLegendEntries} levelId={cloudIcingLevelId} />
      {aciLegendContent}
      {tropopauseLegendContent}
      {ciLegendVisible && <ConvectiveLegend title="대류 가능성" entries={CI_LEGEND} note="위성 기반 대류 발생 가능성 참고 — 레이더 실황·위험등급 아님" />}
      {ctpsLegendVisible && <ConvectiveLegend title="구름 꼭대기" entries={CTPS_LEGEND} note="CTH 기반 높이 — 위험등급 아님" />}
      {echoTopLegendVisible && (echoTopOutOfRange ? (
        <div className="rainviewer-legend" aria-label="Echo top legend">
          <div className="rainviewer-legend-title">에코탑(재산출) · FL</div>
          <div className="rainviewer-legend-empty">
            이 시각 에코탑 자료 없음
          </div>
        </div>
      ) : (
        <ConvectiveLegend title="에코탑(재산출)" entries={ECHO_TOP_LEGEND} note="재산출 · 18 dBZ · MSL — KMA 공식 ETOP 아님" />
      ))}
      {turbulenceLegendVisible && <TurbulenceLegend product={turbulenceProduct} entries={turbulenceLegendEntries} />}
    </div>
  )

  useEffect(() => {
    if (!onOpenPanelHeightChange) return undefined
    const panel = bottomPanelRef.current
    const publish = () => onOpenPanelHeightChange(open ? Math.ceil(panel?.getBoundingClientRect().height ?? 0) : 0)
    publish()
    if (!open || !panel || typeof ResizeObserver === 'undefined') return () => onOpenPanelHeightChange(0)
    const observer = new ResizeObserver(publish)
    observer.observe(panel)
    return () => {
      observer.disconnect()
      onOpenPanelHeightChange(0)
    }
  }, [onOpenPanelHeightChange, open])

  if (!radarLegendVisible && !hsrLegendVisible && !hciLegendVisible && !qpfLegendVisible && !radarOverseasLegendVisible && !lightningLegendVisible && !flightCategoryLegendVisible && !windSpeedLegendVisible && !temperatureLegendVisible && !cloudLegendVisible && !icingLegendVisible && !turbulenceLegendVisible && !ciLegendVisible && !ctpsLegendVisible && !echoTopLegendVisible && !surfaceChartLegendVisible && !supplementalContent && !aciLegendContent && !tropopauseLegendContent) return null

  // 모바일과 데스크톱 지도 모드 모두 하단(타임라인 위) 가로 범례 바를 사용한다.
  if (!isMobile && !bottomDock) return panel

  const mobileLegends = [
    hsrLegendVisible && { key: 'hsr', title: 'HSR · mm/h', entries: hsrLegend },
    hciLegendVisible && { key: 'hci', title: 'HCI · 강수 형태', entries: hciLegend },
    wissdomLegendVisible && { key: 'wissdom', title: 'WISSDOM · m/s', entries: WISSDOM_WIND_LEGEND, note: wissdomNote },
    radarLegendVisible && { key: 'radar', title: '레이더 · mm/h', entries: radarRainrateLegend, reverse: true },
    lightningLegendVisible && { key: 'ltg', title: '낙뢰 · 5분', entries: lightningLegendEntries },
    surfaceChartLegendVisible && { key: 'surfaceChart', title: '강수 · KIM · mm/3h', entries: surfaceChartLegendEntries, note: surfaceChartLegendNote },
    windSpeedLegendVisible && { key: 'wind', title: '바람 · kt', entries: windSpeedLegendEntries },
    ciLegendVisible && { key: 'ci', title: '대류 가능성 · 위성', entries: CI_LEGEND },
    ctpsLegendVisible && { key: 'ctps', title: '구름 꼭대기 · FL', entries: CTPS_LEGEND },
    // 이 하단 독이 데스크톱·모바일 모두에서 실제로 렌더되는 범례다(MapView가 bottomDock={!isMobile}).
    // FR-006이 요구하는 `재산출 · 18 dBZ · MSL` 표기와 자료 없음 안내가 여기 있어야 화면에 나온다.
    echoTopLegendVisible && (echoTopOutOfRange
      ? { key: 'echoTop', title: '에코탑(재산출)', entries: [], note: '이 시각 에코탑 자료 없음' }
      : { key: 'echoTop', title: '에코탑(재산출) · FL', entries: ECHO_TOP_LEGEND, note: '재산출 · 18 dBZ · MSL — KMA 공식 ETOP 아님' }),
  ].filter(Boolean)

  return (
    <div className={`map-legend-mobile-dock${bottomDock ? ' map-legend-desktop-dock' : ''}`}>
      <div ref={bottomPanelRef} className={`map-legends-bottom${open ? ' is-open' : ''}`} aria-hidden={!open}>
        {supplementalContent}
        {aciLegendContent}
        {tropopauseLegendContent}
        {turbulenceLegendVisible && <TurbulenceLegend product={turbulenceProduct} entries={turbulenceLegendEntries} />}
        <CloudIcingLegend cloud={cloudLegendVisible} icing={icingLegendVisible} temperature={temperatureLegendVisible} cloudEntries={cloudLegendEntries} levelId={cloudIcingLevelId} mode="map" compact />
        {mobileLegends.map((l) => (
          <HLegend key={l.key} title={l.title} entries={l.entries} reverse={l.reverse} note={l.note} />
        ))}
        {radarWindLegendVisible && (
          <HLegend title="WISSDOM · m/s" entries={WISSDOM_WIND_LEGEND} note={wissdomNote} />
        )}
        {qpfLegendVisible && (
          <HLegend title="초단기 강수예측 · MAPLE · mm/h" entries={QPF_LEGEND} />
        )}
        {flightCategoryLegendVisible && (
          <section className="flight-category-legend" aria-label="시정·운고 범례">
            {flightCategoryVisibilityOn && <FlightCategoryBandLegend title="시정 · km" entries={[...flightCategoryBands, { label: '자료 없음', color: '#9ca3af' }]} />}
            {flightCategoryCeilingOn && <FlightCategoryBandLegend title="운고 · m" entries={[...flightCategoryCeilingBands, { label: '자료 없음', color: '#9ca3af' }]} />}
            <p className="flight-category-legend__note">
              {[flightCategoryVisibilityOn && '시정: 채움', flightCategoryCeilingOn && '운고: 옅은 채움·윤곽'].filter(Boolean).join(' · ')}
            </p>
            {flightCategoryStationLegendVisible && <FlightCategoryBandLegend title="관측지점 · 운고 m" entries={flightCategoryStationBands} />}
          </section>
        )}
      </div>
      <button
        type="button"
        className={`map-legend-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        범례 {sampleWarning && <span className="map-legend-sample-warning">HIGH 현재 자료 아님</span>}
        <span className="map-legend-toggle-caret" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
    </div>
  )
}

export default WeatherLegends
