import { useState } from 'react'
import { Cloud, Layers } from 'lucide-react'
import MapView from '../map/MapView.jsx'

function MonitoringMap({
  weather,
  selectedAirport,
  onAirportSelect,
}) {
  const [activeMapPanel, setActiveMapPanel] = useState(null)

  function toggleMapPanel(panelId) {
    setActiveMapPanel((current) => (current === panelId ? null : panelId))
  }

  return (
    <section className="monitoring-mapbox-panel">
      <div className="monitoring-map-icons" aria-label="지도 레이어 패널">
        <button
          type="button"
          className={`monitoring-map-icon-btn ${activeMapPanel === 'aviation' ? 'active' : ''}`}
          onClick={() => toggleMapPanel('aviation')}
          title="Aviation"
          aria-label="Aviation"
        >
          <Layers size={19} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className={`monitoring-map-icon-btn ${activeMapPanel === 'met' ? 'active' : ''}`}
          onClick={() => toggleMapPanel('met')}
          title="MET"
          aria-label="MET"
        >
          <Cloud size={19} strokeWidth={2.2} />
        </button>
      </div>
      <MapView
        activePanel={activeMapPanel}
        airports={weather?.airports || []}
        metarData={weather?.metar}
        echoMeta={weather?.echoMeta}
        satMeta={weather?.satMeta}
        sigmetData={weather?.sigmet}
        airmetData={weather?.airmet}
        lightningData={weather?.lightning}
        sigwxLowData={weather?.sigwxLow}
        sigwxLowHistoryData={weather?.sigwxLowHistory}
        sigwxFrontMeta={weather?.sigwxFrontMeta || weather?.sigwxLowFronts}
        sigwxCloudMeta={weather?.sigwxCloudMeta || weather?.sigwxLowClouds}
        selectedAirport={selectedAirport}
        onAirportSelect={onAirportSelect}
      />
    </section>
  )
}

export default MonitoringMap
