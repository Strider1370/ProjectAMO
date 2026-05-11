import { useCallback, useEffect, useRef, useState } from 'react'
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
import {
  DEFAULT_AIRPORT_MINIMA_RULES,
  formatUtc,
  getFlightCategory,
  normalizeAirportMinimaSettings,
} from './legacy/utils/helpers'
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
import GroundCurrentWeatherCard from './legacy/components/GroundCurrentWeatherCard'
import AlertPopup from './legacy/components/alerts/AlertPopup'
import AlertSound from './legacy/components/alerts/AlertSound'
import AlertMarquee from './legacy/components/alerts/AlertMarquee'
import Settings from './legacy/components/alerts/Settings'
import MonitoringMap from './MonitoringMap.jsx'
import {
  fetchMonitoringSnapshotMeta,
  loadChangedMonitoringData,
  loadMonitoringAlertDefaults,
  loadMonitoringData,
  loadMonitoringStaticData,
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

function hashOf(entry) {
  return entry?.hash ?? null
}

function tmOf(entry) {
  return entry?.tm ?? null
}

function overlayKey(entry) {
  if (!entry) return null
  return [
    entry.tmfc || '',
    entry.source_hash || '',
    entry.updated_at || '',
    entry.render_version || '',
  ].join('|')
}

function buildSnapshotStateFromData(data) {
  return {
    metar: data.metar?.content_hash || null,
    taf: data.taf?.content_hash || null,
    warning: data.warning?.content_hash || null,
    sigmet: data.sigmet?.content_hash || null,
    airmet: data.airmet?.content_hash || null,
    sigwxLow: data.sigwxLow?.content_hash || null,
    amos: data.amos?.content_hash || null,
    lightning: data.lightning?.content_hash || null,
    adsb: data.adsb?.content_hash || null,
    groundForecast: data.groundForecast?.content_hash || null,
    groundOverview: data.groundOverview?.content_hash || null,
    environment: data.environment?.content_hash || null,
    airportInfo: data.airportInfo?.content_hash || null,
    echo: data.echoMeta?.tm || null,
    satellite: data.satMeta?.tm || null,
    sigwxFrontMeta: overlayKey(data.sigwxFrontMeta),
    sigwxCloudMeta: overlayKey(data.sigwxCloudMeta),
  }
}

function detectChanges(snapshot, saved) {
  const sigwxLow = snapshot?.sigwxLow || snapshot?.sigwx_low
  const groundForecast = snapshot?.groundForecast || snapshot?.ground_forecast
  const groundOverview = snapshot?.groundOverview || snapshot?.ground_overview
  const echo = snapshot?.echoMeta || snapshot?.echo
  const satellite = snapshot?.satMeta || snapshot?.satellite

  return {
    metar: hashOf(snapshot?.metar) !== saved.metar,
    taf: hashOf(snapshot?.taf) !== saved.taf,
    warning: hashOf(snapshot?.warning) !== saved.warning,
    sigmet: hashOf(snapshot?.sigmet) !== saved.sigmet,
    airmet: hashOf(snapshot?.airmet) !== saved.airmet,
    sigwxLow: hashOf(sigwxLow) !== saved.sigwxLow,
    amos: hashOf(snapshot?.amos) !== saved.amos,
    lightning: hashOf(snapshot?.lightning) !== saved.lightning,
    adsb: hashOf(snapshot?.adsb) !== saved.adsb,
    groundForecast: hashOf(groundForecast) !== saved.groundForecast,
    groundOverview: hashOf(groundOverview) !== saved.groundOverview,
    environment: hashOf(snapshot?.environment) !== saved.environment,
    airportInfo: hashOf(snapshot?.airportInfo) !== saved.airportInfo,
    echoMeta: tmOf(echo) !== saved.echo,
    satMeta: tmOf(satellite) !== saved.satellite,
    sigwxFrontMeta: overlayKey(snapshot?.sigwxFrontMeta) !== saved.sigwxFrontMeta,
    sigwxCloudMeta: overlayKey(snapshot?.sigwxCloudMeta) !== saved.sigwxCloudMeta,
  }
}

function nextSnapshotState(snapshot, changedData, saved) {
  const sigwxLow = snapshot?.sigwxLow || snapshot?.sigwx_low
  const groundForecast = snapshot?.groundForecast || snapshot?.ground_forecast
  const groundOverview = snapshot?.groundOverview || snapshot?.ground_overview
  const echo = snapshot?.echoMeta || snapshot?.echo
  const satellite = snapshot?.satMeta || snapshot?.satellite

  return {
    metar: changedData.metar?.content_hash ?? hashOf(snapshot?.metar) ?? saved.metar,
    taf: changedData.taf?.content_hash ?? hashOf(snapshot?.taf) ?? saved.taf,
    warning: changedData.warning?.content_hash ?? hashOf(snapshot?.warning) ?? saved.warning,
    sigmet: changedData.sigmet?.content_hash ?? hashOf(snapshot?.sigmet) ?? saved.sigmet,
    airmet: changedData.airmet?.content_hash ?? hashOf(snapshot?.airmet) ?? saved.airmet,
    sigwxLow: changedData.sigwxLow?.content_hash ?? hashOf(sigwxLow) ?? saved.sigwxLow,
    amos: changedData.amos?.content_hash ?? hashOf(snapshot?.amos) ?? saved.amos,
    lightning: changedData.lightning?.content_hash ?? hashOf(snapshot?.lightning) ?? saved.lightning,
    adsb: changedData.adsb?.content_hash ?? hashOf(snapshot?.adsb) ?? saved.adsb,
    groundForecast: changedData.groundForecast?.content_hash ?? hashOf(groundForecast) ?? saved.groundForecast,
    groundOverview: changedData.groundOverview?.content_hash ?? hashOf(groundOverview) ?? saved.groundOverview,
    environment: changedData.environment?.content_hash ?? hashOf(snapshot?.environment) ?? saved.environment,
    airportInfo: changedData.airportInfo?.content_hash ?? hashOf(snapshot?.airportInfo) ?? saved.airportInfo,
    echo: changedData.echoMeta?.tm ?? tmOf(echo) ?? saved.echo,
    satellite: changedData.satMeta?.tm ?? tmOf(satellite) ?? saved.satellite,
    sigwxFrontMeta: overlayKey(changedData.sigwxFrontMeta) ?? overlayKey(snapshot?.sigwxFrontMeta) ?? saved.sigwxFrontMeta,
    sigwxCloudMeta: overlayKey(changedData.sigwxCloudMeta) ?? overlayKey(snapshot?.sigwxCloudMeta) ?? saved.sigwxCloudMeta,
  }
}

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
  const [data, setData] = useState({})
  const [selectedAirport, setSelectedAirport] = useState(() => (
    localStorage.getItem('selected_airport_monitoring') || DEFAULT_AIRPORT
  ))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [alertDefaults, setAlertDefaults] = useState(null)
  const [activeAlerts, setActiveAlerts] = useState([])
  const [previewAlerts, setPreviewAlerts] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [tafVersion, setTafVersion] = useState(() => localStorage.getItem('taf_view_mode') || 'v2')
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem('time_zone') || 'KST')
  const [mapTheme, setMapTheme] = useState(() => localStorage.getItem('map_theme') || 'light')
  const [trafficCallsignFilter, setTrafficCallsignFilter] = useState(() => localStorage.getItem('traffic_callsign_filter') || '')
  const [trafficAltitudeBands, setTrafficAltitudeBands] = useState(() => (
    readJsonLocalStorage('traffic_altitude_bands', ALL_ALTITUDE_BANDS)
  ))
  const [airportMinimaSettings, setAirportMinimaSettings] = useState(() => (
    normalizeAirportMinimaSettings(readJsonLocalStorage('airport_minima_settings', DEFAULT_AIRPORT_MINIMA_RULES))
  ))
  const [advisoryFilter, setAdvisoryFilter] = useState(() => loadAdvisoryFilterSettings())

  const prevDataRef = useRef(null)
  const pollingRef = useRef(null)
  const pollingInFlightRef = useRef(false)
  const snapshotRef = useRef(buildSnapshotStateFromData({}))

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
    localStorage.setItem('taf_view_mode', tafVersion)
  }, [tafVersion])

  useEffect(() => {
    localStorage.setItem('traffic_callsign_filter', trafficCallsignFilter)
  }, [trafficCallsignFilter])

  useEffect(() => {
    localStorage.setItem('traffic_altitude_bands', JSON.stringify(trafficAltitudeBands))
  }, [trafficAltitudeBands])

  useEffect(() => {
    localStorage.setItem('airport_minima_settings', JSON.stringify(airportMinimaSettings))
  }, [airportMinimaSettings])

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

  const initialLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ airports, warningTypes, alertDefaults: defaults }, result] = await Promise.all([
        loadMonitoringStaticData(),
        loadMonitoringData(),
      ])
      const merged = {
        ...result,
        airports: result.airports?.length ? result.airports : airports,
        warningTypes: result.warningTypes || warningTypes,
      }

      setAlertDefaults(defaults)
      setData(merged)

      setSelectedAirport((prev) => {
        const available = new Set([
          ...Object.keys(merged.metar?.airports || {}),
          ...Object.keys(merged.taf?.airports || {}),
          ...Object.keys(merged.warning?.airports || {}),
          ...(merged.airports || []).filter((airport) => airport.icao !== 'TST1').map((airport) => airport.icao),
        ])
        if (prev && available.has(prev)) return prev
        if (available.has(DEFAULT_AIRPORT)) return DEFAULT_AIRPORT
        return Array.from(available)[0] || null
      })

      snapshotRef.current = buildSnapshotStateFromData(merged)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const pollOnce = useCallback(async () => {
    if (pollingInFlightRef.current) return
    pollingInFlightRef.current = true

    try {
      const snapshot = await fetchMonitoringSnapshotMeta()
      if (!snapshot) return

      const changes = detectChanges(snapshot, snapshotRef.current)
      if (!Object.values(changes).some(Boolean)) return

      const changedData = await loadChangedMonitoringData(changes)
      setData((prev) => ({ ...prev, ...changedData }))
      snapshotRef.current = nextSnapshotState(snapshot, changedData, snapshotRef.current)
    } finally {
      pollingInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    initialLoad()
  }, [initialLoad])

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

  useEffect(() => {
    if (!alertDefaults) return undefined
    const settings = resolveSettings(alertDefaults)
    const intervalSec = settings.global.poll_interval_seconds || 30
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(() => pollOnce(), intervalSec * 1000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [alertDefaults, pollOnce])

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
    setAirportMinimaSettings(normalizeAirportMinimaSettings(
      readJsonLocalStorage('airport_minima_settings', DEFAULT_AIRPORT_MINIMA_RULES),
    ))
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

  const metarVis = metarTarget?.observation?.visibility?.value ?? null
  const metarClouds = metarTarget?.observation?.clouds || []
  const metarCeiling = metarClouds
    .filter((cloud) => cloud.amount === 'BKN' || cloud.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null
  getFlightCategory(metarVis, metarCeiling, selectedAirport, airportMinimaSettings)

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
      minimaSettings={airportMinimaSettings}
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
      minimaSettings={airportMinimaSettings}
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
        <div className="dashboard-root" data-dashboard-mode={dashboardMode}>
          <div className="left-panel-header">
            <Header
              airports={airportOptions}
              selectedAirport={selectedAirport}
              onAirportChange={setSelectedAirport}
              airportLabel={airportLabel}
            />
          </div>

          <div className="right-panel-top">
            <div className="panel-switch dashboard-mode-switch" role="tablist" aria-label="대시보드 모드">
              <button
                type="button"
                className={`panel-switch-btn ${dashboardMode === 'ops' ? 'active' : ''}`}
                onClick={() => setMode('ops')}
              >
                운항
              </button>
              <button
                type="button"
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
            {tafPanel}
          </div>

          <div className="map-panel-wrap">
            {mapPanel}
          </div>
        </div>
      )}

      {showSettings && alertDefaults && (
        <Settings
          defaults={alertDefaults}
          onClose={() => setShowSettings(false)}
          onSettingsChange={handleSettingsChange}
          timeZone={timeZone}
          setTimeZone={setTimeZone}
          mapTheme={mapTheme}
          setMapTheme={setMapTheme}
          trafficCallsignFilter={trafficCallsignFilter}
          setTrafficCallsignFilter={setTrafficCallsignFilter}
          trafficAltitudeBands={trafficAltitudeBands}
          setTrafficAltitudeBands={setTrafficAltitudeBands}
          minimaSettings={airportMinimaSettings}
          setMinimaSettings={setAirportMinimaSettings}
          advisoryFilter={advisoryFilter}
          setAdvisoryFilter={(next) => {
            setAdvisoryFilter(next || getDefaultAdvisoryFilterSettings())
            saveAdvisoryFilterSettings(next || getDefaultAdvisoryFilterSettings())
          }}
          onPreviewAlert={handlePreviewAlert}
        />
      )}
    </>
  )
}
