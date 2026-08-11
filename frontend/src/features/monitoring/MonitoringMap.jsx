import { useEffect, useRef, useState } from 'react'
import { Cloud, Layers, Palette } from 'lucide-react'
import MapView from '../map/MapView.jsx'
import MonitoringSlideOverlay from './MonitoringSlideOverlay.jsx'
import { mergeAdvisoryPayloads, mergeAirportPayloads } from '../../api/weatherApi.js'

// 지도의 RANGE_RING 반지름과 대응: 경보 8km · 위험 16km · 주의 32km.
const ZONE_RADIUS_KM = { alert: 8, danger: 16, caution: 32 }

function MonitoringMap({
  weather,
  selectedAirport,
  onAirportSelect,
  basemapId,
  slideshowSlideId = 'live',
  slideshowContent = null,
  onStopSlideshow,
  slideshowStatusLabel = null,
  slideshowEffect = 'fade',
  slideshowDurationMs = 1000,
  highlightZones = {},
  canvasScale = null,
}) {
  const [activeMapPanel, setActiveMapPanel] = useState(null)
  const [legendsOpen, setLegendsOpen] = useState(false)
  const [mapStyleReady, setMapStyleReady] = useState(false)
  const mapViewRef = useRef(null)

  useEffect(() => {
    if (basemapId) mapViewRef.current?.switchBasemap(basemapId)
  }, [basemapId])

  // 고정 캔버스 배율이 바뀌면 지도가 차지하는 실제 화면 픽셀 수가 달라진다. 컨테이너의 CSS 크기는
  // 그대로라 mapbox는 스스로 알아채지 못하므로, 여기서 다시 그리게 해 해상도를 맞춘다.
  useEffect(() => {
    if (canvasScale) mapViewRef.current?.resizeMap()
  }, [canvasScale])

  useEffect(() => {
    if (selectedAirport) mapViewRef.current?.flyToAirport(selectedAirport, { fitRadiusKm: 32 })
  }, [selectedAirport])
  const mapMetarData = mergeAirportPayloads(weather?.metar || null, weather?.metarOverseas || null)
  const mapSigmetData = mergeAdvisoryPayloads(weather?.sigmet || null, weather?.sigmetOverseas || null)
  // 링은 한 번에 하나만 강조 — 가장 급한 구역(경보 > 위험 > 주의) 반지름을 넘긴다.
  const highlightedZone = ['alert', 'danger', 'caution'].find((zone) => highlightZones[zone])
  const highlightRingRadiusKm = highlightedZone ? ZONE_RADIUS_KM[highlightedZone] : null

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
        <button
          type="button"
          className={`monitoring-map-icon-btn ${legendsOpen ? 'active' : ''}`}
          onClick={() => setLegendsOpen((open) => !open)}
          title="범례"
          aria-label="범례"
        >
          <Palette size={19} strokeWidth={2.2} />
        </button>
      </div>
      <MapView
        ref={mapViewRef}
        activePanel={activeMapPanel}
        showMapTools={false}
        showBasemapSwitcher={false}
        showAdvisoryBadges={false}
        showGeolocateControl={false}
        showWeatherLegends={legendsOpen}
        rangeRingRadiiKm={[8, 16, 32]}
        highlightRingRadiusKm={highlightRingRadiusKm}
        airports={weather?.airports || []}
        metarData={mapMetarData}
        echoMeta={weather?.echoMeta}
        wissdomMeta={weather?.wissdomMeta || null}
        qpfMeta={weather?.qpfMeta || null}
        hsrMeta={weather?.hsrMeta || null}
        hciMeta={weather?.hciMeta || null}
        satVisibleMeta={weather?.satVisibleMeta || null}
        echoTopMeta={weather?.echoTopMeta || null}
        rainviewerMeta={weather?.rainviewerMeta || null}
        satMeta={weather?.satMeta}
        convectiveMeta={weather?.convectiveMeta || null}
        sigmetData={mapSigmetData}
        airmetData={weather?.airmet}
        lightningData={weather?.lightning}
        sigwxLowData={weather?.sigwxLow}
        sigwxLowHistoryData={weather?.sigwxLowHistory}
        sigwxFrontMeta={weather?.sigwxFrontMeta || weather?.sigwxLowFronts}
        sigwxCloudMeta={weather?.sigwxCloudMeta || weather?.sigwxLowClouds}
        notamData={weather?.notam || null}
        selectedAirport={selectedAirport}
        onAirportSelect={onAirportSelect}
        onStyleReady={() => setMapStyleReady(true)}
        enableWindOverlay={true}
        initialMetVisibility={{ radar: true, lightning: true }}
      />
      {!mapStyleReady && (
        <div className="monitoring-map-loading" role="status" aria-live="polite">
          <span className="monitoring-map-loading__spinner" aria-hidden="true" />
          <span>지도 불러오는 중…</span>
        </div>
      )}
      <MonitoringSlideOverlay
        slideId={slideshowSlideId}
        content={slideshowContent}
        scope="map-panel"
        onStop={onStopSlideshow}
        statusLabel={slideshowStatusLabel}
        effect={slideshowEffect}
        durationMs={slideshowDurationMs}
      />
    </section>
  )
}

export default MonitoringMap
