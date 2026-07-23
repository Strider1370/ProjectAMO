import { useEffect, useRef, useState } from 'react'
import { Cloud, Layers } from 'lucide-react'
import MapView from '../map/MapView.jsx'
import { mergeAdvisoryPayloads, mergeAirportPayloads } from '../../api/weatherApi.js'

function MonitoringMap({
  weather,
  selectedAirport,
  onAirportSelect,
  basemapId,
}) {
  const [activeMapPanel, setActiveMapPanel] = useState(null)
  const mapViewRef = useRef(null)

  useEffect(() => {
    if (basemapId) mapViewRef.current?.switchBasemap(basemapId)
  }, [basemapId])
  const mapMetarData = mergeAirportPayloads(weather?.metar || null, weather?.metarOverseas || null)
  const mapSigmetData = mergeAdvisoryPayloads(weather?.sigmet || null, weather?.sigmetOverseas || null)

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
          title="항공"
          aria-label="항공"
        >
          <Layers size={19} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className={`monitoring-map-icon-btn ${activeMapPanel === 'met' ? 'active' : ''}`}
          onClick={() => toggleMapPanel('met')}
          title="기상"
          aria-label="기상"
        >
          <Cloud size={19} strokeWidth={2.2} />
        </button>
      </div>
      <MapView
        ref={mapViewRef}
        activePanel={activeMapPanel}
        showMapTools={false}
        showBasemapSwitcher={false}
        airports={weather?.airports || []}
        metarData={mapMetarData}
        echoMeta={weather?.echoMeta}
        satMeta={weather?.satMeta}
        sigmetData={mapSigmetData}
        airmetData={weather?.airmet}
        lightningData={weather?.lightning}
        sigwxLowData={weather?.sigwxLow}
        sigwxLowHistoryData={weather?.sigwxLowHistory}
        sigwxFrontMeta={weather?.sigwxFrontMeta || weather?.sigwxLowFronts}
        sigwxCloudMeta={weather?.sigwxCloudMeta || weather?.sigwxLowClouds}
        selectedAirport={selectedAirport}
        onAirportSelect={onAirportSelect}
        enableWindOverlay={false}
      />
    </section>
  )
}

export default MonitoringMap
