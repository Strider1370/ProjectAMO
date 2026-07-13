import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import AirportPanel from '../features/airport-panel/AirportPanel.jsx'
import MapView from '../features/map/MapView.jsx'
import useWeatherPolling from './useWeatherPolling.js'
import Sidebar from './layout/Sidebar.jsx'
import MobileTaskBar from './layout/MobileTaskBar.jsx'
import MobileMapOverlay from './layout/MobileMapOverlay.jsx'
import MobileMoreMenu from './layout/MobileMoreMenu.jsx'
import SettingsModal from '../features/settings/SettingsModal.jsx'
import AuthModal from '../features/auth/AuthModal.jsx'
import { AuthProvider } from '../features/auth/AuthContext.jsx'
import UpdatesModal from '../features/about/UpdatesModal.jsx'
import SearchPalette from '../features/search/SearchPalette.jsx'
import FlightAlertDetail from '../features/notifications/FlightAlertDetail.jsx'
import { listSavedRoutes } from '../features/route-briefing/lib/routeStore.js'
import { buildSearchCatalog } from '../features/map/layerActions.js'
import { mergeAdvisoryPayloads, mergeAirportPayloads } from '../api/weatherApi.js'
import { useLastSeenVersion } from '../features/about/useLastSeenVersion.js'
import useIsMobile from '../shared/ui/useIsMobile.js'
import { TimeZoneProvider, useTimeZone } from '../shared/timezone/TimeZoneContext.jsx'

const MonitoringPage = lazy(() => import('../features/monitoring/MonitoringPage.jsx'))
const SandboxPage = lazy(() => import('../features/sandbox/SandboxPage.jsx'))
const DesignTestPage = lazy(() => import('../features/design-test/DesignTestPage.jsx'))
const AdminPage = lazy(() => import('../features/admin/AdminPage.jsx'))
const DeveloperPage = lazy(() => import('../features/developer/DeveloperPage.jsx'))

function formatTimeByTz(ms, tz) {
  const d = tz === 'KST' ? new Date(ms + 9 * 3600 * 1000) : new Date(ms)
  const year  = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day   = String(d.getUTCDate()).padStart(2, '0')
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const mins  = String(d.getUTCMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${mins} ${tz}`
}

function MainAppShell() {
  const { tz } = useTimeZone()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [activePanel, setActivePanel] = useState(null)
  const [selectedAirport, setSelectedAirport] = useState(() => {
    // 딥링크: ?airport=RKSI 로 공항패널 바로 열기 (공유 링크 + Playwright 캡처용)
    const p = new URLSearchParams(window.location.search).get('airport')
    return p ? p.toUpperCase() : null
  })
  const [deeplinkFlightId, setDeeplinkFlightId] = useState(() => {
    // 딥링크: ?flight=<routeId> 로 비행 알림 에스컬레이션 화면 바로 열기 (Task 10)
    const p = new URLSearchParams(window.location.search).get('flight')
    return p ? Number(p) : null
  })
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
  const [mobileTask, setMobileTask] = useState('map')
  const [layerCounts, setLayerCounts] = useState({ aviation: 0, met: 0 })
  const [searchOpen, setSearchOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const mapRef = useRef(null)
  const isMobile = useIsMobile()
  const { weatherData, requestDeferredWeatherData } = useWeatherPolling()
  const { hasUpdate, markSeen } = useLastSeenVersion()

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activePanel === 'updates') markSeen()
  }, [activePanel, markSeen])

  // Auto-open the update board on first visit after a new release (once, on mount).
  useEffect(() => {
    if (hasUpdate) setActivePanel('updates')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function togglePanel(panelId) {
    setActivePanel((cur) => (cur === panelId ? null : panelId))
  }

  const selectedAirportMeta = useMemo(
    () => weatherData?.airports?.find((a) => a.icao === selectedAirport) || null,
    [weatherData, selectedAirport],
  )

  const searchCatalog = useMemo(
    () => buildSearchCatalog(weatherData?.airports || []),
    [weatherData],
  )

  const mapMetarData = useMemo(
    () => mergeAirportPayloads(weatherData?.metar || null, weatherData?.metarOverseas || null),
    [weatherData?.metar, weatherData?.metarOverseas],
  )
  const mapSigmetData = useMemo(
    () => mergeAdvisoryPayloads(weatherData?.sigmet || null, weatherData?.sigmetOverseas || null),
    [weatherData?.sigmet, weatherData?.sigmetOverseas],
  )

  // 경보 종류 → 짧은 한글 라벨(칩용). wrng_type_key 우선, 없으면 원문 이름.
  const WARNING_KO = {
    WIND_SHEAR: '급변풍', LOW_VISIBILITY: '저시정', STRONG_WIND: '강풍', HEAVY_RAIN: '호우',
    LOW_CEILING: '저운고', THUNDERSTORM: '뇌우', TYPHOON: '태풍', HEAVY_SNOW: '대설', YELLOW_DUST: '황사',
  }
  const warningTypeKo = (w) => WARNING_KO[w?.wrng_type_key] || w?.wrng_type_name || '경보'
  // 활성 공항경보가 있는 공항 ICAO 목록(상시 위험 요약 칩용).
  const warnedAirports = useMemo(
    () => Object.entries(weatherData?.warning?.airports || {})
      .filter(([, w]) => (w?.warnings?.length || 0) > 0)
      .map(([icao]) => icao),
    [weatherData],
  )
  // 공항별 경보 종류 짧은 라벨(칩 펼침에 "RKPC · 급변풍"처럼). 같은 종류 중복 제거.
  const warningLabels = useMemo(() => {
    const out = {}
    for (const [icao, w] of Object.entries(weatherData?.warning?.airports || {})) {
      const labels = [...new Set((w?.warnings || []).map(warningTypeKo))]
      if (labels.length) out[icao] = labels
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherData])

  // Cmd/Ctrl+K → 검색 팔레트 (사이드바 검색 아이콘과 동일).
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 검색 결과 실행 — 패널 열기/공항 선택은 여기서, 레이어·베이스맵은 MapView ref(상태가 거기 있음).
  function runAction(entry) {
    switch (entry.type) {
      case 'airport':
        setSelectedAirport(entry.id)
        break
      case 'panel':
        if (entry.href) window.location.assign(entry.href)
        else setActivePanel(entry.panelId)
        break
      case 'met':
        setActivePanel('met')
        mapRef.current?.setLayerOn(entry.id, 'met')
        break
      case 'aviation':
        setActivePanel('aviation')
        mapRef.current?.setLayerOn(entry.id, 'aviation')
        break
      case 'basemap':
        mapRef.current?.switchBasemap(entry.id)
        break
      default:
        break
    }
  }

  // Map the mobile task switcher onto the existing activePanel mechanism.
  function selectMobileTask(task) {
    setMobileTask(task)
    setSelectedAirport(null) // switching tasks dismisses the airport detail panel
    if (task === 'route') setActivePanel('route-check')
    else setActivePanel((cur) => (['aviation', 'met', 'route-check'].includes(cur) ? null : cur))
  }

  return (
    <div className={`app ${isSidebarExpanded ? 'sidebar-is-expanded' : ''}`}>
      <Sidebar
        activePanel={activePanel}
        onPanelToggle={togglePanel}
        isExpanded={isSidebarExpanded}
        onExpandToggle={setIsSidebarExpanded}
        hasUpdate={hasUpdate}
        layerCounts={layerCounts}
        onSearchOpen={() => setSearchOpen(true)}
        onProfileClick={() => setAuthOpen(true)}
      />
      <main className="map-shell">
        <MapView
          ref={mapRef}
          activePanel={activePanel}
          airports={weatherData?.airports || []}
          metarData={mapMetarData}
          echoMeta={weatherData?.echoMeta || null}
          satMeta={weatherData?.satMeta || null}
          sigmetData={mapSigmetData}
          airmetData={weatherData?.airmet || null}
          lightningData={weatherData?.lightning || null}
          sigwxLowData={weatherData?.sigwxLow || null}
          sigwxLowHistoryData={weatherData?.sigwxLowHistory || null}
          sigwxFrontMeta={weatherData?.sigwxFrontMeta || null}
          sigwxCloudMeta={weatherData?.sigwxCloudMeta || null}
          notamData={weatherData?.notam || null}
          selectedAirport={selectedAirport}
          warnedAirports={warnedAirports}
          warningLabels={warningLabels}
          onAirportSelect={setSelectedAirport}
          onRequestDeferredWeatherData={requestDeferredWeatherData}
          onLayerCountsChange={setLayerCounts}
          onClosePanel={() => { setActivePanel(null); setMobileTask('map') }}
          onOpenNotamPanel={() => setActivePanel('notam')}
          onOpenRoutePanel={() => setActivePanel('route-check')}
          onOpenCustomAreaPanel={() => setActivePanel('custom-area')}
        />
      </main>
      <AirportPanel
        airport={selectedAirportMeta}
        weatherData={weatherData}
        onClose={() => setSelectedAirport(null)}
        onRequestDeferredWeatherData={requestDeferredWeatherData}
      />

      {isMobile && mobileTask === 'map' && !selectedAirport
        && activePanel !== 'aviation' && activePanel !== 'met' && (
        <MobileMapOverlay
          activePanel={activePanel}
          onToggle={togglePanel}
          aviationCount={layerCounts.aviation}
          metCount={layerCounts.met}
        />
      )}
      {isMobile && mobileTask === 'more' && !selectedAirport && (
        <MobileMoreMenu
          onSearch={() => setSearchOpen(true)}
          onSettings={() => togglePanel('settings')}
          onUpdates={() => togglePanel('updates')}
          onAccount={() => setAuthOpen(true)}
          hasUpdate={hasUpdate}
        />
      )}
      {isMobile && (
        <MobileTaskBar activeTask={mobileTask} onSelect={selectMobileTask} hasUpdate={hasUpdate} />
      )}

      <div className="utc-bar">{formatTimeByTz(nowMs, tz)}</div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {deeplinkFlightId != null && (
        <FlightAlertDetail
          flightId={deeplinkFlightId}
          onClose={() => setDeeplinkFlightId(null)}
          onOpenRoute={async () => {
            const id = deeplinkFlightId
            setDeeplinkFlightId(null)
            setActivePanel('route-check')
            try {
              const routes = await listSavedRoutes()
              const route = routes.find((r) => r.id === id)
              if (route) mapRef.current?.loadRouteBriefing?.(route)
            } catch { /* best-effort: 경로 로드 실패해도 패널은 열림 */ }
          }}
        />
      )}
      {activePanel === 'settings' && (
        <SettingsModal onClose={() => togglePanel('settings')} />
      )}
      {activePanel === 'updates' && (
        <UpdatesModal onClose={() => togglePanel('updates')} />
      )}
      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        catalog={searchCatalog}
        onRun={runAction}
      />
    </div>
  )
}

function App() {
  const path = window.location.pathname
  if (path === '/monitoring') {
    return <Suspense fallback={null}><MonitoringPage /></Suspense>
  }
  if (path === '/sandbox') {
    return <Suspense fallback={null}><SandboxPage /></Suspense>
  }
  if (path === '/test' && import.meta.env.DEV) {
    // 디자인 테스트 페이지 — 개발 빌드에서만. 운영 빌드(npm run build)에선 이 코드가 제거되어 접근 불가.
    return <Suspense fallback={null}><DesignTestPage /></Suspense>
  }
  if (path === '/admin') {
    return <Suspense fallback={null}><AuthProvider><AdminPage /></AuthProvider></Suspense>
  }
  if (path === '/dev' && import.meta.env.DEV) {
    // 개발자 콘솔 — 개발 빌드에서만. 운영 빌드(npm run build)에선 이 코드가 제거되어 접근 불가.
    return <Suspense fallback={null}><TimeZoneProvider><AuthProvider><DeveloperPage /></AuthProvider></TimeZoneProvider></Suspense>
  }
  return <TimeZoneProvider><AuthProvider><MainAppShell /></AuthProvider></TimeZoneProvider>
}

export default App
