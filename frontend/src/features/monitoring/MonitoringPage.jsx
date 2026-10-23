import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MdSettings } from 'react-icons/md'
import { formatUtc } from './legacy/utils/helpers'
import {
  getDefaultAdvisoryFilterSettings,
  loadAdvisoryFilterSettings,
  saveAdvisoryFilterSettings,
} from './legacy/utils/advisory-filter'
import Header from './legacy/components/Header'
import MetarCard from './legacy/components/MetarCard'
import WarningList from './legacy/components/WarningList'
import TafTimeline from './legacy/components/TafTimeline'
import GroundForecastViewport from './legacy/components/GroundForecastViewport'
import GroundForecastClassic from './legacy/components/GroundForecastClassic'
import GroundCurrentWeatherCard from './legacy/components/GroundCurrentWeatherCard'
import Settings from './legacy/components/alerts/Settings'
import MonitoringMap from './MonitoringMap.jsx'
import { knownBasemapId } from '../map/mapConfig.js'
import MonitoringSlideOverlay from './MonitoringSlideOverlay.jsx'
import MonitoringWxInfoSlide from './MonitoringWxInfoSlide.jsx'
import { useMonitoringSlideshow } from './useMonitoringSlideshow.js'
import {
  normalizeMonitoringSlideshowConfig,
  loadMonitoringSlideshowConfig,
  saveMonitoringSlideshowConfig,
  loadMonitoringSlideImage,
  saveMonitoringSlideImage,
  clearMonitoringSlideImage,
} from './lib/monitoringSlideshow.js'
import { canvasScale } from './lib/canvasScale.js'
import { monitoringClockParts } from './lib/monitoringClock.js'
import { GROUND_FORECAST_DISPLAY_MODE, GROUND_FORECAST_DISPLAY_MODE_STORAGE_KEY, normalizeGroundForecastDisplayMode } from './lib/groundForecastDisplayMode.js'
import {
  filterMonitoringAirportChoices,
  isMonitoringSelectableAirport,
  resolveMonitoringAirportSelection,
} from './lib/airportSelection.js'
import { useSnapshotPolling } from '../../app/useWeatherPolling.js'
import {
  buildMonitoringSnapshot,
  detectMonitoringSnapshotChanges,
  fetchMonitoringSnapshotMeta,
  loadChangedMonitoringData,
  loadMonitoringInitialData,
  nextMonitoringSnapshot,
} from './monitoringApi.js'
import './legacy/App.css'
import './MonitoringPage.css'

const MOBILE_LAYOUT_QUERY = '(max-width: 719px)'
const SLIDESHOW_STATUS_LABELS = { off: '꺼짐', waiting: '대기 중', active: '전환 중', ended: '오늘 종료' }

const AIRPORT_NAME_KO = {
  RKSI: '인천국제공항',
  RKSS: '김포국제공항',
  RKPC: '제주국제공항',
  RKPK: '김해국제공항',
  RKJB: '무안국제공항',
  RKNY: '양양국제공항',
  RKPU: '울산공항',
  RKJY: '여수공항',
}

// Captured once, before anything can shadow it: `delete window.devicePixelRatio` does not restore a
// native value here — the property is the window's own, so deleting it leaves the read undefined and
// mapbox silently falls back to a ratio of 1.
const NATIVE_DEVICE_PIXEL_RATIO = typeof window === 'undefined'
  ? null
  : Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
    || Object.getOwnPropertyDescriptor(Window.prototype, 'devicePixelRatio')

function readNativeDevicePixelRatio() {
  if (!NATIVE_DEVICE_PIXEL_RATIO) return 1
  return NATIVE_DEVICE_PIXEL_RATIO.get
    ? NATIVE_DEVICE_PIXEL_RATIO.get.call(window)
    : NATIVE_DEVICE_PIXEL_RATIO.value
}

const DEFAULT_AIRPORT = 'RKSI'
const ALL_ALTITUDE_BANDS = ['0-10000', '10000-20000', '20000-30000', '30000-40000', '40000-50000']

function readJsonLocalStorage(key, fallback) {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export default function MonitoringPage() {
  const [dashboardMode, setDashboardMode] = useState(() => (
    new URLSearchParams(window.location.search).get('mode') === 'ground' ? 'ground' : 'ops'
  ))
  const [selectedAirport, setSelectedAirport] = useState(() => (
    localStorage.getItem('selected_airport_monitoring') || DEFAULT_AIRPORT
  ))
  const controlMenuRef = useRef(null)
  const [showSettings, setShowSettings] = useState(false)
  const [phoneTask, setPhoneTask] = useState('weather')
  const [tafVersion, setTafVersion] = useState(() => localStorage.getItem('taf_view_mode') || 'v2')
  const [groundForecastDisplayMode, setGroundForecastDisplayMode] = useState(() => normalizeGroundForecastDisplayMode(localStorage.getItem(GROUND_FORECAST_DISPLAY_MODE_STORAGE_KEY)))
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem('time_zone') || 'KST')
  const [mapTheme, setMapTheme] = useState(() => localStorage.getItem('map_theme') || 'light')
  const [basemapId, setBasemapId] = useState(() => knownBasemapId(localStorage.getItem('map_basemap_monitoring')))
  const [trafficCallsignFilter, setTrafficCallsignFilter] = useState(() => localStorage.getItem('traffic_callsign_filter') || '')
  const [trafficAltitudeBands, setTrafficAltitudeBands] = useState(() => (
    readJsonLocalStorage('traffic_altitude_bands', ALL_ALTITUDE_BANDS)
  ))
  const [advisoryFilter, setAdvisoryFilter] = useState(() => loadAdvisoryFilterSettings())
  const [currentTime, setCurrentTime] = useState(() => new Date())

  const [slideshowConfig, setSlideshowConfig] = useState(() => loadMonitoringSlideshowConfig().config)
  const [slideImageBlob, setSlideImageBlob] = useState(null)
  const [slideImageRevision, setSlideImageRevision] = useState(0)
  const [slideshowPersistenceError, setSlideshowPersistenceError] = useState(null)
  const [isMobileLayout, setIsMobileLayout] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_LAYOUT_QUERY).matches
      : false
  ))
  // null = fixed canvas off, legacy/App.css owns the layout. See lib/canvasScale.js.
  const [fixedCanvasScale, setFixedCanvasScale] = useState(() => (
    typeof window === 'undefined' ? null : canvasScale(window.innerWidth)
  ))

  useEffect(() => {
    localStorage.setItem('selected_airport_monitoring', selectedAirport || '')
  }, [selectedAirport])

  useEffect(() => {
    localStorage.setItem('time_zone', timeZone)
  }, [timeZone])

  useEffect(() => {
    localStorage.setItem('map_theme', mapTheme)
    document.documentElement.setAttribute('data-theme', mapTheme)
  }, [mapTheme])

  useEffect(() => {
    localStorage.setItem('map_basemap_monitoring', basemapId)
  }, [basemapId])

  useEffect(() => {
    localStorage.setItem('taf_view_mode', tafVersion)
  }, [tafVersion])

  useEffect(() => {
    localStorage.setItem('traffic_callsign_filter', trafficCallsignFilter)
  }, [trafficCallsignFilter])

  useEffect(() => {
    localStorage.setItem('traffic_altitude_bands', JSON.stringify(trafficAltitudeBands))
  }, [trafficAltitudeBands])

  useEffect(() => {
    document.body.classList.add('monitoring-legacy-body')
    return () => document.body.classList.remove('monitoring-legacy-body')
  }, [])

  useEffect(() => {
    let cancelled = false
    loadMonitoringSlideImage().then((result) => {
      if (cancelled || !result.ok || !result.blob) return
      setSlideImageBlob(result.blob)
      setSlideImageRevision((rev) => rev + 1)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia(MOBILE_LAYOUT_QUERY)
    const onChange = (event) => setIsMobileLayout(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Resize covers browser zoom and a monitor swap too — both change innerWidth.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onResize = () => setFixedCanvasScale(canvasScale(window.innerWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Mapbox draws into a bitmap sized from window.devicePixelRatio and knows nothing about the canvas
  // transform above it, so at scale > 1 it produces 1/scale of the pixels it needs and the map alone
  // looks soft while text and panels stay crisp. Its container never changes size — the canvas pins
  // it to 1920px coordinates — so mapbox never re-measures on its own; the ratio is overridden here
  // and MonitoringMap tells the map to redraw. /monitoring renders nothing but this page, so nothing
  // else can read the overridden value. Layout effect: it must be in place before MapView's own
  // effect creates the map.
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !fixedCanvasScale || !NATIVE_DEVICE_PIXEL_RATIO) return undefined
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get: () => readNativeDevicePixelRatio() * fixedCanvasScale,
    })
    return () => {
      Object.defineProperty(window, 'devicePixelRatio', NATIVE_DEVICE_PIXEL_RATIO)
    }
  }, [fixedCanvasScale])

  const intervalMs = 30_000

  const {
    data: rawData,
    loading,
    initialError: error,
  } = useSnapshotPolling({
    loadInitialData: loadMonitoringInitialData,
    selectInitialData: ({ data: initialData }) => initialData,
    onInitialData: ({ data: merged }) => {
      setSelectedAirport((prev) => {
        const available = filterMonitoringAirportChoices([
          ...Object.keys(merged.metar?.airports || {}),
          ...Object.keys(merged.taf?.airports || {}),
          ...Object.keys(merged.warning?.airports || {}),
          ...(merged.airports || []).filter((airport) => airport.icao !== 'TST1' && !airport.overseas).map((airport) => airport.icao),
        ].filter((icao) => icao.startsWith('RK')))
        return resolveMonitoringAirportSelection(prev, available, DEFAULT_AIRPORT)
      })
    },
    fetchSnapshot: fetchMonitoringSnapshotMeta,
    buildSnapshot: buildMonitoringSnapshot,
    detectChanges: detectMonitoringSnapshotChanges,
    hasChanges: (changes) => Object.values(changes).some(Boolean),
    loadChangedData: loadChangedMonitoringData,
    advanceSnapshot: ({ latestSnapshot, changedData, previousSnapshot }) => (
      nextMonitoringSnapshot(latestSnapshot, changedData, previousSnapshot)
    ),
    intervalMs,
    initialErrorMode: 'state',
    initialRetryDelayMs: 30_000,
    logPrefix: '[Monitoring]',
  })
  const data = rawData || {}

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const closeControlMenu = (event) => {
      const menu = controlMenuRef.current
      if (!menu?.open) return
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'pointerdown' && menu.contains(event.target)) return
      menu.removeAttribute('open')
    }

    document.addEventListener('pointerdown', closeControlMenu)
    document.addEventListener('keydown', closeControlMenu)
    return () => {
      document.removeEventListener('pointerdown', closeControlMenu)
      document.removeEventListener('keydown', closeControlMenu)
    }
  }, [])

  const effectiveSlideshowConfig = isMobileLayout
    ? { ...slideshowConfig, enabled: false }
    : slideshowConfig
  // Domestic airports only — the bulletin is a 항공기상청 product, so overseas selections have none.
  const selectedAirportInfo = data.airportInfo?.airports?.[selectedAirport] || null
  const slideshow = useMonitoringSlideshow(
    effectiveSlideshowConfig,
    slideImageBlob,
    slideImageRevision,
    { hasWxInfo: Boolean(selectedAirportInfo) }
  )
  // Only the stage for the configured target ever leaves 'live'. Driving both would run the
  // bulletin's fit twice, once inside a hidden panel that measures zero.
  function slideIdFor(target) {
    return slideshowConfig.target === target ? slideshow.visibleSlide : 'live'
  }

  // `live` is the map itself — already on screen, so it contributes no layer.
  function slideContentFor(target) {
    switch (slideIdFor(target)) {
      case 'wxinfo':
        return <MonitoringWxInfoSlide info={selectedAirportInfo} timeZone={timeZone} />
      case 'image':
        return slideshow.imageUrl
          ? <img className="monitoring-slide-overlay-image" src={slideshow.imageUrl} alt="" />
          : null
      default:
        return null
    }
  }
  const slideshowStatusLabel = SLIDESHOW_STATUS_LABELS[slideshow.status] || null
  const slideshowPersistenceNotice = slideshowPersistenceError || slideshow.persistenceError
    ? '이 세션에서는 계속 사용할 수 있지만, 새로고침하면 설정이 저장되지 않습니다.'
    : null

  function handleSlideshowConfigChange(partial) {
    const next = normalizeMonitoringSlideshowConfig({ ...slideshowConfig, ...partial })
    setSlideshowConfig(next)
    const result = saveMonitoringSlideshowConfig(next)
    setSlideshowPersistenceError(result.ok ? null : result.error || new Error('설정 저장 실패'))
  }

  function handleSlideImageChoose(file) {
    if (!file) return
    setSlideImageBlob(file)
    setSlideImageRevision((rev) => rev + 1)
    saveMonitoringSlideImage(file).then((result) => {
      if (!result.ok) setSlideshowPersistenceError(result.error || new Error('이미지 저장 실패'))
    })
  }

  function handleSlideImageRemove() {
    setSlideImageBlob(null)
    setSlideImageRevision((rev) => rev + 1)
    clearMonitoringSlideImage().then((result) => {
      if (!result.ok) setSlideshowPersistenceError(result.error || new Error('이미지 삭제 실패'))
    })
  }

  function handleSlideshowStop() {
    const next = { ...slideshowConfig, enabled: false }
    setSlideshowConfig(next)
    const result = saveMonitoringSlideshowConfig(next)
    setSlideshowPersistenceError(result.ok ? null : result.error || new Error('설정 저장 실패'))
    slideshow.stop()
  }

  function handleSettingsChange() {
    setTimeZone(localStorage.getItem('time_zone') || 'KST')
    setMapTheme(localStorage.getItem('map_theme') || 'light')
    setBasemapId(knownBasemapId(localStorage.getItem('map_basemap_monitoring')))
    setAdvisoryFilter(loadAdvisoryFilterSettings())
    setGroundForecastDisplayMode(normalizeGroundForecastDisplayMode(localStorage.getItem(GROUND_FORECAST_DISPLAY_MODE_STORAGE_KEY)))
  }

  function setMode(mode) {
    setDashboardMode(mode)
    const url = new URL(window.location.href)
    url.pathname = '/monitoring'
    url.searchParams.set('mode', mode)
    window.history.pushState(null, '', `${url.pathname}${url.search}`)
  }

  function leaveMonitoring() {
    window.location.assign('/')
  }

  function renderSettingsPanel(variant = 'modal') {
    return (
      <Settings
        onClose={() => setShowSettings(false)}
        onSettingsChange={handleSettingsChange}
        timeZone={timeZone}
        setTimeZone={setTimeZone}
        mapTheme={mapTheme}
        setMapTheme={setMapTheme}
        basemapId={basemapId}
        setBasemapId={setBasemapId}
        trafficCallsignFilter={trafficCallsignFilter}
        setTrafficCallsignFilter={setTrafficCallsignFilter}
        trafficAltitudeBands={trafficAltitudeBands}
        setTrafficAltitudeBands={setTrafficAltitudeBands}
        advisoryFilter={advisoryFilter}
        setAdvisoryFilter={(next) => {
          setAdvisoryFilter(next || getDefaultAdvisoryFilterSettings())
          saveAdvisoryFilterSettings(next || getDefaultAdvisoryFilterSettings())
        }}
        groundForecastDisplayMode={groundForecastDisplayMode}
        setGroundForecastDisplayMode={setGroundForecastDisplayMode}
        isGroundMode={dashboardMode === 'ground'}
        variant={variant}
        slideshowConfig={slideshowConfig}
        slideshowStatusLabel={slideshowStatusLabel}
        slideshowImageInfo={slideImageBlob ? { name: slideImageBlob.name || '선택한 이미지' } : null}
        slideshowPersistenceNotice={slideshowPersistenceNotice}
        slideshowDisabled={isMobileLayout}
        onSlideshowConfigChange={handleSlideshowConfigChange}
        onSlideImageChoose={handleSlideImageChoose}
        onSlideImageRemove={handleSlideImageRemove}
        onSlideshowPreview={slideshow.preview}
        onSlideshowStop={handleSlideshowStop}
        onSlideshowNextPage={slideshow.nextPage}
      />
    )
  }

  const isDomesticIcao = (icao) => typeof icao === 'string' && icao.startsWith('RK')
  const airportSet = new Set([
    ...Object.keys(data.metar?.airports || {}),
    ...Object.keys(data.lightning?.airports || {}),
  ].filter(isDomesticIcao))
  ;(data.airports || [])
    .filter((airport) => airport.icao !== 'TST1' && !airport.overseas)
    .forEach((airport) => airportSet.add(airport.icao))
  const orderedAirports = (data.airports || [])
    .filter((airport) => airport.icao !== 'TST1' && !airport.overseas)
    .map((airport) => airport.icao)
    .filter((icao) => airportSet.has(icao))
  const airportList = filterMonitoringAirportChoices([
    ...orderedAirports,
    ...Array.from(airportSet).filter((icao) => !orderedAirports.includes(icao)).sort(),
  ])
  const airportOptions = airportList.map((icao) => {
    const airport = data.airports?.find((item) => item.icao === icao) || null
    const airportName = AIRPORT_NAME_KO[icao] || airport?.nameKo || airport?.name || icao
    return { icao, label: `${airportName}(${icao})` }
  })
  const selectAirport = (icao) => {
    if (isMonitoringSelectableAirport(icao)) setSelectedAirport(icao)
  }

  const selectedAirportMeta = data.airports?.find((airport) => airport.icao === selectedAirport) || null
  const metarTarget = data.metar?.airports?.[selectedAirport]
  const metarTime = (() => {
    const time = metarTarget?.header?.issue_time || metarTarget?.header?.observation_time
    return time ? formatUtc(time, timeZone) : ''
  })()
  const airportLabel = (() => {
    const icao = selectedAirport || '----'
    const airportName = AIRPORT_NAME_KO[icao] || selectedAirportMeta?.nameKo || selectedAirportMeta?.name || metarTarget?.header?.airport_name || icao
    return `${airportName}(${icao})`
  })()

  const warningPanel = (
    <WarningList
      warningData={data.warning}
      kmaSpecialWarningData={data.kmaSpecialWarning}
      groundOverviewData={data.groundOverview}
      icao={selectedAirport}
      warningTypes={data.warningTypes}
      dashboardMode={dashboardMode}
      tz={timeZone}
    />
  )
  const metarPanel = dashboardMode === 'ground' ? (
    <GroundCurrentWeatherCard
      metarData={data.metar}
      groundForecastData={data.groundForecast}
      environmentData={data.environment}
      amosData={data.amos}
      icao={selectedAirport}
      airportMeta={selectedAirportMeta}
      tz={timeZone}
      classic={groundForecastDisplayMode === GROUND_FORECAST_DISPLAY_MODE.CLASSIC}
    />
  ) : (
    <MetarCard
      metarData={data.metar}
      amosData={data.amos}
      icao={selectedAirport}
      airportMeta={selectedAirportMeta}
      metarTime={metarTime}
      version="v2"
      tz={timeZone}
      highlightFields={{}}
    />
  )
  const tafPanel = dashboardMode === 'ground' ? null : (
    <TafTimeline
      tafData={data.taf}
      icao={selectedAirport}
      version={tafVersion}
      onVersionToggle={setTafVersion}
      tz={timeZone}
      highlightTimes={{}}
    />
  )
  const mapPanel = (
    <>
      <div className="map-panel-title">기상 레이더</div>
      <MonitoringMap
        weather={data}
        selectedAirport={selectedAirport}
        onAirportSelect={selectAirport}
        basemapId={basemapId}
        slideshowSlideId={slideIdFor('map-panel')}
        slideshowContent={slideContentFor('map-panel')}
        onStopSlideshow={handleSlideshowStop}
        slideshowStatusLabel={slideshowStatusLabel}
        slideshowEffect={slideshowConfig.transitionEffect}
        slideshowDurationMs={slideshowConfig.transitionDurationMs}
        highlightZones={{}}
        canvasScale={fixedCanvasScale}
      />
    </>
  )

  return (
    // The whole page lives inside the canvas, not just the dashboard grid: the
    // whole-screen slideshow and the settings modal place themselves with `position: fixed`,
    // which resolves against this element because it is transformed. Outside it they would stay at
    // raw device size and shrink against everything else as the resolution grows.
    <div
      className={`monitoring-canvas-stage${fixedCanvasScale ? ' is-fixed' : ''}`}
      style={fixedCanvasScale ? { '--monitoring-canvas-scale': fixedCanvasScale } : undefined}
    >
      {loading && !data.metar && (
        <div className="loading-overlay">
          <p className="loading-message">Loading data...</p>
        </div>
      )}

      {error && (
        <div className="loading-overlay">
          <p className="error-message">Load failed: {error}</p>
        </div>
      )}

      {data.metar && (
        <div className="dashboard-root" data-dashboard-mode={dashboardMode} data-ground-forecast-display-mode={groundForecastDisplayMode} data-phone-task={phoneTask}>
          <div className="left-panel-header">
            <div className="phone-task-tabs" aria-label="모바일 모니터링 보기">
              <button
                type="button"
                className={`phone-task-tab ${phoneTask === 'weather' ? 'active' : ''}`}
                onClick={() => setPhoneTask('weather')}
              >
                기상정보
              </button>
              <button
                type="button"
                className={`phone-task-tab ${phoneTask === 'map' ? 'active' : ''}`}
                onClick={() => setPhoneTask('map')}
              >
                지도
              </button>
              <button
                type="button"
                className={`phone-task-tab ${phoneTask === 'settings' ? 'active' : ''}`}
                onClick={() => setPhoneTask('settings')}
              >
                설정
              </button>
            </div>
            <div className="monitoring-header-controls">
              <Header
                airports={airportOptions}
                selectedAirport={selectedAirport}
                onAirportChange={selectAirport}
                airportLabel={airportLabel}
              />
            </div>
            <div className="phone-settings-task">
              {renderSettingsPanel('inline')}
            </div>
          </div>

          <div className="right-panel-top">
            {(() => {
              const clock = monitoringClockParts(currentTime, timeZone)
              const weekdayClass = clock.weekday === '토' ? 'is-saturday' : clock.weekday === '일' ? 'is-sunday' : ''
              return <time className="monitoring-current-clock" aria-label="현재 시각" dateTime={currentTime.toISOString()}>{clock.date} <span className={`monitoring-current-clock-weekday ${weekdayClass}`.trim()}>({clock.weekday})</span> {clock.time}</time>
            })()}
          </div>

          <details ref={controlMenuRef} className="monitoring-control-menu">
            <summary aria-label="화면 제어"><MdSettings aria-hidden="true" /></summary>
            <div className="monitoring-control-menu-panel">
              <div className="panel-switch dashboard-mode-switch" role="tablist" aria-label="대시보드 모드">
                <button type="button" role="tab" aria-selected={dashboardMode === 'ops'} className={`panel-switch-btn ${dashboardMode === 'ops' ? 'active' : ''}`} onClick={() => { setMode('ops'); controlMenuRef.current?.removeAttribute('open') }}>운항</button>
                <button type="button" role="tab" aria-selected={dashboardMode === 'ground'} className={`panel-switch-btn ${dashboardMode === 'ground' ? 'active' : ''}`} onClick={() => { setMode('ground'); controlMenuRef.current?.removeAttribute('open') }}>지상</button>
              </div>
              <button type="button" className="monitoring-control-menu-button" onClick={() => { setShowSettings(true); controlMenuRef.current?.removeAttribute('open') }}>설정</button>
              <button type="button" className="monitoring-control-menu-button monitoring-exit-btn" onClick={leaveMonitoring}>나가기</button>
            </div>
          </details>

          <div className="left-panel-body">
            {warningPanel}
            {metarPanel}
            {dashboardMode === 'ground' && (groundForecastDisplayMode === GROUND_FORECAST_DISPLAY_MODE.CLASSIC ? <GroundForecastClassic groundForecastData={data.groundForecast} icao={selectedAirport} timeZone={timeZone} /> : <GroundForecastViewport groundForecastData={data.groundForecast} icao={selectedAirport} airportMeta={selectedAirportMeta} timeZone={timeZone} />)}
            {tafPanel}
          </div>

          <div className="map-panel-wrap">
            {mapPanel}
          </div>
        </div>
      )}

      {data.metar && slideshowConfig.target === 'whole-screen' && (
        <MonitoringSlideOverlay
          slideId={slideIdFor('whole-screen')}
          content={slideContentFor('whole-screen')}
          scope="whole-screen"
          onStop={handleSlideshowStop}
          statusLabel={slideshowStatusLabel}
          effect={slideshowConfig.transitionEffect}
          durationMs={slideshowConfig.transitionDurationMs}
        />
      )}

      {showSettings && renderSettingsPanel()}
    </div>
  )
}
