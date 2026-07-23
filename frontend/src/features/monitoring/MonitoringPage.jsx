import { useEffect, useRef, useState } from 'react'
import {
  buildAlertKey,
  clearResolvedAlerts,
  dispatch,
  evaluate,
  isInCooldown,
  isQuietHours,
  recordAlert,
  resolveSettings,
  setAlertCallback,
} from './legacy/utils/alerts'
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
import GroundForecastPanel from './legacy/components/GroundForecastPanel'
import GroundHourlyStrip from './legacy/components/GroundHourlyStrip'
import GroundCurrentWeatherCard from './legacy/components/GroundCurrentWeatherCard'
import AlertPopup from './legacy/components/alerts/AlertPopup'
import AlertSound from './legacy/components/alerts/AlertSound'
import AlertMarquee from './legacy/components/alerts/AlertMarquee'
import Settings from './legacy/components/alerts/Settings'
import MonitoringMap from './MonitoringMap.jsx'
import { useSnapshotPolling } from '../../app/useWeatherPolling.js'
import {
  buildMonitoringSnapshot,
  detectMonitoringSnapshotChanges,
  fetchMonitoringSnapshotMeta,
  loadChangedMonitoringData,
  loadMonitoringAlertDefaults,
  loadMonitoringInitialData,
  nextMonitoringSnapshot,
} from './monitoringApi.js'
import './legacy/App.css'
import './MonitoringPage.css'

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
  const [alertDefaults, setAlertDefaults] = useState(null)
  const [activeAlerts, setActiveAlerts] = useState([])
  const [previewAlerts, setPreviewAlerts] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [phoneTask, setPhoneTask] = useState('weather')
  const [tafVersion, setTafVersion] = useState(() => localStorage.getItem('taf_view_mode') || 'v2')
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem('time_zone') || 'KST')
  const [mapTheme, setMapTheme] = useState(() => localStorage.getItem('map_theme') || 'light')
  const [basemapId, setBasemapId] = useState(() => localStorage.getItem('map_basemap_monitoring') || 'standard')
  const [trafficCallsignFilter, setTrafficCallsignFilter] = useState(() => localStorage.getItem('traffic_callsign_filter') || '')
  const [trafficAltitudeBands, setTrafficAltitudeBands] = useState(() => (
    readJsonLocalStorage('traffic_altitude_bands', ALL_ALTITUDE_BANDS)
  ))
  const [advisoryFilter, setAdvisoryFilter] = useState(() => loadAdvisoryFilterSettings())

  const prevDataRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('selected_airport_monitoring', selectedAirport || '')
    setActiveAlerts([])
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
    setAlertCallback((alertObj) => {
      setActiveAlerts((prev) => [alertObj, ...prev].slice(0, 20))
    })
    return () => setAlertCallback(null)
  }, [])

  const intervalMs = alertDefaults
    ? (resolveSettings(alertDefaults).global.poll_interval_seconds || 30) * 1000
    : null

  const {
    data: rawData,
    loading,
    initialError: error,
  } = useSnapshotPolling({
    loadInitialData: loadMonitoringInitialData,
    selectInitialData: ({ data: initialData }) => initialData,
    onInitialData: ({ data: merged, alertDefaults: defaults }) => {
      setAlertDefaults(defaults)
      setSelectedAirport((prev) => {
        const available = new Set([
          ...Object.keys(merged.metar?.airports || {}),
          ...Object.keys(merged.metarOverseas?.airports || {}),
          ...Object.keys(merged.taf?.airports || {}),
          ...Object.keys(merged.tafOverseas?.airports || {}),
          ...Object.keys(merged.warning?.airports || {}),
          ...(merged.airports || []).filter((airport) => airport.icao !== 'TST1').map((airport) => airport.icao),
        ])
        if (prev && available.has(prev)) return prev
        if (available.has(DEFAULT_AIRPORT)) return DEFAULT_AIRPORT
        return Array.from(available)[0] || null
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
    logPrefix: '[Monitoring]',
  })
  const data = rawData || {}

  useEffect(() => {
    if (!selectedAirport || !alertDefaults) return
    const settings = resolveSettings(alertDefaults)
    if (!settings.global.alerts_enabled || isQuietHours(settings.global.quiet_hours)) return

    const currentData = {
      metar: data.metar?.airports?.[selectedAirport] || null,
      taf: data.taf?.airports?.[selectedAirport] || null,
      warning: data.warning?.airports?.[selectedAirport] || null,
      lightning: data.lightning?.airports?.[selectedAirport] || null,
    }
    const prev = prevDataRef.current
    const previousData = prev ? {
      metar: prev.metar?.airports?.[selectedAirport] || null,
      taf: prev.taf?.airports?.[selectedAirport] || null,
      warning: prev.warning?.airports?.[selectedAirport] || null,
      lightning: prev.lightning?.airports?.[selectedAirport] || null,
    } : null

    const results = evaluate(currentData, previousData, settings)
    const firedKeys = new Set()
    for (const result of results) {
      const key = buildAlertKey(result, selectedAirport)
      firedKeys.add(key)
      if (isInCooldown(key, settings.global.cooldown_seconds)) continue
      recordAlert(key)
      dispatch(result, settings.dispatchers, selectedAirport)
    }

    clearResolvedAlerts(firedKeys)
    prevDataRef.current = data
  }, [data, selectedAirport, alertDefaults])

  function handleDismissAlert(id) {
    setActiveAlerts((prev) => prev.filter((alert) => alert.id !== id))
    setPreviewAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }

  function handlePreviewAlert(channel, previewDispatchers = null) {
    const settings = alertDefaults ? resolveSettings(alertDefaults) : null
    if (!settings) return
    const dispatchers = previewDispatchers || settings.dispatchers
    const previewChannels = {
      popup: channel === 'popup',
      sound: channel === 'sound',
      marquee: channel === 'marquee',
    }
    const previewAlert = {
      id: `preview-${channel}-${Date.now()}`,
      severity: channel === 'sound' ? 'critical' : 'warning',
      title: channel === 'popup' ? '팝업 알림 예시' : channel === 'sound' ? '소리 알림 예시' : '하단 알림 바 예시',
      message: channel === 'popup'
        ? '실제 알림이 뜨면 이런 팝업이 표시됩니다.'
        : channel === 'sound'
          ? '현재 설정된 사운드 크기와 패턴으로 재생됩니다.'
          : '하단 알림 바에는 이런 식으로 메시지가 표시됩니다.',
      icao: selectedAirport || DEFAULT_AIRPORT,
      triggerId: `preview_${channel}`,
      timestamp: new Date().toISOString(),
      previewChannels,
    }
    setPreviewAlerts((prev) => [previewAlert, ...prev].slice(0, 10))

    const popupLifetimeMs = previewChannels.popup
      ? Math.max((dispatchers.popup?.auto_dismiss_seconds ?? 10) * 1000, 3000)
      : 0
    const marqueeLifetimeMs = previewChannels.marquee
      ? Math.max((dispatchers.marquee?.show_duration_seconds ?? 30) * 1000, 5000)
      : 0
    const soundRepeat = dispatchers.sound?.repeat_count?.critical ?? 3
    const soundLifetimeMs = previewChannels.sound ? Math.max(soundRepeat * 500 + 1000, 2500) : 0
    const lifetimeMs = Math.max(popupLifetimeMs, marqueeLifetimeMs, soundLifetimeMs, 4000)

    window.setTimeout(() => {
      setPreviewAlerts((prev) => prev.filter((alert) => alert.id !== previewAlert.id))
    }, lifetimeMs)
  }

  function handleSettingsChange() {
    loadMonitoringAlertDefaults().then((defaults) => setAlertDefaults({ ...defaults }))
    setTimeZone(localStorage.getItem('time_zone') || 'KST')
    setMapTheme(localStorage.getItem('map_theme') || 'light')
    setBasemapId(localStorage.getItem('map_basemap_monitoring') || 'standard')
    setAdvisoryFilter(loadAdvisoryFilterSettings())
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
    if (!alertDefaults) return null

    return (
      <Settings
        defaults={alertDefaults}
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
        onPreviewAlert={handlePreviewAlert}
        variant={variant}
      />
    )
  }

  const settings = alertDefaults ? resolveSettings(alertDefaults) : null
  const popupAlerts = [...previewAlerts.filter((alert) => alert.previewChannels?.popup), ...activeAlerts]
  const soundAlerts = [...previewAlerts.filter((alert) => alert.previewChannels?.sound), ...activeAlerts]
  const marqueeAlerts = [...previewAlerts.filter((alert) => alert.previewChannels?.marquee), ...activeAlerts]
  const airportSet = new Set([
    ...Object.keys(data.metar?.airports || {}),
    ...Object.keys(data.lightning?.airports || {}),
  ])
  ;(data.airports || [])
    .filter((airport) => airport.icao !== 'TST1')
    .forEach((airport) => airportSet.add(airport.icao))
  const orderedAirports = (data.airports || [])
    .filter((airport) => airport.icao !== 'TST1')
    .map((airport) => airport.icao)
    .filter((icao) => airportSet.has(icao))
  const airportList = [...orderedAirports, ...Array.from(airportSet).filter((icao) => !orderedAirports.includes(icao)).sort()]
  const airportOptions = airportList.map((icao) => {
    const airport = data.airports?.find((item) => item.icao === icao) || null
    const airportName = AIRPORT_NAME_KO[icao] || airport?.nameKo || airport?.name || icao
    return { icao, label: `${airportName}(${icao})` }
  })

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
    />
  )
  const tafPanel = dashboardMode === 'ground' ? (
    <GroundForecastPanel groundForecastData={data.groundForecast} icao={selectedAirport} />
  ) : (
    <TafTimeline
      tafData={data.taf}
      icao={selectedAirport}
      version={tafVersion}
      onVersionToggle={setTafVersion}
      tz={timeZone}
    />
  )
  const mapPanel = (
    <>
      <div className="map-panel-title">기상 레이더</div>
      <MonitoringMap
        weather={data}
        selectedAirport={selectedAirport}
        onAirportSelect={setSelectedAirport}
        basemapId={basemapId}
      />
    </>
  )

  return (
    <>
      {settings && (
        <>
          <AlertPopup alerts={popupAlerts} onDismiss={handleDismissAlert} settings={settings.dispatchers.popup} />
          <AlertSound alerts={soundAlerts} settings={settings.dispatchers.sound} />
          <AlertMarquee alerts={marqueeAlerts} settings={settings.dispatchers.marquee} />
        </>
      )}

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
        <div className="dashboard-root" data-dashboard-mode={dashboardMode} data-phone-task={phoneTask}>
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
                onAirportChange={setSelectedAirport}
                airportLabel={airportLabel}
              />
            </div>
            <div className="phone-settings-task">
              {renderSettingsPanel('inline')}
            </div>
          </div>

          <div className="right-panel-top">
            <div className="panel-switch dashboard-mode-switch" role="tablist" aria-label="대시보드 모드">
              <button
                type="button"
                role="tab"
                aria-selected={dashboardMode === 'ops'}
                className={`panel-switch-btn ${dashboardMode === 'ops' ? 'active' : ''}`}
                onClick={() => setMode('ops')}
              >
                운항
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dashboardMode === 'ground'}
                className={`panel-switch-btn ${dashboardMode === 'ground' ? 'active' : ''}`}
                onClick={() => setMode('ground')}
              >
                지상
              </button>
            </div>
            <button
              className="settings-icon-btn"
              onClick={() => setShowSettings(true)}
              title="설정"
              aria-label="설정"
            >
              &#8943;
            </button>
            <button
              type="button"
              className="monitoring-exit-btn"
              onClick={leaveMonitoring}
              title="메인 화면으로 나가기"
              aria-label="메인 화면으로 나가기"
            >
              나가기
            </button>
          </div>

          <div className="left-panel-body">
            {warningPanel}
            {metarPanel}
            {dashboardMode === 'ground' && (
              <GroundHourlyStrip groundForecastData={data.groundForecast} icao={selectedAirport} />
            )}
            {tafPanel}
          </div>

          <div className="map-panel-wrap">
            {mapPanel}
          </div>
        </div>
      )}

      {showSettings && renderSettingsPanel()}
    </>
  )
}
