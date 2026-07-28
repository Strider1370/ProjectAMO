import { useEffect, useRef, useState } from 'react'
import {
  buildAlertKey,
  clearResolvedAlerts,
  dispatch,
  evaluate,
  getFirstFired,
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
import AlertPanel from './legacy/components/alerts/AlertPanel'
import AlertSound from './legacy/components/alerts/AlertSound'
import Settings from './legacy/components/alerts/Settings'
import MonitoringMap from './MonitoringMap.jsx'
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
  const [validAlertKeys, setValidAlertKeys] = useState(() => new Set())
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

  const [slideshowConfig, setSlideshowConfig] = useState(() => loadMonitoringSlideshowConfig().config)
  const [slideImageBlob, setSlideImageBlob] = useState(null)
  const [slideImageRevision, setSlideImageRevision] = useState(0)
  const [slideshowPersistenceError, setSlideshowPersistenceError] = useState(null)
  const [isMobileLayout, setIsMobileLayout] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_LAYOUT_QUERY).matches
      : false
  ))

  const prevDataRef = useRef(null)
  const wasPausedRef = useRef(false)

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

  useEffect(() => {
    setAlertCallback((alertObj) => {
      setActiveAlerts((prev) => {
        // 재발화(같은 alertKey)는 새 줄을 추가하지 않고 기존 줄을 갈아 끼운다 —
        // id·timestamp는 새 값으로 바뀌어(소리 재알림용) 있어도 highlightSince는
        // dispatch()가 이미 최초 발동 시각으로 넘겨줬으므로 강조는 재시작되지 않는다.
        const idx = alertObj.alertKey ? prev.findIndex((alert) => alert.alertKey === alertObj.alertKey) : -1
        if (idx === -1) return [alertObj, ...prev].slice(0, 20)
        const next = [...prev]
        next[idx] = alertObj
        return next
      })
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
          ...Object.keys(merged.taf?.airports || {}),
          ...Object.keys(merged.warning?.airports || {}),
          ...(merged.airports || []).filter((airport) => airport.icao !== 'TST1' && !airport.overseas).map((airport) => airport.icao),
        ].filter((icao) => icao.startsWith('RK')))
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
    const paused = !settings.global.alerts_enabled
      || isQuietHours(settings.global.quiet_hours)
      || dashboardMode === 'ground'
    if (paused) {
      wasPausedRef.current = true
      // 지상 모드에서는 목록·반짝임·소리 모두 없다(스펙 §8) — 이건 렌더 쪽(§8 게이트)에서
      // 막는다. 여기서 activeAlerts/validAlertKeys를 비우면 운항으로 돌아왔을 때
      // 쿨다운에 걸린 조건은 재발화가 아니라서 목록이 최대 cooldown_seconds 동안
      // 텅 비게 된다. 판정만 멈추고 이미 살아있는 알람은 그대로 둔다.
      return
    }

    const currentData = {
      metar: data.metar?.airports?.[selectedAirport] || null,
      taf: data.taf?.airports?.[selectedAirport] || null,
      warning: data.warning?.airports?.[selectedAirport] || null,
      lightning: data.lightning?.airports?.[selectedAirport] || null,
    }
    // 재개 직후에는 "그동안 무엇이 바뀌었나"가 아니라 "지금 무엇이 나쁜가"로 판정한다.
    const resuming = wasPausedRef.current
    wasPausedRef.current = false
    const prev = resuming ? null : prevDataRef.current
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
      dispatch(result, settings.dispatchers, selectedAirport, key, getFirstFired(key))
    }

    // 이력과 무관하게 "지금 데이터만으로도 여전히 조건이 성립하는지" 다시 확인한다.
    // previous를 비워서 재평가하면 값이 임계값을 계속 넘긴 상태인 알림만 유효로 잡힌다.
    const liveResults = evaluate(currentData, null, settings)
    setValidAlertKeys(new Set(liveResults.map((result) => buildAlertKey(result, selectedAirport))))

    clearResolvedAlerts(firedKeys, selectedAirport)
    prevDataRef.current = data
  }, [data, selectedAirport, alertDefaults, dashboardMode])

  function handleDismissAlert(id) {
    setActiveAlerts((prev) => prev.filter((alert) => alert.id !== id))
    setPreviewAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }

  // 실제 트리거가 낼 법한 문구를 흉내 낸 예시 3종. alertKey가 없어 조건 해소로 사라지지 않으므로
  // 강조 시간이 끝나고 10초 뒤 스스로 빠진다.
  // 심각도 내림차순이라 마지막에 뜬 3번이 목록 맨 아래에 들어간다 — 채운 줄이 맨 위가 아님을 보여준다.
  const PANEL_PREVIEW_SEQUENCE = [
    {
      severity: 'critical',
      title: '[예시] 낙뢰 경보: 8km 이내 3건',
      message: '최근접 5.2km | 경보 3건',
      highlight: { panel: 'map', zone: 'alert' },
    },
    {
      severity: 'warning',
      title: '[예시] METAR 저시정: 1200m',
      message: '현재 시정이 1200m으로 임계값(1500m) 이하입니다.',
      highlight: { panel: 'metar', field: 'visibility' },
    },
    {
      severity: 'info',
      title: '[예시] TAF 저시정: 2500m',
      message: 'TAF 6시간 내 예보\n시정 2500m',
      highlight: { panel: 'taf', fields: ['visibility'] },
    },
  ]

  function firePopupPreviewSequence(highlightSeconds) {
    // 화면에 실제로 그려진 시간칸이어야 강조가 붙는다. 없으면 빈 배열 —
    // 스펙 §6의 "대상을 표시할 수 없으면 생략"에 걸려 조용히 넘어간다.
    const tafTimes = (data.taf?.airports?.[selectedAirport]?.timeline || [])
      .map((slot) => slot.time)
      .filter((time) => new Date(time) > new Date())
      .slice(0, 3)

    PANEL_PREVIEW_SEQUENCE.forEach((example, index) => {
      window.setTimeout(() => {
        const previewAlert = {
          id: `preview-popup-${Date.now()}-${index}`,
          ...example,
          highlight: example.highlight.panel === 'taf'
            ? { ...example.highlight, times: tafTimes }
            : example.highlight,
          icao: selectedAirport || DEFAULT_AIRPORT,
          triggerId: 'preview_popup',
          timestamp: Date.now(),
        }
        setPreviewAlerts((prev) => [previewAlert, ...prev].slice(0, 10))
        // 강조가 끝나고 10초 뒤 스스로 빠진다. 예시는 조건 해소 판정이 없다.
        window.setTimeout(() => {
          setPreviewAlerts((prev) => prev.filter((alert) => alert.id !== previewAlert.id))
        }, highlightSeconds * 1000 + 10000)
      }, index * 600)
    })
  }

  function handlePreviewAlert(channel, previewDispatchers = null) {
    const settings = alertDefaults ? resolveSettings(alertDefaults) : null
    if (!settings) return
    const dispatchers = previewDispatchers || settings.dispatchers

    if (channel === 'popup') {
      firePopupPreviewSequence(dispatchers.popup?.highlight_seconds ?? 60)
      return
    }

    // 소리 예시: 목록에 줄을 만들되 강조 대상이 없고, 재생이 끝나면 곧 사라진다.
    const previewAlert = {
      id: `preview-sound-${Date.now()}`,
      severity: 'critical',
      title: '소리 알림 예시',
      message: '현재 설정된 사운드 크기와 패턴으로 재생됩니다.',
      icao: selectedAirport || DEFAULT_AIRPORT,
      triggerId: 'preview_sound',
      timestamp: Date.now(),
      previewChannels: { sound: true },
    }
    setPreviewAlerts((prev) => [previewAlert, ...prev].slice(0, 10))

    const repeat = dispatchers.sound?.repeat_count?.critical ?? 3
    window.setTimeout(() => {
      setPreviewAlerts((prev) => prev.filter((alert) => alert.id !== previewAlert.id))
    }, Math.max(repeat * 500 + 1000, 2500))
  }

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
        return <MonitoringWxInfoSlide info={selectedAirportInfo} />
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
      />
    )
  }

  const settings = alertDefaults ? resolveSettings(alertDefaults) : null
  const popupAlerts = [...previewAlerts, ...activeAlerts]
  const soundAlerts = [...previewAlerts.filter((alert) => alert.previewChannels?.sound), ...activeAlerts]

  // 강조는 새 알람 창 안의 것만. 창 밖으로 나가면 요소는 평소 모습으로 돌아간다.
  // 동시에 여러 알람이 살아 있으면 각자의 칸이 각자의 심각도 색으로 깜빡인다(스펙 §7).
  // 지도(mapPanel)는 모드와 무관하게 항상 그려지므로, 지상 모드에서는 여기서
  // 강조 자체를 비운다 — activeAlerts를 그대로 둔 채로도 지도 링이 깜빡이지 않게 한다.
  const highlightMs = (settings?.dispatchers?.popup?.highlight_seconds ?? 60) * 1000
  // highlightSince: 최초 발동 시각. 재발화(쿨다운 만료 후 재알림)해도 이 값은 그대로라
  // 조건이 이어지는 동안 강조가 재시작되지 않는다. 없으면(예시 알람 등) timestamp로 대체.
  const highlighting = dashboardMode === 'ground' ? [] : popupAlerts.filter(
    (alert) => alert.highlight && Date.now() - (alert.highlightSince ?? alert.timestamp) < highlightMs
  )

  // 같은 대상에 둘이 겹치면 더 심각한 쪽 색을 남긴다.
  const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 }
  const collect = (panel, keyOf) => {
    const out = {}
    for (const alert of highlighting) {
      if (alert.highlight.panel !== panel) continue
      for (const key of keyOf(alert.highlight)) {
        const before = out[key]
        if (!before || (SEVERITY_RANK[alert.severity] ?? Infinity) < (SEVERITY_RANK[before] ?? Infinity)) {
          out[key] = alert.severity
        }
      }
    }
    return out
  }

  const metarHighlightFields = collect('metar', (h) => (h.field ? [h.field] : []))
  const tafHighlightTimes = collect('taf', (h) => h.times || [])
  const mapHighlightZones = collect('map', (h) => (h.zone ? [h.zone] : []))

  // 강조 창이 닫히는 순간을 잡으려면 재렌더가 필요하다. 강조 중일 때만 돈다.
  const [, setHighlightTick] = useState(0)
  useEffect(() => {
    if (highlighting.length === 0) return undefined
    const timer = window.setInterval(() => setHighlightTick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [highlighting.length])

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
      highlightFields={metarHighlightFields}
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
      highlightTimes={tafHighlightTimes}
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
        slideshowSlideId={slideIdFor('map-panel')}
        slideshowContent={slideContentFor('map-panel')}
        onStopSlideshow={handleSlideshowStop}
        slideshowStatusLabel={slideshowStatusLabel}
        slideshowEffect={slideshowConfig.transitionEffect}
        slideshowDurationMs={slideshowConfig.transitionDurationMs}
        highlightZones={mapHighlightZones}
      />
    </>
  )

  return (
    <>
      {settings && dashboardMode !== 'ground' && (
        <>
          <AlertPanel alerts={popupAlerts} validKeys={validAlertKeys} onDismiss={handleDismissAlert} settings={settings.dispatchers.popup} />
          <AlertSound alerts={soundAlerts} settings={settings.dispatchers.sound} />
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
    </>
  )
}
