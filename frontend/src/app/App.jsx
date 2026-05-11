import { useEffect, useMemo, useState } from 'react'
import AirportPanel from '../features/airport-panel/AirportPanel.jsx'
import MapView from '../features/map/MapView.jsx'
import MonitoringPage from '../features/monitoring/MonitoringPage.jsx'
import useWeatherPolling from './useWeatherPolling.js'
import Sidebar from './layout/Sidebar.jsx'

function formatUtcTime(date) {
  const day   = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const mins  = String(date.getUTCMinutes()).padStart(2, '0')
  return `${day}/${month} ${hours}:${mins} UTC`
}

function MainAppShell() {
  const [utcTime, setUtcTime] = useState(() => formatUtcTime(new Date()))
  const [activePanel, setActivePanel] = useState(null)
  const [selectedAirport, setSelectedAirport] = useState(null)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
  const weatherData = useWeatherPolling()

  // UTC clock
  useEffect(() => {
    const timer = window.setInterval(() => setUtcTime(formatUtcTime(new Date())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function togglePanel(panelId) {
    setActivePanel((cur) => (cur === panelId ? null : panelId))
  }

  const selectedAirportMeta = useMemo(
    () => weatherData?.airports?.find((a) => a.icao === selectedAirport) || null,
    [weatherData, selectedAirport],
  )

  return (
    <div className={`app ${isSidebarExpanded ? 'sidebar-is-expanded' : ''}`}>
      <Sidebar 
        activePanel={activePanel} 
        onPanelToggle={togglePanel} 
        isExpanded={isSidebarExpanded}
        onExpandToggle={setIsSidebarExpanded}
      />
      <main className="map-shell">
        <MapView
          activePanel={activePanel}
          airports={weatherData?.airports || []}
          metarData={weatherData?.metar || null}
          echoMeta={weatherData?.echoMeta || null}
          satMeta={weatherData?.satMeta || null}
          sigmetData={weatherData?.sigmet || null}
          airmetData={weatherData?.airmet || null}
          lightningData={weatherData?.lightning || null}
          sigwxLowData={weatherData?.sigwxLow || null}
          sigwxLowHistoryData={weatherData?.sigwxLowHistory || null}
          sigwxFrontMeta={weatherData?.sigwxFrontMeta || null}
          sigwxCloudMeta={weatherData?.sigwxCloudMeta || null}
          selectedAirport={selectedAirport}
          onAirportSelect={setSelectedAirport}
        />
      </main>
      <AirportPanel
        airport={selectedAirportMeta}
        weatherData={weatherData}
        onClose={() => setSelectedAirport(null)}
      />
      <div className="utc-bar">{utcTime}</div>
    </div>
  )
}

function App() {
  return window.location.pathname === '/monitoring' ? <MonitoringPage /> : <MainAppShell />
}

export default App
