import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_CONFIG, BASEMAP_OPTIONS } from './mapConfig.js'
import { addAviationWfsLayers } from '../aviation-layers/addAviationWfsLayers.js'
import { AVIATION_WFS_LAYERS } from '../aviation-layers/aviationWfsLayers.js'
import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  advisoryItemsToFeatureCollection,
  advisoryItemsToLabelFeatureCollection,
  setAdvisoryVisibility,
  updateAdvisoryLayerData,
} from '../weather-overlays/lib/advisoryLayers.js'
import { buildBriefingRoute, buildVfrRoute, canBuildBriefingRoutePath, loadIapData, loadNavpoints, loadRouteDirectionMetadata } from '../route-briefing/lib/routePlanner.js'
import { getProcedures, KNOWN_AIRPORTS } from '../route-briefing/lib/procedureData.js'
import { fetchAdsbData } from '../../api/adsbApi.js'
import { fetchVerticalProfile } from '../../api/briefingApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, setAdsbVisibility, ADSB_SOURCE_ID } from '../aviation-layers/addAdsbLayer.js'
import AviationLayerPanel from '../aviation-layers/AviationLayerPanel.jsx'
import VerticalProfileChart from '../route-briefing/VerticalProfileChart.jsx'
import { SIGWX_FILTER_OPTIONS, sigwxLowToMapboxData } from '../weather-overlays/lib/sigwxData.js'
import AdvisoryBadges from '../weather-overlays/AdvisoryBadges.jsx'
import AdsbTimestamp from '../weather-overlays/AdsbTimestamp.jsx'
import SigwxHistoryBar from '../weather-overlays/SigwxHistoryBar.jsx'
import SigwxLegendDialog from '../weather-overlays/SigwxLegendDialog.jsx'
import WeatherTimelineBar from '../weather-overlays/WeatherTimelineBar.jsx'
import WeatherLegends from '../weather-overlays/WeatherLegends.jsx'
import WeatherOverlayPanel from '../weather-overlays/WeatherOverlayPanel.jsx'
import {
  buildTimelineTicks,
  getPlaybackDelayMs,
  normalizeFrame,
  normalizeFrames,
  pickNearestPreviousFrame,
} from '../weather-overlays/lib/weatherTimeline.js'
import BasemapSwitcher from './basemapSwitcher/BasemapSwitcher.jsx'
import { addOrUpdateImageOverlay } from './imageOverlay.js'
import './MapView.css'

// ???? Constants ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

const ROAD_VISIBILITY_ZOOM = 8
const FIR_EXIT_AIRPORT = 'FIR_EXIT'
const FIR_IN_AIRPORT = 'FIR_IN'
const FIR_IN_ALLOWED_FIXES = new Set(['AGAVO', 'ANDOL', 'APELA', 'ATOTI', 'BEDAR', 'INVOK', 'KALEK', 'KANSU', 'LANAT', 'RUGMA', 'SAPRA'])
const FIR_OUT_ALLOWED_FIXES = new Set(['AGAVO', 'ANDOL', 'APELA', 'ATOTI', 'BESNA', 'IGRAS', 'INVOK', 'KALEK', 'KANSU', 'LANAT', 'MUGUS', 'RUGMA', 'SAMDO', 'SAPRA'])
const ROUTE_PREVIEW_SOURCE = 'briefing-route-preview'
const ROUTE_PREVIEW_LINE = 'briefing-route-preview-line'
const ROUTE_PREVIEW_POINT = 'briefing-route-preview-point'
const BOUNDARY_FIX_PREVIEW_SOURCE = 'boundary-fix-preview'
const BOUNDARY_FIX_PREVIEW_POINT = 'boundary-fix-preview-point'
const BOUNDARY_FIX_PREVIEW_LABEL = 'boundary-fix-preview-label'

const ROUTE_HL_WP_ICON = 'route-hl-wp-icon'
const ROUTE_HL_WP_LABEL = 'route-hl-wp-label'
const ROUTE_HL_NA_ICON = 'route-hl-na-icon'
const ROUTE_HL_NA_LABEL = 'route-hl-na-label'
const ROUTE_HL_AW_LINE = 'route-hl-aw-line'
const ROUTE_HL_AW_LABEL = 'route-hl-aw-label'
const ROUTE_HL_LAYER_IDS = [ROUTE_HL_WP_ICON, ROUTE_HL_WP_LABEL, ROUTE_HL_NA_ICON, ROUTE_HL_NA_LABEL, ROUTE_HL_AW_LINE, ROUTE_HL_AW_LABEL]

const VFR_WP_CIRCLE = 'vfr-wp-circle'
const VFR_WP_LABEL = 'vfr-wp-label'

const PROC_PREVIEW_SOURCE = 'procedure-preview'
const PROC_SID_LINE = 'procedure-sid-line'

function getWindDirection(metarData, airport) {
  const value = metarData?.airports?.[airport]?.observation?.wind?.direction
  return Number.isFinite(value) ? value : null
}

function getRunwayHeading(runwayGroup) {
  const match = String(runwayGroup ?? '').match(/(\d{2})/)
  if (!match) return null
  const runwayNumber = Number(match[1])
  if (!Number.isFinite(runwayNumber)) return null
  return (runwayNumber % 36) * 10
}

function getHeadingDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY
  return Math.abs(((a - b + 540) % 360) - 180)
}

function pickBestRunwayGroup(runwayGroups, windDirection) {
  const unique = [...new Set((runwayGroups ?? []).filter(Boolean))]
  if (unique.length === 0) return null
  if (!Number.isFinite(windDirection)) return unique[0]
  return unique
    .map((runwayGroup) => ({
      runwayGroup,
      heading: getRunwayHeading(runwayGroup),
    }))
    .sort((a, b) => {
      const diffA = getHeadingDifference(a.heading, windDirection)
      const diffB = getHeadingDifference(b.heading, windDirection)
      if (diffA !== diffB) return diffA - diffB
      return (a.heading ?? 0) - (b.heading ?? 0)
    })[0]?.runwayGroup ?? unique[0]
}

function filterProceduresByRunway(procedures, runwayGroup) {
  if (!runwayGroup) return procedures
  const filtered = procedures.filter((proc) => (proc.runways ?? []).includes(runwayGroup))
  return filtered.length > 0 ? filtered : procedures
}

function chooseIapKeyForRunway(entry, iapData, runwayGroup) {
  const candidateKeys = entry?.candidateIapKeys ?? []
  if (candidateKeys.length === 0) return null
  if (!runwayGroup) return entry?.defaultIapKey ?? candidateKeys[0]
  return candidateKeys.find((key) =>
    (iapData?.iapRoutes?.[key]?.representativeFor?.runwayGroup ?? []).includes(runwayGroup),
  ) ?? entry?.defaultIapKey ?? candidateKeys[0]
}
const PROC_STAR_LINE = 'procedure-star-line'
const PROC_IAP_LINE = 'procedure-iap-line'
const PROC_WP_CIRCLE = 'procedure-wp-circle'
const PROC_WP_LABEL = 'procedure-wp-label'

const AIRPORT_SOURCE_ID = 'kma-weather-airports'
const AIRPORT_CIRCLE_LAYER = 'kma-weather-airports-circle'
const AIRPORT_LABEL_LAYER = 'kma-weather-airports-label'

const SATELLITE_SOURCE = 'kma-satellite-overlay'
const SATELLITE_LAYER = 'kma-satellite-overlay'
const RADAR_SOURCE = 'kma-radar-overlay'
const RADAR_LAYER = 'kma-radar-overlay'
const SIGWX_SOURCE = 'kma-sigwx-overlay'
const SIGWX_LAYER = 'kma-sigwx-overlay'
const SIGWX_CLOUD_SOURCE = 'kma-sigwx-cloud-overlay'
const SIGWX_CLOUD_LAYER = 'kma-sigwx-cloud-overlay'
const SIGWX_POLYGON_SOURCE = 'kma-sigwx-low-polygons'
const SIGWX_POLYGON_LAYER = 'kma-sigwx-low-polygons'
const SIGWX_POLYGON_OUTLINE_LAYER = 'kma-sigwx-low-polygons-outline'
const SIGWX_LINE_SOURCE = 'kma-sigwx-low-lines'
const SIGWX_LINE_LAYER = 'kma-sigwx-low-lines'
const SIGWX_LABEL_SOURCE = 'kma-sigwx-low-labels'
const SIGWX_LABEL_LAYER = 'kma-sigwx-low-labels'
const SIGWX_ICON_SOURCE = 'kma-sigwx-low-icons'
const SIGWX_ICON_LAYER = 'kma-sigwx-low-icons'
const SIGWX_ARROW_LABEL_SOURCE = 'kma-sigwx-low-arrow-labels'
const SIGWX_ARROW_LABEL_LAYER = 'kma-sigwx-low-arrow-labels'
const SIGWX_TEXT_CHIP_SOURCE = 'kma-sigwx-low-text-chips'
const SIGWX_TEXT_CHIP_LAYER = 'kma-sigwx-low-text-chips'
const SIGWX_VECTOR_LAYERS = [
  SIGWX_POLYGON_LAYER,
  SIGWX_POLYGON_OUTLINE_LAYER,
  SIGWX_LINE_LAYER,
  SIGWX_LABEL_LAYER,
  SIGWX_ICON_LAYER,
  SIGWX_ARROW_LABEL_LAYER,
  SIGWX_TEXT_CHIP_LAYER,
]
const LIGHTNING_SOURCE = 'kma-lightning'
const LIGHTNING_GROUND_LAYER = 'kma-lightning-ground'
const LIGHTNING_CLOUD_LAYER = 'kma-lightning-cloud'
const LIGHTNING_ICON_IDS = [
  'lightning-0-10',
  'lightning-10-20',
  'lightning-20-30',
  'lightning-30-40',
  'lightning-40-50',
  'lightning-50-60',
]
const LIGHTNING_BLINK_INTERVAL_MS = 800
const LIGHTNING_TIME_WINDOW_MINUTES = 60
const LIGHTNING_AGE_BANDS = [
  { min: 0, max: 10, color: '#ff1f1f', opacity: 1, iconId: 'lightning-0-10' },
  { min: 10, max: 20, color: '#ff00ff', opacity: 0.92, iconId: 'lightning-10-20' },
  { min: 20, max: 30, color: '#2f55ff', opacity: 0.85, iconId: 'lightning-20-30' },
  { min: 30, max: 40, color: '#1dd9e6', opacity: 0.78, iconId: 'lightning-30-40' },
  { min: 40, max: 50, color: '#25d90a', opacity: 0.7, iconId: 'lightning-40-50' },
  { min: 50, max: 60, color: '#ffeb00', opacity: 0.62, iconId: 'lightning-50-60' },
]
const RADAR_RAINRATE_LEGEND = [
  { label: '150', color: 'rgb(51, 50, 59)' },
  { label: '110', color: 'rgb(2, 4, 138)' },
  { label: '90', color: 'rgb(75, 79, 170)' },
  { label: '70', color: 'rgb(178, 180, 219)' },
  { label: '60', color: 'rgb(141, 6, 219)' },
  { label: '50', color: 'rgb(174, 44, 250)' },
  { label: '40', color: 'rgb(201, 107, 248)' },
  { label: '30', color: 'rgb(223, 170, 250)' },
  { label: '25', color: 'rgb(174, 5, 7)' },
  { label: '20', color: 'rgb(202, 4, 6)' },
  { label: '15', color: 'rgb(246, 61, 4)' },
  { label: '10', color: 'rgb(237, 118, 7)' },
  { label: '9', color: 'rgb(211, 175, 10)' },
  { label: '8', color: 'rgb(237, 196, 10)' },
  { label: '7', color: 'rgb(251, 218, 32)' },
  { label: '6', color: 'rgb(254, 247, 19)' },
  { label: '5', color: 'rgb(18, 92, 5)' },
  { label: '4', color: 'rgb(7, 135, 6)' },
  { label: '3', color: 'rgb(6, 187, 8)' },
  { label: '2', color: 'rgb(8, 250, 8)' },
  { label: '1.0', color: 'rgb(4, 74, 231)' },
  { label: '0.5', color: 'rgb(6, 153, 238)' },
  { label: '0.1', color: 'rgb(8, 198, 246)' },
  { label: '0.0', color: 'rgb(247, 252, 249)' },
]

const GEO_BOUNDARY_COLOR = '#facc15'
const GEO_BOUNDARY_WIDTH = 1
const GEO_SIGUNGU_MIN_ZOOM = 9
const ROUTE_SEQUENCE_COLORS = {
  airport: '#0f172a',
  sid: '#2563eb',
  star: '#7c3aed',
  iap: '#0ea5e9',
  airway: '#1f2933',
  enr: '#1f2933',
  waypoint: '#0f766e',
}
const GEO_LAYERS = [
  { sourceId: 'geo-neighbors', layerId: 'geo-neighbors-line', url: '/Geo/korea_neighbors_masked.v1.geojson', minzoom: 0 },
  { sourceId: 'geo-sido', layerId: 'geo-sido-line', url: '/Geo/sido.json', minzoom: 0, maxzoom: GEO_SIGUNGU_MIN_ZOOM },
  { sourceId: 'geo-sigungu', layerId: 'geo-sigungu-line', url: '/Geo/sigungu.json', minzoom: GEO_SIGUNGU_MIN_ZOOM },
]

const HIDDEN_ROAD_COLOR = 'rgba(255,255,255,0)'
const VISIBLE_ROAD_COLORS = { roads: '#d6dde6', trunks: '#c6d1dd', motorways: '#b9c7d4' }

// MET layer definitions (order = display order in panel)
const MET_LAYERS = [
  { id: 'radar', label: 'Radar', color: '#38bdf8' },
  { id: 'satellite', label: 'Satellite', color: '#64748b' },
  { id: 'lightning', label: 'Lightning', color: '#facc15' },
  { id: 'sigmet', label: 'SIGMET', color: ADVISORY_LAYER_DEFS.sigmet.color },
  { id: 'airmet', label: 'AIRMET', color: ADVISORY_LAYER_DEFS.airmet.color },
  { id: 'sigwx', label: 'SIGWX', color: '#a78bfa' },
  { id: 'adsb', label: 'ADS-B', color: '#10b981' },
]

const emptyGeoJSON = { type: 'FeatureCollection', features: [] }
const M_TO_FT = 3.28084

// ???? VFR waypoint helpers ??????????????????????????????????????????????????????????????????????????????????????????????????????????

function greatCircleNm(lon1, lat1, lon2, lat2) {
  const R = 3440.065
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function calcVfrDistance(waypoints) {
  let total = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += greatCircleNm(waypoints[i].lon, waypoints[i].lat, waypoints[i + 1].lon, waypoints[i + 1].lat)
  }
  return Number(total.toFixed(2))
}

function segmentPointDistSq(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
}

function findInsertIndex(waypoints, lngLat) {
  const { lng, lat } = lngLat
  let minDist = Infinity
  let insertIdx = 1
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1]
    const d = segmentPointDistSq(a.lon, a.lat, b.lon, b.lat, lng, lat)
    if (d < minDist) { minDist = d; insertIdx = i + 1 }
  }
  return insertIdx
}

function relabeledWaypoints(waypoints) {
  let wpCount = 0
  return waypoints.map((wp) => wp.fixed ? wp : { ...wp, id: `WP${++wpCount}` })
}

function buildVfrGeoJSON(waypoints) {
  if (waypoints.length < 2) return emptyGeoJSON
  const coords = waypoints.map((wp) => [wp.lon, wp.lat])
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { role: 'route-preview-line' }, geometry: { type: 'LineString', coordinates: coords } },
      ...waypoints.map((wp, i) => ({
        type: 'Feature',
        properties: { role: 'vfr-waypoint', wpIndex: i, fixed: wp.fixed ? 1 : 0, label: wp.id },
        geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
      })),
    ],
  }
}

function getProcedureLineCoordinates(proc) {
  const geometryCoords = proc?.geometry?.coordinates
  if (Array.isArray(geometryCoords) && geometryCoords.length >= 2) {
    return geometryCoords
  }

  const fixes = (proc?.fixes ?? []).filter((f) => f.lat != null && f.lon != null)
  if (fixes.length < 2) return []
  return fixes.map((f) => [f.lon, f.lat])
}

const BOUNDARY_FIX_FLOW_LABELS = {
  AGAVO: 'Westbound',
  ANDOL: 'Boundary',
  APELA: 'Southeastbound',
  ATOTI: 'Southwestbound',
  BEDAR: 'Southwestbound',
  BESNA: 'Southeastbound',
  IGRAS: 'Boundary',
  INVOK: 'Boundary',
  KALEK: 'Boundary',
  KANSU: 'Eastbound',
  LANAT: 'Eastbound',
  MUGUS: 'Southbound',
  RUGMA: 'Southwestbound',
  SAMDO: 'Southeastbound',
  SAPRA: 'Eastbound',
}

function formatBoundaryFixLabel(fix) {
  const flowLabel = BOUNDARY_FIX_FLOW_LABELS[fix]
  return flowLabel ? `${fix} (${flowLabel})` : fix
}

function buildProcedureGeoJSON(sid, star, iap) {
  const features = []
  function addProc(proc, role) {
    if (!proc) return
    const fixes = proc.fixes.filter((f) => f.lat != null && f.lon != null)
    const coords = getProcedureLineCoordinates(proc)
    if (coords.length < 2 || fixes.length < 2) return
    features.push({ type: 'Feature', properties: { role: `${role}-line` }, geometry: { type: 'LineString', coordinates: coords } })
    fixes.forEach((f) => features.push({
      type: 'Feature',
      properties: { role: `${role}-wp`, label: f.id },
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
    }))
    ;(proc.displayPoints ?? [])
      .filter((p) => p.lat != null && p.lon != null)
      .forEach((p) => features.push({
        type: 'Feature',
        properties: { role: `${role}-wp`, label: p.id },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      }))
  }
  addProc(sid, 'sid')
  addProc(star, 'star')
  if (iap) {
    const iapFixes = (iap.fixes ?? []).filter((f) => f.coordinates?.lat != null)
    if (iapFixes.length >= 2) {
      features.push({ type: 'Feature', properties: { role: 'iap-line' }, geometry: iap.geometry })
      iapFixes.forEach((f) => features.push({
        type: 'Feature',
        properties: { role: 'iap-wp', label: f.id },
        geometry: { type: 'Point', coordinates: [f.coordinates.lon, f.coordinates.lat] },
      }))
    }
  }
  return { type: 'FeatureCollection', features }
}

function augmentRouteWithProcedures(previewGeojson, sid, star, iap) {
  if (!sid && !star && !iap) return previewGeojson
  const lineFeature = previewGeojson.features.find((f) => f.properties.role === 'route-preview-line')
  if (!lineFeature) return previewGeojson

  // baseCoords = [depAirport, entryFix, ...airways..., exitFix, arrAirport]
  let combined = [...lineFeature.geometry.coordinates]
  const depCoord = combined[0]
  const arrCoord = combined[combined.length - 1]

  // 1. Process SID: replace [dep, entryFix] with the full SID geometry
  const sidCoords = getProcedureLineCoordinates(sid)
  if (sidCoords.length > 0) {
    combined = [...sidCoords, ...combined.slice(2)]
  }

  // 2. Process STAR & IAP: replace [exitFix, arr] with [...starCoords, ...iapTail]
  const starCoords = getProcedureLineCoordinates(star)
  const iapCoords = iap?.geometry?.coordinates ?? []
  const iapTail = iapCoords.length > 1 ? iapCoords.slice(1) : []

  if (starCoords.length > 0) {
    // starCoords starts at exitFix
    const tail = iapTail.length > 0 ? iapTail : [arrCoord]
    combined = [...combined.slice(0, -2), ...starCoords, ...tail]
  } else if (iapTail.length > 0) {
    // No STAR but have IAP (starts at exitFix)
    combined = [...combined.slice(0, -1), ...iapTail]
  }

  if (combined.length < 2) return previewGeojson
  return {
    ...previewGeojson,
    features: previewGeojson.features.map((f) =>
      f.properties.role === 'route-preview-line'
        ? { ...f, geometry: { ...f.geometry, coordinates: combined } }
        : f
    ),
  }
}

function addProcedurePreviewLayers(map) {
  if (!map.getSource(PROC_PREVIEW_SOURCE)) {
    map.addSource(PROC_PREVIEW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(PROC_SID_LINE)) {
    map.addLayer({
      id: PROC_SID_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'sid-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [5, 3] },
    })
  }
  if (!map.getLayer(PROC_STAR_LINE)) {
    map.addLayer({
      id: PROC_STAR_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'star-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [5, 3] },
    })
  }
  if (!map.getLayer(PROC_IAP_LINE)) {
    map.addLayer({
      id: PROC_IAP_LINE, type: 'line', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'iap-line'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#0ea5e9', 'line-width': 2, 'line-dasharray': [3, 3] },
    })
  }
  if (!map.getLayer(PROC_WP_CIRCLE)) {
    map.addLayer({
      id: PROC_WP_CIRCLE, type: 'circle', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['any', ['==', ['get', 'role'], 'sid-wp'], ['==', ['get', 'role'], 'star-wp'], ['==', ['get', 'role'], 'iap-wp']],
      paint: {
        'circle-radius': 4,
        'circle-color': ['case',
          ['==', ['get', 'role'], 'sid-wp'], '#2563eb',
          ['==', ['get', 'role'], 'iap-wp'], '#0ea5e9',
          '#7c3aed',
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }
  if (!map.getLayer(PROC_WP_LABEL)) {
    map.addLayer({
      id: PROC_WP_LABEL, type: 'symbol', source: PROC_PREVIEW_SOURCE, slot: 'top',
      filter: ['any', ['==', ['get', 'role'], 'sid-wp'], ['==', ['get', 'role'], 'star-wp'], ['==', ['get', 'role'], 'iap-wp']],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': ['case',
          ['==', ['get', 'role'], 'sid-wp'], '#2563eb',
          ['==', ['get', 'role'], 'iap-wp'], '#0ea5e9',
          '#7c3aed',
        ],
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }
}

function addVfrWaypointLayers(map) {
  if (!map.getLayer(VFR_WP_CIRCLE)) {
    map.addLayer({
      id: VFR_WP_CIRCLE, type: 'circle', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'vfr-waypoint'],
      paint: {
        'circle-radius': 7,
        'circle-color': ['case', ['==', ['get', 'fixed'], 1], '#f97316', '#ffffff'],
        'circle-stroke-color': ['case', ['==', ['get', 'fixed'], 1], '#ffffff', '#2563eb'],
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      },
    })
  }
  if (!map.getLayer(VFR_WP_LABEL)) {
    map.addLayer({
      id: VFR_WP_LABEL, type: 'symbol', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['all', ['==', ['get', 'role'], 'vfr-waypoint'], ['==', ['get', 'fixed'], 0]],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#2563eb', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    })
  }
}

function bindVfrInteractions(map, vfrWaypointsRef, setVfrWaypoints) {
  let draggingIdx = -1

  map.on('mousedown', VFR_WP_CIRCLE, (e) => {
    e.preventDefault()
    const wpIdx = e.features[0].properties.wpIndex
    if (vfrWaypointsRef.current[wpIdx]?.fixed) return
    draggingIdx = wpIdx
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  })

  map.on('mousedown', ROUTE_PREVIEW_LINE, (e) => {
    if (vfrWaypointsRef.current.length < 2) return
    const wpHit = map.queryRenderedFeatures(e.point, { layers: [VFR_WP_CIRCLE] })
    if (wpHit.length > 0) return
    e.preventDefault()
    const wps = vfrWaypointsRef.current
    const insertIdx = findInsertIndex(wps, e.lngLat)
    const wpCount = wps.filter((wp) => !wp.fixed).length
    const newWp = { id: `WP${wpCount + 1}`, lon: e.lngLat.lng, lat: e.lngLat.lat }
    const next = relabeledWaypoints([...wps.slice(0, insertIdx), newWp, ...wps.slice(insertIdx)])
    vfrWaypointsRef.current = next
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(next))
    draggingIdx = insertIdx
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'grabbing'
  })

  map.on('mousemove', ROUTE_PREVIEW_LINE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = 'crosshair'
  })
  map.on('mouseleave', ROUTE_PREVIEW_LINE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = ''
  })
  map.on('mousemove', VFR_WP_CIRCLE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = 'grab'
  })
  map.on('mouseleave', VFR_WP_CIRCLE, () => {
    if (draggingIdx < 0) map.getCanvas().style.cursor = ''
  })

  map.on('mousemove', (e) => {
    if (draggingIdx < 0) return
    const updated = vfrWaypointsRef.current.map((wp, i) =>
      i === draggingIdx ? { ...wp, lon: e.lngLat.lng, lat: e.lngLat.lat } : wp
    )
    vfrWaypointsRef.current = updated
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(updated))
  })

  map.on('mouseup', () => {
    if (draggingIdx < 0) return
    setVfrWaypoints([...vfrWaypointsRef.current])
    draggingIdx = -1
    map.dragPan.enable()
    map.getCanvas().style.cursor = ''
  })
}

// ???? Helpers ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

function applyRoadVisibility(map, show) {
  map.setConfigProperty('basemap', 'colorRoads', show ? VISIBLE_ROAD_COLORS.roads : HIDDEN_ROAD_COLOR)
  map.setConfigProperty('basemap', 'colorTrunks', show ? VISIBLE_ROAD_COLORS.trunks : HIDDEN_ROAD_COLOR)
  map.setConfigProperty('basemap', 'colorMotorways', show ? VISIBLE_ROAD_COLORS.motorways : HIDDEN_ROAD_COLOR)
}

function setLayerVisibility(map, layer, isVisible) {
  const v = isVisible ? 'visible' : 'none'
  const ids = [
    layer.fillLayerId, layer.maskLayerId, layer.hoverLayerId,
    layer.pointMaskLayerId, layer.pointLayerId,
    layer.lineLayerId, layer.routeLabelLayerId,
    layer.tickLayerId, layer.externalLabelLayerId,
    layer.internalLabelLayerId, layer.labelLayerId,
    layer.pointLabelLayerId ? (layer.pointLabelMaskLayerId ?? `${layer.pointLabelLayerId}-mask`) : null,
    layer.pointLabelLayerId,
  ].filter(Boolean)

  ids.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
  })

  layer.neighborBoundaries?.forEach((b) => {
    if (map.getLayer(b.tickLayerId)) map.setLayoutProperty(b.tickLayerId, 'visibility', v)
  })
}

function setMapLayerVisible(map, layerId, isVisible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none')
  }
}

function ensureMapImage(map, { id, url }) {
  if (!id || !url || map.hasImage(id)) return
  map.loadImage(url, (error, image) => {
    if (error || !image || map.hasImage(id)) return
    map.addImage(id, image)
  })
}

function createSigwxChipImage({ fill, stroke }) {
  const width = 64
  const height = 26
  const radius = 6
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.beginPath()
  ctx.moveTo(radius, 1)
  ctx.lineTo(width - radius - 1, 1)
  ctx.quadraticCurveTo(width - 1, 1, width - 1, radius)
  ctx.lineTo(width - 1, height - radius - 1)
  ctx.quadraticCurveTo(width - 1, height - 1, width - radius - 1, height - 1)
  ctx.lineTo(radius, height - 1)
  ctx.quadraticCurveTo(1, height - 1, 1, height - radius - 1)
  ctx.lineTo(1, radius)
  ctx.quadraticCurveTo(1, 1, radius, 1)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
  return ctx.getImageData(0, 0, width, height)
}

function ensureSigwxChipImages(map) {
  const images = [
    { id: 'sigwx-chip-neutral', fill: 'rgba(255,255,255,0.96)', stroke: '#111827' },
    { id: 'sigwx-chip-green', fill: 'rgba(236, 253, 245, 0.96)', stroke: '#16a34a' },
    { id: 'sigwx-chip-blue', fill: 'rgba(239, 246, 255, 0.96)', stroke: '#2563eb' },
    { id: 'sigwx-chip-orange', fill: 'rgba(255, 247, 237, 0.96)', stroke: '#ea580c' },
  ]

  images.forEach((image) => {
    if (map.hasImage(image.id)) return
    const data = createSigwxChipImage(image)
    if (!data || map.hasImage(image.id)) return
    map.addImage(image.id, data, { pixelRatio: 2 })
  })
}

function addOrUpdateGeoJsonSource(map, sourceId, data) {
  const source = map.getSource(sourceId)
  if (source) {
    source.setData(data)
  } else {
    map.addSource(sourceId, { type: 'geojson', data })
  }
}

function buildSigwxDashArrayExpression() {
  return [
    'match',
    ['get', 'lineType'],
    '2', ['literal', [8, 6]],
    '3', ['literal', [10, 6]],
    '4', ['literal', [10, 4, 2, 4]],
    '5', ['literal', [14, 8]],
    '6', ['literal', [16, 6]],
    '7', ['literal', [12, 4, 2, 4, 2, 4]],
    '8', ['literal', [18, 6]],
    '301', ['literal', [10, 6]],
    '302', ['literal', [10, 6]],
    '303', ['literal', [10, 6]],
    '304', ['literal', [10, 6]],
    '310', ['literal', [10, 6]],
    ['literal', [1, 0]],
  ]
}

function addOrUpdateSigwxLowLayers(map, data) {
  const empty = emptyGeoJSON
  ensureSigwxChipImages(map)
  addOrUpdateGeoJsonSource(map, SIGWX_POLYGON_SOURCE, data?.polygons || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_LINE_SOURCE, data?.lines || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_LABEL_SOURCE, data?.labels || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_ICON_SOURCE, data?.icons || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_ARROW_LABEL_SOURCE, data?.arrowLabels || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_TEXT_CHIP_SOURCE, data?.textChips || empty)

  data?.iconImages?.forEach((image) => ensureMapImage(map, image))

  if (!map.getLayer(SIGWX_POLYGON_LAYER)) {
    map.addLayer({
      id: SIGWX_POLYGON_LAYER,
      type: 'fill',
      source: SIGWX_POLYGON_SOURCE,
      slot: 'top',
      paint: {
        'fill-color': ['coalesce', ['get', 'colorBack'], '#a78bfa'],
        'fill-opacity': 0.12,
      },
    })
  }

  if (!map.getLayer(SIGWX_POLYGON_OUTLINE_LAYER)) {
    map.addLayer({
      id: SIGWX_POLYGON_OUTLINE_LAYER,
      type: 'line',
      source: SIGWX_POLYGON_SOURCE,
      slot: 'top',
      paint: {
        'line-color': ['coalesce', ['get', 'colorLine'], '#7c3aed'],
        'line-opacity': 0.95,
        'line-width': ['coalesce', ['get', 'lineWidth'], 2],
        'line-dasharray': buildSigwxDashArrayExpression(),
      },
    })
  }

  if (!map.getLayer(SIGWX_LINE_LAYER)) {
    map.addLayer({
      id: SIGWX_LINE_LAYER,
      type: 'line',
      source: SIGWX_LINE_SOURCE,
      slot: 'top',
      paint: {
        'line-color': ['coalesce', ['get', 'colorLine'], '#7c3aed'],
        'line-opacity': 0.95,
        'line-width': ['coalesce', ['get', 'lineWidth'], 2],
        'line-dasharray': buildSigwxDashArrayExpression(),
      },
    })
  }

  if (!map.getLayer(SIGWX_ICON_LAYER)) {
    map.addLayer({
      id: SIGWX_ICON_LAYER,
      type: 'symbol',
      source: SIGWX_ICON_SOURCE,
      slot: 'top',
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': ['coalesce', ['get', 'iconScale'], 0.82],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  }

  if (!map.getLayer(SIGWX_LABEL_LAYER)) {
    map.addLayer({
      id: SIGWX_LABEL_LAYER,
      type: 'symbol',
      source: SIGWX_LABEL_SOURCE,
      slot: 'top',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-offset': [0, 1.1],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#2d1b69',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }

  if (!map.getLayer(SIGWX_ARROW_LABEL_LAYER)) {
    map.addLayer({
      id: SIGWX_ARROW_LABEL_LAYER,
      type: 'symbol',
      source: SIGWX_ARROW_LABEL_SOURCE,
      slot: 'top',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    })
  }

  if (!map.getLayer(SIGWX_TEXT_CHIP_LAYER)) {
    map.addLayer({
      id: SIGWX_TEXT_CHIP_LAYER,
      type: 'symbol',
      source: SIGWX_TEXT_CHIP_SOURCE,
      slot: 'top',
      layout: {
        'icon-image': [
          'match',
          ['get', 'chipTone'],
          'green', 'sigwx-chip-green',
          'blue', 'sigwx-chip-blue',
          'orange', 'sigwx-chip-orange',
          'sigwx-chip-neutral',
        ],
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [5, 7, 5, 7],
        'text-field': ['get', 'chipText'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': [
          'match',
          ['get', 'chipTone'],
          'green', '#166534',
          'blue', '#1d4ed8',
          'orange', '#c2410c',
          '#111827',
        ],
      },
    })
  }
}

function setSigwxLowVisibility(map, isVisible) {
  SIGWX_VECTOR_LAYERS.forEach((layerId) => setMapLayerVisible(map, layerId, isVisible))
}

function createAirportGeoJSON(airports) {
  return {
    type: 'FeatureCollection',
    features: airports
      .filter((a) => Number.isFinite(a.lon) && Number.isFinite(a.lat))
      .map((a) => ({
        type: 'Feature',
        id: a.icao,
        properties: { icao: a.icao, name: a.nameKo || a.name || a.icao },
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      })),
  }
}

function getLightningAgeBand(ageMinutes) {
  return LIGHTNING_AGE_BANDS.find((band) => ageMinutes >= band.min && ageMinutes < band.max) ?? null
}

function createLightningCrossImage(color) {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.translate(size / 2, size / 2)
  ctx.lineCap = 'round'

  // Black outline for contrast against raster backgrounds.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(-9, 0)
  ctx.lineTo(9, 0)
  ctx.moveTo(0, -9)
  ctx.lineTo(0, 9)
  ctx.stroke()

  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-9, 0)
  ctx.lineTo(9, 0)
  ctx.moveTo(0, -9)
  ctx.lineTo(0, 9)
  ctx.stroke()

  return ctx.getImageData(0, 0, size, size)
}

function ensureLightningIcons(map) {
  LIGHTNING_AGE_BANDS.forEach((band) => {
    if (map.hasImage(band.iconId)) return
    const image = createLightningCrossImage(band.color)
    if (!image) return
    map.addImage(band.iconId, image)
  })
}

function buildLightningOpacityExpression(blinkOff = false) {
  if (blinkOff) return 0
  return [
    'coalesce',
    ['get', 'opacity'],
    1,
  ]
}

function createLightningGeoJSON(lightningData, referenceTimeMs) {
  const strikes = lightningData?.nationwide?.strikes || lightningData?.strikes || []
  const baseTimeMs = Number.isFinite(referenceTimeMs) ? referenceTimeMs : Date.now()
  return {
    type: 'FeatureCollection',
    features: strikes
      .filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat))
      .map((s) => {
        const strikeTimeMs = new Date(s.time).getTime()
        if (!Number.isFinite(strikeTimeMs)) return null
        const ageMinutes = (baseTimeMs - strikeTimeMs) / 60000
        if (ageMinutes < 0 || ageMinutes > LIGHTNING_TIME_WINDOW_MINUTES) return null
        const band = getLightningAgeBand(ageMinutes)
        if (!band) return null
        return { s, ageMinutes, band }
      })
      .filter(Boolean)
      .map((s, i) => ({
        type: 'Feature',
        id: i,
        properties: {
          type: s.s.type_name || (s.s.type === 'G' ? 'ground' : 'cloud'),
          ageMinutes: Number(s.ageMinutes.toFixed(1)),
          iconKey: s.band.iconId,
          opacity: s.band.opacity,
        },
        geometry: { type: 'Point', coordinates: [s.s.lon, s.s.lat] },
      })),
  }
}

function parseFrameTmToMs(tm) {
  if (!tm || !/^\d{12}$/.test(String(tm))) return null
  const raw = String(tm)
  const date = new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - 9,
    Number(raw.slice(10, 12)),
    0,
    0,
  ))
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : null
}

function formatReferenceTimeLabel(timeMs) {
  if (!Number.isFinite(timeMs)) return '--:--'
  const kst = new Date(timeMs + 9 * 60 * 60 * 1000)
  const hours = String(kst.getUTCHours()).padStart(2, '0')
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function parseSigwxTmfcToMs(tmfc) {
  if (!tmfc || !/^\d{10}$/.test(String(tmfc))) return null
  const raw = String(tmfc)
  const date = new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - 9,
    0,
    0,
    0,
  ))
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : null
}

function formatSigwxStamp(value) {
  const timeMs = value?.includes?.('T')
    ? Date.parse(value)
    : parseSigwxTmfcToMs(value)
  if (!Number.isFinite(timeMs)) return '-'
  const kst = new Date(timeMs + 9 * 60 * 60 * 1000)
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hours = String(kst.getUTCHours()).padStart(2, '0')
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes} KST`
}

function formatAdvisoryPanelLabel(item, kind) {
  const base = kind === 'sigmet' ? 'SIGMET' : 'AIRMET'
  const sequence = item?.sequence_number ? ` ${item.sequence_number}` : ''
  const phenomenon = item?.phenomenon_code || item?.phenomenon_label || ''
  return `${base}${sequence}${phenomenon ? ` ${phenomenon}` : ''}`
}

function formatAdvisoryValidLabel(item) {
  const start = Date.parse(item?.valid_from)
  const end = Date.parse(item?.valid_to)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return `${formatSigwxStamp(new Date(start).toISOString())} ~ ${formatSigwxStamp(new Date(end).toISOString())}`
}

// ???? Initial state factories ??????????????????????????????????????????????????????????????????????????????????????????????????????

function initAviationVisibility() {
  return AVIATION_WFS_LAYERS.reduce((acc, l) => { acc[l.id] = l.defaultVisible; return acc }, {})
}

function initMetVisibility() {
  return MET_LAYERS.reduce((acc, l) => { acc[l.id] = false; return acc }, {})
}

// ???? Route helpers (unchanged from original) ????????????????????????????????????????????????????????????????????

function addRoutePreviewLayers(map) {
  if (!map.getSource(ROUTE_PREVIEW_SOURCE)) {
    map.addSource(ROUTE_PREVIEW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(ROUTE_PREVIEW_LINE)) {
    map.addLayer({
      id: ROUTE_PREVIEW_LINE, type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-line'],
      paint: { 'line-color': '#f97316', 'line-width': 4, 'line-opacity': 0.9 },
    })
  }
  if (!map.getLayer(ROUTE_PREVIEW_POINT)) {
    map.addLayer({
      id: ROUTE_PREVIEW_POINT, type: 'circle', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
      filter: ['==', ['get', 'role'], 'route-preview-point'],
      paint: { 'circle-color': '#f97316', 'circle-radius': 4, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
    })
  }
}

function addBoundaryFixPreviewLayers(map) {
  if (!map.getSource(BOUNDARY_FIX_PREVIEW_SOURCE)) {
    map.addSource(BOUNDARY_FIX_PREVIEW_SOURCE, { type: 'geojson', data: emptyGeoJSON })
  }
  if (!map.getLayer(BOUNDARY_FIX_PREVIEW_POINT)) {
    map.addLayer({
      id: BOUNDARY_FIX_PREVIEW_POINT,
      type: 'circle',
      source: BOUNDARY_FIX_PREVIEW_SOURCE,
      slot: 'top',
      paint: {
        'circle-color': '#0f766e',
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }
  if (!map.getLayer(BOUNDARY_FIX_PREVIEW_LABEL)) {
    map.addLayer({
      id: BOUNDARY_FIX_PREVIEW_LABEL,
      type: 'symbol',
      source: BOUNDARY_FIX_PREVIEW_SOURCE,
      slot: 'top',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Noto Sans CJK JP Bold'],
        'text-anchor': 'top',
        'text-offset': [0, 0.9],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#0f766e',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }
}


function applyRouteHighlight(map, navpointIds) {
  const ptFilter = (ids) => ['all', ['==', ['geometry-type'], 'Point'], ['in', ['get', 'ident'], ['literal', ids]]]

  const wpCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'waypoint')
  const naCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'navaid')
  const awCfg = AVIATION_WFS_LAYERS.find((l) => l.id === 'ats-route')

  function buildIconExpr(cfg) {
    const { property, fallback, values } = cfg.iconImageByProperty
    const expr = ['match', ['get', property]]
    Object.entries(values).forEach(([v, icon]) => expr.push(v, icon.imageId))
    expr.push(values[fallback].imageId)
    return expr
  }

  function addOrUpdate(id, layerDef, filter) {
    if (!map.getLayer(id)) {
      map.addLayer({ id, ...layerDef, filter })
    } else {
      map.setFilter(id, filter)
      map.setLayoutProperty(id, 'visibility', 'visible')
    }
  }

  addOrUpdate(ROUTE_HL_WP_ICON, {
    type: 'symbol', source: wpCfg.sourceId, slot: 'top',
    layout: { 'icon-image': buildIconExpr(wpCfg), 'icon-size': wpCfg.iconSize ?? 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
  }, ptFilter(navpointIds))

  addOrUpdate(ROUTE_HL_WP_LABEL, {
    type: 'symbol', source: wpCfg.sourceId, slot: 'top',
    layout: { 'text-field': ['get', 'ident'], 'text-size': 10, 'text-font': ['Noto Sans CJK JP Bold'], 'text-anchor': 'top', 'text-offset': [0, 0.75], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': wpCfg.color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  }, ptFilter(navpointIds))

  addOrUpdate(ROUTE_HL_NA_ICON, {
    type: 'symbol', source: naCfg.sourceId, slot: 'top',
    layout: { 'icon-image': buildIconExpr(naCfg), 'icon-size': naCfg.iconSize ?? 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
  }, ptFilter(navpointIds))

  addOrUpdate(ROUTE_HL_NA_LABEL, {
    type: 'symbol', source: naCfg.sourceId, slot: 'top',
    layout: { 'text-field': ['get', 'ident'], 'text-size': 10, 'text-font': ['Noto Sans CJK JP Bold'], 'text-anchor': 'top', 'text-offset': [0, 0.75], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': naCfg.color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  }, ptFilter(navpointIds))

  const segFilter = ['==', ['get', 'role'], 'route-segment-line']

  addOrUpdate(ROUTE_HL_AW_LINE, {
    type: 'line', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
    paint: { 'line-color': awCfg.color, 'line-width': awCfg.lineWidth, 'line-opacity': awCfg.lineOpacity },
  }, segFilter)

  addOrUpdate(ROUTE_HL_AW_LABEL, {
    type: 'symbol', source: ROUTE_PREVIEW_SOURCE, slot: 'top',
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 200, 'text-field': ['get', 'routeId'], 'text-size': 10, 'text-font': ['Noto Sans CJK JP Bold'], 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'map', 'text-keep-upright': true, 'text-allow-overlap': false, 'text-ignore-placement': false },
    paint: { 'text-color': awCfg.color, 'text-halo-color': '#eef6ed', 'text-halo-width': 1.5 },
  }, segFilter)
}

function clearRouteHighlight(map) {
  ROUTE_HL_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
  })
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

// ???? Airport layers ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

function addAirportLayers(map, data) {
  if (!map.getSource(AIRPORT_SOURCE_ID)) {
    map.addSource(AIRPORT_SOURCE_ID, { type: 'geojson', data })
  }
  if (!map.getLayer(AIRPORT_CIRCLE_LAYER)) {
    map.addLayer({
      id: AIRPORT_CIRCLE_LAYER, type: 'circle', source: AIRPORT_SOURCE_ID, slot: 'top',
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 5],
        'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#f97316', '#0f766e'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.95,
      },
    })
  }
  if (!map.getLayer(AIRPORT_LABEL_LAYER)) {
    map.addLayer({
      id: AIRPORT_LABEL_LAYER, type: 'symbol', source: AIRPORT_SOURCE_ID, slot: 'top',
      layout: {
        'text-field': ['get', 'icao'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 12,
        'text-offset': [0, 0.8],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    })
  }
}

// ???? Lightning layers ????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

function addLightningLayers(map, data) {
  ensureLightningIcons(map)

  if (!map.getSource(LIGHTNING_SOURCE)) {
    map.addSource(LIGHTNING_SOURCE, { type: 'geojson', data })
  }
  if (!map.getLayer(LIGHTNING_GROUND_LAYER)) {
    map.addLayer({
      id: LIGHTNING_GROUND_LAYER, type: 'symbol', source: LIGHTNING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'type'], 'ground'],
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': 0.62,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': buildLightningOpacityExpression(false) },
    })
  }
  if (!map.getLayer(LIGHTNING_CLOUD_LAYER)) {
    map.addLayer({
      id: LIGHTNING_CLOUD_LAYER, type: 'symbol', source: LIGHTNING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'type'], 'cloud'],
      layout: {
        'icon-image': ['get', 'iconKey'],
        'icon-size': 0.48,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': buildLightningOpacityExpression(false) },
    })
  }
}

function setLightningVisibility(map, isVisible) {
  setMapLayerVisible(map, LIGHTNING_GROUND_LAYER, isVisible)
  setMapLayerVisible(map, LIGHTNING_CLOUD_LAYER, isVisible)
}

function setLightningBlinkState(map, blinkOff) {
  if (map.getLayer(LIGHTNING_GROUND_LAYER)) {
    map.setPaintProperty(LIGHTNING_GROUND_LAYER, 'icon-opacity', buildLightningOpacityExpression(blinkOff))
  }
  if (map.getLayer(LIGHTNING_CLOUD_LAYER)) {
    map.setPaintProperty(LIGHTNING_CLOUD_LAYER, 'icon-opacity', buildLightningOpacityExpression(blinkOff))
  }
}

// ???? Geo boundary layers ??????????????????????????????????????????????????????????????????????????????????????????????????????????????

function addGeoBoundaryLayers(map) {
  GEO_LAYERS.forEach(({ sourceId, layerId, url, minzoom, maxzoom }) => {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: url })
    }
    if (!map.getLayer(layerId)) {
      const layerDef = {
        id: layerId,
        type: 'line',
        source: sourceId,
        slot: 'top',
        minzoom,
        layout: { visibility: 'none' },
        paint: {
          'line-color': GEO_BOUNDARY_COLOR,
          'line-width': GEO_BOUNDARY_WIDTH,
          'line-opacity': 0.85,
        },
      }
      if (maxzoom !== undefined) layerDef.maxzoom = maxzoom
      map.addLayer(layerDef)
    }
  })
}

function setGeoBoundaryVisibility(map, show) {
  GEO_LAYERS.forEach(({ layerId }) => setMapLayerVisible(map, layerId, show))
}

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

  function getAirportElevationFt(icao) {
    const airport = airports.find((item) => item.icao === icao || item.id === icao)
    const elevationFt = Number(
      airport?.elevationFt
      ?? airport?.elevation_ft
      ?? airport?.fieldElevationFt
      ?? airport?.field_elevation_ft
    )
    if (Number.isFinite(elevationFt) && elevationFt >= 0) return Math.round(elevationFt)

    const elevationM = Number(airport?.elevationM ?? airport?.elevation_m)
    if (Number.isFinite(elevationM) && elevationM >= 0) return Math.round(elevationM * M_TO_FT)

    return null
  }

  function getVfrAirportAltitudeFt(wp) {
    const storedElevationFt = Number(wp?.airportElevationFt)
    if (Number.isFinite(storedElevationFt) && storedElevationFt >= 0) return Math.round(storedElevationFt)
    return getAirportElevationFt(wp?.id) ?? 0
  }

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

        const seen = new Set()
        const options = Object.values(metadata?.routes ?? {})
          .flatMap((route) => route?.boundaryFixes ?? [])
          .map((fix) => ({
            value: fix,
            label: formatBoundaryFixLabel(fix),
          }))
          .filter((option) => {
            if (seen.has(option.value)) return false
            seen.add(option.value)
            return true
          })
          .sort((a, b) => a.value.localeCompare(b.value))

        setFirInOptions(options.filter((option) => FIR_IN_ALLOWED_FIXES.has(option.value)))
        setFirExitOptions(options.filter((option) => FIR_OUT_ALLOWED_FIXES.has(option.value)))
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
    const entry = iapData.starToIapCandidates?.[selectedStar.id]
    if (!entry) {
      setIapCandidates([])
      setSelectedIapKey(null)
      return
    }
    const candidates = entry.candidateIapKeys.map((key) => ({
      key,
      label: `RWY ${iapData.iapRoutes[key]?.representativeFor?.runwayGroup?.join(', ') ?? key}`,
    }))
    setIapCandidates(candidates)
    setSelectedIapKey((current) => (
      candidates.some(({ key }) => key === current)
        ? current
        : entry.defaultIapKey
    ))
  }, [selectedStar, iapData])

  const selectedIap = iapData?.iapRoutes?.[selectedIapKey] ?? null
  const visibleSidOptions = useMemo(() => {
    if (!Array.isArray(availableSidIds)) {
      return sidOptions
    }

    return sidOptions.filter((proc) => availableSidIds.includes(proc.id))
  }, [availableSidIds, sidOptions])

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
      map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
      map.getSource(PROC_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
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
    addProcedurePreviewLayers(map)

    if (routeResult?.flightRule === 'IFR' && (selectedSid || selectedStar)) {
      const augmented = augmentRouteWithProcedures(routeResult.previewGeojson, selectedSid, selectedStar, selectedIap)
      map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(augmented)
      const procGeojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
      const wpOnly = { ...procGeojson, features: procGeojson.features.filter((f) => !f.properties.role.endsWith('-line')) }
      map.getSource(PROC_PREVIEW_SOURCE)?.setData(wpOnly)
    } else {
      const geojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
      map.getSource(PROC_PREVIEW_SOURCE)?.setData(geojson)
      if (geojson.features.length > 0 && !routeResult) {
        const coords = geojson.features.flatMap((f) =>
          f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates
        )
        const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
        map.fitBounds(bounds, { padding: 80, maxZoom: 9, duration: 500 })
      }
    }
  }, [selectedSid, selectedStar, selectedIap, routeResult, isStyleReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    addBoundaryFixPreviewLayers(map)

    const selectedBoundaryFix =
      (isFirInMode && routeForm.entryFix) ||
      (isFirExitMode && routeForm.exitFix) ||
      null

    const navpoint = selectedBoundaryFix ? navpointsById?.[selectedBoundaryFix] : null
    const source = map.getSource(BOUNDARY_FIX_PREVIEW_SOURCE)

    if (!source || !navpoint?.coordinates) {
      source?.setData(emptyGeoJSON)
      return
    }

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            label: selectedBoundaryFix,
          },
          geometry: {
            type: 'Point',
            coordinates: [navpoint.coordinates.lon, navpoint.coordinates.lat],
          },
        },
      ],
    })

    if (!routeResult) {
      const procGeojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
      const procCoords = procGeojson.features.flatMap((feature) =>
        feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates,
      )
      const boundaryCoord = [navpoint.coordinates.lon, navpoint.coordinates.lat]
      const coords = [...procCoords, boundaryCoord]

      if (coords.length > 0) {
        const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
        map.fitBounds(bounds, { padding: 80, maxZoom: 9, duration: 500 })
      }
    }
  }, [isFirInMode, isFirExitMode, routeForm.entryFix, routeForm.exitFix, navpointsById, isStyleReady, routeResult, selectedSid, selectedStar, selectedIap])

  const airportGeoJSON = useMemo(() => createAirportGeoJSON(airports), [airports])
  const radarFrames = useMemo(() => normalizeFrames(echoMeta?.frames?.length ? echoMeta.frames : [echoMeta?.nationwide]), [echoMeta])
  const satelliteFrames = useMemo(() => normalizeFrames(satMeta?.frames?.length ? satMeta.frames : [satMeta?.latest]), [satMeta])
  const lightningFrames = useMemo(() => {
    const frame = normalizeFrame({ tm: lightningData?.query?.tm })
    return frame ? [frame] : []
  }, [lightningData?.query?.tm])
  const weatherTimelineTicks = useMemo(() => buildTimelineTicks([
    metVisibility.radar ? radarFrames : [],
    metVisibility.satellite ? satelliteFrames : [],
    metVisibility.lightning ? lightningFrames : [],
  ]), [metVisibility.radar, metVisibility.satellite, metVisibility.lightning, radarFrames, satelliteFrames, lightningFrames])
  const effectiveWeatherTimelineIndex = weatherTimelineTicks.length > 0
    ? weatherTimelineIndex >= 0
      ? Math.min(weatherTimelineIndex, weatherTimelineTicks.length - 1)
      : weatherTimelineTicks.length - 1
    : 0
  const selectedWeatherTimeMs = weatherTimelineTicks[effectiveWeatherTimelineIndex] ?? null
  const weatherTimelineVisible = (metVisibility.radar || metVisibility.satellite || metVisibility.lightning) && weatherTimelineTicks.length > 0
  const radarFrame = useMemo(() => pickNearestPreviousFrame(radarFrames, selectedWeatherTimeMs), [radarFrames, selectedWeatherTimeMs])
  const satFrame = useMemo(() => pickNearestPreviousFrame(satelliteFrames, selectedWeatherTimeMs), [satelliteFrames, selectedWeatherTimeMs])
  const lightningGeoJSON = useMemo(
    () => createLightningGeoJSON(lightningData, lightningReferenceTimeMs),
    [lightningData, lightningReferenceTimeMs],
  )
  const adsbGeoJSON = useMemo(() => createAdsbGeoJSON(adsbData), [adsbData])
  const sigmetItems = useMemo(() => (
    (sigmetData?.items || []).map((item, index) => ({
      ...item,
      mapKey: item.id || `sigmet-${index}`,
      panelLabel: formatAdvisoryPanelLabel(item, 'sigmet'),
      validLabel: formatAdvisoryValidLabel(item),
    }))
  ), [sigmetData])
  const airmetItems = useMemo(() => (
    (airmetData?.items || []).map((item, index) => ({
      ...item,
      mapKey: item.id || `airmet-${index}`,
      panelLabel: formatAdvisoryPanelLabel(item, 'airmet'),
      validLabel: formatAdvisoryValidLabel(item),
    }))
  ), [airmetData])
  const visibleSigmetPayload = useMemo(() => ({
    ...sigmetData,
    items: sigmetItems.filter((item) => !hiddenAdvisoryKeys.sigmet.includes(item.mapKey)),
  }), [sigmetData, sigmetItems, hiddenAdvisoryKeys.sigmet])
  const visibleAirmetPayload = useMemo(() => ({
    ...airmetData,
    items: airmetItems.filter((item) => !hiddenAdvisoryKeys.airmet.includes(item.mapKey)),
  }), [airmetData, airmetItems, hiddenAdvisoryKeys.airmet])
  const sigmetFeatures = useMemo(() => advisoryItemsToFeatureCollection(visibleSigmetPayload, 'sigmet'), [visibleSigmetPayload])
  const sigmetLabels = useMemo(() => advisoryItemsToLabelFeatureCollection(visibleSigmetPayload, 'sigmet'), [visibleSigmetPayload])
  const airmetFeatures = useMemo(() => advisoryItemsToFeatureCollection(visibleAirmetPayload, 'airmet'), [visibleAirmetPayload])
  const airmetLabels = useMemo(() => advisoryItemsToLabelFeatureCollection(visibleAirmetPayload, 'airmet'), [visibleAirmetPayload])
  const sigwxHistoryEntries = useMemo(() => {
    const history = Array.isArray(sigwxLowHistoryData) ? sigwxLowHistoryData : []
    if (history.length > 0) return history
    return sigwxLowData ? [sigwxLowData] : []
  }, [sigwxLowHistoryData, sigwxLowData])
  const selectedSigwxEntry = sigwxHistoryEntries[sigwxHistoryIndex] || sigwxHistoryEntries[0] || sigwxLowData || null
  const sigwxLowMapData = useMemo(() => sigwxLowToMapboxData(selectedSigwxEntry, {
    hiddenGroupKeys: hiddenAdvisoryKeys.sigwxLow,
    filters: sigwxFilter,
  }), [selectedSigwxEntry, hiddenAdvisoryKeys.sigwxLow, sigwxFilter])
  const sigwxGroups = sigwxLowMapData.groups || []
  const visibleSigwxGroups = useMemo(
    () => sigwxGroups.filter((group) => !group.hidden && group.enabledByFilter),
    [sigwxGroups],
  )
  const showVisibleSigwxFrontOverlay = useMemo(
    () => visibleSigwxGroups.some((group) => group.overlayRole === 'front'),
    [visibleSigwxGroups],
  )
  const showVisibleSigwxCloudOverlay = useMemo(
    () => visibleSigwxGroups.some((group) => group.overlayRole === 'cloud'),
    [visibleSigwxGroups],
  )
  const advisoryBadgeItems = useMemo(() => ([
    metVisibility.sigwx ? { key: 'sigwxLow', label: 'SIGWX_LOW', count: sigwxGroups.length, tone: 'sigwx' } : null,
    metVisibility.sigmet ? { key: 'sigmet', label: 'SIGMET', count: sigmetItems.length, tone: 'sigmet' } : null,
    metVisibility.airmet ? { key: 'airmet', label: 'AIRMET', count: airmetItems.length, tone: 'airmet' } : null,
  ].filter(Boolean)), [metVisibility.sigwx, metVisibility.sigmet, metVisibility.airmet, sigwxGroups.length, sigmetItems.length, airmetItems.length])
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

      const [frontResponse, cloudResponse] = await Promise.all([
        fetch(`/api/sigwx-front-meta?tmfc=${selectedTmfc}`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
        fetch(`/api/sigwx-cloud-meta?tmfc=${selectedTmfc}`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
      ])

      if (cancelled) return
      setSelectedSigwxFrontMeta(frontResponse)
      setSelectedSigwxCloudMeta(cloudResponse)
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

  const sigmetCount = sigmetFeatures.features.length
  const airmetCount = airmetFeatures.features.length
  const sigwxCount = sigwxGroups.length
  const lightningCount = lightningGeoJSON.features.length
  const radarLegendVisible = metVisibility.radar && !!radarFrame
  const lightningLegendVisible = metVisibility.lightning
  const radarReferenceTimeMs = useMemo(
    () => parseFrameTmToMs(radarFrame?.tm) ?? Date.now(),
    [radarFrame?.tm],
  )
  const lightningLegendEntries = useMemo(() => (
    LIGHTNING_AGE_BANDS.map((band) => ({
      ...band,
      label: formatReferenceTimeLabel(lightningReferenceTimeMs - band.max * 60 * 1000),
    }))
  ), [lightningReferenceTimeMs])

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
      addRoutePreviewLayers(map)
      addBoundaryFixPreviewLayers(map)
      addVfrWaypointLayers(map)
      addProcedurePreviewLayers(map)
      bindSectorHover(map)
      if (!vfrInteractionsBound) {
        vfrInteractionsBound = true
        bindVfrInteractions(map, vfrWaypointsRef, setVfrWaypoints)
      }

      // Satellite overlay
      const hasSat = addOrUpdateImageOverlay(map, { sourceId: SATELLITE_SOURCE, layerId: SATELLITE_LAYER, frame: satFrame, opacity: 0.92 })
      setMapLayerVisible(map, SATELLITE_LAYER, hasSat && metVisibility.satellite)

      // Radar overlay
      const hasRadar = addOrUpdateImageOverlay(map, { sourceId: RADAR_SOURCE, layerId: RADAR_LAYER, frame: radarFrame, opacity: 0.88 })
      setMapLayerVisible(map, RADAR_LAYER, hasRadar && metVisibility.radar)

      // SIGWX overlay
      const hasSigwx = addOrUpdateImageOverlay(map, { sourceId: SIGWX_SOURCE, layerId: SIGWX_LAYER, frame: selectedSigwxFrontMeta, opacity: 0.85 })
      const hasSigwxCloud = addOrUpdateImageOverlay(map, { sourceId: SIGWX_CLOUD_SOURCE, layerId: SIGWX_CLOUD_LAYER, frame: selectedSigwxCloudMeta, opacity: 0.65 })
      addOrUpdateSigwxLowLayers(map, sigwxLowMapData)
      setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && metVisibility.sigwx && showVisibleSigwxFrontOverlay)
      setMapLayerVisible(map, SIGWX_CLOUD_LAYER, hasSigwxCloud && metVisibility.sigwx && showVisibleSigwxCloudOverlay)
      setSigwxLowVisibility(map, metVisibility.sigwx)

      // SIGMET / AIRMET advisories
      addAdvisoryLayers(map, 'sigmet', sigmetFeatures, sigmetLabels)
      addAdvisoryLayers(map, 'airmet', airmetFeatures, airmetLabels)
      setAdvisoryVisibility(map, 'sigmet', metVisibility.sigmet)
      setAdvisoryVisibility(map, 'airmet', metVisibility.airmet)

      // Lightning
      addLightningLayers(map, lightningGeoJSON)
      setLightningVisibility(map, metVisibility.lightning)

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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    if (routeResult?.flightRule === 'IFR') {
      applyRouteHighlight(map, routeResult.navpointIds)
    } else {
      clearRouteHighlight(map)
    }
  }, [routeResult, isStyleReady])

  // ???? VFR waypoint sync ????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || vfrWaypoints.length < 2) return
    addVfrWaypointLayers(map)
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(vfrWaypoints))
  }, [vfrWaypoints, isStyleReady])

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

    const hasSat = addOrUpdateImageOverlay(map, { sourceId: SATELLITE_SOURCE, layerId: SATELLITE_LAYER, frame: satFrame, opacity: 0.92 })
    const hasRadar = addOrUpdateImageOverlay(map, { sourceId: RADAR_SOURCE, layerId: RADAR_LAYER, frame: radarFrame, opacity: 0.88 })
    const hasSigwx = addOrUpdateImageOverlay(map, { sourceId: SIGWX_SOURCE, layerId: SIGWX_LAYER, frame: selectedSigwxFrontMeta, opacity: 0.85 })
    const hasSigwxCloud = addOrUpdateImageOverlay(map, { sourceId: SIGWX_CLOUD_SOURCE, layerId: SIGWX_CLOUD_LAYER, frame: selectedSigwxCloudMeta, opacity: 0.65 })
    addOrUpdateSigwxLowLayers(map, sigwxLowMapData)

    setMapLayerVisible(map, SATELLITE_LAYER, hasSat && metVisibility.satellite)
    setMapLayerVisible(map, RADAR_LAYER, hasRadar && metVisibility.radar)
    setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && metVisibility.sigwx && showVisibleSigwxFrontOverlay)
    setMapLayerVisible(map, SIGWX_CLOUD_LAYER, hasSigwxCloud && metVisibility.sigwx && showVisibleSigwxCloudOverlay)
    setSigwxLowVisibility(map, metVisibility.sigwx)
  }, [satFrame, radarFrame, selectedSigwxFrontMeta, selectedSigwxCloudMeta, sigwxLowMapData, metVisibility, isStyleReady, showVisibleSigwxFrontOverlay, showVisibleSigwxCloudOverlay])

  // ???? Sync SIGMET / AIRMET ????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    updateAdvisoryLayerData(map, 'sigmet', sigmetFeatures, sigmetLabels)
    updateAdvisoryLayerData(map, 'airmet', airmetFeatures, airmetLabels)
    setAdvisoryVisibility(map, 'sigmet', metVisibility.sigmet)
    setAdvisoryVisibility(map, 'airmet', metVisibility.airmet)
  }, [sigmetFeatures, sigmetLabels, airmetFeatures, airmetLabels, metVisibility.sigmet, metVisibility.airmet, isStyleReady])

  // ???? Sync lightning ????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    addLightningLayers(map, lightningGeoJSON)
    map.getSource(LIGHTNING_SOURCE)?.setData(lightningGeoJSON)
    setLightningVisibility(map, metVisibility.lightning)
    setLightningBlinkState(map, metVisibility.lightning && blinkLightning && lightningBlinkOff)
  }, [lightningGeoJSON, metVisibility.lightning, blinkLightning, lightningBlinkOff, isStyleReady])

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
      map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(next.length >= 2 ? buildVfrGeoJSON(next) : emptyGeoJSON)
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
        const pts = result.previewGeojson.features.filter((f) => f.properties.role === 'route-preview-point')
        const departureElevationFt = getAirportElevationFt(result.departureAirport)
        const arrivalElevationFt = getAirportElevationFt(result.arrivalAirport)
        const initialWaypoints = [
          { id: result.departureAirport, lon: pts[0].geometry.coordinates[0], lat: pts[0].geometry.coordinates[1], fixed: true, airportElevationFt: departureElevationFt, altitudeFt: departureElevationFt ?? 0 },
          { id: result.arrivalAirport, lon: pts[1].geometry.coordinates[0], lat: pts[1].geometry.coordinates[1], fixed: true, airportElevationFt: arrivalElevationFt, altitudeFt: arrivalElevationFt ?? 0 },
        ]
        setVfrWaypoints(initialWaypoints)
        if (map?.isStyleLoaded()) {
          addRoutePreviewLayers(map)
          addVfrWaypointLayers(map)
          map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(initialWaypoints))
          const coords = initialWaypoints.map((wp) => [wp.lon, wp.lat])
          const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
          map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 500 })
        }
      } else {
        setVfrWaypoints([])
        if (map?.isStyleLoaded()) {
          addRoutePreviewLayers(map)
          const displayGeojson = augmentRouteWithProcedures(result.previewGeojson, selectedSid, selectedStar, selectedIap)
          map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(displayGeojson)
          if (selectedSid || selectedStar) {
            addProcedurePreviewLayers(map)
            const procGeojson = buildProcedureGeoJSON(selectedSid, selectedStar, selectedIap)
            const wpOnly = { ...procGeojson, features: procGeojson.features.filter((f) => !f.properties.role.endsWith('-line')) }
            map.getSource(PROC_PREVIEW_SOURCE)?.setData(wpOnly)
          }
          const coords = displayGeojson.features.flatMap((f) =>
            f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates
          )
          if (coords.length > 0) {
            const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
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
      const airportElevationFt = getVfrAirportAltitudeFt(wp)
      return { ...wp, airportElevationFt, altitudeFt: airportElevationFt }
    }))
  }

  function getCurrentRouteLineString() {
    if (!routeResult) return null

    if (routeResult.flightRule === 'VFR') {
      if (vfrWaypoints.length < 2) return null
      return {
        type: 'LineString',
        coordinates: vfrWaypoints.map((wp) => [wp.lon, wp.lat]),
      }
    }

    const displayGeojson = augmentRouteWithProcedures(routeResult.previewGeojson, selectedSid, selectedStar, selectedIap)
    const lineFeature = displayGeojson.features.find((feature) => feature.properties.role === 'route-preview-line')
    return lineFeature?.geometry ?? null
  }

  function buildProcedurePayload(procedure, type) {
    if (!procedure) return null
    return {
      id: procedure.id ?? procedure.name ?? null,
      type,
      fixes: (procedure.fixes ?? []).map((fix) => ({
        id: fix.id,
        lon: fix.lon ?? fix.coordinates?.lon ?? null,
        lat: fix.lat ?? fix.coordinates?.lat ?? null,
        legDistanceNm: fix.legDistanceNm ?? null,
        altitude: fix.altitude ?? null,
      })),
    }
  }

  function buildProcedureContextPayload() {
    if (routeResult?.flightRule !== 'IFR') return null
    return {
      entryFix: routeResult.entryFix ?? null,
      exitFix: routeResult.exitFix ?? null,
      procedures: [
        buildProcedurePayload(selectedSid, 'SID'),
        buildProcedurePayload(selectedStar, 'STAR'),
        buildProcedurePayload(selectedIap, 'IAP'),
      ].filter(Boolean),
    }
  }

  function buildRouteProfileMarkersPayload() {
    if (!routeResult) return []

    if (routeResult.flightRule === 'VFR') {
      return vfrWaypoints.map((wp) => ({
        label: wp.id,
        lon: wp.lon,
        lat: wp.lat,
        kind: wp.fixed ? 'AIRPORT' : 'WAYPOINT',
      }))
    }

    const baseLine = routeResult.previewGeojson?.features?.find((feature) => feature.properties.role === 'route-preview-line')
    const baseCoordinates = baseLine?.geometry?.coordinates ?? []
    const routeIds = new Set(routeResult.routeIds ?? [])
    const labels = (routeResult.displaySequence ?? []).filter((item) => !routeIds.has(item))

    return labels
      .map((label, index) => {
        const coordinate = baseCoordinates[index]
        if (!coordinate) return null
        return {
          label,
          lon: coordinate[0],
          lat: coordinate[1],
          kind: index === 0 || index === labels.length - 1 ? 'AIRPORT' : 'FIX',
        }
      })
      .filter(Boolean)
  }

  async function handleVerticalProfileRequest() {
    const routeGeometry = getCurrentRouteLineString()
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
      const profile = await fetchVerticalProfile({
        flightRule: routeResult?.flightRule,
        routeGeometry,
        plannedCruiseAltitudeFt,
        procedureContext: buildProcedureContextPayload(),
        vfrWaypoints: routeResult?.flightRule === 'VFR' ? vfrWaypoints : undefined,
        routeMarkers: buildRouteProfileMarkersPayload(),
        sampleSpacingMeters: 250,
      })
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

  const sigwxIssueLabel = formatSigwxStamp(selectedSigwxEntry?.fetched_at)
  const sigwxValidLabel = formatSigwxStamp(selectedSigwxEntry?.tmfc)
  function buildIfrSequenceTokens(result) {
    const seq = result?.displaySequence ?? []
    const airwayIds = new Set(result?.routeIds ?? [])
    const middleSeq = seq.slice(1, -1)
    const tokens = []

    const departureLabel = seq[0] ?? result?.departureAirport
    if (departureLabel) {
      tokens.push({ kind: 'airport', text: departureLabel })
    }

    if (selectedSid?.name) {
      tokens.push({ kind: 'sid', text: `SID(${selectedSid.name})` })
    }

    middleSeq.forEach((item) => {
      tokens.push({
        kind: airwayIds.has(item) ? 'airway' : 'waypoint',
        text: item,
      })
    })

    if (selectedStar?.name) {
      tokens.push({ kind: 'star', text: `STAR(${selectedStar.name})` })
    }

    if (selectedIap) {
      const iapName = selectedIap.sourceProcedure || selectedIap.fullName || selectedIap.name
      if (iapName) {
        tokens.push({ kind: 'iap', text: `IAP(${iapName})` })
      }
    }

    const arrivalLabel = result?.arrivalAirport || seq[seq.length - 1]
    if (arrivalLabel) {
      tokens.push({ kind: 'airport', text: arrivalLabel })
    }

    return tokens
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
                const displayTokens = buildIfrSequenceTokens(routeResult)

                // Calculate total distance
                const airwayDist = Number(routeResult.distanceNm || 0)
                const sidDist = Number(selectedSid?.fixes?.reduce((acc, f) => acc + (f.legDistanceNm || 0), 0) || 0)
                const starDist = Number(selectedStar?.fixes?.reduce((acc, f) => acc + (f.legDistanceNm || 0), 0) || 0)
                const iapDist = Number(selectedIap?.fixes?.reduce((acc, f) => acc + (f.legDistanceNm || 0), 0) || 0)
                const totalDist = Number((airwayDist + sidDist + starDist + iapDist).toFixed(1))
                const distanceBreakdown = [
                  { kind: 'sid', label: 'SID', value: sidDist },
                  { kind: 'enr', label: 'ENR', value: airwayDist },
                  { kind: 'star', label: 'STAR', value: starDist },
                  { kind: 'iap', label: 'IAP', value: iapDist },
                ].filter((item) => item.value > 0)

                return (
                  <>
                    <div className="route-check-total-dist">
                      {'\ucd1d \uac70\ub9ac'}: <strong>{totalDist} NM</strong>
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
                        ? getVfrAirportAltitudeFt(wp)
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


