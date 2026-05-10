import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSnapshotMetaFromData, fetchSnapshotMeta, loadChangedWeatherData, loadWeatherData } from './api/weatherApi.js'
import AirportPanel from './components/AirportPanel/AirportPanel.jsx'
import MapView from './components/Map/MapView.jsx'
import Sidebar from './components/Sidebar/Sidebar.jsx'

function formatUtcTime(date) {
  const day   = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const mins  = String(date.getUTCMinutes()).padStart(2, '0')
  return `${day}/${month} ${hours}:${mins} UTC`
}

const REFRESH_INTERVAL_MS = 60_000

function hashesDiffer(prev, next) {
  return (prev?.hash || null) !== (next?.hash || null)
}

function framesDiffer(prev, next) {
  return (prev?.tm || null) !== (next?.tm || null)
}

function detectSnapshotChanges(prev, next) {
  return {
    metar: hashesDiffer(prev?.metar, next?.metar),
    taf: hashesDiffer(prev?.taf, next?.taf),
    warning: hashesDiffer(prev?.warning, next?.warning),
    sigmet: hashesDiffer(prev?.sigmet, next?.sigmet),
    airmet: hashesDiffer(prev?.airmet, next?.airmet),
    sigwxLow: hashesDiffer(prev?.sigwxLow, next?.sigwxLow),
    amos: hashesDiffer(prev?.amos, next?.amos),
    lightning: hashesDiffer(prev?.lightning, next?.lightning),
    airportInfo: hashesDiffer(prev?.airportInfo, next?.airportInfo),
    echoMeta: framesDiffer(prev?.echoMeta, next?.echoMeta),
    satMeta: framesDiffer(prev?.satMeta, next?.satMeta),
  }
}

function hasSnapshotChanges(changes) {
  return Object.values(changes).some(Boolean)
}

function App() {
  const [utcTime, setUtcTime] = useState(() => formatUtcTime(new Date()))
  const [activePanel, setActivePanel] = useState(null)
  const [selectedAirport, setSelectedAirport] = useState(null)
  const [weatherData, setWeatherData] = useState(null)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
  const snapshotMetaRef = useRef(null)

  // UTC clock
  useEffect(() => {
    const timer = window.setInterval(() => setUtcTime(formatUtcTime(new Date())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Weather data fetch loop
  useEffect(() => {
    let mounted = true
    let polling = false

    async function fetchInitialData() {
      try {
        const data = await loadWeatherData()
        if (!mounted) return
        setWeatherData(data)
        snapshotMetaRef.current = buildSnapshotMetaFromData(data)
      } catch (err) {
        console.warn('[App] Weather data fetch failed:', err.message)
      }
    }

    async function pollChangedData() {
      if (polling) return
      if (!snapshotMetaRef.current) {
        await fetchInitialData()
        return
      }
      polling = true

      try {
        const latestMeta = await fetchSnapshotMeta()
        if (!mounted || !latestMeta) return

        const changes = detectSnapshotChanges(snapshotMetaRef.current, latestMeta)
        if (!hasSnapshotChanges(changes)) return

        const changedData = await loadChangedWeatherData(changes)
        if (!mounted) return

        setWeatherData((prev) => {
          const nextData = { ...(prev || {}), ...changedData }
          snapshotMetaRef.current = buildSnapshotMetaFromData(nextData)
          return nextData
        })
      } catch (err) {
        console.warn('[App] Weather incremental fetch failed:', err.message)
      } finally {
        polling = false
      }
    }

    fetchInitialData()
    const timer = window.setInterval(pollChangedData, REFRESH_INTERVAL_MS)
    return () => { mounted = false; window.clearInterval(timer) }
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

export default App
