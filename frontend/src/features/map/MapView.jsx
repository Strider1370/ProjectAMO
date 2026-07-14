import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_CONFIG, BASEMAP_OPTIONS } from './mapConfig.js'
import { addAviationWfsLayers } from '../aviation-layers/addAviationWfsLayers.js'
import { AVIATION_WFS_LAYERS } from '../aviation-layers/aviationWfsLayers.js'
import { useFirTickOverlay } from '../aviation-layers/useFirTickOverlay.js'
import {
  ADVISORY_LAYER_DEFS,
} from '../weather-overlays/lib/advisoryLayers.js'
import { ADSB_FETCH_DISABLED, fetchAdsbData } from '../../api/adsbApi.js'
import { fetchSigwxCloudMeta, fetchSigwxFrontMeta } from '../../api/weatherApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, createAdsbTrailGeoJSON, syncAdsbLayer } from '../aviation-layers/addAdsbLayer.js'
import { registerAircraftImages } from '../aviation-layers/aircraftIconImages.js'
import { registerAirlineLogos } from '../aviation-layers/airlineLogoImages.js'
import AviationLayerPanel from '../aviation-layers/AviationLayerPanel.jsx'
import MapToolsPanel from '../map-tools/MapToolsPanel.jsx'
import { useMapTools } from '../map-tools/useMapTools.js'
import NotamPanel from '../notam/NotamPanel.jsx'
import { updateNotamLayerData, setNotamVisibility, setNotamCategoryFilter as applyNotamCategoryFilter, notamPopupHtml, notamsAtPoint, addNotamHighlight, setNotamHighlight, geometryBounds } from '../notam/lib/notamLayers.js'
import { notamToFeatureCollection, displayGeometry } from '../notam/lib/notamGeoJson.js'
import { registerNotamObstacleImages } from '../notam/lib/notamObstacleIcons.js'
import { NOTAM_CATEGORIES } from '../notam/lib/notamViewModel.js'
import { SIGWX_FILTER_OPTIONS } from '../weather-overlays/lib/sigwxData.js'
import AdvisoryBadges from '../weather-overlays/AdvisoryBadges.jsx'
import AdsbTimestamp from '../weather-overlays/AdsbTimestamp.jsx'
import SigwxHistoryBar from '../weather-overlays/SigwxHistoryBar.jsx'
import SigwxLegendDialog from '../weather-overlays/SigwxLegendDialog.jsx'
import TimelineRail from '../weather-overlays/TimelineRail.jsx'
import { useTimelineRail, useTimelinePlayback } from '../weather-overlays/lib/useTimelineRail.js'
import WeatherLegends from '../weather-overlays/WeatherLegends.jsx'
import WeatherOverlayPanel from '../weather-overlays/WeatherOverlayPanel.jsx'
import NwpSliderBar from '../weather-overlays/NwpSliderBar.jsx'
import LevelRail from '../weather-overlays/LevelRail.jsx'
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
import { getNextMetVisibility } from '../weather-overlays/lib/metLayerVisibility.js'
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
import {
  buildWeatherOverlayModel,
  formatReferenceTimeLabel,
} from '../weather-overlays/lib/weatherOverlayModel.js'
import { useFlightCategory } from '../weather-overlays/lib/useFlightCategory.js'
import {
  addFlightCategoryLayer,
  bindFlightCategoryClick,
  removeFlightCategoryLayer,
  syncFlightCategoryLayer,
} from '../weather-overlays/lib/flightCategoryLayers.js'
import BasemapSwitcher from './basemapSwitcher/BasemapSwitcher.jsx'
import MapToolsLauncher from '../map-tools/MapToolsLauncher.jsx'
import { setLayerVisibility } from './lib/mapLayerUtils.js'
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
} from '../route-briefing/lib/routePreview.js'
import {
  clearRoutePreviewLayers,
  installRoutePreviewLayers,
  syncBoundaryFixPreview,
  syncRoutePreviewLayers,
  syncVfrWaypointData,
} from '../route-briefing/lib/routePreviewSync.js'
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

function initMetVisibility() {
  const visibility = MET_LAYERS.reduce((acc, l) => { acc[l.id] = false; return acc }, {})
  visibility.radar = true
  visibility.windFlow = true
  visibility.windSpeed = true
  return visibility
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

const MapView = forwardRef(function MapView({
  activePanel,
  airports = [],
  metarData = null,
  echoMeta = null,
  satMeta = null,
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
  onRequestDeferredWeatherData,
  onLayerCountsChange,
  onClosePanel,
  onOpenNotamPanel,
  onOpenRoutePanel,
  onOpenCustomAreaPanel,
  enableWindOverlay = true,
}, ref) {
  const isMobile = useIsMobile()
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
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
  const [isStyleReady, setIsStyleReady] = useState(false)
  const [styleRevision, setStyleRevision] = useState(0)
  const [aviationVisibility, setAviationVisibility] = useState(initAviationVisibility)
  const [metVisibility, setMetVisibility] = useState(initMetVisibility)
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
  const routeBriefing = useRouteBriefing({ activePanel, airports, metarData })
  const notamFc = useMemo(() => notamToFeatureCollection(notamData, Date.now()), [notamData])
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
  const [basemapId, setBasemapId] = useState('standard')
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)

  // 레이어 켜기(끄지 않음) — ref(검색, 화면 밖)와 in-map 패널(브리핑/경로) 공용. 패널이 쓰는 setter 재사용.
  function setLayerOn(id, kind) {
    if (kind === 'met') setMetVisibility((prev) => (prev[id] ? prev : getNextMetVisibility(prev, id, { lowPower })))
    else if (kind === 'aviation') setAviationVisibility((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
  }
  // loadRouteBriefing: 딥링크 '전체 브리핑 보기'가 저장경로를 route-briefing 훅으로 로드+브리핑 자동생성(§검증).
  useImperativeHandle(ref, () => ({
    setLayerOn, switchBasemap,
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
    flyToAirport: (icao) => {
      const map = mapRef.current
      const ap = airports.find((a) => a.icao === icao)
      if (!map || !ap) return
      if (!tourHomeRef.current) tourHomeRef.current = { center: map.getCenter(), zoom: map.getZoom() }
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
  const { vfrWaypointsRef, hideTimerRef } = routeBriefing.refs
  const { setHoveredWpInfo, setVfrWaypoints } = routeBriefing.actions
  const { routePreviewModel } = routeBriefing
  const { geojson: flightCategoryGeojson } = useFlightCategory()
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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    const { fitCoordinates } = syncRoutePreviewLayers(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = boundsFromCoords(fitCoordinates)
      map.fitBounds(bounds, { padding: fitPaddingFor(80), maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, routeResult, isStyleReady, styleRevision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    const { fitCoordinates } = syncBoundaryFixPreview(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = boundsFromCoords(fitCoordinates)
      map.fitBounds(bounds, { padding: fitPaddingFor(80), maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, isStyleReady, routeResult, styleRevision])

  useEffect(() => {
    const map = mapRef.current
    const coords = fitBoundsRequest?.coordinates ?? []
    if (!map || !isStyleReady || coords.length === 0) return
    const bounds = boundsFromCoords(coords)
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
      map.fitBounds(bounds, { padding: pad, maxZoom: 8, duration: 600 })
    }
    if (id === 'destination') {
      const ap = byIcao(meta?.arrivalAirport)
      if (ap) map.flyTo({ center: [ap.lon, ap.lat], zoom: 8.5, padding: pad, duration: 600 })
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
  // Small delay so the lazy briefing panel mounts + lays out before fitPaddingFor reads its width.
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
    const t = setTimeout(() => {
      map.fitBounds(boundsFromCoords(coords), { padding: fitPaddingFor(60), maxZoom: 8, duration: 600 })
    }, 350)
    return () => clearTimeout(t)
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
  const weatherOverlayModel = useMemo(() => buildWeatherOverlayModel({
    echoMeta,
    satMeta,
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
    lightningReferenceTimeMs,
    nwpSelection,
    ktgGrid,
    flightCategoryGeojson,
    tz,
  }), [
    echoMeta,
    satMeta,
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
    lightningReferenceTimeMs,
    nwpSelection,
    ktgGrid,
    flightCategoryGeojson,
    tz,
  ])
  const {
    radarFrames,
    satelliteFrames,
    weatherTimelineTicks,
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
    lightningLegendVisible,
    lightningLegendEntries,
    radarReferenceTimeMs,
    sigwxIssueLabel,
    sigwxValidLabel,
    nwpIssueLabel,
    nwpValidLabel,
    ktgIssueLabel,
    ktgValidLabel,
    flightCategoryIssueLabel,
  } = weatherOverlayModel
  const advisoryPanelItems = useMemo(() => {
    if (openAdvisoryPanel === 'sigwxLow') return sigwxGroups
    if (openAdvisoryPanel === 'sigmet') return sigmetItems.filter((i) => i.source !== 'NOAA')
    if (openAdvisoryPanel === 'airmet') return airmetItems
    return []
  }, [openAdvisoryPanel, sigwxGroups, sigmetItems, airmetItems])

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
    if (metVisibility.flightCategory)
      entries.push({ key: 'flightCategory', label: '비행기상구역', issueLabel: flightCategoryIssueLabel })
    if (metVisibility.sigwx)
      entries.push({ key: 'sigwx', label: 'SIGWX', issueLabel: sigwxIssueLabel, validLabel: sigwxValidLabel })
    return entries
  }, [
    enableWindOverlay,
    metVisibility.wind, metVisibility.temp, metVisibility.cloud,
    metVisibility.icing, metVisibility.turbulence, metVisibility.flightCategory, metVisibility.sigwx,
    nwpIssueLabel, nwpValidLabel, ktgIssueLabel, ktgValidLabel, flightCategoryIssueLabel,
    sigwxIssueLabel, sigwxValidLabel,
  ])

  useTimelinePlayback({
    isPlaying: weatherTimelinePlaying,
    speed: weatherTimelineSpeed,
    pastTicksMs: weatherTimelineTicks,
    nwpTimes: sliderTimes,
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
    selectedSigwxFrontMeta: weatherOverlayModel.selectedSigwxFrontMeta,
    selectedSigwxCloudMeta: weatherOverlayModel.selectedSigwxCloudMeta,
    sigwxLowMapData: weatherOverlayModel.sigwxLowMapData,
    visibility: {
      satellite: weatherOverlayModel.visibility.satellite,
      radar: weatherOverlayModel.visibility.radar,
      sigwx: weatherOverlayModel.visibility.sigwx,
    },
    showVisibleSigwxFrontOverlay: weatherOverlayModel.showVisibleSigwxFrontOverlay,
    showVisibleSigwxCloudOverlay: weatherOverlayModel.showVisibleSigwxCloudOverlay,
  }), [
    weatherOverlayModel.satelliteFrame,
    weatherOverlayModel.radarFrame,
    weatherOverlayModel.selectedSigwxFrontMeta,
    weatherOverlayModel.selectedSigwxCloudMeta,
    weatherOverlayModel.sigwxLowMapData,
    weatherOverlayModel.visibility.satellite,
    weatherOverlayModel.visibility.radar,
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
    blinkLightning,
    lightningBlinkOff,
  }), [
    weatherOverlayModel.visibility.lightning,
    weatherOverlayModel.lightningGeoJSON,
    blinkLightning,
    lightningBlinkOff,
  ])

  function toggleAviation(id) {
    setAviationVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleMet(id) {
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

    if (ADSB_FETCH_DISABLED || !metVisibility.adsb) {
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
  }, [metVisibility.adsb])

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

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

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

    // zoom handler lives outside style.load to avoid duplicate registration on style switch
    let roadsVisible = map.getZoom() >= ROAD_VISIBILITY_ZOOM
    map.on('zoom', () => {
      if (!map.isStyleLoaded()) return
      const should = map.getZoom() >= ROAD_VISIBILITY_ZOOM
      if (should !== roadsVisible) { roadsVisible = should; applyRoadVisibility(map, roadsVisible) }
    })

    map.on('style.load', () => {
      applyRoadVisibility(map, roadsVisible)

      // Aviation GeoJSON
      addAviationWfsLayers(map)

      // Route preview
      installRoutePreviewLayers(map)
      if (!vfrInteractionsBound) {
        vfrInteractionsBound = true
        bindVfrInteractions(map, vfrWaypointsRef, setVfrWaypoints)
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

      // Flight category overlay (before airport circles so airports render on top)
      addFlightCategoryLayer(map, AIRPORT_CIRCLE_LAYER)

      // ADS-B
      addAdsbLayers(map)

      setStyleRevision((value) => value + 1)
      setIsStyleReady(true)
    })

    mapRef.current = map
    // ponytail: DEV 전용 디버그 훅 — Playwright/콘솔에서 카메라 정밀 제어용. 프로덕션 빌드엔 미포함.
    if (import.meta.env.DEV) window.__map = map
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', resizeMap)
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
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
      ADVISORY_LAYER_DEFS.airmet.fillLayerId,
      ADVISORY_LAYER_DEFS.airmet.lineLayerId,
    ]
    advisoryEventCleanupRef.current = advisoryLayerIds.flatMap((layerId) => [
      bindLayerEvent(map, 'click', layerId, (e) => {
        const desc = e.features?.[0]?.properties?.description
        if (!desc) return
        new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })
          .setLngLat(e.lngLat)
          .setHTML(`<pre class="mapbox-advisory-popup">${desc.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</pre>`)
          .addTo(map)
      }),
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

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    AVIATION_WFS_LAYERS.forEach((l) => setLayerVisibility(map, l, aviationVisibility[l.id]))
  }, [aviationVisibility, styleRevision])

  // ???? Route highlight (?롪퍔?δ빳???뚮뜆?????깅턄???띠룆踰????戮?뻣) ????????????????????????????????????????????????????

  // ???? VFR waypoint sync ????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || routeResult?.flightRule !== 'VFR') return
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

  // ???? Sync SIGMET / AIRMET ????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    syncAdvisoryLayers(map, advisoryLayerModel)
  }, [advisoryLayerModel])

  // ???? Sync lightning ????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    syncLightningLayers(map, lightningLayerModel)
  }, [lightningLayerModel])

  // FIR 경계 틱(지오메트리 렌더 + moveend 재생성) — 스크롤 후 틱 이탈 방지.
  useFirTickOverlay(mapRef, isStyleReady, styleRevision)

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
    setGeoBoundaryVisibility(map, shouldShowGeoBoundaries({ basemapId, metVisibility, enableWindOverlay }))
  }, [
    basemapId,
    enableWindOverlay,
    metVisibility.satellite,
    metVisibility.radar,
    metVisibility.wind,
    metVisibility.temp,
    metVisibility.cloud,
    metVisibility.icing,
  ])

  // ???? Sync ADS-B ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    registerAircraftImages(map)
    registerAirlineLogos(map)
    syncAdsbLayer(map, { geojson: adsbGeoJSON, trailGeojson: adsbTrailGeoJSON, isVisible: metVisibility.adsb })
  }, [adsbGeoJSON, adsbTrailGeoJSON, metVisibility.adsb])

  // ???? Sync flight category overlay ??????????????????????????????????????????????????????????????????????????????????????????????????

  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    syncFlightCategoryLayer(map, {
      geojson: flightCategoryGeojson,
      visible: !!metVisibility.flightCategory,
      beforeLayerId: AIRPORT_CIRCLE_LAYER,
    })
  }, removeFlightCategoryLayer, [flightCategoryGeojson, metVisibility.flightCategory])

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

  function metLayerBadge(id) {
    if (id === 'sigmet') return sigmetCount
    if (id === 'airmet') return airmetCount
    if (id === 'lightning') return lightningCount
    if (id === 'sigwx') return sigwxCount
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
  const aviationActiveCount = AVIATION_WFS_LAYERS.filter((l) => aviationVisibility[l.id]).length
  const metActiveCount = MET_LAYERS.filter((l) => metVisibility[l.id] && !isMetLayerDisabled(l.id)).length
  useEffect(() => {
    onLayerCountsChange?.({ aviation: aviationActiveCount, met: metActiveCount })
  }, [aviationActiveCount, metActiveCount, onLayerCountsChange])

  // ???? Render ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  return (
    <div
      className="map-view-wrapper"
      data-route-briefing-map-mode={activePanel === 'route-check' && routeBriefingMapMode ? 'true' : 'false'}
    >
      <div ref={mapContainerRef} className="map-view" />

      {adsbLoading && (
        <div className="adsb-loading" role="status" aria-live="polite">
          <span className="adsb-loading__spinner" aria-hidden="true" />
          <span>ADS-B 불러오는 중…</span>
        </div>
      )}

      {error && <div className="map-view-error" role="alert">{error}</div>}

      <WeatherLayerTimestampBar entries={timestampEntries} tz={tz} />

      <WeatherLegends
        radarLegendVisible={radarLegendVisible}
        lightningLegendVisible={lightningLegendVisible}
        blinkLightning={blinkLightning}
        onBlinkLightningChange={setBlinkLightning}
        radarRainrateLegend={RADAR_RAINRATE_LEGEND}
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
        radarReferenceTimeMs={radarReferenceTimeMs}
        lightningReferenceTimeMs={lightningReferenceTimeMs}
        formatReferenceTimeLabel={(ms) => formatReferenceTimeLabel(ms, tz)}
      />

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

      <SigwxHistoryBar
        isVisible={metVisibility.sigwx}
        selectedEntry={selectedSigwxEntry}
        entryCount={sigwxHistoryEntries.length}
        historyIndex={sigwxHistoryIndex}
        issueLabel={sigwxIssueLabel}
        validLabel={sigwxValidLabel}
        isElevated
        onHistoryIndexChange={setSigwxHistoryIndex}
      />

      <TimelineRail
        pastTicksMs={weatherTimelineTicks}
        nwpTimes={sliderTimes}
        selectedMs={weatherTimelineSelectedMs}
        isPlaying={weatherTimelinePlaying}
        onScrub={scrubWeatherTimeline}
        onPlayPause={toggleWeatherTimelinePlay}
      />

      {/* 브리핑 패널을 닫아도 경로는 지도에 남는다 — 패널을 다시 열지 않고도 지울 수
          있도록 하단 중앙(타임라인 스크럽 스택 위, 겹침 확인됨)에 요약+지우기 칩 표시. */}
      {routeBriefing.state.routeResult && activePanel !== 'route-check' && (
        <div
          className="active-route-chip"
          role="button"
          tabIndex={0}
          onClick={onOpenRoutePanel}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenRoutePanel?.() } }}
          aria-label="경로 확인 패널 열기"
        >
          <span className="active-route-chip-route">
            {routeBriefing.state.routeForm.departureAirport || '출발'}
            <span aria-hidden="true">{' → '}</span>
            {routeBriefing.state.routeForm.arrivalAirport || '도착'}
          </span>
          {routeBriefing.derived.plannedDistanceNm > 0 && (
            <span className="active-route-chip-dist">{Math.round(routeBriefing.derived.plannedDistanceNm)} NM</span>
          )}
          <button
            type="button"
            className="active-route-chip-clear"
            aria-label="경로 지우기"
            onClick={(e) => { e.stopPropagation(); routeBriefing.actions.handleRouteReset() }}
          >×</button>
        </div>
      )}

      <NwpSliderBar
        isVisible={enableWindOverlay && (metVisibility.wind || metVisibility.temp || metVisibility.cloud || metVisibility.icing)}
        levels={sliderLevels}
        times={sliderTimes}
        selection={nwpSelection}
        availability={sliderAvailability}
        isElevated
        timeSliderEnabled={false}
        onSelectionChange={setNwpSelection}
      />
      {enableWindOverlay && metVisibility.turbulence && altLevelsFt.length > 1 && (
        <LevelRail
          title="고도"
          items={altLevelsFt.map((ft) => ({ value: ft, label: `${ft / 1000}K` }))}
          activeValue={altLevelsFt.indexOf(selectedAltFt) >= 0 ? selectedAltFt : altLevelsFt[0]}
          onSelect={setSelectedAltFt}
        />
      )}

      <AdsbTimestamp
        isVisible={metVisibility.adsb}
        updatedAt={adsbData?.updated_at}
        compact
      />

      <SigwxLegendDialog isOpen={sigwxLegendOpen} onClose={toggleSigwxLegend} />

      <MapToolsLauncher
        isOpen={activePanel === 'custom-area'}
        onToggle={() => (activePanel === 'custom-area' ? onClosePanel?.() : onOpenCustomAreaPanel?.())}
      />

      <BasemapSwitcher
        basemapId={basemapId}
        isOpen={basemapMenuOpen}
        onOpenChange={setBasemapMenuOpen}
        onSwitchBasemap={switchBasemap}
      />

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
          />
        </Suspense>
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

      {hoveredAirportIcao && (() => {
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
          nowMs={Date.now()}
          tz={tz}
        />
      )}

    </div>
  )
})

export default MapView


