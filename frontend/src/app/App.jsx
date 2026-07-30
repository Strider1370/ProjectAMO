import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import useTour from '../features/onboarding/useTour.js'
import TourOverlay from '../features/onboarding/TourOverlay.jsx'
import FlightAlertDetail from '../features/notifications/FlightAlertDetail.jsx'
import { listSavedRoutes } from '../features/route-briefing/lib/routeStore.js'
import { buildSearchCatalog } from '../features/map/layerActions.js'
import { mergeAdvisoryPayloads, mergeAirportPayloads } from '../api/weatherApi.js'
import { useLastSeenVersion } from '../features/about/useLastSeenVersion.js'
import useIsMobile from '../shared/ui/useIsMobile.js'
import ExitOnDoubleBack from '../shared/ui/ExitOnDoubleBack.jsx'
import { TimeZoneProvider, useTimeZone } from '../shared/timezone/TimeZoneContext.jsx'

const MonitoringPage = lazy(() => import('../features/monitoring/MonitoringPage.jsx'))
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
  const [layerCounts, setLayerCounts] = useState({ aviation: 0, met: 0, traffic: 0 })
  const [searchOpen, setSearchOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const mapRef = useRef(null)
  const isMobile = useIsMobile()
  const { weatherData, requestDeferredWeatherData } = useWeatherPolling()
  const { hasUpdate, markSeen, isFirstVisit } = useLastSeenVersion()
  const tourAirportPoint = useCallback((icao) => mapRef.current?.getAirportPoint(icao) ?? null, [])
  const tourFocusAirport = useCallback((icao) => mapRef.current?.flyToAirport(icao), [])
  const tour = useTour({ isMobile, isFirstVisit, markSeen, getAirportPoint: tourAirportPoint })

  // 온보딩 스텝 전환 시 이전 스텝이 연 것 정리 — 패널 닫아 다음 스텝이 깨끗한 상태에서 하이라이트되게
  // (기상·항공 패널은 같은 클래스라 안 닫으면 다음 스텝 reveal이 잔여 패널을 잡아 버림). 지도를 확대했던
  // 공항 스텝에서 나올 때만 초기 뷰로 복귀. 첫 진입(prev=null)엔 아무것도 안 함.
  const tourStepId = tour.step?.id
  const prevTourStepRef = useRef(null)
  useEffect(() => {
    if (!tour.active) { prevTourStepRef.current = null; return }
    const prev = prevTourStepRef.current
    prevTourStepRef.current = tourStepId
    if (prev == null) return
    setSelectedAirport(null)
    setActivePanel(null)
    if (prev === 'airport') mapRef.current?.resetView?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.active, tourStepId])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activePanel === 'updates') markSeen()
  }, [activePanel, markSeen])

  // Auto-open the update board on first visit after a new release (once, on mount).
  // 단, 온보딩 투어가 자동 발동할 참이면 양보한다(첫 방문자는 changelog보다 투어 우선).
  useEffect(() => {
    if (hasUpdate && !tour.willAutoStart) setActivePanel('updates')
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
        onHelp={tour.restart}
      />
      <main className="map-shell">
        <MapView
          ref={mapRef}
          activePanel={activePanel}
          mobileTask={mobileTask}
          airports={weatherData?.airports || []}
          metarData={mapMetarData}
          echoMeta={weatherData?.echoMeta || null}
          echoTopMeta={weatherData?.echoTopMeta || null}
          rainviewerMeta={weatherData?.rainviewerMeta || null}
          satMeta={weatherData?.satMeta || null}
          convectiveMeta={weatherData?.convectiveMeta || null}
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
          onOpenMetPanel={() => setActivePanel('met')}
        />
      </main>
      <AirportPanel
        airport={selectedAirportMeta}
        weatherData={weatherData}
        onClose={() => setSelectedAirport(null)}
        onRequestDeferredWeatherData={requestDeferredWeatherData}
      />

      {isMobile && mobileTask === 'map' && !selectedAirport && (
        <MobileMapOverlay
          activePanel={activePanel}
          onToggle={togglePanel}
          aviationCount={layerCounts.aviation}
          metCount={layerCounts.met}
          trafficCount={layerCounts.traffic}
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
      {isMobile && !selectedAirport && (
        <MobileTaskBar activeTask={mobileTask} onSelect={selectMobileTask} hasUpdate={hasUpdate} />
      )}

      <div className="utc-bar">{formatTimeByTz(nowMs, tz)}</div>
      <ExitOnDoubleBack />
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
      {tour.active && (
        <TourOverlay
          tour={tour}
          getAirportPoint={tourAirportPoint}
          onFocusAirport={tourFocusAirport}
          onSelectAirport={setSelectedAirport}
        />
      )}
    </div>
  )
}

function App() {
  if (window.location.pathname === '/monitoring') {
    // 상황판은 벽걸이 전용이다. 모바일 폭에서는 조용히 메인으로 되돌린다 —
    // 운영자가 주소를 직접 아는 화면이라 모바일 사용자에게 설명할 맥락이 없다.
    // 가드는 여기 한 곳뿐이다. MonitoringPage의 모바일 대응 코드는 그대로 두어
    // 이 가드만 풀면 되살아나게 한다.
    if (window.innerWidth <= 719) {
      window.location.replace('/')
      return null
    }
    return <Suspense fallback={null}><MonitoringPage /></Suspense>
  }
  if (window.location.pathname === '/test' && import.meta.env.DEV) {
    // 디자인 테스트 페이지 — 개발 빌드에서만. 운영 빌드(npm run build)에선 이 코드가 제거되어 접근 불가.
    return <Suspense fallback={null}><DesignTestPage /></Suspense>
  }
  if (window.location.pathname === '/admin') {
    return <Suspense fallback={null}><AuthProvider><AdminPage /></AuthProvider></Suspense>
  }
  if (window.location.pathname === '/dev' && import.meta.env.DEV) {
    // 개발자 콘솔 — 개발 빌드에서만. 운영 빌드(npm run build)에선 이 코드가 제거되어 접근 불가.
    return <Suspense fallback={null}><TimeZoneProvider><AuthProvider><DeveloperPage /></AuthProvider></TimeZoneProvider></Suspense>
  }
  return <TimeZoneProvider><AuthProvider><MainAppShell /></AuthProvider></TimeZoneProvider>
}

export default App
