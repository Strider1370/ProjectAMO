import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_CONFIG, BASEMAP_OPTIONS } from './mapConfig.js'
import { addAviationWfsLayers } from '../aviation-layers/addAviationWfsLayers.js'
import { AVIATION_WFS_LAYERS } from '../aviation-layers/aviationWfsLayers.js'
import {
  ADVISORY_LAYER_DEFS,
} from '../weather-overlays/lib/advisoryLayers.js'
import { buildBriefingRoute, buildVfrRoute, canBuildBriefingRoutePath, loadIapData, loadNavpoints, loadRouteDirectionMetadata } from '../route-briefing/lib/routePlanner.js'
import { getProcedures, KNOWN_AIRPORTS } from '../route-briefing/lib/procedureData.js'
import { fetchAdsbData } from '../../api/adsbApi.js'
import { fetchVerticalProfile } from '../../api/briefingApi.js'
import { fetchSigwxCloudMeta, fetchSigwxFrontMeta } from '../../api/weatherApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, setAdsbVisibility, ADSB_SOURCE_ID } from '../aviation-layers/addAdsbLayer.js'
import AviationLayerPanel from '../aviation-layers/AviationLayerPanel.jsx'
import VerticalProfileChart from '../route-briefing/VerticalProfileChart.jsx'
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
  installAdvisoryLayers,
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
  calcVfrDistance,
  relabeledWaypoints,
} from '../route-briefing/lib/routePreview.js'
import {
  clearRoutePreviewLayers,
  installRoutePreviewLayers,
  syncBoundaryFixPreview,
  syncRoutePreviewLayers,
  syncVfrWaypointData,
} from '../route-briefing/lib/routePreviewSync.js'
import { buildVerticalProfileRequest } from '../route-briefing/lib/verticalProfileRequest.js'
import {
  FIR_EXIT_AIRPORT,
  FIR_IN_AIRPORT,
  ROUTE_SEQUENCE_COLORS,
  buildBoundaryFixOptions,
  buildIapCandidates,
  buildIfrDistanceBreakdown,
  buildIfrSequenceTokens,
  buildInitialVfrWaypoints,
  buildRoutePreviewModel,
  buildVisibleSidOptions,
  chooseIapKeyForRunway,
  filterProceduresByRunway,
  getCurrentRouteLineString,
  getVfrAirportAltitudeFt,
  getWindDirection,
  pickBestRunwayGroup,
} from '../route-briefing/lib/routeBriefingModel.js'
import './MapView.css'

// ???? Constants ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

const ROAD_VISIBILITY_ZOOM = 8
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
  if (!sector?.fillLayerId || !sector.hoverLayerId) return

  map.on('mousemove', sector.fillLayerId, (e) => {
    const ids = [...new Set(e.features.map((f) => f.properties.sectorId).filter(Boolean))]
    map.getCanvas().style.cursor = ids.length > 0 ? 'pointer' : ''
    map.setFilter(sector.hoverLayerId, ['in', ['get', 'sectorId'], ['literal', ids]])
  })
  map.on('mouseleave', sector.fillLayerId, () => {
    map.getCanvas().style.cursor = ''
    map.setFilter(sector.hoverLayerId, ['in', ['get', 'sectorId'], ['literal', []]])
  })
}

// ???? Lightning layers ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

// ???? Route state ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

const initialRouteForm = {
  flightRule: 'IFR',
  departureAirport: '', entryFix: '',
  exitFix: '', arrivalAirport: '', routeType: 'RNAV',
}
const DEFAULT_CRUISE_ALTITUDE_FT = 9000

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
  const [error, setError] = useState(null)
  const [isStyleReady, setIsStyleReady] = useState(false)
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
  const [routeForm, setRouteForm] = useState(initialRouteForm)
  const [routeResult, setRouteResult] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(DEFAULT_CRUISE_ALTITUDE_FT)
  const [verticalProfile, setVerticalProfile] = useState(null)
  const [verticalProfileLoading, setVerticalProfileLoading] = useState(false)
  const [verticalProfileError, setVerticalProfileError] = useState(null)
  const [verticalProfileStale, setVerticalProfileStale] = useState(false)
  const [verticalProfileWindowOpen, setVerticalProfileWindowOpen] = useState(false)
  const [editingVfrAltitudeIndex, setEditingVfrAltitudeIndex] = useState(null)
  const [adsbData, setAdsbData] = useState(null)
  const [basemapId, setBasemapId] = useState('standard')
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)
  const [vfrWaypoints, setVfrWaypoints] = useState([])
  const [hoveredWpInfo, setHoveredWpInfo] = useState(null)
  const [sidOptions, setSidOptions] = useState([])
  const [availableSidIds, setAvailableSidIds] = useState(null)
  const [starOptions, setStarOptions] = useState([])
  const [selectedSid, setSelectedSid] = useState(null)
  const [selectedStar, setSelectedStar] = useState(null)
  const [iapData, setIapData] = useState(null)
  const [iapCandidates, setIapCandidates] = useState([])
  const [selectedIapKey, setSelectedIapKey] = useState(null)
  const [firInOptions, setFirInOptions] = useState([])
  const [firExitOptions, setFirExitOptions] = useState([])
  const [navpointsById, setNavpointsById] = useState({})
  const [autoRecommendRequested, setAutoRecommendRequested] = useState(false)
  const vfrWaypointsRef = useRef([])
  const hideTimerRef = useRef(null)
  const isFirInMode = routeForm.flightRule === 'IFR' && routeForm.departureAirport === FIR_IN_AIRPORT
  const isFirExitMode = routeForm.flightRule === 'IFR' && routeForm.arrivalAirport === FIR_EXIT_AIRPORT

  useEffect(() => { onSelectRef.current = onAirportSelect }, [onAirportSelect])
  useEffect(() => { vfrWaypointsRef.current = vfrWaypoints }, [vfrWaypoints])

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

  // ???? Procedure loading ??????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const airport = routeForm.departureAirport
    if (!KNOWN_AIRPORTS.includes(airport)) { setSidOptions([]); setSelectedSid(null); return }
    getProcedures(airport, 'SID').then((procs) => { setSidOptions(procs); setSelectedSid(null) })
  }, [routeForm.departureAirport])

  useEffect(() => {
    let cancelled = false

    if (routeForm.flightRule !== 'IFR' || !routeForm.exitFix) {
      setAvailableSidIds(null)
      return () => {
        cancelled = true
      }
    }

    Promise.all(
      sidOptions.map(async (proc) => {
        const allowed = await canBuildBriefingRoutePath({
          entryFix: proc.enrouteFix,
          exitFix: routeForm.exitFix,
          routeType: routeForm.routeType,
        })
        return allowed ? proc.id : null
      }),
    )
      .then((ids) => {
        if (cancelled) return
        const filteredIds = ids.filter(Boolean)
        setAvailableSidIds(filteredIds.length > 0 ? filteredIds : null)
        if (filteredIds.length > 0 && selectedSid && !filteredIds.includes(selectedSid.id)) {
          setSelectedSid(null)
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableSidIds(null)
      })

    return () => {
      cancelled = true
    }
  }, [routeForm.flightRule, routeForm.exitFix, routeForm.routeType, sidOptions, selectedSid])

  useEffect(() => {
    const airport = routeForm.arrivalAirport
    if (!KNOWN_AIRPORTS.includes(airport)) { setStarOptions([]); setSelectedStar(null); return }
    getProcedures(airport, 'STAR').then((procs) => { setStarOptions(procs); setSelectedStar(null) })
  }, [routeForm.arrivalAirport])

  useEffect(() => {
    let cancelled = false

    loadRouteDirectionMetadata()
      .then((metadata) => {
        if (cancelled) return

        const options = buildBoundaryFixOptions(metadata)
        setFirInOptions(options.firInOptions)
        setFirExitOptions(options.firExitOptions)
      })
      .catch(() => {
        if (!cancelled) {
          setFirInOptions([])
          setFirExitOptions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    loadNavpoints()
      .then((navpoints) => {
        if (!cancelled) setNavpointsById(navpoints ?? {})
      })
      .catch(() => {
        if (!cancelled) setNavpointsById({})
      })

    return () => {
      cancelled = true
    }
  }, [])

  // ???? IAP data loading ????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const airport = routeForm.arrivalAirport
    if (KNOWN_AIRPORTS.includes(airport)) {
      loadIapData(airport).then(setIapData)
    } else {
      setIapData(null)
      setIapCandidates([])
      setSelectedIapKey(null)
    }
  }, [routeForm.arrivalAirport])

  useEffect(() => {
    if (!selectedStar || !iapData) {
      setIapCandidates([])
      setSelectedIapKey(null)
      return
    }
    const { candidates, selectedIapKey: nextSelectedIapKey } = buildIapCandidates(selectedStar, iapData, selectedIapKey)
    setIapCandidates(candidates)
    setSelectedIapKey(nextSelectedIapKey)
  }, [selectedStar, iapData, selectedIapKey])

  const selectedIap = iapData?.iapRoutes?.[selectedIapKey] ?? null
  const visibleSidOptions = useMemo(() => buildVisibleSidOptions(sidOptions, availableSidIds), [availableSidIds, sidOptions])
  const routePreviewModel = useMemo(() => buildRoutePreviewModel({
    routeForm,
    routeResult,
    vfrWaypoints,
    selectedSid,
    selectedStar,
    selectedIap,
    navpointsById,
  }), [navpointsById, routeForm, routeResult, selectedIap, selectedSid, selectedStar, vfrWaypoints])

  function clearRouteDisplay() {
    setRouteResult(null)
    setRouteError(null)
    setRouteLoading(false)
    setVerticalProfile(null)
    setVerticalProfileError(null)
    setVerticalProfileStale(false)
    setVerticalProfileWindowOpen(false)
    setVfrWaypoints([])
    const map = mapRef.current
    if (map?.isStyleLoaded()) {
      clearRoutePreviewLayers(map)
    }
  }

  useEffect(() => {
    if (verticalProfile) {
      setVerticalProfileStale(true)
    }
  }, [selectedSid, selectedStar, selectedIapKey, vfrWaypoints])

  useEffect(() => {
    let cancelled = false

    if (
      activePanel !== 'route-check' ||
      routeForm.flightRule !== 'IFR' ||
      !autoRecommendRequested
    ) {
      return () => {
        cancelled = true
      }
    }

    const isDomesticDeparture = KNOWN_AIRPORTS.includes(routeForm.departureAirport)
    const isDomesticArrival = KNOWN_AIRPORTS.includes(routeForm.arrivalAirport)

    if (isFirInMode && !routeForm.entryFix) {
      return () => {
        cancelled = true
      }
    }

    if (isFirExitMode && !routeForm.exitFix) {
      return () => {
        cancelled = true
      }
    }

    if (
      !isFirInMode &&
      !isFirExitMode &&
      (!isDomesticDeparture || !isDomesticArrival || sidOptions.length === 0 || starOptions.length === 0 || !iapData)
    ) {
      return () => {
        cancelled = true
      }
    }

    if (isFirInMode && (!isDomesticArrival || starOptions.length === 0 || !iapData)) {
      return () => {
        cancelled = true
      }
    }

    if (isFirExitMode && (!isDomesticDeparture || sidOptions.length === 0)) {
      return () => {
        cancelled = true
      }
    }

    const departureCandidates = isFirInMode
      ? [{ sid: null, entryFix: routeForm.entryFix }]
      : filterProceduresByRunway(
          sidOptions,
          pickBestRunwayGroup(
            sidOptions.flatMap((proc) => proc.runways ?? []),
            getWindDirection(metarData, routeForm.departureAirport),
          ),
        ).map((sid) => ({ sid, entryFix: sid.enrouteFix ?? '' }))

    const arrivalCandidates = isFirExitMode
      ? [{ star: null, iapKey: null, exitFix: routeForm.exitFix }]
      : filterProceduresByRunway(
          starOptions
            .map((star) => {
              const entry = iapData.starToIapCandidates?.[star.id]
              return { star, entry, runways: entry?.runways ?? [] }
            })
            .filter(({ entry }) => entry),
          pickBestRunwayGroup(
            starOptions
              .map((star) => iapData?.starToIapCandidates?.[star.id]?.runways ?? [])
              .flat(),
            getWindDirection(metarData, routeForm.arrivalAirport),
          ),
        ).map(({ star, entry }) => ({
          star,
          iapKey: chooseIapKeyForRunway(
            entry,
            iapData,
            pickBestRunwayGroup(
              starOptions
                .map((candidateStar) => iapData?.starToIapCandidates?.[candidateStar.id]?.runways ?? [])
                .flat(),
              getWindDirection(metarData, routeForm.arrivalAirport),
            ),
          ),
          exitFix: star.startFix ?? '',
        }))

    Promise.all(
      departureCandidates.flatMap(({ sid, entryFix }) =>
        arrivalCandidates.map(async ({ star, iapKey, exitFix }) => {
          try {
            const result = await buildBriefingRoute({
              departureAirport: routeForm.departureAirport,
              arrivalAirport: routeForm.arrivalAirport,
              entryFix,
              exitFix,
              routeType: routeForm.routeType,
            })

            return {
              sid,
              star,
              iapKey,
              entryFix,
              exitFix,
              distanceNm: Number(result?.distanceNm) || Number.POSITIVE_INFINITY,
            }
          } catch {
            return null
          }
        }),
      ),
    ).then((results) => {
      if (cancelled) return

      const valid = results.filter(Boolean).sort((a, b) => a.distanceNm - b.distanceNm)
      const fallbackSid = departureCandidates[0] ?? null
      const fallbackArrival = arrivalCandidates[0] ?? null
      const best = valid[0] ?? (fallbackSid && fallbackArrival
        ? {
            sid: fallbackSid.sid ?? null,
            star: fallbackArrival.star,
            iapKey: fallbackArrival.iapKey,
            entryFix: fallbackSid.entryFix,
            exitFix: fallbackArrival.exitFix,
          }
        : null)

      if (!best) return

      setAutoRecommendRequested(false)
      setSelectedSid(best.sid ?? null)
      setSelectedStar(best.star ?? null)
      setSelectedIapKey(best.iapKey ?? null)
      setRouteForm((prev) => ({
        ...prev,
        entryFix: best.entryFix ?? prev.entryFix,
        exitFix: best.exitFix ?? prev.exitFix,
      }))
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [
    activePanel,
    iapData,
    isFirInMode,
    isFirExitMode,
    metarData,
    routeForm.arrivalAirport,
    routeForm.departureAirport,
    routeForm.entryFix,
    routeForm.exitFix,
    routeForm.flightRule,
    routeForm.routeType,
    sidOptions,
    starOptions,
    autoRecommendRequested,
  ])

  // ???? Procedure preview on map ????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    const { fitCoordinates } = syncRoutePreviewLayers(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = fitCoordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(fitCoordinates[0], fitCoordinates[0]))
      map.fitBounds(bounds, { padding: 80, maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, routeResult, isStyleReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    const { fitCoordinates } = syncBoundaryFixPreview(map, routePreviewModel)
    if (fitCoordinates.length > 0 && !routeResult) {
      const bounds = fitCoordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(fitCoordinates[0], fitCoordinates[0]))
      map.fitBounds(bounds, { padding: 80, maxZoom: 9, duration: 500 })
    }
  }, [routePreviewModel, isStyleReady, routeResult])

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
      timeoutId = setTimeout(poll, 5000)
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

    let airportHandlerBound = false
    let advisoryHandlerBound = false
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
      AVIATION_WFS_LAYERS.forEach((l) => setLayerVisibility(map, l, aviationVisibility[l.id]))

      // Route preview
      installRoutePreviewLayers(map)
      bindSectorHover(map)
      if (!vfrInteractionsBound) {
        vfrInteractionsBound = true
        bindVfrInteractions(map, vfrWaypointsRef, setVfrWaypoints)
      }

      // Weather overlays
      syncRasterAndSigwxLayers(map, rasterAndSigwxModel)
      installAdvisoryLayers(map, advisoryLayerModel)
      syncLightningLayers(map, lightningLayerModel)

      // Geo boundaries (coastline + admin)
      addGeoBoundaryLayers(map)

      // Airport circles
      addAirportLayers(map, airportGeoJSON)

      if (!airportHandlerBound) {
        airportHandlerBound = true
        map.on('click', AIRPORT_CIRCLE_LAYER, (e) => {
          const icao = e.features?.[0]?.properties?.icao
          if (icao) onSelectRef.current?.(icao)
        })
        map.on('mouseenter', AIRPORT_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', AIRPORT_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = '' })
      }

      // ADS-B
      addAdsbLayers(map)
      bindAdsbHover(map)
      setAdsbVisibility(map, metVisibility.adsb)

      if (!advisoryHandlerBound) {
        advisoryHandlerBound = true
        const advisoryLayerIds = [
          ADVISORY_LAYER_DEFS.sigmet.fillLayerId, ADVISORY_LAYER_DEFS.sigmet.lineLayerId,
          ADVISORY_LAYER_DEFS.airmet.fillLayerId, ADVISORY_LAYER_DEFS.airmet.lineLayerId,
        ]
        advisoryLayerIds.forEach((layerId) => {
          map.on('click', layerId, (e) => {
            const desc = e.features?.[0]?.properties?.description
            if (!desc) return
            new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })
              .setLngLat(e.lngLat)
              .setHTML(`<pre class="mapbox-advisory-popup">${desc.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</pre>`)
              .addTo(map)
          })
          map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
        })
      }

      setIsStyleReady(true)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ???? Sync aviation layer visibility ??????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    AVIATION_WFS_LAYERS.forEach((l) => setLayerVisibility(map, l, aviationVisibility[l.id]))
  }, [aviationVisibility])

  // ???? Route highlight (?롪퍔?δ빳???뚮뜆?????깅턄???띠룆踰????戮?뻣) ????????????????????????????????????????????????????

  // ???? VFR waypoint sync ????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || routeResult?.flightRule !== 'VFR') return
    syncVfrWaypointData(map, routePreviewModel)
  }, [routePreviewModel, routeResult, isStyleReady])

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
  }, [isStyleReady])

  // ???? Sync MET overlays ??????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    syncRasterAndSigwxLayers(map, rasterAndSigwxModel)
  }, [rasterAndSigwxModel, isStyleReady])

  // ???? Sync SIGMET / AIRMET ????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    syncAdvisoryLayers(map, advisoryLayerModel)
  }, [advisoryLayerModel, isStyleReady])

  // ???? Sync lightning ????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    syncLightningLayers(map, lightningLayerModel)
  }, [lightningLayerModel, isStyleReady])

  // ???? Sync geo boundaries ??????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    setGeoBoundaryVisibility(map, metVisibility.satellite || metVisibility.radar)
  }, [metVisibility.satellite, metVisibility.radar, isStyleReady])

  // ???? Sync ADS-B ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    map.getSource(ADSB_SOURCE_ID)?.setData(adsbGeoJSON)
    setAdsbVisibility(map, metVisibility.adsb)
  }, [adsbGeoJSON, metVisibility.adsb, isStyleReady])

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
  }, [airportGeoJSON, isStyleReady])

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
  }, [airportGeoJSON, selectedAirport, isStyleReady])

  // ???? Route panel clear ??????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    if (activePanel === 'route-check') return
    clearRouteDisplay()
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
  }, [activePanel])

  // ???? Route search ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  function updateRouteField(field, value) {
    setRouteForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleDepartureAirportChange(value) {
    clearRouteDisplay()
    updateRouteField('departureAirport', value)
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)

    if (value === FIR_IN_AIRPORT) {
      updateRouteField('entryFix', '')
    }
  }

  function handleArrivalAirportChange(value) {
    clearRouteDisplay()
    updateRouteField('arrivalAirport', value)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)

    if (value === FIR_EXIT_AIRPORT) {
      updateRouteField('exitFix', '')
    }
  }

  function handleEntryFixChange(value) {
    clearRouteDisplay()
    updateRouteField('entryFix', value)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)
  }

  function handleExitFixChange(value) {
    clearRouteDisplay()
    updateRouteField('exitFix', value)
    setSelectedSid(null)
    setAutoRecommendRequested(true)
  }

  function switchFlightRule(rule) {
    setRouteForm((prev) => ({ ...prev, flightRule: rule }))
    clearRouteDisplay()
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)
  }

  function handleAutoRecommend() {
    clearRouteDisplay()
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAutoRecommendRequested(true)
  }

  function handleRouteReset() {
    clearRouteDisplay()
    setRouteForm((prev) => ({ ...initialRouteForm, flightRule: prev.flightRule }))
    setSelectedSid(null)
    setSelectedStar(null)
    setIapCandidates([])
    setSelectedIapKey(null)
    setAvailableSidIds(null)
    setAutoRecommendRequested(false)
  }

  function deleteVfrWaypoint(idx) {
    const next = relabeledWaypoints(vfrWaypoints.filter((_, i) => i !== idx))
    setVfrWaypoints(next)
    setHoveredWpInfo(null)
    const map = mapRef.current
    if (map?.isStyleLoaded()) {
      syncVfrWaypointData(map, { vfrWaypoints: next })
    }
  }

  async function handleRouteSearch(e) {
    e.preventDefault()
    setRouteLoading(true)
    setRouteError(null)
    setVerticalProfile(null)
    setVerticalProfileError(null)
    setVerticalProfileStale(false)
    setVerticalProfileWindowOpen(false)
    try {
      const result = routeForm.flightRule === 'VFR'
        ? await buildVfrRoute(routeForm)
        : await buildBriefingRoute(routeForm)
      setRouteResult(result)
      const map = mapRef.current
      if (result.flightRule === 'VFR') {
        const initialWaypoints = buildInitialVfrWaypoints(result, airports)
        setVfrWaypoints(initialWaypoints)
        if (map?.isStyleLoaded()) {
          syncVfrWaypointData(map, { vfrWaypoints: initialWaypoints })
          const coords = initialWaypoints.map((wp) => [wp.lon, wp.lat])
          const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
          map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 500 })
        }
      } else {
        setVfrWaypoints([])
        if (map?.isStyleLoaded()) {
          const { fitCoordinates } = syncRoutePreviewLayers(map, {
            routeResult: result,
            selectedSid,
            selectedStar,
            selectedIap,
          })
          if (fitCoordinates.length > 0) {
            const bounds = fitCoordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(fitCoordinates[0], fitCoordinates[0]))
            map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 500 })
          }
        }
      }
    } catch (err) {
      setRouteResult(null)
      setRouteError(err.message)
    } finally {
      setRouteLoading(false)
    }
  }

  function updateVfrWaypointAltitude(idx, value) {
    setVfrWaypoints((prev) => prev.map((wp, i) => (
      i === idx ? { ...wp, altitudeFt: value } : wp
    )))
  }

  function applyCruiseAltitudeToVfrWaypoints() {
    const plannedCruiseAltitudeFt = Number(cruiseAltitudeFt)
    if (!Number.isFinite(plannedCruiseAltitudeFt) || plannedCruiseAltitudeFt <= 0) return
    setVfrWaypoints((prev) => prev.map((wp) => {
      if (!wp.fixed) return { ...wp, altitudeFt: Math.round(plannedCruiseAltitudeFt) }
      const airportElevationFt = getVfrAirportAltitudeFt(airports, wp)
      return { ...wp, airportElevationFt, altitudeFt: airportElevationFt }
    }))
  }

  async function handleVerticalProfileRequest() {
    const routeGeometry = getCurrentRouteLineString({
      routeResult,
      vfrWaypoints,
      selectedSid,
      selectedStar,
      selectedIap,
    })
    const plannedCruiseAltitudeFt = Number(cruiseAltitudeFt)

    if (!routeGeometry) {
      setVerticalProfileError('\uc5f0\uc9c1\ub2e8\uba74\ub3c4\ub97c \uc0dd\uc131\ud560 \uacbd\ub85c\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.')
      return
    }

    if (!Number.isFinite(plannedCruiseAltitudeFt) || plannedCruiseAltitudeFt <= 0) {
      setVerticalProfileError('\uc21c\ud56d\uace0\ub3c4\ub97c 0\ubcf4\ub2e4 \ud070 ft \uac12\uc73c\ub85c \uc785\ub825\ud574\uc8fc\uc138\uc694.')
      return
    }

    setVerticalProfileLoading(true)
    setVerticalProfileError(null)
    try {
      const profile = await fetchVerticalProfile(buildVerticalProfileRequest({
        routeGeometry,
        routeResult,
        selectedSid,
        selectedStar,
        selectedIap,
        vfrWaypoints,
        plannedCruiseAltitudeFt,
      }))
      setVerticalProfile(profile)
      setVerticalProfileStale(false)
      setVerticalProfileWindowOpen(true)
    } catch (err) {
      setVerticalProfileError(err.message)
    } finally {
      setVerticalProfileLoading(false)
    }
  }

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

      {hoveredWpInfo && (
        <button
          className="vfr-wp-delete"
          style={{ left: hoveredWpInfo.x + 8, top: hoveredWpInfo.y - 16 }}
          onClick={() => deleteVfrWaypoint(hoveredWpInfo.idx)}
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={() => setHoveredWpInfo(null)}
        >X</button>
      )}

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

      {/* Route check panel */}
      {activePanel === 'route-check' && (
        <section className="route-check-panel" aria-label={'\uacbd\ub85c \ud655\uc778 \ud328\ub110'}>
          <div className="route-check-header">
            <div>
              <div className="route-check-eyebrow">Flight Plan</div>
              <div className="route-check-title">{'\uacbd\ub85c \ud655\uc778'}</div>
            </div>
            <span className="route-check-status">{routeForm.flightRule}</span>
          </div>
          <form className="route-check-form" onSubmit={handleRouteSearch}>
            <div className="route-check-section route-check-section--conditions">
              <div className="route-check-section-title">{'\uc6b4\ud56d \uc870\uac74'}</div>
              <div className="route-check-section-grid">
                <div className={`route-check-field route-check-flight-rule-field${routeForm.flightRule === 'VFR' ? ' full-width' : ''}`}>
                  <div className="route-check-field-label">{'\ube44\ud589 \uaddc\uce59'}</div>
                  <div className="route-check-flight-rule">
                    <label className={`route-check-radio route-check-flight-option${routeForm.flightRule === 'IFR' ? ' is-active' : ''}`}>
                      <input type="radio" name="flightRule" value="IFR" checked={routeForm.flightRule === 'IFR'} onChange={() => switchFlightRule('IFR')} />
                      <span>IFR</span>
                    </label>
                    <span className="route-check-flight-divider">/</span>
                    <label className={`route-check-radio route-check-flight-option${routeForm.flightRule === 'VFR' ? ' is-active' : ''}`}>
                      <input type="radio" name="flightRule" value="VFR" checked={routeForm.flightRule === 'VFR'} onChange={() => switchFlightRule('VFR')} />
                      <span>VFR</span>
                    </label>
                  </div>
                </div>
                {routeForm.flightRule === 'IFR' && (
                  <label>{'\uacbd\ub85c \uc720\ud615'}
                    <select value={routeForm.routeType} onChange={(e) => updateRouteField('routeType', e.target.value)}>
                      <option value="ALL">{'\uc804\uccb4'}</option>
                      <option value="RNAV">RNAV</option>
                      <option value="ATS">ATS</option>
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className="route-check-section">
              <div className="route-check-section-title">{'\ucd9c\ubc1c'}</div>
              <div className="route-check-section-grid">
                <label>{'\ucd9c\ubc1c \uacf5\ud56d'}
                  <select
                    value={routeForm.departureAirport === FIR_IN_AIRPORT ? FIR_IN_AIRPORT : KNOWN_AIRPORTS.includes(routeForm.departureAirport) ? routeForm.departureAirport : '__direct__'}
                    onChange={(e) => handleDepartureAirportChange(e.target.value === '__direct__' ? '' : e.target.value)}
                  >
                    {KNOWN_AIRPORTS.map((ap) => <option key={ap} value={ap}>{ap}</option>)}
                    <option value={FIR_IN_AIRPORT}>FIR IN</option>
                    <option value="__direct__">{'\uc9c1\uc811 \uc785\ub825'}</option>
                  </select>
                  {!KNOWN_AIRPORTS.includes(routeForm.departureAirport) && routeForm.departureAirport !== FIR_IN_AIRPORT && (
                    <input className="proc-direct-input" value={routeForm.departureAirport} placeholder="ICAO" onChange={(e) => updateRouteField('departureAirport', e.target.value)} />
                  )}
                </label>
                {routeForm.flightRule === 'IFR' && (
                <label>{isFirInMode ? '\uc9c4\uc785 FIX' : visibleSidOptions.length > 0 ? 'SID' : '\uc9c4\uc785 FIX'}
                  {isFirInMode
                    ? (
                        <select
                        value={routeForm.entryFix}
                        onChange={(e) => handleEntryFixChange(e.target.value)}
                        disabled={firInOptions.length === 0}
                      >
                        {firInOptions.length === 0
                          ? <option value="">{'\uc9c4\uc785 FIX \uc5c6\uc74c'}</option>
                          : [
                              <option key="__empty__" value="">{'-- \uc5c6\uc74c --'}</option>,
                              ...firInOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>),
                            ]}
                      </select>
                    )
                    : visibleSidOptions.length > 0
                    ? (
                      <select value={selectedSid?.id ?? ''} onChange={(e) => {
                        clearRouteDisplay()
                        setAutoRecommendRequested(false)
                        const proc = visibleSidOptions.find((p) => p.id === e.target.value) ?? null
                        setSelectedSid(proc)
                        if (proc) updateRouteField('entryFix', proc.enrouteFix ?? '')
                      }}>
                        <option value="">{'-- \uc5c6\uc74c --'}</option>
                        {visibleSidOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    )
                    : <input value={routeForm.entryFix} onChange={(e) => handleEntryFixChange(e.target.value)} />
                  }
                </label>
                )}
              </div>
            </div>

            <div className="route-check-section">
              <div className="route-check-section-title">{'\ub3c4\ucc29'}</div>
              <div className="route-check-section-grid">
                <label>{'\ub3c4\ucc29 \uacf5\ud56d'}
                  <select
                    value={
                      routeForm.arrivalAirport === FIR_EXIT_AIRPORT
                        ? FIR_EXIT_AIRPORT
                        : KNOWN_AIRPORTS.includes(routeForm.arrivalAirport)
                          ? routeForm.arrivalAirport
                          : '__direct__'
                    }
                    onChange={(e) => handleArrivalAirportChange(e.target.value === '__direct__' ? '' : e.target.value)}
                  >
                    {KNOWN_AIRPORTS.map((ap) => <option key={ap} value={ap}>{ap}</option>)}
                    <option value={FIR_EXIT_AIRPORT}>FIR EXIT</option>
                    <option value="__direct__">{'\uc9c1\uc811 \uc785\ub825'}</option>
                  </select>
                  {!KNOWN_AIRPORTS.includes(routeForm.arrivalAirport) && routeForm.arrivalAirport !== FIR_EXIT_AIRPORT && (
                    <input className="proc-direct-input" value={routeForm.arrivalAirport} placeholder="ICAO" onChange={(e) => updateRouteField('arrivalAirport', e.target.value)} />
                  )}
                </label>
                {routeForm.flightRule === 'IFR' && (
                <label>{isFirExitMode ? '\uc774\ud0c8 FIX' : starOptions.length > 0 ? 'STAR' : '\uc774\ud0c8 FIX'}
                  {isFirExitMode
                    ? (
                      <select
                        value={routeForm.exitFix}
                        onChange={(e) => handleExitFixChange(e.target.value)}
                        disabled={firExitOptions.length === 0}
                      >
                        {firExitOptions.length === 0
                          ? <option value="">{'\uc774\ud0c8 FIX \uc5c6\uc74c'}</option>
                          : [
                              <option key="__empty__" value="">{'-- \uc5c6\uc74c --'}</option>,
                              ...firExitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>),
                            ]}
                      </select>
                    )
                    : starOptions.length > 0
                    ? (
                      <select value={selectedStar?.id ?? ''} onChange={(e) => {
                        clearRouteDisplay()
                        setAutoRecommendRequested(false)
                        const proc = starOptions.find((p) => p.id === e.target.value) ?? null
                        setSelectedStar(proc)
                        if (proc) updateRouteField('exitFix', proc.startFix ?? '')
                      }}>
                        <option value="">{'-- \uc5c6\uc74c --'}</option>
                        {starOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    )
                    : <input value={routeForm.exitFix} onChange={(e) => handleExitFixChange(e.target.value)} />
                  }
                </label>
                )}
                {!isFirExitMode && iapCandidates.length > 1 && (
                  <label>RWY
                    <select value={selectedIapKey ?? ''} onChange={(e) => {
                      clearRouteDisplay()
                      setAutoRecommendRequested(false)
                      setSelectedIapKey(e.target.value || null)
                    }}>
                      {iapCandidates.map(({ key, label }) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className={`route-check-actions${routeForm.flightRule === 'VFR' ? ' is-vfr' : ''}`}>
              <button className="route-check-search-button" type="submit" disabled={routeLoading}>{routeLoading ? '\uac80\uc0c9 \uc911...' : '\uac80\uc0c9'}</button>
              {routeForm.flightRule === 'IFR' && (
                <button className="route-check-secondary-button" type="button" onClick={handleAutoRecommend} disabled={routeLoading}>{'\uc790\ub3d9\uac80\uc0c9'}</button>
              )}
              <button className="route-check-secondary-button" type="button" onClick={handleRouteReset} disabled={routeLoading}>{'\ucd08\uae30\ud654'}</button>
            </div>
          </form>
          {routeError && <div className="route-check-error">{routeError}</div>}
          {routeResult && (
            <div className="route-check-result">
              {routeResult.flightRule === 'IFR' && (() => {
                const displayTokens = buildIfrSequenceTokens(routeResult, { selectedSid, selectedStar, selectedIap })
                const { totalDistanceNm, items: distanceBreakdown } = buildIfrDistanceBreakdown({
                  routeResult,
                  selectedSid,
                  selectedStar,
                  selectedIap,
                })

                return (
                  <>
                    <div className="route-check-total-dist">
                      {'\ucd1d \uac70\ub9ac'}: <strong>{totalDistanceNm} NM</strong>
                      {distanceBreakdown.length > 0 && (
                        <span className="dist-breakdown">
                          {' ('}
                          {distanceBreakdown.map((item, index) => (
                            <span key={`${item.kind}-${item.label}`}>
                              {index > 0 && <span className="dist-breakdown-sep">{' + '}</span>}
                              <span
                                className={`dist-breakdown-token is-${item.kind}`}
                                style={{ color: ROUTE_SEQUENCE_COLORS[item.kind] }}
                              >
                                {`${item.label} ${item.value.toFixed(1)}`}
                              </span>
                            </span>
                          ))}
                          {')'}
                        </span>
                      )}
                    </div>
                    <div className="route-check-sequence">
                      {displayTokens.map((token, index) => (
                        <span key={`${token.kind}-${token.text}-${index}`}>
                          {index > 0 && <span className="route-check-sequence-sep">{' -> '}</span>}
                          <span
                            className={`route-check-sequence-token is-${token.kind}`}
                            style={{ color: ROUTE_SEQUENCE_COLORS[token.kind] }}
                          >
                            {token.text}
                          </span>
                        </span>
                      ))}
                    </div>
                  </>
                )
              })()}
              {routeResult.flightRule === 'VFR' && vfrWaypoints.length >= 2 && (
                <>
                  <div className="route-check-total-dist">
                    {'\ucd1d \uac70\ub9ac'}: <strong>{calcVfrDistance(vfrWaypoints).toFixed(1)} NM</strong>
                  </div>
                  <div className="vfr-altitude-tools">
                    <span>{'VFR WP \uacc4\ud68d\uace0\ub3c4'}</span>
                    <button type="button" onClick={applyCruiseAltitudeToVfrWaypoints}>
                      {'\uc21c\ud56d\uace0\ub3c4 \uc804\uccb4 \uc801\uc6a9'}
                    </button>
                  </div>
                  <div className="vfr-waypoint-altitude-list">
                    {vfrWaypoints.map((wp, index) => {
                      const fallbackAltitudeFt = Number(cruiseAltitudeFt)
                      const displayAltitudeFt = wp.fixed
                        ? getVfrAirportAltitudeFt(airports, wp)
                        : Number.isFinite(Number(wp.altitudeFt))
                        ? Number(wp.altitudeFt)
                        : fallbackAltitudeFt
                      const isEditing = !wp.fixed && editingVfrAltitudeIndex === index
                      return (
                        <div className="vfr-waypoint-altitude-row" key={`${wp.id}-${index}`}>
                          <span className="vfr-waypoint-altitude-id">{wp.id}</span>
                          {isEditing ? (
                            <input
                              className="vfr-waypoint-altitude-input"
                              type="number"
                              min="100"
                              step="100"
                              autoFocus
                              value={Number.isFinite(displayAltitudeFt) ? Math.round(displayAltitudeFt) : ''}
                              onChange={(e) => updateVfrWaypointAltitude(index, e.target.value)}
                              onBlur={() => setEditingVfrAltitudeIndex(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') setEditingVfrAltitudeIndex(null)
                              }}
                            />
                          ) : wp.fixed ? (
                            <span className="vfr-waypoint-altitude-pill is-fixed" title="공항 표고">
                              {`${Math.round(displayAltitudeFt).toLocaleString()} ft`}
                            </span>
                          ) : (
                            <button
                              className="vfr-waypoint-altitude-pill"
                              type="button"
                              onClick={() => setEditingVfrAltitudeIndex(index)}
                            >
                              {Number.isFinite(displayAltitudeFt)
                                ? `${Math.round(displayAltitudeFt).toLocaleString()} ft`
                                : '\uace0\ub3c4 \uc785\ub825'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              <div className="vertical-profile-control">
                <label>
                  <span>{'\uc21c\ud56d\uace0\ub3c4(ft)'}</span>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={cruiseAltitudeFt}
                    onChange={(e) => setCruiseAltitudeFt(e.target.value)}
                  />
                </label>
                <button type="button" onClick={handleVerticalProfileRequest} disabled={verticalProfileLoading}>
                  {verticalProfileLoading ? '\uc0dd\uc131 \uc911...' : '\uc5f0\uc9c1\ub2e8\uba74\ub3c4 \uc0dd\uc131'}
                </button>
              </div>
              {verticalProfileStale && (
                <div className="vertical-profile-stale">
                  {'\uacbd\ub85c\uac00 \ubcc0\uacbd\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc5f0\uc9c1\ub2e8\uba74\ub3c4\ub97c \ub2e4\uc2dc \uc0dd\uc131\ud574\uc8fc\uc138\uc694.'}
                </div>
              )}
              {verticalProfileError && <div className="vertical-profile-error">{verticalProfileError}</div>}
              {verticalProfile && (
                <button
                  className="vertical-profile-open-button"
                  type="button"
                  onClick={() => setVerticalProfileWindowOpen(true)}
                >
                  {'\uc5f0\uc9c1\ub2e8\uba74\ub3c4 \uc5f4\uae30'}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {verticalProfile && verticalProfileWindowOpen && (
        <div className="vertical-profile-window-backdrop" role="presentation">
          <section className="vertical-profile-window" role="dialog" aria-modal="true" aria-label={'\uc5f0\uc9c1\ub2e8\uba74\ub3c4'}>
            <div className="vertical-profile-window-header">
              <div>
                <div className="vertical-profile-window-eyebrow">Vertical Profile</div>
                <div className="vertical-profile-window-title">{'\uc5f0\uc9c1\ub2e8\uba74\ub3c4'}</div>
              </div>
              <button type="button" className="vertical-profile-window-close" onClick={() => setVerticalProfileWindowOpen(false)}>
                {'\ub2eb\uae30'}
              </button>
            </div>
            <VerticalProfileChart profile={verticalProfile} />
          </section>
        </div>
      )}

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


