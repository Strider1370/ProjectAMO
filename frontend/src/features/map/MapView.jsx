import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ChartSpline, House } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import useHasHover from '../../shared/ui/useHasHover.js'
import useDemoMode from '../../shared/demoMode/useDemoMode.js'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import circle from '@turf/circle'
import { point } from '@turf/helpers'
import { MAP_CONFIG, BASEMAP_OPTIONS } from './mapConfig.js'
import { addAviationWfsLayers } from '../aviation-layers/addAviationWfsLayers.js'
import { AVIATION_PANEL_MERGE_GROUPS, AVIATION_WFS_LAYERS } from '../aviation-layers/aviationWfsLayers.js'
import { useFirTickOverlay } from '../aviation-layers/useFirTickOverlay.js'
import { useMoaActivation } from '../aviation-layers/useMoaActivation.js'
import {
  ADVISORY_LAYER_DEFS,
} from '../weather-overlays/lib/advisoryLayers.js'
import { ADSB_FETCH_DISABLED, fetchAdsbData } from '../../api/adsbApi.js'
import { fetchConvectiveCtpsPoint, fetchEchoTopPoint, fetchSigwxCloudMeta, fetchSigwxFrontMeta } from '../../api/weatherApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, createAdsbTrailGeoJSON, syncAdsbLayer } from '../aviation-layers/addAdsbLayer.js'
import { registerAircraftImages } from '../aviation-layers/aircraftIconImages.js'
import { registerAirlineLogos } from '../aviation-layers/airlineLogoImages.js'
import AviationLayerPanel from '../aviation-layers/AviationLayerPanel.jsx'
import MapToolsPanel from '../map-tools/MapToolsPanel.jsx'
import { useMapTools } from '../map-tools/useMapTools.js'
import NotamPanel from '../notam/NotamPanel.jsx'
import { updateNotamLayerData, setNotamVisibility, setNotamCategoryFilter as applyNotamCategoryFilter, notamPopupHtml, notamsAtPoint, addNotamHighlight, setNotamHighlight, geometryBounds } from '../notam/lib/notamLayers.js'
import TrafficPanel from '../traffic/TrafficPanel.jsx'
import useTrafficFilters from '../traffic/useTrafficFilters.js'
import { countAircraft, hasActiveFilters, visibleIds } from '../traffic/trafficFilter.js'
import { applyAdsbFilter } from '../traffic/applyAdsbFilter.js'
import { notamToFeatureCollection, displayGeometry } from '../notam/lib/notamGeoJson.js'
import { registerNotamObstacleImages } from '../notam/lib/notamObstacleIcons.js'
import { NOTAM_CATEGORIES } from '../notam/lib/notamViewModel.js'
import { SIGWX_FILTER_OPTIONS } from '../weather-overlays/lib/sigwxData.js'
import AdvisoryBadges from '../weather-overlays/AdvisoryBadges.jsx'
import AdsbTimestamp from '../weather-overlays/AdsbTimestamp.jsx'
import SigwxLegendDialog from '../weather-overlays/SigwxLegendDialog.jsx'
import TimelineRail from '../weather-overlays/TimelineRail.jsx'
import { useTimelineRail, useTimelinePlayback } from '../weather-overlays/lib/useTimelineRail.js'
import useRadarWindOverlay, { deriveRadarWindRailActive, hasExactRadarWindFrame } from '../weather-overlays/lib/useRadarWindOverlay.js'
import { nwpAvailabilityEntries } from '../weather-overlays/lib/timelineRailModel.js'
import WeatherLegends from '../weather-overlays/WeatherLegends.jsx'
import { legendStamps } from '../weather-overlays/lib/flightCategoryLegend.js'
import WeatherOverlayPanel from '../weather-overlays/WeatherOverlayPanel.jsx'
import useMyMap from '../my-map/useMyMap.js'
import MyMapPanel from '../my-map/MyMapPanel.jsx'
import RadarWindVerticalRail from '../weather-overlays/RadarWindVerticalRail.jsx'
import LevelSliderPanel from '../weather-overlays/LevelSliderPanel.jsx'
import ConvectiveOverlayControls from '../weather-overlays/ConvectiveOverlayControls.jsx'
import ConvectiveOverlayCard from '../weather-overlays/ConvectiveOverlayCard.jsx'
import EchoTopCard from '../weather-overlays/EchoTopCard.jsx'
import QpfStatusCard from '../weather-overlays/QpfStatusCard.jsx'
import TyphoonPanel from '../weather-overlays/TyphoonPanel.jsx'
import { useTyphoonOverlay } from '../weather-overlays/lib/typhoonOverlaySync.js'
import { syncKmaCompositeLayers } from '../weather-overlays/lib/kmaCompositeLayers.js'
import WeatherPointInspector from '../weather-overlays/WeatherPointInspector.jsx'
import { useConvectiveOverlay } from '../weather-overlays/lib/useConvectiveOverlay.js'
import { useEchoTopOverlay } from '../weather-overlays/lib/useEchoTopOverlay.js'
import { useWeatherPointInspector } from '../weather-overlays/lib/useWeatherPointInspector.js'
import WeatherLayerTimestampBar from '../weather-overlays/WeatherLayerTimestampBar.jsx'
import { useNwpOverlays } from '../weather-overlays/lib/useNwpOverlays.js'
import { destroyWindOverlay, syncWindOverlay } from '../weather-overlays/lib/windOverlaySync.js'
import { WIND_SPEED_COLOR_RAMP } from '../weather-overlays/lib/windField.js'
import { CELSIUS_TEMPERATURE_COLOR_RAMP } from '../weather-overlays/lib/temperatureField.js'
import { destroyTemperatureOverlay, syncTemperatureOverlay } from '../weather-overlays/lib/temperatureOverlaySync.js'
import { CLOUD_POTENTIAL_COLOR_RAMP } from '../weather-overlays/lib/cloudPotentialField.js'
import { destroyCloudPotentialOverlay, syncCloudPotentialOverlay } from '../weather-overlays/lib/cloudPotentialOverlaySync.js'
import { ICING_COLOR_RAMP } from '../weather-overlays/lib/icingPotentialField.js'
import { destroyIcingPotentialOverlay, syncIcingPotentialOverlay } from '../weather-overlays/lib/icingPotentialOverlaySync.js'
import { KTG_COLOR_RAMP } from '../weather-overlays/lib/ktgTurbulenceField.js'
import { destroyKtgTurbulenceOverlay, syncKtgTurbulenceOverlay } from '../weather-overlays/lib/ktgTurbulenceOverlaySync.js'
import { createInitialMetVisibility, getNextMetVisibility } from '../weather-overlays/lib/metLayerVisibility.js'
import {
  LIGHTNING_BLINK_INTERVAL_MS,
} from '../weather-overlays/lib/lightningLayers.js'
import {
  MET_LAYERS,
  RADAR_RAINRATE_LEGEND,
  installWeatherOverlayLayers,
  syncAdvisoryLayers,
  syncLightningLayers,
  syncRasterAndSigwxLayers,
} from '../weather-overlays/lib/weatherOverlayLayers.js'
import { syncTerrainHazardLayer, terrainHazardAltitudeItems } from '../weather-overlays/lib/terrainHazardLayer.js'
import {
  buildWeatherOverlayModel,
  formatReferenceTimeLabel,
} from '../weather-overlays/lib/weatherOverlayModel.js'
import { HCI_LEGEND, HSR_LEGEND } from '../weather-overlays/lib/rasterLegendModel.js'
import { useFlightCategory } from '../weather-overlays/lib/useFlightCategory.js'
import {
  syncFlightCategoryLayers,
  removeFlightCategoryLayers,
  bindFlightCategoryClick,
  STATION_COLORS,
} from '../weather-overlays/lib/flightCategoryLayers.js'
import { escapeHtml } from '../../shared/ui/escapeHtml.js'
import BasemapSwitcher from './basemapSwitcher/BasemapSwitcher.jsx'
import MapToolsLauncher from '../map-tools/MapToolsLauncher.jsx'
import { createOneShotNotifier } from './lib/createOneShotNotifier.js'
import { setLayerVisibility, resetLazyGeoJsonSources } from './lib/mapLayerUtils.js'
import { bindLayerEvent, cleanupAll } from './lib/mapStyleSync.js'
import {
  AIRPORT_CIRCLE_LAYER,
  AIRPORT_INTERACTIVE_LAYERS,
  AIRPORT_STATION_CENTER_LAYER,
  AIRPORT_SOURCE_ID,
  addAirportLayers,
  addGeoBoundaryLayers,
  createAirportGeoJSON,
  setGeoBoundaryVisibility,
  geoBoundaryPresentation,
  shouldShowGeoBoundaries,
} from './lib/baseMapLayers.js'
import {
  registerAirportStationImages,
  registerAirportWeatherImages,
  registerAirportWindBarbImages,
} from './lib/airportStationImages.js'
import {
  PROC_WP_CIRCLE,
  PROC_WP_LABEL,
  VFR_WP_CIRCLE,
  bindVfrInteractions,
  bindIfrClickInteraction,
} from '../route-briefing/lib/routePreview.js'
import {
  clearRoutePreviewLayers,
  installRoutePreviewLayers,
  syncBoundaryFixPreview,
  syncRoutePreviewLayers,
  syncVfrWaypointData,
} from '../route-briefing/lib/routePreviewSync.js'
import { syncTokenPreviewLayers } from '../route-briefing/lib/tokenPreviewLayers.js'
import { legCoordinates, syncLegHighlight } from '../route-briefing/lib/legHighlight.js'
import { useRouteBriefing } from '../route-briefing/useRouteBriefing.js'
import AirportTooltip from './AirportTooltip.jsx'
import './MapView.css'

const RouteBriefingPanel = lazy(() => import('../route-briefing/RouteBriefingPanel.jsx'))
const VerticalProfileWindow = lazy(() => import('../route-briefing/VerticalProfileWindow.jsx'))
const BriefingView = lazy(() => import('../route-briefing/BriefingView.jsx'))

// ???? Constants ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

const ROAD_VISIBILITY_ZOOM = 8
const ADSB_POLL_INTERVAL_MS = 90 * 1000
const HIDDEN_ROAD_COLOR = 'rgba(255,255,255,0.2)'
const VISIBLE_ROAD_COLORS = { roads: '#d6dde6', trunks: '#c6d1dd', motorways: '#b9c7d4' }

// ???? Helpers ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

function applyRoadVisibility(map, show) {
  // 'basemap' config는 Mapbox Standard 계열 전용. 커스텀/클래식 basemap(예: 지형)에선
  // setConfigProperty가 던지므로 무시 — 그런 스타일은 자체 도로 스타일을 쓴다.
  try {
    map.setConfigProperty('basemap', 'colorRoads', show ? VISIBLE_ROAD_COLORS.roads : HIDDEN_ROAD_COLOR)
    map.setConfigProperty('basemap', 'colorTrunks', show ? VISIBLE_ROAD_COLORS.trunks : HIDDEN_ROAD_COLOR)
    map.setConfigProperty('basemap', 'colorMotorways', show ? VISIBLE_ROAD_COLORS.motorways : HIDDEN_ROAD_COLOR)
  } catch { /* ponytail: non-Standard basemap엔 basemap config import가 없음 */ }
}

// ???? Initial state factories ??????????????????????????????????????????????????????????????????????????????????????????????????????

function initAviationVisibility() {
  return AVIATION_WFS_LAYERS.reduce((acc, l) => { acc[l.id] = l.defaultVisible; return acc }, {})
}

function initMetVisibility(overrides) {
  return createInitialMetVisibility(MET_LAYERS.map((layer) => layer.id), overrides)
}

function bindSectorHover(map) {
  const sector = AVIATION_WFS_LAYERS.find((l) => l.id === 'sector')
  if (!sector?.fillLayerId || !sector.hoverLayerId) return null

  const onMouseMove = (e) => {
    const ids = [...new Set(e.features.map((f) => f.properties.sectorId).filter(Boolean))]
    map.getCanvas().style.cursor = ids.length > 0 ? 'pointer' : ''
    map.setFilter(sector.hoverLayerId, ['in', ['get', 'sectorId'], ['literal', ids]])
  }
  const onMouseLeave = () => {
    map.getCanvas().style.cursor = ''
    map.setFilter(sector.hoverLayerId, ['in', ['get', 'sectorId'], ['literal', []]])
  }

  const cleanups = [
    bindLayerEvent(map, 'mousemove', sector.fillLayerId, onMouseMove),
    bindLayerEvent(map, 'mouseleave', sector.fillLayerId, onMouseLeave),
  ]
  return () => cleanupAll(cleanups)
}

// ???? Lightning layers ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

// ???? Component ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

// 좌표 배열을 감싸는 LngLatBounds를 만든다. (fitBounds 호출 전 공통 단계)
function boundsFromCoords(coords) {
  return coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
}

// 맵 스타일이 준비됐을 때만 run(map)을 실행하는 공통 훅.
// 오버레이 sync 효과들이 반복하던 map/isStyleReady 가드와 styleRevision 의존성을 통합한다.
function useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, run, deps) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    return run(map)
    // run/mapRef는 매 렌더 새로 생성되므로 의도적으로 deps에서 제외(기존 효과 동작 유지).
  }, [isStyleReady, styleRevision, ...deps])
}

// 한 기상 필드 오버레이의 sync(스타일 동기화)와 unmount destroy를 한 자리에 묶는다.
// 필드 추가 시 destroy를 멀리 떨어진 공용 cleanup 효과에 따로 넣다 빠뜨리는 일을 막는다.
function useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, run, destroy, deps) {
  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, run, deps)
  useEffect(() => () => {
    const map = mapRef.current
    if (map) destroy(map)
  }, [])
}

const RANGE_RING_SOURCE_ID = 'range-rings'
const RANGE_RING_LABEL_SOURCE_ID = 'range-rings-labels'
const RANGE_RING_LINE_LAYER = 'range-rings-line'
const RANGE_RING_LABEL_LAYER = 'range-rings-label'

// 가까운 링일수록 위험도 높음: 빨강(가까움) → 주황 → 노랑(멂). 원색 톤으로 눈에 띄게.
const RANGE_RING_COLORS = ['#ff0000', '#ff8800', '#ffd500']

// 라벨·색은 백엔드 VIS_BAND_COLORS와 classifyVisibility의 경계를 그대로 옮겨 적은 것이다
// (backend/src/processors/flight-category-processor.js). 오늘은 값이 일치하지만 프런트가
// 따로 들고 있으므로, 백엔드가 밴드를 다시 나누면 지도는 새 색으로 칠하는데 범례 문구만
// 예전 값에 머물러 거짓말을 하게 된다 — flightCategoryLayers.js의 STATION_FILL 주석과
// 같은 종류의 경고.
const FLIGHT_CATEGORY_LEGEND_BANDS = [
  { label: '3 km 미만', color: '#dc2626' },
  { label: '3~5 km', color: '#f97316' },
  { label: '5~7 km', color: '#fde047' },
]

// 지점 색은 flightCategoryLayers.js의 STATION_COLORS를 그대로 쓴다 — 여기서 리터럴로
// 다시 적으면 그 파일의 STATION_FILL이 바뀔 때 범례만 예전 색에 머무는 거짓말이 생긴다.
const FLIGHT_CATEGORY_STATION_LEGEND_BANDS = [
  { label: '450 m 미만', color: STATION_COLORS.severe },
  { label: '450~900 m', color: STATION_COLORS.caution },
  { label: '900 m 초과·구름 없음', color: STATION_COLORS.good },
]

// 선택 공항 중심 낙뢰 접근 확인용 거리(km) 점선 원. ponytail: km 라벨 텍스트만, 회전/자북 보정 없음.
// circle()의 0번 꼭짓점은 반경과 무관하게 같은 중심·steps에서 항상 같은 방위 → 라벨 1개씩 한 줄로 정렬.
function buildRangeRingGeoJSON(center, radiiKm) {
  const rings = []
  const labels = []
  radiiKm.forEach((radiusKm, index) => {
    const color = RANGE_RING_COLORS[index % RANGE_RING_COLORS.length]
    const ring = circle(point(center), radiusKm, { units: 'kilometers', steps: 64 })
    ring.properties = { radiusKm, color }
    rings.push(ring)
    labels.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ring.geometry.coordinates[0][0] },
      properties: { radiusKm, color },
    })
  })
  return {
    rings: { type: 'FeatureCollection', features: rings },
    labels: { type: 'FeatureCollection', features: labels },
  }
}

function syncRangeRings(map, { rings, labels }) {
  const ringSource = map.getSource(RANGE_RING_SOURCE_ID)
  const labelSource = map.getSource(RANGE_RING_LABEL_SOURCE_ID)
  if (ringSource && labelSource) {
    ringSource.setData(rings)
    labelSource.setData(labels)
    return
  }
  map.addSource(RANGE_RING_SOURCE_ID, { type: 'geojson', data: rings })
  map.addSource(RANGE_RING_LABEL_SOURCE_ID, { type: 'geojson', data: labels })
  const beforeId = map.getLayer(AIRPORT_CIRCLE_LAYER) ? AIRPORT_CIRCLE_LAYER : undefined
  map.addLayer({
    id: RANGE_RING_LINE_LAYER,
    type: 'line',
    source: RANGE_RING_SOURCE_ID,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.5,
      'line-dasharray': [2, 2],
      'line-opacity': 1,
    },
  }, beforeId)
  map.addLayer({
    id: RANGE_RING_LABEL_LAYER,
    type: 'symbol',
    source: RANGE_RING_LABEL_SOURCE_ID,
    layout: {
      'text-field': ['concat', ['to-string', ['get', 'radiusKm']], 'km'],
      'text-size': 11,
      'text-anchor': 'bottom',
      'text-offset': [0, -0.3],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': ['get', 'color'],
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  }, beforeId)
}

function removeRangeRings(map) {
  if (map.getLayer(RANGE_RING_LABEL_LAYER)) map.removeLayer(RANGE_RING_LABEL_LAYER)
  if (map.getLayer(RANGE_RING_LINE_LAYER)) map.removeLayer(RANGE_RING_LINE_LAYER)
  if (map.getSource(RANGE_RING_LABEL_SOURCE_ID)) map.removeSource(RANGE_RING_LABEL_SOURCE_ID)
  if (map.getSource(RANGE_RING_SOURCE_ID)) map.removeSource(RANGE_RING_SOURCE_ID)
}

// 강조 대상 링만 굵게, 낙뢰 깜빡임 틱(lightningBlinkOff)을 그대로 타고 함께 뒤집는다.
// 기본 굵기는 1.5 그대로 — 강조와 무관한 상시 표시를 바꾸지 않는다.
// 낙뢰 레이어가 꺼져 있으면 lightningBlinkOff가 false에 고정되므로(틱이 안 돎),
// 강조를 5px로 굳히지 않도록 lightningActive가 거짓일 때는 강조 자체를 생략한다.
function updateRangeRingHighlight(map, highlightRingRadiusKm, lightningBlinkOff, lightningActive) {
  if (!map.getLayer(RANGE_RING_LINE_LAYER)) return
  const effectiveRadiusKm = lightningActive ? highlightRingRadiusKm : null
  map.setPaintProperty(RANGE_RING_LINE_LAYER, 'line-width', [
    'case',
    ['==', ['get', 'radiusKm'], effectiveRadiusKm ?? -1], lightningBlinkOff ? 1.5 : 5,
    1.5,
  ])
}

const MapView = forwardRef(function MapView({
  activePanel,
  mobileTask = 'map',
  airports = [],
  metarData = null,
  echoMeta = null,
  wissdomMeta = null,
  qpfMeta = null,
  hsrMeta = null,
  hciMeta = null,
  satVisibleMeta = null,
  rainviewerMeta = null,
  satMeta = null,
  convectiveMeta = null,
  echoTopMeta = null,
  sigmetData = null,
  airmetData = null,
  lightningData = null,
  sigwxLowData = null,
  sigwxLowHistoryData = null,
  sigwxFrontMeta = null,
  sigwxCloudMeta = null,
  notamData = null,
  selectedAirport,
  warnedAirports = [],
  warningLabels = {},
  onAirportSelect,
  onStyleReady,
  onRequestDeferredWeatherData,
  onLayerCountsChange,
  onClosePanel,
  onOpenNotamPanel,
  onOpenRoutePanel,
  onOpenCustomAreaPanel,
  onOpenMetPanel,
  enableWindOverlay = true,
  initialMetVisibility = null,
  showMapTools = true,
  showBasemapSwitcher = true,
  showAdvisoryBadges = true,
  showGeolocateControl = true,
  showWeatherLegends = true,
  rangeRingRadiiKm = null,
  highlightRingRadiusKm = null,
}, ref) {
  const notifyInitialStyleReady = useMemo(() => createOneShotNotifier(onStyleReady), [onStyleReady])
  const isMobile = useIsMobile()
  // 터치 기기에서는 공항 호버 툴팁을 띄우지 않는다 — 탭하면 공항 패널이 열리는데
  // 그 직전에 가짜 mousemove로 툴팁이 깜빡였다 사라졌다.
  const hasHover = useHasHover()
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const initialHomeRef = useRef(null)
  const [showKoreaHome, setShowKoreaHome] = useState(false)
  const tourHomeRef = useRef(null) // 온보딩: 공항 확대 전 홈 뷰 저장(resetView 복귀용)
  const onSelectRef = useRef(onAirportSelect)
  const tooltipTimerRef = useRef(null)
  const tooltipIcaoRef = useRef(null)
  const [hoveredAirportIcao, setHoveredAirportIcao] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const airportEventCleanupRef = useRef([])
  const { tz } = useTimeZone()
  const advisoryEventCleanupRef = useRef([])
  const adsbEventCleanupRef = useRef(null)
  const sectorEventCleanupRef = useRef(null)
  const [error, setError] = useState(null)
  const { on: demoMode, nowMs: demoNowMs } = useDemoMode()
  const [isStyleReady, setIsStyleReady] = useState(false)
  const [styleRevision, setStyleRevision] = useState(0)
  const [aviationVisibility, setAviationVisibility] = useState(initAviationVisibility)
  const [metVisibility, setMetVisibility] = useState(() => initMetVisibility(initialMetVisibility))
  const [showFlightCategoryMissing, setShowFlightCategoryMissing] = useState(false)
  const [showFlightCategoryStations, setShowFlightCategoryStations] = useState(true)
  const [timestampOpen, setTimestampOpen] = useState(true)
  const [weatherLegendOpen, setWeatherLegendOpen] = useState(false)
  const [weatherLegendPanelHeight, setWeatherLegendPanelHeight] = useState(0)
  const [terrainAltitudeFt, setTerrainAltitudeFt] = useState(3000)
  const [blinkLightning, setBlinkLightning] = useState(false)
  const [lightningBlinkOff, setLightningBlinkOff] = useState(false)
  const [lightningReferenceTimeMs, setLightningReferenceTimeMs] = useState(() => Date.now())
  const {
    selectedMs: weatherTimelineSelectedMs,
    setSelectedMs: setWeatherTimelineSelectedMs,
    scrub: scrubWeatherTimeline,
    isPlaying: weatherTimelinePlaying,
    togglePlay: toggleWeatherTimelinePlay,
    speed: weatherTimelineSpeed,
  } = useTimelineRail()

  // 데스크톱 화살표키: 지도 이동 대신 좌우=타임라인, 상하=연직슬라이더(떠 있을 때만) 이동.
  // 각 레일은 포커스 상태에서 이미 자체 onKeyDown으로 화살표를 처리하므로(TimelineRail,
  // LevelSlider), 여기서는 그 DOM 노드에 키 이벤트를 그대로 전달만 한다.
  useEffect(() => {
    if (isMobile) return undefined
    function onArrowKeyDown(event) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const target = event.target
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      // 레일 자체에 포커스가 있으면 그 컴포넌트의 onKeyDown이 이미 처리했다 — 중복 전달 방지.
      if (target?.closest?.('.timeline-rail__viewport, .pressure-level-slider__track')) return

      event.preventDefault()
      const isHorizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      const forwardTarget = document.querySelector(
        isHorizontal
          ? '.timeline-rail__viewport'
          : '.vertical-level-rail-stack .pressure-level-slider__track',
      )
      forwardTarget?.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true, cancelable: true }))
    }
    window.addEventListener('keydown', onArrowKeyDown)
    return () => window.removeEventListener('keydown', onArrowKeyDown)
  }, [isMobile])

  const [windFlowOpacity, setWindFlowOpacity] = useState(0.8)
  const [windFlowTrail, setWindFlowTrail] = useState(0.9)
  const [windFlowWidth, setWindFlowWidth] = useState(1.5)
  const [sigwxHistoryIndex, setSigwxHistoryIndex] = useState(0)
  const [sigwxLegendOpen, setSigwxLegendOpen] = useState(false)
  const [openAdvisoryPanel, setOpenAdvisoryPanel] = useState(null)
  const [sigwxFilter, setSigwxFilter] = useState(() => Object.fromEntries(SIGWX_FILTER_OPTIONS.map((option) => [option.key, true])))
  const [hiddenAdvisoryKeys, setHiddenAdvisoryKeys] = useState({ sigwxLow: [], sigmet: [], airmet: [] })
  const [notamCategoryFilter, setNotamCategoryFilter] = useState(() => NOTAM_CATEGORIES.map((c) => c.id))
  const [notamLocationFilter, setNotamLocationFilter] = useState('all')
  const [selectedSigwxFrontMeta, setSelectedSigwxFrontMeta] = useState(sigwxFrontMeta)
  const [selectedSigwxCloudMeta, setSelectedSigwxCloudMeta] = useState(sigwxCloudMeta)
  // 브리핑 NOTAM 경로전용 필터가 아래 NOTAM 동기화 effect에서 참조 → 반드시 effect보다 먼저 선언(TDZ 방지).
  const [routeBriefingMapMode, setRouteBriefingMapMode] = useState(false)
  const routeBriefing = useRouteBriefing({ activePanel, airports, metarData, demoMode, demoNowMs })
  const effectiveLightningReferenceTimeMs = demoMode ? demoNowMs : lightningReferenceTimeMs
  const notamFc = useMemo(() => notamToFeatureCollection(notamData, demoNowMs), [notamData, demoNowMs])
  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    registerNotamObstacleImages(map) // 장애물 종류별 아이콘 등록(비동기, 준비되면 심볼 레이어가 참조)
    updateNotamLayerData(map, notamFc)
    addNotamHighlight(map)
    setNotamVisibility(map, metVisibility.notam)
    // 브리핑 "경로에 걸린 NOTAM만" 모드: 맵모드 + 브리핑 존재 시 routeNotams id로 제한. 그 외엔 전체(null).
    const notamIdFilter = (routeBriefingMapMode && routeBriefing.state.briefing)
      ? (routeBriefing.state.briefing.routeNotams ?? []).map((n) => n.id)
      : null
    applyNotamCategoryFilter(map, notamCategoryFilter, notamLocationFilter, notamIdFilter)
    // 겹침 팝업(surface D): 클릭 지점의 모든 NOTAM 후보를 해석(1 / 2-3 미니리스트 / 4+ 전체보기).
    // 폴리곤은 point-in-polygon으로 직접 판정(투명/줌 무관, 네모·동그라미 내부 어디든), 점·선은 queryRenderedFeatures.
    const lineLayers = ['notam-marker', 'notam-obstacle', 'notam-line', 'notam-fir-line'].filter((id) => map.getLayer(id))
    function onNotamClick(e) {
      if (!metVisibility.notam) return
      const polyHits = notamsAtPoint(notamFc.features, e.lngLat.lng, e.lngLat.lat, notamCategoryFilter)
        .filter((f) => notamLocationFilter === 'all' || f.properties?.location === notamLocationFilter)
        .filter((f) => !notamIdFilter || notamIdFilter.includes(f.properties?.id))
      const rendered = lineLayers.length ? map.queryRenderedFeatures(e.point, { layers: lineLayers }) : []
      const seen = new Set()
      const uniq = []
      for (const f of [...polyHits, ...rendered]) {
        const id = f.properties?.id
        if (id && !seen.has(id)) { seen.add(id); uniq.push(f) }
      }
      if (uniq.length === 0) return
      const popup = new mapboxgl.Popup({ closeButton: true, maxWidth: '380px' })
        .setLngLat(e.lngLat).setHTML(notamPopupHtml(uniq)).addTo(map)
      const moreBtn = popup.getElement()?.querySelector('.notam-pop-more')
      if (moreBtn) moreBtn.addEventListener('click', () => { onOpenNotamPanel?.(); popup.remove() })
    }
    map.on('click', onNotamClick)
    // 클릭 가능 신호: NOTAM 구역/마커 위에서 커서 포인터(어포던스)
    const hoverLayers = ['notam-fill', 'notam-line', 'notam-fir-line', 'notam-marker', 'notam-obstacle'].filter((id) => map.getLayer(id))
    const onNotamEnter = () => { if (metVisibility.notam) map.getCanvas().style.cursor = 'pointer' }
    const onNotamLeave = () => { map.getCanvas().style.cursor = '' }
    for (const id of hoverLayers) { map.on('mouseenter', id, onNotamEnter); map.on('mouseleave', id, onNotamLeave) }
    return () => {
      map.off('click', onNotamClick)
      for (const id of hoverLayers) { map.off('mouseenter', id, onNotamEnter); map.off('mouseleave', id, onNotamLeave) }
    }
  }, [notamFc, metVisibility.notam, notamCategoryFilter, notamLocationFilter, routeBriefingMapMode, routeBriefing.state.briefing])
  const [adsbData, setAdsbData] = useState(null)
  const [adsbLoading, setAdsbLoading] = useState(false)
  // ADS-B 켜기/끄기는 기상 레이어에서 분리됐다 — 항적 패널이 소유한다. 저장하지 않는다.
  const [trafficVisible, setTrafficVisible] = useState(false)
  const { filters: trafficFilters, setFilters: setTrafficFilters, resetFilters: resetTrafficFilters } = useTrafficFilters()
  const [basemapId, setBasemapId] = useState('standard')
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)

  // 레이어 켜기(끄지 않음) — ref(검색, 화면 밖)와 in-map 패널(브리핑/경로) 공용. 패널이 쓰는 setter 재사용.
  function setLayerOn(id, kind) {
    if (kind === 'met') setMetVisibility((prev) => (prev[id] ? prev : getNextMetVisibility(prev, id, { lowPower })))
    else if (kind === 'aviation') setAviationVisibility((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
    else if (kind === 'traffic') setTrafficVisible(true)
  }
  // loadRouteBriefing: 딥링크 '전체 브리핑 보기'가 저장경로를 route-briefing 훅으로 로드+브리핑 자동생성(§검증).
  useImperativeHandle(ref, () => ({
    setLayerOn, switchBasemap,
    // 컨테이너 크기가 그대로여도 다시 그려야 할 때가 있다 — 모니터링의 고정 캔버스는 컨테이너를
    // 1920px 좌표계에 붙박아 두고 화면 배율만 바꾸므로 mapbox의 ResizeObserver가 영영 발동하지 않는다.
    resizeMap: () => mapRef.current?.resize(),
    loadRouteBriefing: (saved) => routeBriefing.actions.loadSavedRoute(saved, { autoBriefing: true }),
    // 온보딩 투어용: 실제 공항 좌표를 써야 스포트라이트가 마커 위에 정확히 얹혀 클릭이 마커에 맞는다.
    // 공항 → 화면 픽셀(스포트라이트 위치). 데이터/지도 준비 전엔 null(오버레이가 대기).
    getAirportPoint: (icao) => {
      const map = mapRef.current
      const ap = airports.find((a) => a.icao === icao)
      if (!map || !ap) return null
      // project()는 캔버스(컨테이너) 기준 픽셀 — 사이드바만큼 오른쪽으로 밀린 캔버스의 뷰포트 오프셋을 더해야
      // position:fixed 스포트라이트와 맞는다(안 더하면 마커 왼쪽으로 어긋남).
      const p = map.project([ap.lon, ap.lat])
      const canvas = map.getCanvas().getBoundingClientRect()
      return { x: p.x + canvas.left, y: p.y + canvas.top }
    },
    // 공항으로 부드럽게 이동(선택은 안 함 — 선택하면 watch가 즉시 진행되어 클릭 유도가 무의미).
    // 처음 날아가기 직전의 실제 뷰를 저장 → resetView가 "사이트 진입 시 보던 그 줌"으로 정확히 복귀.
    // fitRadiusKm을 주면 고정 줌 대신 그 반경 원이 화면에 꽉 차도록 fitBounds(모니터링 range ring용).
    flyToAirport: (icao, { fitRadiusKm } = {}) => {
      const map = mapRef.current
      const ap = airports.find((a) => a.icao === icao)
      if (!map || !ap) return
      if (!tourHomeRef.current) tourHomeRef.current = { center: map.getCenter(), zoom: map.getZoom() }
      if (fitRadiusKm) {
        const ring = circle(point([ap.lon, ap.lat]), fitRadiusKm, { units: 'kilometers', steps: 32 })
        map.fitBounds(boundsFromCoords(ring.geometry.coordinates[0]), { padding: 32, duration: 800 })
        return
      }
      map.flyTo({ center: [ap.lon, ap.lat], zoom: 7.5, duration: 800 })
    },
    // 온보딩 스텝 전환 때 지도 리셋 — 저장한 초기 뷰(없으면 MAP_CONFIG)로 복귀.
    resetView: () => {
      const map = mapRef.current
      if (!map) return
      const home = tourHomeRef.current
      map.flyTo(home ? { ...home, duration: 600 } : { center: MAP_CONFIG.center, zoom: MAP_CONFIG.zoom, duration: 600 })
    },
  }))
  const { routeResult, fitBoundsRequest } = routeBriefing.state
  const [highlightedLeg, setHighlightedLeg] = useState(null) // NAVLOG 표에서 가리킨 구간
  const flyToKorea = () => {
    const map = mapRef.current
    const home = initialHomeRef.current
    if (map) map.flyTo(home ? { ...home, duration: 600 } : { center: MAP_CONFIG.center, zoom: MAP_CONFIG.zoom, bearing: 0, pitch: 0, duration: 600 })
    setShowKoreaHome(false)
  }
  const { vfrWaypointsRef, hideTimerRef, mapInteractionModeRef, mapInteractionActionRef, mapInteractionStatusRef, vfrWaypointDropRef, designWaypointDropRef, isComparisonRef } = routeBriefing.refs
  const { setHoveredWpInfo } = routeBriefing.actions
  const { routePreviewModel } = routeBriefing
  const flightCategory = useFlightCategory()
  const fcPopupRef = useRef(null)
  const {
    windField, windRendererOptions, temperatureField, cloudField, icingField, ktgGrid,
    windStatus, tempStatus, cloudStatus, icingStatus, turbulenceStatus,
    lowPower, cloudMaxSpread,
    altLevelsFt, selectedAltFt, setSelectedAltFt,
    sliderLevels, sliderTimes, sliderAvailability, nwpSelection, setNwpSelection,
  } = useNwpOverlays({ enableWindOverlay, metVisibility, windFlowOpacity, windFlowTrail, windFlowWidth, timelineSelectedMs: weatherTimelineSelectedMs })

  useEffect(() => { onSelectRef.current = onAirportSelect }, [onAirportSelect])

  useEffect(() => {
    if (activePanel !== 'route-check') setRouteBriefingMapMode(false)
  }, [activePanel])

  useEffect(() => {
    const timer = window.setInterval(() => setLightningReferenceTimeMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!metVisibility.lightning || !blinkLightning) {
      setLightningBlinkOff(false)
      return undefined
    }
    const timer = window.setInterval(() => {
      setLightningBlinkOff((prev) => !prev)
    }, LIGHTNING_BLINK_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [metVisibility.lightning, blinkLightning])

  useEffect(() => {
    if (!metVisibility.sigwx) {
      setSigwxLegendOpen(false)
    }
  }, [metVisibility.sigwx])

  // ???? Procedure preview on map ????????????????????????????????????????????????????????????????????????????????????????????

  // Mobile: when a bottom sheet (route form or briefing) covers the lower screen,
  // fit the route into the visible map ABOVE the sheet by padding the bottom.
  // Desktop keeps its supplied padding (right-side panel handled separately).
  const fitPaddingFor = (desktopPad) => {
    const container = mapRef.current?.getContainer()
    const doc = container?.ownerDocument
    const sheet = doc?.querySelector('.mobile-sheet')
    if (sheet) {
      const h = Math.round(sheet.getBoundingClientRect().height) || 0
      return { top: 40, left: 30, right: 30, bottom: h + 30 }
    }
    // Desktop: pad the side(s) a panel covers so the route centers in the *visible* map
    // (not under a panel). 경로 결과(.briefing-view, 오른쪽)와 경로 입력(.route-check-panel, 왼쪽)
    // 둘 다 보일 때 각각 그 폭만큼 패딩 → 어느 패널에 가려지지 않게 맞춰짐.
    const cw = container?.clientWidth || 1200
    const base = typeof desktopPad === 'number' ? desktopPad : 60
    const pad = { top: base, bottom: base, left: base, right: base }
    const cap = (w) => Math.min(w + 24, cw - 120)
    const rightPanel = doc?.querySelector('.briefing-view')
    const rw = rightPanel ? Math.round(rightPanel.getBoundingClientRect().width) : 0
    if (rw > 0) pad.right = cap(rw)
    const leftPanel = doc?.querySelector('.route-check-panel')
    const lw = leftPanel ? Math.round(leftPanel.getBoundingClientRect().width) : 0
    if (lw > 0) pad.left = cap(lw)
    return pad
  }

  // NAVLOG 구간 강조 — 표의 한 줄에 호버/클릭하면 그 구간만 지도에서 굵게. 시점은 옮기지 않는다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    const coordinates = highlightedLeg?.coordinates?.length > 1
      ? highlightedLeg.coordinates
      : highlightedLeg ? legCoordinates(routeResult?.previewGeojson, highlightedLeg.from, highlightedLeg.to) : []
    syncLegHighlight(map, coordinates, { pinned: Boolean(highlightedLeg?.pinned) })
  }, [highlightedLeg, routeResult, isStyleReady, styleRevision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    const { fitCoordinates } = syncRoutePreviewLayers(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = boundsFromCoords(fitCoordinates)
      setShowKoreaHome(true)
      map.fitBounds(bounds, { padding: fitPaddingFor(80), maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, routeResult, isStyleReady, styleRevision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    const { fitCoordinates } = syncBoundaryFixPreview(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = boundsFromCoords(fitCoordinates)
      setShowKoreaHome(true)
      map.fitBounds(bounds, { padding: fitPaddingFor(80), maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, isStyleReady, routeResult, styleRevision])

  // 확정된 토큰을 점과 점선으로 보여준다. 공항 하나만 쳐도 그 지점이 지도에 뜨고,
  // 둘 이상이면 그 사이가 이어진다 — 목적지를 정하기 전에도 친 것이 화면에 있어야 한다.
  // 화면을 옮기지는 않는다: 치는 도중에 지도가 계속 움직이면 읽을 수가 없다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    syncTokenPreviewLayers(map, routeBriefing.state.routeTokenGeometry, { hasAppliedRoute: !!routeResult })
  }, [routeBriefing.state.routeTokenGeometry, routeResult, isStyleReady, styleRevision])

  useEffect(() => {
    const map = mapRef.current
    const coords = fitBoundsRequest?.coordinates ?? []
    if (!map || !isStyleReady || coords.length === 0) return
    const bounds = boundsFromCoords(coords)
    setShowKoreaHome(true)
    map.fitBounds(bounds, { padding: fitPaddingFor(80), maxZoom: fitBoundsRequest.maxZoom ?? 8, duration: 500 })
  }, [fitBoundsRequest, isStyleReady, styleRevision])

  // Scroll-sync: pan/zoom the live map to the active briefing section's spatial target.
  function focusBriefingSection(id) {
    const map = mapRef.current
    if (!map) return
    const meta = routeBriefing.state.briefing?.meta
    const byIcao = (icao) => airports.find((a) => a.icao === icao)
    const container = map.getContainer()
    const containerWidth = container?.clientWidth || 1200
    // Mobile: sheet covers the bottom → center in the visible map above it.
    // Desktop: panel covers the right → pad the right side.
    const sheet = container?.ownerDocument?.querySelector('.mobile-sheet')
    let pad
    if (sheet) {
      const h = Math.round(sheet.getBoundingClientRect().height) || 0
      pad = { top: 40, left: 30, right: 30, bottom: h + 30 }
    } else {
      const panelWidth = container?.ownerDocument?.querySelector('.briefing-view')?.clientWidth || Math.round(containerWidth * 0.48)
      const padRight = Math.min(panelWidth + 24, containerWidth - 120)
      pad = { top: 60, bottom: 60, left: 60, right: padRight }
    }
    const fitPts = (pts) => {
      if (pts.length < 1) return
      const bounds = boundsFromCoords(pts)
      setShowKoreaHome(true)
      map.fitBounds(bounds, { padding: pad, maxZoom: 8, duration: 600 })
    }
    if (id === 'destination') {
      const ap = byIcao(meta?.arrivalAirport)
      if (ap) {
        setShowKoreaHome(true)
        map.flyTo({ center: [ap.lon, ap.lat], zoom: 8.5, padding: pad, duration: 600 })
      }
    } else if (id === 'current') {
      fitPts([meta?.departureAirport, meta?.arrivalAirport, meta?.alternateAirport]
        .map(byIcao).filter(Boolean).map((a) => [a.lon, a.lat]))
    } else {
      const samples = routeBriefing.state.verticalProfile?.axis?.samples ?? []
      fitPts(samples.map((s) => [s.lon, s.lat]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))
    }
  }

  // When a briefing is shown, center the route in the visible LEFT map (panel on right).
  // Use the route coordinates directly — don't wait for the on-demand vertical profile.
  // Wait for the lazy briefing panel to mount before reading its width for map padding.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !routeBriefing.state.briefing) return undefined
    const st = routeBriefing.state
    // VFR은 모든 경유점을 포함해 fit(경유점이 dep→arr 직선 밖으로 멀리 나가도 다 보이게).
    // IFR은 fitBoundsRequest가 이미 전체 항로 경로를 담고 있음. fitBounds가 필요만큼 축소/확대.
    const coords = (st.routeResult?.flightRule === 'VFR'
      ? (st.vfrWaypoints ?? []).map((wp) => [wp.lon, wp.lat])
      : (fitBoundsRequest?.coordinates ?? [])
    ).filter((c) => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]))
    if (coords.length === 0) return undefined
    const fitForBriefingPanel = () => {
      if (!map.getContainer().ownerDocument.querySelector('.briefing-view')) return false
      setShowKoreaHome(true)
      map.fitBounds(boundsFromCoords(coords), { padding: fitPaddingFor(60), maxZoom: 8, duration: 600 })
      return true
    }
    if (fitForBriefingPanel()) return undefined
    const observer = new MutationObserver(() => {
      if (fitForBriefingPanel()) observer.disconnect()
    })
    observer.observe(map.getContainer().ownerDocument.body, { childList: true, subtree: true })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeBriefing.state.briefing, isStyleReady])

  const airportGeoJSON = useMemo(
    () => createAirportGeoJSON(airports, metarData),
    [airports, metarData],
  )
  const airportWeatherImageIds = useMemo(
    () => [...new Set(airportGeoJSON.features.map((feature) => feature.properties.weatherIconId).filter(Boolean))],
    [airportGeoJSON],
  )
  const adsbGeoJSON = useMemo(() => createAdsbGeoJSON(adsbData), [adsbData])
  const adsbTrailGeoJSON = useMemo(() => createAdsbTrailGeoJSON(adsbData), [adsbData])
  const adsbCounts = useMemo(() => countAircraft(adsbGeoJSON.features), [adsbGeoJSON])
  const adsbVisibleIds = useMemo(() => visibleIds(adsbGeoJSON.features, trafficFilters), [adsbGeoJSON, trafficFilters])
  const baseWeatherOverlayModel = useMemo(() => buildWeatherOverlayModel({
    echoMeta,
    wissdomMeta,
    qpfMeta,
    hsrMeta,
    hciMeta,
    satVisibleMeta,
    rainviewerMeta,
    satMeta,
    convectiveMeta,
    echoTopMeta,
    lightningData,
    sigwxLowData,
    sigwxLowHistoryData,
    sigmetData,
    airmetData,
    visibility: metVisibility,
    selectedWeatherTimeMs: weatherTimelineSelectedMs,
    sigwxHistoryIndex,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    lightningReferenceTimeMs: effectiveLightningReferenceTimeMs,
    nwpSelection,
    ktgGrid,
    // Shared "지금" — real time outside demo mode, refreshed every 30 s. It is what separates
    // the observed past from the forecast future on the timeline.
    nowMs: demoNowMs,
    tz,
  }), [
    echoMeta,
    wissdomMeta,
    qpfMeta,
    hsrMeta,
    hciMeta,
    satVisibleMeta,
    rainviewerMeta,
    satMeta,
    convectiveMeta,
    echoTopMeta,
    lightningData,
    sigwxLowData,
    sigwxLowHistoryData,
    sigmetData,
    airmetData,
    metVisibility,
    weatherTimelineSelectedMs,
    sigwxHistoryIndex,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    effectiveLightningReferenceTimeMs,
    nwpSelection,
    ktgGrid,
    demoNowMs,
    tz,
  ])
  const radarWindOverlay = useRadarWindOverlay({
    radarHsrEnabled: baseWeatherOverlayModel.visibility.radarHsr,
    exactFrameAvailable: (heightM) => hasExactRadarWindFrame({
      radarFrame: baseWeatherOverlayModel.radarFrame,
      wissdomMeta,
      heightM,
    }),
  })
  // baseWeatherOverlayModel과 같은 계산을 WISSDOM 선택 결과까지 반영해 한 번 더 돈다.
  // useMemo가 없으면 렌더마다 프레임 객체가 새로 생겨, 아래 rasterAndSigwxModel 등이
  // 내용은 그대로인데 "바뀐 것"으로 판정돼 지도 동기화가 통째로 매 렌더 다시 돈다.
  const weatherOverlayModel = useMemo(() => buildWeatherOverlayModel({
    echoMeta, wissdomMeta, qpfMeta, hsrMeta, hciMeta, satVisibleMeta, rainviewerMeta, satMeta, convectiveMeta, echoTopMeta,
    lightningData, sigwxLowData, sigwxLowHistoryData, sigmetData, airmetData,
    visibility: metVisibility, selectedWeatherTimeMs: weatherTimelineSelectedMs,
    radarWindHeightM: radarWindOverlay.heightM,
    radarWindRequested: radarWindOverlay.effectiveVisible,
    sigwxHistoryIndex, sigwxFilter, hiddenAdvisoryKeys, selectedSigwxFrontMeta,
    selectedSigwxCloudMeta, lightningReferenceTimeMs: effectiveLightningReferenceTimeMs,
    nwpSelection, ktgGrid, nowMs: demoNowMs, tz,
  }), [
    echoMeta, wissdomMeta, qpfMeta, hsrMeta, hciMeta, satVisibleMeta, rainviewerMeta, satMeta, convectiveMeta, echoTopMeta,
    lightningData, sigwxLowData, sigwxLowHistoryData, sigmetData, airmetData,
    metVisibility, weatherTimelineSelectedMs,
    radarWindOverlay.heightM, radarWindOverlay.effectiveVisible,
    sigwxHistoryIndex, sigwxFilter, hiddenAdvisoryKeys, selectedSigwxFrontMeta,
    selectedSigwxCloudMeta, effectiveLightningReferenceTimeMs,
    nwpSelection, ktgGrid, demoNowMs, tz,
  ])
  const convectiveOverlay = useConvectiveOverlay({
    mapRef, isStyleReady, styleRevision,
    ciVisible: metVisibility.ci, ctpsVisible: metVisibility.ctps,
    ciFrame: weatherOverlayModel.ciFrame, ctpsFrame: weatherOverlayModel.ctpsFrame,
    fetchCtpsPoint: fetchConvectiveCtpsPoint, timeZone: tz,
  })
  const echoTopOverlay = useEchoTopOverlay({
    mapRef, isStyleReady, styleRevision,
    visible: metVisibility.echoTop,
    frame: weatherOverlayModel.echoTopFrame,
    fetchPoint: fetchEchoTopPoint,
  })
  const typhoonOverlay = useTyphoonOverlay({
    mapRef, isStyleReady, styleRevision, visible: metVisibility.typhoon, timeZone: tz,
  })
  const radarWindEffectiveVisible = radarWindOverlay.effectiveVisible
  const timelineAvailableFrameEntries = useMemo(() => [
    ...weatherOverlayModel.activeFrameEntries,
    ...nwpAvailabilityEntries(sliderTimes),
  ], [sliderTimes, weatherOverlayModel.activeFrameEntries])
  const {
    radarFrames,
    satelliteFrames,
    weatherTimelineTicks,
    forecastTimelineTicks,
    sigwxHistoryEntries,
    selectedSigwxEntry,
    sigwxGroups,
    sigmetItems,
    airmetItems,
    advisoryBadgeItems,
    sigmetCount,
    airmetCount,
    sigwxCount,
    lightningCount,
    radarLegendVisible,
    radarOverseasLegendVisible,
    rainviewerOutOfRange,
    lightningLegendVisible,
    lightningLegendEntries,
    radarReferenceTimeMs,
    sigwxIssueLabel,
    sigwxValidLabel,
    nwpIssueLabel,
    nwpValidLabel,
    ktgIssueLabel,
    ktgValidLabel,
  } = weatherOverlayModel
  const advisoryPanelItems = useMemo(() => {
    if (openAdvisoryPanel === 'sigwxLow') return sigwxGroups
    if (openAdvisoryPanel === 'sigmet') return sigmetItems.filter((i) => i.source !== 'NOAA')
    if (openAdvisoryPanel === 'airmet') return airmetItems
    return []
  }, [openAdvisoryPanel, sigwxGroups, sigmetItems, airmetItems])

  const fcStamps = useMemo(
    () => legendStamps(flightCategory.sources, flightCategory.hasData, flightCategory.computedAt, tz),
    [flightCategory.sources, flightCategory.hasData, flightCategory.computedAt, tz],
  )

  const timestampEntries = useMemo(() => {
    const entries = []
    if (enableWindOverlay && metVisibility.wind)
      entries.push({ key: 'wind', label: '바람', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.temp)
      entries.push({ key: 'temp', label: '기온', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.cloud)
      entries.push({ key: 'cloud', label: '습도', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.icing)
      entries.push({ key: 'icing', label: '착빙', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.turbulence)
      entries.push({ key: 'turbulence', label: '난류', issueLabel: ktgIssueLabel, validLabel: ktgValidLabel })
    if (metVisibility.visibility)
      entries.push({ key: 'visibility', label: '시정', issueLabel: fcStamps.visibility })
    if (metVisibility.ceiling)
      entries.push({ key: 'ceiling', label: '운고', issueLabel: fcStamps.ceiling })
    if (showFlightCategoryStations && (metVisibility.visibility || metVisibility.ceiling))
      entries.push({ key: 'fcStations', label: '관측지점', issueLabel: fcStamps.stations })
    if (metVisibility.sigwx) {
      const entryCount = sigwxHistoryEntries.length
      entries.push({
        key: 'sigwx',
        label: `SIGWX-L · ${entryCount ? sigwxHistoryIndex + 1 : 0}/${entryCount}`,
        issueLabel: sigwxIssueLabel,
        validLabel: sigwxValidLabel,
        history: entryCount > 1 ? {
          atOldest: sigwxHistoryIndex >= entryCount - 1,
          atLatest: sigwxHistoryIndex <= 0,
          onPrevious: () => setSigwxHistoryIndex((prev) => Math.min(entryCount - 1, prev + 1)),
          onNext: () => setSigwxHistoryIndex((prev) => Math.max(0, prev - 1)),
        } : null,
      })
    }
    return entries
  }, [
    enableWindOverlay,
    metVisibility.wind, metVisibility.temp, metVisibility.cloud,
    metVisibility.icing, metVisibility.turbulence, metVisibility.visibility, metVisibility.ceiling, metVisibility.sigwx,
    nwpIssueLabel, nwpValidLabel, ktgIssueLabel, ktgValidLabel,
    fcStamps, showFlightCategoryStations,
    sigwxIssueLabel, sigwxValidLabel, sigwxHistoryEntries.length, sigwxHistoryIndex,
  ])

  const weatherPointFields = useMemo(() => ({
    windField,
    temperatureField,
    cloudField,
    icingField,
    ktgGrid,
  }), [cloudField, icingField, ktgGrid, temperatureField, windField])
  const weatherPointVisibility = useMemo(() => ({
    wind: enableWindOverlay && metVisibility.wind,
    temp: enableWindOverlay && metVisibility.temp,
    cloud: enableWindOverlay && metVisibility.cloud,
    icing: enableWindOverlay && metVisibility.icing,
    turbulence: enableWindOverlay && metVisibility.turbulence,
  }), [enableWindOverlay, metVisibility.cloud, metVisibility.icing, metVisibility.temp, metVisibility.turbulence, metVisibility.wind])
  const weatherPointInspector = useWeatherPointInspector({
    mapRef,
    isStyleReady,
    enabled: Object.values(weatherPointVisibility).some(Boolean),
    visibility: weatherPointVisibility,
    fields: weatherPointFields,
    issueLabel: nwpIssueLabel,
    validLabel: nwpValidLabel,
    turbulenceIssueLabel: ktgIssueLabel,
    turbulenceValidLabel: ktgValidLabel,
  })

  useTimelinePlayback({
    isPlaying: weatherTimelinePlaying,
    speed: weatherTimelineSpeed,
    pastTicksMs: weatherTimelineTicks,
    nwpTimes: sliderTimes,
    qpfTimesMs: forecastTimelineTicks,
    setSelectedMs: setWeatherTimelineSelectedMs,
  })

  useEffect(() => {
    if (sigwxHistoryIndex >= sigwxHistoryEntries.length) {
      setSigwxHistoryIndex(0)
    }
  }, [sigwxHistoryEntries.length, sigwxHistoryIndex])

  useEffect(() => {
    const selectedTmfc = selectedSigwxEntry?.tmfc
    if (!selectedTmfc) {
      setSelectedSigwxFrontMeta(null)
      setSelectedSigwxCloudMeta(null)
      return
    }

    let cancelled = false
    const isLatestTmfc = selectedTmfc === sigwxLowData?.tmfc

    async function loadSigwxMeta() {
      if (isLatestTmfc) {
        setSelectedSigwxFrontMeta(sigwxFrontMeta)
        setSelectedSigwxCloudMeta(sigwxCloudMeta)
      } else {
        setSelectedSigwxFrontMeta(null)
        setSelectedSigwxCloudMeta(null)
      }

      const [frontMeta, cloudMeta] = await Promise.all([
        fetchSigwxFrontMeta(selectedTmfc).catch(() => null),
        fetchSigwxCloudMeta(selectedTmfc).catch(() => null),
      ])

      if (cancelled) return
      setSelectedSigwxFrontMeta(frontMeta)
      setSelectedSigwxCloudMeta(cloudMeta)
    }

    loadSigwxMeta()
    return () => {
      cancelled = true
    }
  }, [selectedSigwxEntry?.tmfc, sigwxLowData?.tmfc, sigwxFrontMeta, sigwxCloudMeta])

  useEffect(() => {
    if (openAdvisoryPanel === 'sigwxLow' && !metVisibility.sigwx) setOpenAdvisoryPanel(null)
    if (openAdvisoryPanel === 'sigmet' && !metVisibility.sigmet) setOpenAdvisoryPanel(null)
    if (openAdvisoryPanel === 'airmet' && !metVisibility.airmet) setOpenAdvisoryPanel(null)
  }, [openAdvisoryPanel, metVisibility.sigwx, metVisibility.sigmet, metVisibility.airmet])

  useEffect(() => {
    if (metVisibility.sigwx) {
      onRequestDeferredWeatherData?.(['sigwxLowHistory'])
    }
  }, [metVisibility.sigwx, onRequestDeferredWeatherData])
  const rasterAndSigwxModel = useMemo(() => ({
    satelliteFrame: weatherOverlayModel.satelliteFrame,
    radarFrame: weatherOverlayModel.radarFrame,
    wissdomFrame: weatherOverlayModel.wissdomFrame,
    qpfFrame: weatherOverlayModel.qpfFrame,
    rainviewerMeta: weatherOverlayModel.rainviewerMeta,
    rainviewerFrame: weatherOverlayModel.rainviewerFrame,
    selectedSigwxFrontMeta: weatherOverlayModel.selectedSigwxFrontMeta,
    selectedSigwxCloudMeta: weatherOverlayModel.selectedSigwxCloudMeta,
    sigwxLowMapData: weatherOverlayModel.sigwxLowMapData,
    visibility: {
      satellite: weatherOverlayModel.visibility.satellite,
      radar: weatherOverlayModel.visibility.radar,
      radarOverseas: weatherOverlayModel.visibility.radarOverseas,
      sigwx: weatherOverlayModel.visibility.sigwx,
    },
    showVisibleSigwxFrontOverlay: weatherOverlayModel.showVisibleSigwxFrontOverlay,
    showVisibleSigwxCloudOverlay: weatherOverlayModel.showVisibleSigwxCloudOverlay,
  }), [
    weatherOverlayModel.satelliteFrame,
    weatherOverlayModel.radarFrame,
    weatherOverlayModel.wissdomFrame,
    weatherOverlayModel.qpfFrame,
    weatherOverlayModel.rainviewerMeta,
    weatherOverlayModel.rainviewerFrame,
    weatherOverlayModel.selectedSigwxFrontMeta,
    weatherOverlayModel.selectedSigwxCloudMeta,
    weatherOverlayModel.sigwxLowMapData,
    weatherOverlayModel.visibility.satellite,
    weatherOverlayModel.visibility.radar,
    weatherOverlayModel.visibility.radarOverseas,
    weatherOverlayModel.visibility.sigwx,
    weatherOverlayModel.showVisibleSigwxFrontOverlay,
    weatherOverlayModel.showVisibleSigwxCloudOverlay,
  ])
  const advisoryLayerModel = useMemo(() => ({
    visibility: {
      sigmet: weatherOverlayModel.visibility.sigmet,
      sigmet_intl: weatherOverlayModel.visibility.sigmet_intl,
      airmet: weatherOverlayModel.visibility.airmet,
    },
    sigmetFeatures: weatherOverlayModel.sigmetFeatures,
    sigmetLabels: weatherOverlayModel.sigmetLabels,
    sigmetIntlFeatures: weatherOverlayModel.sigmetIntlFeatures,
    sigmetIntlLabels: weatherOverlayModel.sigmetIntlLabels,
    airmetFeatures: weatherOverlayModel.airmetFeatures,
    airmetLabels: weatherOverlayModel.airmetLabels,
  }), [
    weatherOverlayModel.visibility.sigmet,
    weatherOverlayModel.visibility.sigmet_intl,
    weatherOverlayModel.visibility.airmet,
    weatherOverlayModel.sigmetFeatures,
    weatherOverlayModel.sigmetLabels,
    weatherOverlayModel.sigmetIntlFeatures,
    weatherOverlayModel.sigmetIntlLabels,
    weatherOverlayModel.airmetFeatures,
    weatherOverlayModel.airmetLabels,
  ])
  const lightningLayerModel = useMemo(() => ({
    visibility: {
      lightning: weatherOverlayModel.visibility.lightning,
    },
    lightningGeoJSON: weatherOverlayModel.lightningGeoJSON,
    lightningReferenceTimeMs: weatherOverlayModel.lightningReferenceTimeMs,
    blinkLightning,
    lightningBlinkOff,
  }), [
    weatherOverlayModel.visibility.lightning,
    weatherOverlayModel.lightningGeoJSON,
    weatherOverlayModel.lightningReferenceTimeMs,
    blinkLightning,
    lightningBlinkOff,
  ])

  function toggleAviation(id) {
    setAviationVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleMet(id) {
    // 태풍을 켜면 목록 패널이 뜬다. 레이어 패널을 열어둔 채로 두면 모바일에서 두 시트가
    // 완전히 겹쳐 목록에 손이 닿지 않는다 — 레이어 패널을 닫아 목록을 드러낸다.
    if (id === 'typhoon' && !metVisibility.typhoon) onClosePanel?.()
    setMetVisibility((prev) => {
      return getNextMetVisibility(prev, id, { lowPower })
    })
  }

  // 목록에서 NOTAM 클릭 → 지도가 해당 지오메트리로 줌인 + 강조. 지도표시 꺼져있으면 자동 ON.
  function locateNotam(item) {
    const map = mapRef.current
    const geom = displayGeometry(item)
    if (!map || !geom) return
    if (!metVisibility.notam) toggleMet('notam')
    setNotamHighlight(map, { type: 'Feature', geometry: geom, properties: { id: item.id } })
    const bounds = geometryBounds(geom)
    if (bounds) {
      map.fitBounds(bounds, { padding: { top: 70, bottom: 90, left: 470, right: 70 }, maxZoom: 12, duration: 800 })
    }
  }

  function clearAviationLayers() {
    setAviationVisibility(AVIATION_WFS_LAYERS.reduce((acc, l) => { acc[l.id] = false; return acc }, {}))
  }

  function clearMetLayers() {
    setMetVisibility((prev) => {
      const next = { ...prev }
      MET_LAYERS.forEach((l) => { next[l.id] = false })
      return next
    })
  }

  // ???? ADS-B Polling ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    let timeoutId
    let cancelled = false

    if (ADSB_FETCH_DISABLED || !trafficVisible) {
      setAdsbLoading(false)
      return undefined
    }

    setAdsbLoading(!adsbData)

    async function poll() {
      const data = await fetchAdsbData()
      if (cancelled) return
      if (data) setAdsbData(data)
      setAdsbLoading(false)
      timeoutId = setTimeout(poll, ADSB_POLL_INTERVAL_MS)
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [trafficVisible])

  // ???? Map init ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined

    const token = import.meta.env.VITE_MAPBOX_TOKEN
    if (!token) { setError('VITE_MAPBOX_TOKEN is required.'); return undefined }

    mapboxgl.accessToken = token

    const initialBasemap = BASEMAP_OPTIONS[0]

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: initialBasemap.style,
      config: { basemap: initialBasemap.config },
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.maxBounds,
      logoPosition: 'bottom-right',
      language: 'ko',
      localIdeographFontFamily: '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif',
      // 기본 첨부는 넓은 화면에서 펼쳐진 채라 하단 타임라인 재생 버튼과 겹친다.
      // 아래에서 compact(‘i’ 버튼 → 클릭 시 펼침) 첨부를 직접 추가한다.
      attributionControl: false,
    })

    // 화살표키는 지도 이동이 아니라 타임라인/연직슬라이더 조작에 쓴다(아래 keydown 포워딩 참고).
    map.keyboard.disable()
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    if (showGeolocateControl) {
      map.addControl(new mapboxgl.GeolocateControl({ trackUserLocation: true, showUserHeading: true }), 'bottom-right')
    }

    let resizeFrame = null
    const resizeMap = () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        map.resize()
      })
    }
    const resizeObserver = new ResizeObserver(resizeMap)
    resizeObserver.observe(mapContainerRef.current)
    window.addEventListener('resize', resizeMap)

    let vfrInteractionsBound = false
    let routeInteractionCleanup = null

    // zoom handler lives outside style.load to avoid duplicate registration on style switch
    let roadsVisible = map.getZoom() >= ROAD_VISIBILITY_ZOOM
    map.on('zoom', () => {
      if (!map.isStyleLoaded()) return
      const should = map.getZoom() >= ROAD_VISIBILITY_ZOOM
      if (should !== roadsVisible) { roadsVisible = should; applyRoadVisibility(map, roadsVisible) }
    })

    map.on('style.load', () => {
      applyRoadVisibility(map, roadsVisible)

      // 새 스타일은 소스를 전부 새로 만드므로 지연 로딩 여부 추적도 초기화.
      resetLazyGeoJsonSources(map)

      // Aviation GeoJSON
      addAviationWfsLayers(map)

      // Route preview
      installRoutePreviewLayers(map)
      if (!vfrInteractionsBound) {
        vfrInteractionsBound = true
        bindVfrInteractions(map, vfrWaypointsRef, vfrWaypointDropRef, isComparisonRef, designWaypointDropRef)
        routeInteractionCleanup = bindIfrClickInteraction(map, mapInteractionModeRef, mapInteractionActionRef, mapInteractionStatusRef)
        // Procedure waypoint name on hover, in the original label style (small
        // colored text beside the dot) — reveal only the hovered fix's label.
        const procWpRoleFilter = ['any', ['==', ['get', 'role'], 'sid-wp'], ['==', ['get', 'role'], 'star-wp'], ['==', ['get', 'role'], 'iap-wp']]
        map.on('mouseenter', PROC_WP_CIRCLE, (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const f = e.features?.[0]
          if (!f) return
          map.setFilter(PROC_WP_LABEL, ['all', procWpRoleFilter, ['==', ['get', 'label'], f.properties.label]])
          map.setLayoutProperty(PROC_WP_LABEL, 'visibility', 'visible')
        })
        map.on('mouseleave', PROC_WP_CIRCLE, () => {
          map.getCanvas().style.cursor = ''
          map.setLayoutProperty(PROC_WP_LABEL, 'visibility', 'none')
        })
      }

      // Weather overlays
      installWeatherOverlayLayers(map)

      // Geo boundaries (coastline + admin)
      addGeoBoundaryLayers(map)

      // Airport circles
      addAirportLayers(map, { type: 'FeatureCollection', features: [] })

      // ADS-B
      addAdsbLayers(map)

      setStyleRevision((value) => value + 1)
      setIsStyleReady(true)
      notifyInitialStyleReady()
    })

    mapRef.current = map
    // ponytail: DEV 전용 디버그 훅 — Playwright/콘솔에서 카메라 정밀 제어용. 프로덕션 빌드엔 미포함.
    if (import.meta.env.DEV) window.__map = map
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', resizeMap)
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      routeInteractionCleanup?.()
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined

    cleanupAll(airportEventCleanupRef.current)
    cleanupAll(advisoryEventCleanupRef.current)
    adsbEventCleanupRef.current?.()
    sectorEventCleanupRef.current?.()

    airportEventCleanupRef.current = [
      // click + cursor on all interactive layers
      ...AIRPORT_INTERACTIVE_LAYERS.flatMap((layerId) => [
        bindLayerEvent(map, 'click', layerId, (e) => {
          const icao = e.features?.[0]?.properties?.icao
          if (!icao) return
          // Touch fires no mouseleave, so clear the hover tooltip on selection.
          tooltipIcaoRef.current = null
          clearTimeout(tooltipTimerRef.current)
          setHoveredAirportIcao(null)
          onSelectRef.current?.(icao)
        }),
        bindLayerEvent(map, 'mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' }),
        bindLayerEvent(map, 'mouseleave', layerId, () => { map.getCanvas().style.cursor = '' }),
      ]),
      // tooltip via mousemove — avoids adjacent-airport cancel race condition
      bindLayerEvent(map, 'mousemove', AIRPORT_STATION_CENTER_LAYER, (e) => {
        const icao = e.features?.[0]?.properties?.icao
        const coords = e.features?.[0]?.geometry?.coordinates
        if (!icao || !coords) return
        clearTimeout(tooltipTimerRef.current)
        if (icao !== tooltipIcaoRef.current) {
          tooltipIcaoRef.current = icao
          const { x, y } = map.project(coords)
          setHoveredAirportIcao(icao)
          setTooltipPos({ x, y })
        }
      }),
      bindLayerEvent(map, 'mouseleave', AIRPORT_STATION_CENTER_LAYER, () => {
        tooltipIcaoRef.current = null
        clearTimeout(tooltipTimerRef.current)
        tooltipTimerRef.current = setTimeout(() => {
          setHoveredAirportIcao(null)
        }, 80)
      }),
    ]

    const advisoryLayerIds = [
      ADVISORY_LAYER_DEFS.sigmet.fillLayerId,
      ADVISORY_LAYER_DEFS.sigmet.lineLayerId,
      ADVISORY_LAYER_DEFS.sigmet_intl.fillLayerId,
      ADVISORY_LAYER_DEFS.sigmet_intl.lineLayerId,
      ADVISORY_LAYER_DEFS.airmet.fillLayerId,
      ADVISORY_LAYER_DEFS.airmet.lineLayerId,
    ]
    // 클릭 하나가 여러 레이어(국내/해외 SIGMET, AIRMET)에서 동시에 걸릴 수 있어 레이어별
    // 핸들러가 각자 팝업을 띄우면 중복이 뜬다 — 같은 물리 클릭(원본 DOM 이벤트)당 한 번만
    // 처리하고, 그 지점의 모든 항목을 모아 겹친 것 전부를 한 팝업에 같이 보여준다.
    const handledAdvisoryClicks = new WeakSet()
    const showAdvisoryPopup = (e) => {
      const domEvent = e.originalEvent
      if (domEvent) {
        if (handledAdvisoryClicks.has(domEvent)) return
        handledAdvisoryClicks.add(domEvent)
      }

      const features = map.queryRenderedFeatures(e.point, { layers: advisoryLayerIds })
      const seenIds = new Set()
      const advisories = []
      for (const feature of features) {
        const id = feature.properties?.id
        const desc = feature.properties?.description
        if (!desc || (id && seenIds.has(id))) continue
        if (id) seenIds.add(id)
        advisories.push(feature.properties)
      }
      if (!advisories.length) return

      const html = advisories
        .map((advisory) => {
          const type = advisory.kind?.startsWith('sigmet') ? 'SIGMET' : 'AIRMET'
          const tone = type.toLowerCase()
          const name = `${type}${advisory.sequence ? ` ${advisory.sequence}` : ''}${advisory.fir ? ` · ${advisory.fir}` : ''}`
          const details = [
            ['고도', advisory.altitude],
            ['이동', advisory.motion],
          ].filter(([, value]) => value)
          return `<section class="mapbox-advisory-popup mapbox-advisory-popup--${tone}">
            <div class="mapbox-advisory-popup-head"><span class="mapbox-advisory-popup-icon" aria-hidden="true">⚠</span><strong>${escapeHtml(name)}</strong></div>
            <div class="mapbox-advisory-popup-body"><span class="mapbox-advisory-popup-acc" aria-hidden="true"></span><div>
              <p class="mapbox-advisory-popup-title">${escapeHtml(advisory.phenomenonLabel || advisory.label || '')}</p>
              ${advisory.validity ? `<p class="mapbox-advisory-popup-time">${escapeHtml(advisory.validity)}</p>` : ''}
              ${details.length ? `<div class="mapbox-advisory-popup-details">${details.map(([label, value]) => `<div class="mapbox-advisory-popup-detail"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>` : ''}
            </div></div>
          </section>`
        })
        .join('<hr class="mapbox-advisory-popup-divider" />')

      new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map)
    }
    advisoryEventCleanupRef.current = advisoryLayerIds.flatMap((layerId) => [
      bindLayerEvent(map, 'click', layerId, showAdvisoryPopup),
      bindLayerEvent(map, 'mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' }),
      bindLayerEvent(map, 'mouseleave', layerId, () => { map.getCanvas().style.cursor = '' }),
    ])

    adsbEventCleanupRef.current = bindAdsbHover(map)
    sectorEventCleanupRef.current = bindSectorHover(map)

    return () => {
      cleanupAll(airportEventCleanupRef.current)
      cleanupAll(advisoryEventCleanupRef.current)
      adsbEventCleanupRef.current?.()
      sectorEventCleanupRef.current?.()
      airportEventCleanupRef.current = []
      advisoryEventCleanupRef.current = []
      adsbEventCleanupRef.current = null
      sectorEventCleanupRef.current = null
    }
  }, [isStyleReady, styleRevision])

  // ???? Sync aviation layer visibility ??????????????????????????????????????????????????????????????????????????????

  // map.isStyleLoaded()로 막으면 안 된다 — 레이더처럼 계속 갱신되는 소스가 하나라도 있으면
  // 그 값이 계속 false라, 토글이 통째로 무시되고 다시 시도되지도 않는다(레이어가 안 켜짐).
  // 다른 동기화들과 같이 style.load로 세운 isStyleReady/styleRevision을 기준으로 삼는다.
  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    AVIATION_WFS_LAYERS.forEach((l) => setLayerVisibility(map, l, aviationVisibility[l.id]))
  }, [aviationVisibility])

  // ???? Route highlight (?롪퍔?δ빳???뚮뜆?????깅턄???띠룆踰????戮?뻣) ????????????????????????????????????????????????????

  // ???? VFR waypoint sync ????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || (routeResult?.flightRule !== 'VFR' && routePreviewModel?.pendingRouteResult?.flightRule !== 'VFR')) return
    syncVfrWaypointData(map, routePreviewModel)
  }, [routePreviewModel, routeResult, isStyleReady, styleRevision])

  // ???? VFR WP hover (X ?뺢퀗?????戮?뻣?? ????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    const onWpMove = (e) => {
      clearTimeout(hideTimerRef.current)
      const wpIdx = e.features[0].properties.wpIndex
      const wp = vfrWaypointsRef.current[wpIdx]
      if (!wp || wp.fixed) { setHoveredWpInfo(null); return }
      const pos = map.project([wp.lon, wp.lat])
      setHoveredWpInfo({ idx: wpIdx, x: pos.x, y: pos.y })
    }
    const onWpLeave = () => {
      hideTimerRef.current = setTimeout(() => setHoveredWpInfo(null), 120)
    }

    map.on('mousemove', VFR_WP_CIRCLE, onWpMove)
    map.on('mouseleave', VFR_WP_CIRCLE, onWpLeave)
    return () => {
      map.off('mousemove', VFR_WP_CIRCLE, onWpMove)
      map.off('mouseleave', VFR_WP_CIRCLE, onWpLeave)
    }
  }, [isStyleReady, styleRevision])

  // ???? Sync MET overlays ??????????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    syncRasterAndSigwxLayers(map, rasterAndSigwxModel)
  }, [rasterAndSigwxModel])

  // 이용자가 올린 KML/KMZ. 상태와 레이어 배선은 전부 features/my-map/ 안에 있다.
  const myMap = useMyMap(mapRef, isStyleReady)

  // ponytail: 기상청 합성영상(HSR·수상체) 임시 비교용 동기화.
  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    syncKmaCompositeLayers(map, {
      hsrMeta, hciMeta, visibleMeta: satVisibleMeta,
      qpfFrame: weatherOverlayModel.qpfFrame,
      selectedMs: weatherOverlayModel.selectedWeatherTimeMs,
      visibility: metVisibility,
    })
  }, [hsrMeta, hciMeta, satVisibleMeta, weatherOverlayModel.qpfFrame, weatherOverlayModel.selectedWeatherTimeMs, metVisibility])

  // ???? Sync terrain hazard shading ????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    syncTerrainHazardLayer(map, {
      visible: metVisibility.terrainHazard,
      altitudeFt: terrainAltitudeFt,
    })
  }, [metVisibility.terrainHazard, terrainAltitudeFt])

  // ???? Sync SIGMET / AIRMET ????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    syncAdvisoryLayers(map, advisoryLayerModel)
  }, [advisoryLayerModel])

  // ???? Sync lightning ????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    syncLightningLayers(map, lightningLayerModel)
    updateRangeRingHighlight(map, highlightRingRadiusKm, lightningBlinkOff, metVisibility.lightning)
  }, [lightningLayerModel, highlightRingRadiusKm, metVisibility.lightning, blinkLightning])

  // FIR 경계 틱(지오메트리 렌더 + moveend 재생성) — 스크롤 후 틱 이탈 방지.
  useFirTickOverlay(mapRef, isStyleReady, styleRevision)

  // 활성화 NOTAM과 매칭된 군작전구역에 빗금 — 켜진 구역과 평상시 구역을 구분한다.
  useMoaActivation(mapRef, isStyleReady, styleRevision, notamData)

  // 패널 표시 여부와 무관하게 항상 호출 — activePanel이 'custom-area'가 아닐 때도 draw
  // 컨트롤/완성된 폴리곤이 지도에 남아있어야 하고(패널 닫기/탭 전환에 폴리곤이 사라지면 안 됨),
  // 다른 탭을 보는 중에도 지도 위 폴리곤 클릭으로 패널을 자동으로 열 수 있어야 한다.
  const mapTools = useMapTools(mapRef, isStyleReady, {
    panelOpen: activePanel === 'custom-area',
    onFeatureSelect: onOpenCustomAreaPanel,
  })

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    if (!enableWindOverlay) return
    syncWindOverlay(map, {
      windField,
      rendererOptions: windRendererOptions,
      visibility: {
        wind: metVisibility.wind,
        windFlow: metVisibility.windFlow,
        windSpeed: metVisibility.windSpeed,
      },
    })
  }, destroyWindOverlay, [
    enableWindOverlay,
    windField,
    windRendererOptions,
    metVisibility.wind,
    metVisibility.windFlow,
    metVisibility.windSpeed,
  ])

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    if (!enableWindOverlay) return
    syncTemperatureOverlay(map, {
      temperatureField,
      isVisible: metVisibility.temp,
    })
  }, destroyTemperatureOverlay, [
    enableWindOverlay,
    temperatureField,
    metVisibility.temp,
  ])

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    if (!enableWindOverlay) return
    syncCloudPotentialOverlay(map, {
      cloudPotentialField: cloudField,
      isVisible: metVisibility.cloud,
    })
  }, destroyCloudPotentialOverlay, [
    enableWindOverlay,
    cloudField,
    metVisibility.cloud,
  ])

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    if (!enableWindOverlay) return
    syncIcingPotentialOverlay(map, {
      icingField,
      isVisible: metVisibility.icing,
    })
  }, destroyIcingPotentialOverlay, [
    enableWindOverlay,
    icingField,
    metVisibility.icing,
  ])

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    if (!enableWindOverlay) return
    syncKtgTurbulenceOverlay(map, {
      ktgGrid,
      isVisible: metVisibility.turbulence,
    })
  }, destroyKtgTurbulenceOverlay, [
    enableWindOverlay,
    ktgGrid,
    metVisibility.turbulence,
  ])

  // ???? Sync geo boundaries ??????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    const presentation = geoBoundaryPresentation({ basemapId, metVisibility, enableWindOverlay })
    setGeoBoundaryVisibility(map, presentation.visible, presentation.color)
  }, [
    basemapId,
    enableWindOverlay,
    metVisibility.satellite,
    metVisibility.satelliteVisible,
    metVisibility.radar,
    metVisibility.radarHsr,
    metVisibility.radarHci,
    metVisibility.wind,
    metVisibility.temp,
    metVisibility.cloud,
    metVisibility.icing,
  ])

  // ???? Sync ADS-B ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    registerAircraftImages(map)
    registerAirlineLogos(map)
    syncAdsbLayer(map, { geojson: adsbGeoJSON, trailGeojson: adsbTrailGeoJSON, isVisible: trafficVisible })
    applyAdsbFilter(map, { ids: adsbVisibleIds, filtered: hasActiveFilters(trafficFilters) })
  }, [adsbGeoJSON, adsbTrailGeoJSON, trafficVisible, adsbVisibleIds, trafficFilters])

  // ???? Sync flight category overlay ??????????????????????????????????????????????????????????????????????????????????????????????????

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    syncFlightCategoryLayers(map, {
      visibility: flightCategory.visibility,
      ceiling: flightCategory.ceiling,
      stations: flightCategory.stations,
      showVisibility: !!metVisibility.visibility,
      showCeiling: !!metVisibility.ceiling,
      showMissing: showFlightCategoryMissing,
      showStations: showFlightCategoryStations,
      beforeLayerId: AIRPORT_CIRCLE_LAYER,
    })
  }, removeFlightCategoryLayers, [
    flightCategory.visibility, flightCategory.ceiling, flightCategory.stations,
    metVisibility.visibility, metVisibility.ceiling,
    showFlightCategoryMissing, showFlightCategoryStations,
  ])

  // ???? Sync selected-airport range rings (monitoring only) ??????????????????????????????????????????????????????????????????????????

  const rangeRingCenter = useMemo(() => {
    if (!rangeRingRadiiKm?.length || !selectedAirport) return null
    const airport = airports.find((a) => a.icao === selectedAirport)
    if (!airport || !Number.isFinite(airport.lon) || !Number.isFinite(airport.lat)) return null
    return [airport.lon, airport.lat]
  }, [airports, selectedAirport, rangeRingRadiiKm])

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    if (!rangeRingCenter || !rangeRingRadiiKm?.length) {
      removeRangeRings(map)
      return
    }
    syncRangeRings(map, buildRangeRingGeoJSON(rangeRingCenter, rangeRingRadiiKm))
  }, removeRangeRings, [rangeRingCenter, rangeRingRadiiKm])

  // FC_VIS_LAYER가 이미 있어야 click을 걸 수 있다 — 위 동기화 effect(:1509)가 이 effect보다
  // 먼저 선언돼 있어야 같은 커밋에서 레이어가 먼저 만들어진다. 훅 순서를 바꾸면 조용히 깨진다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    return bindFlightCategoryClick(map, fcPopupRef)
  }, [isStyleReady, styleRevision]) // eslint-disable-line react-hooks/exhaustive-deps

  // ???? Sync airport data ??????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    let cancelled = false

    async function syncAirportMarkers() {
      registerAirportStationImages(map)
      registerAirportWindBarbImages(map)
      await registerAirportWeatherImages(map, airportWeatherImageIds)
      if (cancelled) return

      addAirportLayers(map, airportGeoJSON)
      map.getSource(AIRPORT_SOURCE_ID)?.setData(airportGeoJSON)
    }

    void syncAirportMarkers()

    return () => {
      cancelled = true
    }
  }, [airportGeoJSON, airportWeatherImageIds, isStyleReady, styleRevision])

  // ???? Sync airport selected state ??????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !map.getSource(AIRPORT_SOURCE_ID)) return
    airportGeoJSON.features.forEach((f) => {
      map.setFeatureState(
        { source: AIRPORT_SOURCE_ID, id: f.properties.icao },
        { selected: f.properties.icao === selectedAirport },
      )
    })
  }, [airportGeoJSON, selectedAirport, isStyleReady, styleRevision])

  // ???? Layer panel helpers ??????????????????????????????????????????????????????????????????????????????????????????????????????

  function switchBasemap(id) {
    const map = mapRef.current
    if (!map || id === basemapId) return
    const option = BASEMAP_OPTIONS.find((o) => o.id === id)
    if (!option) return
    setBasemapId(id)
    setBasemapMenuOpen(false)
    setIsStyleReady(false)
    map.setStyle(option.style, { config: { basemap: option.config } })
  }

  function isMetLayerDisabled(id) {
    if (id === 'wind') return !enableWindOverlay || (windStatus === 'error' && !windField)
    if (id === 'temp') return !enableWindOverlay || ((tempStatus === 'error' || tempStatus === 'unavailable') && !temperatureField)
    if (id === 'cloud') {
      return !enableWindOverlay || (!metVisibility.cloud && (cloudStatus === 'error' || cloudStatus === 'unavailable') && !cloudField)
    }
    if (id === 'icing') {
      return !enableWindOverlay || (!metVisibility.icing && (icingStatus === 'error' || icingStatus === 'unavailable') && !icingField)
    }
    if (id === 'turbulence') {
      return !enableWindOverlay || (!metVisibility.turbulence && turbulenceStatus === 'error' && !ktgGrid)
    }
    if (id === 'radar') return radarFrames.length === 0
    if (id === 'satellite') return satelliteFrames.length === 0
    return false
  }

  // 그리기 런처 표시 여부 — 베이스맵 버튼 위치가 여기에 따라 갈린다.
  const mapToolsVisible = showMapTools && (!isMobile || mobileTask === 'map' || mobileTask === 'route')

  function metLayerBadge(id) {
    if (id === 'sigmet') return sigmetCount
    if (id === 'airmet') return airmetCount
    if (id === 'lightning') return lightningCount
    if (id === 'sigwx') return sigwxCount
    if (id === 'typhoon') return typhoonOverlay.typhoons.length
    return null
  }

  function toggleSigwxLegend(event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    setSigwxLegendOpen((prev) => !prev)
  }

  function toggleSigwxGroup(groupKey) {
    setHiddenAdvisoryKeys((prev) => {
      const current = new Set(prev.sigwxLow || [])
      if (current.has(groupKey)) current.delete(groupKey)
      else current.add(groupKey)
      return { ...prev, sigwxLow: [...current] }
    })
  }

  function toggleSigwxFilter(filterKey) {
    setSigwxFilter((prev) => ({ ...prev, [filterKey]: prev[filterKey] === false }))
  }

  function toggleAdvisoryPanel(key) {
    setOpenAdvisoryPanel((prev) => (prev === key ? null : key))
  }

  function toggleAdvisoryVisibility(kind, mapKey) {
    setHiddenAdvisoryKeys((prev) => {
      const current = new Set(prev[kind] || [])
      if (current.has(mapKey)) current.delete(mapKey)
      else current.add(mapKey)
      return { ...prev, [kind]: [...current] }
    })
  }

  // Active-layer counts (mirror the panel "N개 켜짐" logic) reported up for the
  // mobile on-map entry buttons.
  const aviationActiveCount = AVIATION_WFS_LAYERS.filter((layer) => {
    const merged = AVIATION_PANEL_MERGE_GROUPS[layer.id]
    if (merged) return merged.some((id) => aviationVisibility[id])
    return !Object.values(AVIATION_PANEL_MERGE_GROUPS).some((ids) => ids.includes(layer.id)) && aviationVisibility[layer.id]
  }).length
  const metActiveCount = MET_LAYERS.filter((l) => metVisibility[l.id] && !isMetLayerDisabled(l.id)).length
  useEffect(() => {
    onLayerCountsChange?.({ aviation: aviationActiveCount, met: metActiveCount, traffic: trafficVisible ? 1 : 0 })
  }, [aviationActiveCount, metActiveCount, trafficVisible, onLayerCountsChange])

  // ???? Render ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  return (
    <div
      className="map-view-wrapper"
      data-mobile-layer-panel={activePanel === 'aviation' || activePanel === 'met' ? 'true' : undefined}
      data-mobile-task={mobileTask}
      data-route-briefing-map-mode={activePanel === 'route-check' && routeBriefingMapMode ? 'true' : 'false'}
    >
      <div ref={mapContainerRef} className="map-view" />

      {demoMode && <div className="demo-mode-badge">시연용 모드</div>}

      {adsbLoading && (
        <div className="adsb-loading" role="status" aria-live="polite">
          <span className="adsb-loading__spinner" aria-hidden="true" />
          <span>ADS-B 불러오는 중…</span>
        </div>
      )}

      {error && <div className="map-view-error" role="alert">{error}</div>}

      <div
        className={`map-bottom-control-dock${timestampOpen ? ' is-timestamp-open' : ''}${weatherLegendOpen ? ' is-legend-open' : ''}`}
        style={{ '--legend-popover-height': `${weatherLegendPanelHeight}px` }}
      >
        <WeatherLayerTimestampBar entries={timestampEntries} tz={tz} isOpen={timestampOpen} onOpenChange={setTimestampOpen} />

        {showWeatherLegends && (
          <WeatherLegends
          radarLegendVisible={radarLegendVisible}
          hsrLegendVisible={weatherOverlayModel.hsrLegendVisible}
          hciLegendVisible={weatherOverlayModel.hciLegendVisible}
          wissdomLegendVisible={weatherOverlayModel.wissdomLegendVisible}
          hsrLegend={HSR_LEGEND}
          hciLegend={HCI_LEGEND}
          radarOverseasLegendVisible={radarOverseasLegendVisible}
          rainviewerOutOfRange={rainviewerOutOfRange}
          echoTopOutOfRange={metVisibility.echoTop && !weatherOverlayModel.echoTopFrame}
          lightningLegendVisible={lightningLegendVisible}
          blinkLightning={blinkLightning}
          onBlinkLightningChange={setBlinkLightning}
          flightCategoryLegendVisible={!!(metVisibility.visibility || metVisibility.ceiling)}
          flightCategoryVisibilityOn={!!metVisibility.visibility}
          flightCategoryBands={FLIGHT_CATEGORY_LEGEND_BANDS}
          flightCategoryStationLegendVisible={showFlightCategoryStations && !!(metVisibility.visibility || metVisibility.ceiling)}
          flightCategoryStationBands={FLIGHT_CATEGORY_STATION_LEGEND_BANDS}
          flightCategoryStationCount={flightCategory.hasData ? fcStamps.stationCount : null}
          showFlightCategoryMissing={showFlightCategoryMissing}
          onShowFlightCategoryMissingChange={setShowFlightCategoryMissing}
          showFlightCategoryStations={showFlightCategoryStations}
          onShowFlightCategoryStationsChange={setShowFlightCategoryStations}
          radarRainrateLegend={RADAR_RAINRATE_LEGEND}
          qpfStatus={weatherOverlayModel.qpfStatus}
          qpfLegendPath={weatherOverlayModel.qpfFrame?.legendPath}
          lightningLegendEntries={lightningLegendEntries}
          windSpeedLegendVisible={!!(enableWindOverlay && metVisibility.wind && metVisibility.windSpeed && windField)}
          windSpeedLegendEntries={WIND_SPEED_COLOR_RAMP}
          temperatureLegendVisible={!!(enableWindOverlay && metVisibility.temp && temperatureField)}
          temperatureLegendEntries={CELSIUS_TEMPERATURE_COLOR_RAMP}
          cloudLegendVisible={!!(enableWindOverlay && metVisibility.cloud && cloudField)}
          cloudLegendEntries={CLOUD_POTENTIAL_COLOR_RAMP.filter((entry) => entry.max <= cloudMaxSpread)}
          icingLegendVisible={!!(enableWindOverlay && metVisibility.icing && icingField)}
          icingLegendEntries={ICING_COLOR_RAMP}
          turbulenceLegendVisible={!!(enableWindOverlay && metVisibility.turbulence && ktgGrid)}
          turbulenceLegendEntries={KTG_COLOR_RAMP}
          ciLegendVisible={!!metVisibility.ci}
          ctpsLegendVisible={!!metVisibility.ctps}
          echoTopLegendVisible={!!metVisibility.echoTop}
          radarReferenceTimeMs={radarReferenceTimeMs}
          lightningReferenceTimeMs={lightningReferenceTimeMs}
          radarWindLegendVisible={radarWindEffectiveVisible}
          radarWindObservedAtMs={radarWindEffectiveVisible ? (weatherOverlayModel.wissdomFrame?.timeMs ?? null) : null}
            formatReferenceTimeLabel={(ms) => formatReferenceTimeLabel(ms, tz)}
            bottomDock={!isMobile}
            open={weatherLegendOpen}
            onOpenChange={setWeatherLegendOpen}
            onOpenPanelHeightChange={setWeatherLegendPanelHeight}
          />
        )}
      </div>

      {showAdvisoryBadges && (
        <AdvisoryBadges
          badgeItems={advisoryBadgeItems}
          warnedAirports={warnedAirports}
          warningLabels={warningLabels}
          openPanel={openAdvisoryPanel}
          panelItems={advisoryPanelItems}
          hiddenKeys={hiddenAdvisoryKeys}
          onOpenPanel={(key, open) => {
            // Fluent Popover open/close. 열 때 해당 레이어 켜기(꺼져 있으면). warning은 레이어 없음.
            if (open) {
              if (key === 'sigmet' && !metVisibility.sigmet) toggleMet('sigmet')
              else if (key === 'airmet' && !metVisibility.airmet) toggleMet('airmet')
              else if (key === 'sigwxLow' && !metVisibility.sigwx) toggleMet('sigwx')
              setOpenAdvisoryPanel(key)
            } else {
              setOpenAdvisoryPanel((cur) => (cur === key ? null : cur))
            }
          }}
          onToggleVisibility={toggleAdvisoryVisibility}
          onSelectAirport={onAirportSelect}
        />
      )}

      <TimelineRail
        pastTicksMs={weatherTimelineTicks}
        nwpTimes={sliderTimes}
        forecastTicksMs={forecastTimelineTicks}
        selectedMs={weatherTimelineSelectedMs}
        isPlaying={weatherTimelinePlaying}
        onScrub={scrubWeatherTimeline}
        onPlayPause={toggleWeatherTimelinePlay}
        referenceNowMs={demoMode ? demoNowMs : null}
        availableFrameEntries={timelineAvailableFrameEntries}
      />
      <QpfStatusCard status={weatherOverlayModel.qpfStatus} tz={tz} />

      {/* 브리핑 패널을 닫아도 경로는 지도에 남는다 — 패널을 다시 열지 않고도 지울 수
          있도록 하단 중앙(타임라인 스크럽 스택 위, 겹침 확인됨)에 요약+지우기 칩 표시. */}
      {routeBriefing.state.routeResult && activePanel !== 'route-check' && (
        <div
          className="active-route-chip"
        >
          <button type="button" className="active-route-chip-open" onClick={onOpenRoutePanel} aria-label="경로 확인 패널 열기">
            <span className="active-route-chip-route">
              {routeBriefing.state.routeForm.departureAirport || '출발'}
              <span aria-hidden="true">{' → '}</span>
              {routeBriefing.state.routeForm.arrivalAirport || '도착'}
            </span>
            {routeBriefing.derived.plannedDistanceNm > 0 && (
              <span className="active-route-chip-dist">{Math.round(routeBriefing.derived.plannedDistanceNm)} NM</span>
            )}
          </button>
          <button
            type="button"
            className="active-route-chip-clear"
            aria-label="경로 지우기"
            onClick={routeBriefing.actions.handleRouteReset}
          >×</button>
        </div>
      )}

      <div className="vertical-level-rail-stack">
        <RadarWindVerticalRail
          kimActive={enableWindOverlay && (metVisibility.wind || metVisibility.temp || metVisibility.cloud || metVisibility.icing)}
          levels={sliderLevels}
          times={sliderTimes}
          selection={nwpSelection}
          availability={sliderAvailability}
          onKimSelectionChange={setNwpSelection}
          radarWindActive={deriveRadarWindRailActive(radarWindOverlay)}
          radarWindHeightM={radarWindOverlay.heightM}
          onRadarWindHeightChange={radarWindOverlay.setHeightM}
        />
        {enableWindOverlay && metVisibility.turbulence && altLevelsFt.length > 1 && (
          // 트랙 위쪽(index 0)이 위 화살표가 가는 방향 — 고도가 높은 쪽이 맨 위로 오게 내림차순.
          <LevelSliderPanel
            items={[...altLevelsFt].sort((a, b) => b - a).map((ft) => ({ id: ft, primary: `${ft.toLocaleString()} ft` }))}
            activeValue={altLevelsFt.includes(selectedAltFt) ? selectedAltFt : altLevelsFt[0]}
            onSelect={setSelectedAltFt}
            ariaLabel="난류 고도"
          />
        )}
        {metVisibility.terrainHazard && (
          <LevelSliderPanel
            items={terrainHazardAltitudeItems()}
            activeValue={terrainAltitudeFt}
            onSelect={setTerrainAltitudeFt}
            ariaLabel="지형 근접 기준 고도"
          />
        )}
        <ConvectiveOverlayControls ctpsVisible={metVisibility.ctps} minFl={convectiveOverlay.minFl} onMinFlChange={convectiveOverlay.setMinFl} />
      </div>
      <ConvectiveOverlayCard selection={convectiveOverlay.selection} tz={tz} />
      <EchoTopCard selection={echoTopOverlay.selection} tz={tz} />
      {metVisibility.typhoon && (
        <TyphoonPanel
          typhoons={typhoonOverlay.typhoons}
          status={typhoonOverlay.status}
          selected={typhoonOverlay.selected}
          onSelect={typhoonOverlay.select}
          onFocus={(item) => mapRef.current?.flyTo({ center: [item.center.lon, item.center.lat], zoom: 5 })}
          onClose={() => { toggleMet('typhoon'); onOpenMetPanel?.() }}
        />
      )}
      <WeatherPointInspector selection={weatherPointInspector.selection} onClose={weatherPointInspector.clearSelection} />

      <AdsbTimestamp
        isVisible={trafficVisible}
        updatedAt={adsbData?.updated_at}
        compact
      />

      <SigwxLegendDialog isOpen={sigwxLegendOpen} onClose={toggleSigwxLegend} />

      {mapToolsVisible && <MapToolsLauncher
        isOpen={activePanel === 'custom-area'}
        onToggle={() => (activePanel === 'custom-area' ? onClosePanel?.() : onOpenCustomAreaPanel?.())}
      />}

      {showBasemapSwitcher && (
        <BasemapSwitcher
          basemapId={basemapId}
          isOpen={basemapMenuOpen}
          onOpenChange={setBasemapMenuOpen}
          onSwitchBasemap={switchBasemap}
          /* 그리기 버튼은 모바일에서 지도·경로 작업 중에만 뜬다. 없을 때는 그 자리를
             비워둘 이유가 없으므로 베이스맵을 오른쪽 끝으로 붙인다. */
          atRightEdge={!mapToolsVisible}
        />
      )}

      {activePanel === 'route-check' && (
        <>
          {!routeBriefing.state.briefing && (
            <>
              <Suspense fallback={null}>
                <RouteBriefingPanel
                  state={routeBriefing.state}
                  refs={routeBriefing.refs}
                  derived={routeBriefing.derived}
                  actions={routeBriefing.actions}
                  airports={airports}
                  aviationVisibility={aviationVisibility}
                  onToggleAviation={toggleAviation}
                  metVisibility={metVisibility}
                  onToggleMet={toggleMet}
                  onClose={onClosePanel}
                />
              </Suspense>
              {!isMobile && (
                <button
                  type="button"
                  className="route-briefing-map-mode-toggle"
                  onClick={() => setRouteBriefingMapMode((prev) => !prev)}
                >
                  {routeBriefingMapMode ? '입력 보기' : '지도 보기'}
                </button>
              )}
            </>
          )}
          {routeBriefing.state.briefing && (
            <Suspense fallback={null}>
              <BriefingView
                briefing={routeBriefing.state.briefing}
                verticalProfile={routeBriefing.state.verticalProfile}
                crossSection={routeBriefing.state.crossSection}
                advisories={[
                  ...sigmetItems.map((item) => ({ ...item, kind: 'sigmet' })),
                  ...airmetItems.map((item) => ({ ...item, kind: 'airmet' })),
                ]}
                onClose={() => routeBriefing.actions.setBriefing(null)}
                onOpenProfile={routeBriefing.actions.handleVerticalProfileRequest}
                onFocus={focusBriefingSection}
                metVisibility={metVisibility}
                onToggleMetLayer={toggleMet}
                onEnterMapMode={() => setRouteBriefingMapMode(true)}
                onHighlightLeg={setHighlightedLeg}
                onSelectForecastHour={routeBriefing.actions.handleSelectForecastHour}
                crossSectionHourLoading={routeBriefing.state.crossSectionHourLoading}
                routeSnapshot={{
                  routeForm: routeBriefing.state.routeForm,
                  vfrWaypoints: routeBriefing.state.vfrWaypoints,
                  cruiseAltitudeFt: routeBriefing.state.cruiseAltitudeFt,
                  alternateAirport: routeBriefing.state.alternateAirport,
                  etd: routeBriefing.state.etd,
                }}
              />
            </Suspense>
          )}
        </>
      )}

      {!isMobile && (showKoreaHome || (routeBriefing.state.workflowStep === 'altitude' && routeBriefing.state.verticalProfile && !routeBriefing.state.verticalProfileWindowOpen)) && (
        <div className="map-bottom-controls">
          {showKoreaHome && (
            <button type="button" className="map-home-control" onClick={flyToKorea} aria-label="기본 지도 보기" title="기본 지도 보기">
              <House size={18} aria-hidden="true" />
              <span>기본 지도</span>
            </button>
          )}
          {routeBriefing.state.workflowStep === 'altitude' && routeBriefing.state.verticalProfile && !routeBriefing.state.verticalProfileWindowOpen && (
            <button
              type="button"
              className="vertical-profile-reopen-button"
              onClick={() => routeBriefing.actions.setVerticalProfileWindowOpen(true)}
              aria-label="연직단면도 다시 보기"
            >
              <ChartSpline size={18} strokeWidth={2} />
              <span>연직단면도</span>
            </button>
          )}
        </div>
      )}

      {isMobile && showKoreaHome && (
        <button type="button" className="map-home-control" onClick={flyToKorea} aria-label="기본 지도 보기" title="기본 지도 보기">
          <House size={18} aria-hidden="true" />
          <span>기본 지도</span>
        </button>
      )}

      {routeBriefing.state.verticalProfileWindowOpen && (
        <Suspense fallback={null}>
          <VerticalProfileWindow
            profile={routeBriefing.state.verticalProfile}
            crossSection={routeBriefing.state.crossSection}
            isOpen={routeBriefing.state.verticalProfileWindowOpen}
            onClose={() => routeBriefing.actions.setVerticalProfileWindowOpen(false)}
            advisories={[
              ...sigmetItems.map((item) => ({ ...item, kind: 'sigmet' })),
              ...airmetItems.map((item) => ({ ...item, kind: 'airmet' })),
            ]}
            selectedCandidateAltitudeFt={routeBriefing.state.cruiseAltitudeFt}
            candidateAltitudes={(routeBriefing.state.altitudeComparison?.rows ?? [])
              .filter((row) => ['valid', 'input_only'].includes(row.candidateStatus ?? row.status) && row.weatherStatus !== 'weather_unavailable')
              .map((row) => Number(row.altFt ?? row.altitudeFt))}
            onSelectCandidateAltitude={isMobile ? routeBriefing.actions.selectCruiseAltitude : undefined}
            onSelectForecastHour={routeBriefing.actions.handleSelectForecastHour}
            crossSectionHourLoading={routeBriefing.state.crossSectionHourLoading}
            placement={isMobile ? 'mobile-full' : routeBriefing.state.workflowStep === 'altitude' ? 'side' : 'bottom'}
          />
        </Suspense>
      )}

      {activePanel === 'my-map' && (
        <MyMapPanel myMap={myMap} />
      )}

      {activePanel === 'aviation' && (
        <AviationLayerPanel
          visibility={aviationVisibility}
          onToggle={toggleAviation}
          onClose={onClosePanel}
          onClearAll={clearAviationLayers}
        />
      )}

      {activePanel === 'custom-area' && (
        <MapToolsPanel
          activeTool={mapTools.activeTool}
          setActiveTool={mapTools.setActiveTool}
          polygon={mapTools.polygon}
          measure={mapTools.measure}
          onClose={onClosePanel}
        />
      )}

      {hasHover && hoveredAirportIcao && (() => {
        const hoveredMetar = metarData?.airports?.[hoveredAirportIcao] || null
        const hoveredAirportMeta = airports.find((a) => a.icao === hoveredAirportIcao) || null
        const hoveredFeature = airportGeoJSON.features.find((f) => f.properties.icao === hoveredAirportIcao)
        const containerEl = mapContainerRef.current
        return (
          <AirportTooltip
            metar={hoveredMetar}
            airport={hoveredAirportMeta}
            flightCategory={hoveredFeature?.properties?.flightCategory}
            categoryColor={hoveredFeature?.properties?.categoryColor}
            x={tooltipPos.x}
            y={tooltipPos.y}
            containerWidth={containerEl?.clientWidth}
            containerHeight={containerEl?.clientHeight}
          />
        )
      })()}

      {activePanel === 'traffic' && (
        <TrafficPanel
          visible={trafficVisible}
          onToggleVisible={() => setTrafficVisible((v) => !v)}
          filters={trafficFilters}
          onChangeFilters={setTrafficFilters}
          onResetFilters={resetTrafficFilters}
          counts={adsbCounts}
          visibleCount={adsbVisibleIds.length}
          receiving={adsbLoading}
          onClose={onClosePanel}
        />
      )}

      {activePanel === 'met' && (
        <WeatherOverlayPanel
          layers={MET_LAYERS}
          visibility={metVisibility}
          blinkLightning={blinkLightning}
          onToggle={toggleMet}
          onClose={onClosePanel}
          onClearAll={clearMetLayers}
          onBlinkLightningChange={setBlinkLightning}
          isLayerDisabled={isMetLayerDisabled}
          getLayerBadge={metLayerBadge}
          showWind={enableWindOverlay}
          windStatus={windStatus}
          tempStatus={tempStatus}
          cloudStatus={cloudStatus}
          icingStatus={icingStatus}
          turbulenceStatus={turbulenceStatus}
          windLowPower={lowPower}
          windFlowOpacity={windFlowOpacity}
          windFlowTrail={windFlowTrail}
          windFlowWidth={windFlowWidth}
          onWindFlowOpacityChange={setWindFlowOpacity}
          onWindFlowTrailChange={setWindFlowTrail}
          onWindFlowWidthChange={setWindFlowWidth}
          radarWindRequested={radarWindOverlay.requestedVisible}
          onRadarWindRequestedChange={radarWindOverlay.setRequestedVisible}
          terrainAltitudeFt={terrainAltitudeFt}
        />
      )}

      {activePanel === 'notam' && (
        <NotamPanel
          payload={notamData}
          selectedAirport={selectedAirport}
          categoryFilter={notamCategoryFilter}
          onCategoryToggle={(id) => setNotamCategoryFilter((cur) => cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id])}
          locationFilter={notamLocationFilter}
          onLocationChange={setNotamLocationFilter}
          masterOn={metVisibility.notam}
          onMasterToggle={() => toggleMet('notam')}
          onLocate={locateNotam}
          nowMs={demoNowMs}
          tz={tz}
        />
      )}

    </div>
  )
})

export default MapView
