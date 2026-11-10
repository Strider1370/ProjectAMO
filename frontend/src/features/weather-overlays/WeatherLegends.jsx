import CloudIcingLegend from './CloudIcingLegend.jsx'
import { Fragment, useEffect, useRef, useState } from 'react'
import { RAINVIEWER_LEGEND } from './lib/rainviewerLayers.js'
import { WISSDOM_WIND_LEGEND } from './lib/weatherOverlayLayers.js'
import { LegendScale } from './MapLegend.jsx'
import { MAP_LAYER_OPACITY } from './lib/mapLayerOpacity.js'

// 난류: 등급 세 칸. 지수 범위는 마우스를 올리면 보인다.
function TurbulenceLegend({ product, entries }) {
  const ranges = product === 'GKTG'
    ? ['0.15–<0.22', '0.22–<0.34', '≥0.34']
    : ['0.30–<0.475', '0.475–<0.75', '≥0.75']
  const grades = ['LGT', 'MOD', 'SEV']
  return (
    <LegendScale title={`난류 · ${product}`} unit={product} ariaLabel={`${product} 난류 범례`} opacity={product === 'GKTG' ? MAP_LAYER_OPACITY.gktg : 1}
      entries={entries.map((entry, index) => ({ color: entry.color, label: grades[index] }))}
      hint={`${product} 지수 ${grades.map((grade, index) => `${grade} ${ranges[index]}`).join(' · ')}`} />
  )
}

function FlightCategoryBandLegend({ title, unit = null, entries, opacity = 1, note = null }) {
  return (
    <LegendScale title={title} unit={unit} opacity={opacity} note={note}
      entries={entries.map(entry => ({ color: entry.color, label: entry.compactLabel || entry.label }))}
      hint={entries.map(entry => entry.detail ? `${entry.label}(${entry.detail})` : entry.label).join(' · ')} />
  )
}

const CTPS_LEGEND = [{ label: '< FL100', color: '#16A34A' }, { label: 'FL100–199', color: '#EAB308' }, { label: 'FL200–299', color: '#F97316' }, { label: 'FL300–399', color: '#DC2626' }, { label: '≥ FL400', color: '#7E22CE' }]
const FL_EDGE_LEGEND = CTPS_LEGEND.map((entry, index) => ({ color: entry.color, label: index ? String(index * 100) : '' }))
// 바람: 칸이 시작하는 풍속(kt)을 경계에 단다.
const windEdgeEntries = entries => entries.map(entry => ({ color: entry.color, label: String(entry.label).split(/[-+ ]/)[0] }))

// 켜진 레이어마다 범례 한 장. layer는 자료 시각 카드 항목의 key(MapView timestampEntries)와 같다.
// 데스크톱은 이 key로 시각 카드의 해당 레이어 밑에 범례를 붙이고, 모바일 범례 시트는 같은 목록을 순서대로 그린다.
export function buildMapLegendBlocks({
  radarLegendVisible = false,
  hsrLegendVisible = false,
  hciLegendVisible = false,
  wissdomLegendVisible = false,
  hsrLegend = [],
  hciLegend = [],
  radarOverseasLegendVisible = false,
  rainviewerOutOfRange = false,
  lightningLegendVisible = false,
  flightCategoryLegendVisible = false,
  flightCategoryVisibilityOn = false,
  flightCategoryCeilingOn = false,
  flightCategoryBands = [],
  flightCategoryCeilingBands = [],
  flightCategoryStationLegendVisible = false,
  flightCategoryStationBands = [],
  radarRainrateLegend = [],
  lightningLegendEntries = [],
  windSpeedLegendVisible = false,
  windSpeedLegendEntries = [],
  temperatureLegendVisible = false,
  cloudLegendVisible = false,
  cloudLegendEntries = [],
  cloudIcingLevelId = null,
  icingLegendVisible = false,
  turbulenceLegendVisible = false,
  turbulenceLegendEntries = [],
  turbulenceProduct = 'GKTG',
  ctpsLegendVisible = false,
  surfaceChartLegendVisible = false,
  surfaceChartLegendEntries = [],
  surfaceChartLegendNote = null,
  radarReferenceTimeMs,
  lightningReferenceTimeMs,
  radarWindLegendVisible = false,
  radarWindObservedAtMs,
  formatReferenceTimeLabel,
  aciLegendContent = null,
  tropopauseLegendContent = null,
  terrainHazardLegendContent = null,
  cloudIcingControls = null,
} = {}) {
  // 색은 우리가 그리지만 시각은 기상청 분석 시각이다 — 어느 시점의 바람인지 함께 밝힌다.
  const wissdomVisible = wissdomLegendVisible || radarWindLegendVisible
  const wissdomNote = radarWindLegendVisible && formatReferenceTimeLabel
    ? `KMA 관측 ${formatReferenceTimeLabel(radarWindObservedAtMs)}`
    : null
  const scale = (key, layer, props) => ({ key, layer, node: <LegendScale key={key} {...props} /> })
  return [
    aciLegendContent && { key: 'aci', layer: 'aci', node: <Fragment key="aci">{aciLegendContent}</Fragment> },
    tropopauseLegendContent && { key: 'tropopause', layer: 'tropopauseJet', node: <Fragment key="tropopause">{tropopauseLegendContent}</Fragment> },
    terrainHazardLegendContent && { key: 'terrainHazard', layer: 'terrainHazard', node: <Fragment key="terrainHazard">{terrainHazardLegendContent}</Fragment> },
    turbulenceLegendVisible && { key: 'turbulence', layer: 'turbulence', node: <TurbulenceLegend key="turbulence" product={turbulenceProduct} entries={turbulenceLegendEntries} /> },
    (cloudLegendVisible || icingLegendVisible || temperatureLegendVisible || cloudIcingControls) && { key: 'cloudIcing', layer: 'cloudIcing',
      node: <CloudIcingLegend key="cloudIcing" cloud={cloudLegendVisible} icing={icingLegendVisible} temperature={temperatureLegendVisible} cloudEntries={cloudLegendEntries} levelId={cloudIcingLevelId} mode="map" compact controls={cloudIcingControls} /> },
    hsrLegendVisible && scale('hsr', 'radar', { title: 'HSR · mm/h', unit: 'mm/h', entries: hsrLegend, labels: 'edge', opacity: MAP_LAYER_OPACITY.hsr }),
    radarLegendVisible && scale('radar', 'radar', { title: '레이더 · mm/h', unit: 'mm/h', entries: radarRainrateLegend, reverse: true, labels: 'edge', opacity: MAP_LAYER_OPACITY.radar }),
    hciLegendVisible && scale('hci', 'radarHci', { title: 'HCI · 강수 형태', unit: '형태', entries: hciLegend, opacity: MAP_LAYER_OPACITY.hci }),
    wissdomVisible && scale('wissdom', 'wissdom', { title: 'WISSDOM · m/s', unit: 'm/s', entries: WISSDOM_WIND_LEGEND, labels: 'edge', opacity: MAP_LAYER_OPACITY.wissdom, note: wissdomNote }),
    // 해외 레이더는 픽셀 색만 받아 강수량으로 바꿀 수 없다. 국내 mm/h 범례와 다른 반사도 척도임을 밝힌다.
    radarOverseasLegendVisible && (rainviewerOutOfRange
      ? scale('rainviewer', 'radarOverseas', { title: '해외 레이더 · dBZ', unit: 'dBZ', entries: [], note: '이 시각 자료 없음 · 최근 2시간만 제공' })
      : scale('rainviewer', 'radarOverseas', { title: '해외 레이더 · dBZ', unit: 'dBZ', entries: RAINVIEWER_LEGEND, reverse: true, labels: 'edge', opacity: MAP_LAYER_OPACITY.rainviewer,
        note: <>국내 레이더(mm/h)와 다른 척도 · <a href="https://www.rainviewer.com" target="_blank" rel="noreferrer noopener">RainViewer</a></> })),
    // 낙뢰는 타임라인처럼 왼쪽이 과거, 오른쪽이 지금이다. 경계 시각은 칸이 시작하는(더 오래된) 쪽이다.
    lightningLegendVisible && scale('ltg', 'lightning', { title: '낙뢰 · 관측 시각', unit: '관측', entries: lightningLegendEntries, reverse: true, labels: 'edge',
      endLabel: formatReferenceTimeLabel?.(radarLegendVisible ? radarReferenceTimeMs : lightningReferenceTimeMs) ?? null }),
    ctpsLegendVisible && scale('ctps', 'ctps', { title: '구름 꼭대기 · FL', unit: 'FL', entries: FL_EDGE_LEGEND, labels: 'edge', opacity: MAP_LAYER_OPACITY.ctps, note: '위성 CTH 기반 높이 · 위험등급 아님' }),
    surfaceChartLegendVisible && scale('surfaceChart', 'surfaceChart', { title: '강수 · KIM · mm/3h', unit: 'mm/3h', entries: surfaceChartLegendEntries, labels: 'edge', opacity: MAP_LAYER_OPACITY.surfaceChartPrecip, note: surfaceChartLegendNote }),
    windSpeedLegendVisible && scale('wind', 'wind', { title: '바람 · kt', unit: 'kt', entries: windEdgeEntries(windSpeedLegendEntries), labels: 'edge' }),
    flightCategoryLegendVisible && flightCategoryVisibilityOn && { key: 'fcVisibility', layer: 'visibility',
      node: <FlightCategoryBandLegend key="fcVisibility" title="시정 · km" unit="km" opacity={MAP_LAYER_OPACITY.visibility} note="면을 채워 표시" entries={[...flightCategoryBands, { label: '자료 없음', color: '#9ca3af' }]} /> },
    flightCategoryLegendVisible && flightCategoryCeilingOn && { key: 'fcCeiling', layer: 'ceiling',
      node: <FlightCategoryBandLegend key="fcCeiling" title="운고 · m" unit="m" note="옅은 채움과 굵은 윤곽으로 표시" entries={[...flightCategoryCeilingBands, { label: '자료 없음', color: '#9ca3af' }]} /> },
    flightCategoryStationLegendVisible && { key: 'fcStations', layer: 'fcStations',
      node: <FlightCategoryBandLegend key="fcStations" title="관측지점 · 운고 m" unit="운고 m" entries={flightCategoryStationBands} /> },
  ].filter(Boolean)
}

// 모바일 범례 시트. 데스크톱은 범례를 자료 시각 카드 안에 펼쳐 두므로 이 시트를 쓰지 않는다.
function WeatherLegends({
  open: controlledOpen,
  onOpenChange,
  onOpenPanelHeightChange,
  supplementalContent = null,
  sampleWarning = false,
  ...legendProps
}) {
  const bottomPanelRef = useRef(null)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  function setOpen(next) {
    const resolved = typeof next === 'function' ? next(open) : next
    if (controlledOpen === undefined) setUncontrolledOpen(resolved)
    onOpenChange?.(resolved)
  }
  const blocks = buildMapLegendBlocks(legendProps)

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

  if (!blocks.length && !supplementalContent) return null

  return (
    <div className="map-legend-mobile-dock">
      <div ref={bottomPanelRef} className={`map-legends-bottom${open ? ' is-open' : ''}`} aria-hidden={!open}>
        {supplementalContent}
        {blocks.map((block) => block.node)}
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
