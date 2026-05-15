import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_CONFIG, BASEMAP_OPTIONS } from './mapConfig.js'
import { addAviationWfsLayers } from '../aviation-layers/addAviationWfsLayers.js'
import { AVIATION_WFS_LAYERS } from '../aviation-layers/aviationWfsLayers.js'
import {
  ADVISORY_LAYER_DEFS,
} from '../weather-overlays/lib/advisoryLayers.js'
import { fetchAdsbData } from '../../api/adsbApi.js'
import { fetchSigwxCloudMeta, fetchSigwxFrontMeta } from '../../api/weatherApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, syncAdsbLayer } from '../aviation-layers/addAdsbLayer.js'
import AviationLayerPanel from '../aviation-layers/AviationLayerPanel.jsx'
import RouteBriefingPanel from '../route-briefing/RouteBriefingPanel.jsx'
import VerticalProfileWindow from '../route-briefing/VerticalProfileWindow.jsx'
import { SIGWX_FILTER_OPTIONS } from '../weather-overlays/lib/sigwxData.js'
import AdvisoryBadges from '../weather-overlays/AdvisoryBadges.jsx'
import AdsbTimestamp from '../weather-overlays/AdsbTimestamp.jsx'
import SigwxHistoryBar from '../weather-overlays/SigwxHistoryBar.jsx'
import SigwxLegendDialog from '../weather-overlays/SigwxLegendDialog.jsx'
import WeatherTimelineBar from '../weather-overlays/WeatherTimelineBar.jsx'
import WeatherLegends from '../weather-overlays/WeatherLegends.jsx'
import WeatherOverlayPanel from '../weather-overlays/WeatherOverlayPanel.jsx'
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
import {
  getPlaybackDelayMs,
} from '../weather-overlays/lib/weatherTimeline.js'
import BasemapSwitcher from './basemapSwitcher/BasemapSwitcher.jsx'
import { setLayerVisibility } from './lib/mapLayerUtils.js'
import { bindLayerEvent, cleanupAll } from './lib/mapStyleSync.js'
import {
  AIRPORT_CIRCLE_LAYER,
  AIRPORT_SOURCE_ID,
  addAirportLayers,
  addGeoBoundaryLayers,
  createAirportGeoJSON,
  setGeoBoundaryVisibility,
} from './lib/baseMapLayers.js'
import {
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
import './MapView.css'

// ???? Constants ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

const ROAD_VISIBILITY_ZOOM = 8
const ADSB_POLL_INTERVAL_MS = 60 * 60 * 1000
const HIDDEN_ROAD_COLOR = 'rgba(255,255,255,0)'
const VISIBLE_ROAD_COLORS = { roads: '#d6dde6', trunks: '#c6d1dd', motorways: '#b9c7d4' }

// ???? Helpers ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

function applyRoadVisibility(map, show) {
  map.setConfigProperty('basemap', 'colorRoads', show ? VISIBLE_ROAD_COLORS.roads : HIDDEN_ROAD_COLOR)
  map.setConfigProperty('basemap', 'colorTrunks', show ? VISIBLE_ROAD_COLORS.trunks : HIDDEN_ROAD_COLOR)
  map.setConfigProperty('basemap', 'colorMotorways', show ? VISIBLE_ROAD_COLORS.motorways : HIDDEN_ROAD_COLOR)
}

// ???? Initial state factories ??????????????????????????????????????????????????????????????????????????????????????????????????????

function initAviationVisibility() {
  return AVIATION_WFS_LAYERS.reduce((acc, l) => { acc[l.id] = l.defaultVisible; return acc }, {})
}

function initMetVisibility() {
  return MET_LAYERS.reduce((acc, l) => { acc[l.id] = false; return acc }, {})
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

function MapView({
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
  selectedAirport,
  onAirportSelect,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const onSelectRef = useRef(onAirportSelect)
  const airportEventCleanupRef = useRef([])
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
  const [weatherTimelineIndex, setWeatherTimelineIndex] = useState(-1)
  const [weatherTimelinePlaying, setWeatherTimelinePlaying] = useState(false)
  const [weatherTimelineSpeed, setWeatherTimelineSpeed] = useState(1)
  const [sigwxHistoryIndex, setSigwxHistoryIndex] = useState(0)
  const [sigwxLegendOpen, setSigwxLegendOpen] = useState(false)
  const [openAdvisoryPanel, setOpenAdvisoryPanel] = useState(null)
  const [sigwxFilter, setSigwxFilter] = useState(() => Object.fromEntries(SIGWX_FILTER_OPTIONS.map((option) => [option.key, true])))
  const [hiddenAdvisoryKeys, setHiddenAdvisoryKeys] = useState({ sigwxLow: [], sigmet: [], airmet: [] })
  const [selectedSigwxFrontMeta, setSelectedSigwxFrontMeta] = useState(sigwxFrontMeta)
  const [selectedSigwxCloudMeta, setSelectedSigwxCloudMeta] = useState(sigwxCloudMeta)
  const [adsbData, setAdsbData] = useState(null)
  const [basemapId, setBasemapId] = useState('standard')
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)
  const routeBriefing = useRouteBriefing({ activePanel, airports, metarData })
  const { routeResult, fitBoundsRequest } = routeBriefing.state
  const { vfrWaypointsRef, hideTimerRef } = routeBriefing.refs
  const { setHoveredWpInfo, setVfrWaypoints } = routeBriefing.actions
  const { routePreviewModel } = routeBriefing

  useEffect(() => { onSelectRef.current = onAirportSelect }, [onAirportSelect])

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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    const { fitCoordinates } = syncRoutePreviewLayers(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = fitCoordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(fitCoordinates[0], fitCoordinates[0]))
      map.fitBounds(bounds, { padding: 80, maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, routeResult, isStyleReady, styleRevision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    const { fitCoordinates } = syncBoundaryFixPreview(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = fitCoordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(fitCoordinates[0], fitCoordinates[0]))
      map.fitBounds(bounds, { padding: 80, maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, isStyleReady, routeResult, styleRevision])

  useEffect(() => {
    const map = mapRef.current
    const coords = fitBoundsRequest?.coordinates ?? []
    if (!map || !isStyleReady || coords.length === 0) return
    const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
    map.fitBounds(bounds, { padding: 80, maxZoom: fitBoundsRequest.maxZoom ?? 8, duration: 500 })
  }, [fitBoundsRequest, isStyleReady, styleRevision])

  const airportGeoJSON = useMemo(() => createAirportGeoJSON(airports), [airports])
  const adsbGeoJSON = useMemo(() => createAdsbGeoJSON(adsbData), [adsbData])
  const weatherOverlayModel = useMemo(() => buildWeatherOverlayModel({
    echoMeta,
    satMeta,
    lightningData,
    sigwxLowData,
    sigwxLowHistoryData,
    sigmetData,
    airmetData,
    visibility: metVisibility,
    weatherTimelineIndex,
    sigwxHistoryIndex,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    lightningReferenceTimeMs,
  }), [
    echoMeta,
    satMeta,
    lightningData,
    sigwxLowData,
    sigwxLowHistoryData,
    sigmetData,
    airmetData,
    metVisibility,
    weatherTimelineIndex,
    sigwxHistoryIndex,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    lightningReferenceTimeMs,
  ])
  const {
    radarFrames,
    satelliteFrames,
    weatherTimelineTicks,
    effectiveWeatherTimelineIndex,
    selectedWeatherTimeMs,
    weatherTimelineVisible,
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
  } = weatherOverlayModel
  const advisoryPanelItems = useMemo(() => {
    if (openAdvisoryPanel === 'sigwxLow') return sigwxGroups
    if (openAdvisoryPanel === 'sigmet') return sigmetItems
    if (openAdvisoryPanel === 'airmet') return airmetItems
    return []
  }, [openAdvisoryPanel, sigwxGroups, sigmetItems, airmetItems])

  useEffect(() => {
    const tickCount = weatherTimelineTicks.length
    if (tickCount === 0) {
      setWeatherTimelinePlaying(false)
      setWeatherTimelineIndex(-1)
      return
    }

    setWeatherTimelineIndex((prev) => {
      if (prev >= tickCount) {
        return tickCount - 1
      }
      return prev
    })
  }, [weatherTimelineTicks.length])

  useEffect(() => {
    if (!weatherTimelineVisible || !weatherTimelinePlaying || weatherTimelineTicks.length <= 1) return undefined
    const timer = window.setInterval(() => {
      setWeatherTimelineIndex((prev) => {
        const baseIndex = prev >= 0 ? prev : weatherTimelineTicks.length - 1
        return baseIndex >= weatherTimelineTicks.length - 1 ? 0 : baseIndex + 1
      })
    }, getPlaybackDelayMs(weatherTimelineSpeed))
    return () => window.clearInterval(timer)
  }, [weatherTimelineVisible, weatherTimelinePlaying, weatherTimelineTicks.length, weatherTimelineSpeed])

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
      airmet: weatherOverlayModel.visibility.airmet,
    },
    sigmetFeatures: weatherOverlayModel.sigmetFeatures,
    sigmetLabels: weatherOverlayModel.sigmetLabels,
    airmetFeatures: weatherOverlayModel.airmetFeatures,
    airmetLabels: weatherOverlayModel.airmetLabels,
  }), [
    weatherOverlayModel.visibility.sigmet,
    weatherOverlayModel.visibility.airmet,
    weatherOverlayModel.sigmetFeatures,
    weatherOverlayModel.sigmetLabels,
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
    setMetVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ???? ADS-B Polling ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    let timeoutId
    let cancelled = false

    if (!metVisibility.adsb) {
      return undefined
    }

    async function poll() {
      const data = await fetchAdsbData()
      if (cancelled) return
      if (data) setAdsbData(data)
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
    })

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')

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

      // Aviation WFS
      addAviationWfsLayers(map, import.meta.env.VITE_VWORLD_KEY, import.meta.env.VITE_VWORLD_DOMAIN)

      // Route preview
      installRoutePreviewLayers(map)
      if (!vfrInteractionsBound) {
        vfrInteractionsBound = true
        bindVfrInteractions(map, vfrWaypointsRef, setVfrWaypoints)
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
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined

    cleanupAll(airportEventCleanupRef.current)
    cleanupAll(advisoryEventCleanupRef.current)
    adsbEventCleanupRef.current?.()
    sectorEventCleanupRef.current?.()

    airportEventCleanupRef.current = [
      bindLayerEvent(map, 'click', AIRPORT_CIRCLE_LAYER, (e) => {
        const icao = e.features?.[0]?.properties?.icao
        if (icao) onSelectRef.current?.(icao)
      }),
      bindLayerEvent(map, 'mouseenter', AIRPORT_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = 'pointer' }),
      bindLayerEvent(map, 'mouseleave', AIRPORT_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = '' }),
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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    syncRasterAndSigwxLayers(map, rasterAndSigwxModel)
  }, [rasterAndSigwxModel, isStyleReady, styleRevision])

  // ???? Sync SIGMET / AIRMET ????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    syncAdvisoryLayers(map, advisoryLayerModel)
  }, [advisoryLayerModel, isStyleReady, styleRevision])

  // ???? Sync lightning ????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    syncLightningLayers(map, lightningLayerModel)
  }, [lightningLayerModel, isStyleReady, styleRevision])

  // ???? Sync geo boundaries ??????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    setGeoBoundaryVisibility(map, metVisibility.satellite || metVisibility.radar)
  }, [metVisibility.satellite, metVisibility.radar, isStyleReady, styleRevision])

  // ???? Sync ADS-B ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    syncAdsbLayer(map, { geojson: adsbGeoJSON, isVisible: metVisibility.adsb })
  }, [adsbGeoJSON, metVisibility.adsb, isStyleReady, styleRevision])

  // ???? Sync airport data ??????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    addAirportLayers(map, airportGeoJSON)
    map.getSource(AIRPORT_SOURCE_ID)?.setData(airportGeoJSON)

    // Hide WFS airport labels if they have an active marker
    const labelLayerId = 'aviation-airports-label'
    const baseFilter = ['==', ['geometry-type'], 'Point']

    if (map.getLayer(labelLayerId)) {
      const icaos = airportGeoJSON.features.map(f => f.properties.icao).filter(Boolean)
      const filter = icaos.length > 0
        ? ['all', baseFilter, ['!', ['in', ['get', 'icao'], ['literal', icaos]]]]
        : baseFilter

      map.setFilter(labelLayerId, filter)
    }
  }, [airportGeoJSON, isStyleReady, styleRevision])

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

  // ???? Render ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  return (
    <div className="map-view-wrapper">
      <div ref={mapContainerRef} className="map-view" />

      {error && <div className="map-view-error" role="alert">{error}</div>}

      <WeatherLegends
        radarLegendVisible={radarLegendVisible}
        lightningLegendVisible={lightningLegendVisible}
        radarRainrateLegend={RADAR_RAINRATE_LEGEND}
        lightningLegendEntries={lightningLegendEntries}
        radarReferenceTimeMs={radarReferenceTimeMs}
        lightningReferenceTimeMs={lightningReferenceTimeMs}
        formatReferenceTimeLabel={formatReferenceTimeLabel}
      />

      <AdvisoryBadges
        badgeItems={advisoryBadgeItems}
        openPanel={openAdvisoryPanel}
        panelItems={advisoryPanelItems}
        hiddenKeys={hiddenAdvisoryKeys}
        onTogglePanel={toggleAdvisoryPanel}
        onClosePanel={() => setOpenAdvisoryPanel(null)}
        onToggleVisibility={toggleAdvisoryVisibility}
      />

      <SigwxHistoryBar
        isVisible={metVisibility.sigwx}
        selectedEntry={selectedSigwxEntry}
        entryCount={sigwxHistoryEntries.length}
        historyIndex={sigwxHistoryIndex}
        issueLabel={sigwxIssueLabel}
        validLabel={sigwxValidLabel}
        isElevated={weatherTimelineVisible}
        onHistoryIndexChange={setSigwxHistoryIndex}
      />

      <WeatherTimelineBar
        isVisible={weatherTimelineVisible}
        isPlaying={weatherTimelinePlaying}
        selectedIndex={effectiveWeatherTimelineIndex}
        tickCount={weatherTimelineTicks.length}
        selectedTimeMs={selectedWeatherTimeMs}
        playbackSpeed={weatherTimelineSpeed}
        onPlayPause={() => setWeatherTimelinePlaying((prev) => !prev)}
        onIndexChange={(value) => {
          setWeatherTimelinePlaying(false)
          setWeatherTimelineIndex(value)
        }}
        onPlaybackSpeedChange={setWeatherTimelineSpeed}
      />

      <AdsbTimestamp
        isVisible={metVisibility.adsb && !weatherTimelineVisible}
        updatedAt={adsbData?.updated_at}
      />
      <AdsbTimestamp
        isVisible={metVisibility.adsb && weatherTimelineVisible}
        updatedAt={adsbData?.updated_at}
        compact
      />

      <SigwxLegendDialog isOpen={sigwxLegendOpen} onClose={toggleSigwxLegend} />

      <BasemapSwitcher
        basemapId={basemapId}
        isOpen={basemapMenuOpen}
        onOpenChange={setBasemapMenuOpen}
        onSwitchBasemap={switchBasemap}
      />

      {activePanel === 'route-check' && (
        <RouteBriefingPanel
          state={routeBriefing.state}
          refs={routeBriefing.refs}
          derived={routeBriefing.derived}
          actions={routeBriefing.actions}
          airports={airports}
        />
      )}

      <VerticalProfileWindow
        profile={routeBriefing.state.verticalProfile}
        isOpen={routeBriefing.state.verticalProfileWindowOpen}
        onClose={() => routeBriefing.actions.setVerticalProfileWindowOpen(false)}
      />

      {activePanel === 'aviation' && (
        <AviationLayerPanel
          visibility={aviationVisibility}
          onToggle={toggleAviation}
        />
      )}

      {activePanel === 'met' && (
        <WeatherOverlayPanel
          layers={MET_LAYERS}
          visibility={metVisibility}
          blinkLightning={blinkLightning}
          onToggle={toggleMet}
          onBlinkLightningChange={setBlinkLightning}
          isLayerDisabled={isMetLayerDisabled}
          getLayerBadge={metLayerBadge}
        />
      )}

      {activePanel === 'settings' && (
        <div className="dev-layer-panel settings-panel" aria-label="Options panel">
          <div className="dev-layer-panel-title">Options</div>
          {metVisibility.sigwx && (
            <>
              <div className="dev-layer-section-title">SIGWX</div>
              <div className="settings-actions">
                <button type="button" className="dev-layer-inline-button" onClick={toggleSigwxLegend}>Legend</button>
              </div>
              <div className="dev-layer-section-title">SIGWX Filters</div>
              <div className="dev-filter-grid">
                {SIGWX_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`dev-filter-chip${sigwxFilter[option.key] === false ? ' is-off' : ''}`}
                    onClick={() => toggleSigwxFilter(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {!metVisibility.sigwx && <div className="sigwx-group-empty">Enable SIGWX to configure filters.</div>}
        </div>
      )}
    </div>
  )
}

export default MapView


