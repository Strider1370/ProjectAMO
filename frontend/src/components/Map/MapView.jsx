import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAP_CONFIG, BASEMAP_OPTIONS } from '../../config/mapConfig.js'
import { addAviationWfsLayers } from '../../layers/aviation/addAviationWfsLayers.js'
import { AVIATION_WFS_LAYERS } from '../../layers/aviation/aviationWfsLayers.js'
import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  advisoryItemsToFeatureCollection,
  advisoryItemsToLabelFeatureCollection,
  setAdvisoryVisibility,
  updateAdvisoryLayerData,
} from '../../layers/advisories/advisoryLayers.js'
import { buildBriefingRoute, buildVfrRoute, canBuildBriefingRoutePath, loadIapData, loadNavpoints, loadRouteDirectionMetadata } from '../../services/navdata/routePlanner.js'
import { getProcedures, KNOWN_AIRPORTS } from '../../services/navdata/procedureData.js'
import { fetchAdsbData } from '../../api/adsbApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, setAdsbVisibility, ADSB_SOURCE_ID } from '../../layers/aviation/addAdsbLayer.js'
import { sigwxLowToMapboxData } from '../../utils/sigwx.js'
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
const SIGWX_LINE_SOURCE = 'kma-sigwx-low-lines'
const SIGWX_LINE_LAYER = 'kma-sigwx-low-lines'
const SIGWX_LABEL_SOURCE = 'kma-sigwx-low-labels'
const SIGWX_LABEL_LAYER = 'kma-sigwx-low-labels'
const SIGWX_ICON_SOURCE = 'kma-sigwx-low-icons'
const SIGWX_ICON_LAYER = 'kma-sigwx-low-icons'
const SIGWX_VECTOR_LAYERS = [SIGWX_POLYGON_LAYER, SIGWX_LINE_LAYER, SIGWX_LABEL_LAYER, SIGWX_ICON_LAYER]
const LIGHTNING_SOURCE = 'kma-lightning'
const LIGHTNING_GROUND_LAYER = 'kma-lightning-ground'
const LIGHTNING_CLOUD_LAYER = 'kma-lightning-cloud'

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

function buildImageCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return null
  const [[south, west], [north, east]] = bounds
  if (![south, west, north, east].every(Number.isFinite)) return null
  return [[west, north], [east, north], [east, south], [west, south]]
}

function addOrUpdateImageOverlay(map, { sourceId, layerId, frame, opacity }) {
  const coordinates = buildImageCoordinates(frame?.bounds)
  if (!frame?.path || !coordinates) return false

  const image = { url: frame.path, coordinates }
  const source = map.getSource(sourceId)

  if (source?.updateImage) {
    source.updateImage(image)
  } else if (!source) {
    map.addSource(sourceId, { type: 'image', ...image })
  }

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      slot: 'middle',
      paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
    })
  }

  return true
}

function ensureMapImage(map, { id, url }) {
  if (!id || !url || map.hasImage(id)) return
  map.loadImage(url, (error, image) => {
    if (error || !image || map.hasImage(id)) return
    map.addImage(id, image)
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

function addOrUpdateSigwxLowLayers(map, data) {
  const empty = emptyGeoJSON
  addOrUpdateGeoJsonSource(map, SIGWX_POLYGON_SOURCE, data?.polygons || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_LINE_SOURCE, data?.lines || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_LABEL_SOURCE, data?.labels || empty)
  addOrUpdateGeoJsonSource(map, SIGWX_ICON_SOURCE, data?.icons || empty)

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
        'icon-size': 0.55,
        'icon-allow-overlap': true,
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

function createLightningGeoJSON(lightningData) {
  const strikes = lightningData?.strikes || []
  return {
    type: 'FeatureCollection',
    features: strikes
      .filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat))
      .map((s, i) => ({
        type: 'Feature',
        id: i,
        properties: { type: s.type || 'cloud' },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      })),
  }
}

function getRadarFrame(echoMeta) {
  return echoMeta?.nationwide || echoMeta?.frames?.[echoMeta.frames.length - 1] || null
}

function getSatFrame(satMeta) {
  return satMeta?.latest || satMeta?.frames?.[satMeta.frames.length - 1] || null
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
  if (!map.getSource(LIGHTNING_SOURCE)) {
    map.addSource(LIGHTNING_SOURCE, { type: 'geojson', data })
  }
  if (!map.getLayer(LIGHTNING_GROUND_LAYER)) {
    map.addLayer({
      id: LIGHTNING_GROUND_LAYER, type: 'circle', source: LIGHTNING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'type'], 'ground'],
      paint: { 'circle-radius': 4, 'circle-color': '#facc15', 'circle-opacity': 0.85, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 },
    })
  }
  if (!map.getLayer(LIGHTNING_CLOUD_LAYER)) {
    map.addLayer({
      id: LIGHTNING_CLOUD_LAYER, type: 'circle', source: LIGHTNING_SOURCE, slot: 'top',
      filter: ['==', ['get', 'type'], 'cloud'],
      paint: { 'circle-radius': 3, 'circle-color': '#a78bfa', 'circle-opacity': 0.7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 },
    })
  }
}

function setLightningVisibility(map, isVisible) {
  setMapLayerVisible(map, LIGHTNING_GROUND_LAYER, isVisible)
  setMapLayerVisible(map, LIGHTNING_CLOUD_LAYER, isVisible)
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
  const [routeForm, setRouteForm] = useState(initialRouteForm)
  const [routeResult, setRouteResult] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
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
    setVfrWaypoints([])
    const map = mapRef.current
    if (map?.isStyleLoaded()) {
      map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
      map.getSource(PROC_PREVIEW_SOURCE)?.setData(emptyGeoJSON)
    }
  }

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
  const lightningGeoJSON = useMemo(() => createLightningGeoJSON(lightningData), [lightningData])
  const adsbGeoJSON = useMemo(() => createAdsbGeoJSON(adsbData), [adsbData])
  const radarFrame = useMemo(() => getRadarFrame(echoMeta), [echoMeta])
  const satFrame = useMemo(() => getSatFrame(satMeta), [satMeta])
  const sigmetFeatures = useMemo(() => advisoryItemsToFeatureCollection(sigmetData, 'sigmet'), [sigmetData])
  const sigmetLabels = useMemo(() => advisoryItemsToLabelFeatureCollection(sigmetData, 'sigmet'), [sigmetData])
  const airmetFeatures = useMemo(() => advisoryItemsToFeatureCollection(airmetData, 'airmet'), [airmetData])
  const airmetLabels = useMemo(() => advisoryItemsToLabelFeatureCollection(airmetData, 'airmet'), [airmetData])
  const sigwxLowMapData = useMemo(() => sigwxLowToMapboxData(sigwxLowData), [sigwxLowData])

  const sigmetCount = sigmetFeatures.features.length
  const airmetCount = airmetFeatures.features.length
  const sigwxCount = sigwxLowMapData.labels.features.length
  const lightningCount = lightningGeoJSON.features.length

  function toggleAviation(id) {
    setAviationVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleMet(id) {
    setMetVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ???? ADS-B Polling ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????

  useEffect(() => {
    let timeoutId

    async function poll() {
      const data = await fetchAdsbData()
      if (data) setAdsbData(data)
      timeoutId = setTimeout(poll, 5000)
    }

    poll()
    return () => clearTimeout(timeoutId)
  }, [])

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
      const hasSigwx = addOrUpdateImageOverlay(map, { sourceId: SIGWX_SOURCE, layerId: SIGWX_LAYER, frame: sigwxFrontMeta, opacity: 0.85 })
      const hasSigwxCloud = addOrUpdateImageOverlay(map, { sourceId: SIGWX_CLOUD_SOURCE, layerId: SIGWX_CLOUD_LAYER, frame: sigwxCloudMeta, opacity: 0.65 })
      addOrUpdateSigwxLowLayers(map, sigwxLowMapData)
      setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && metVisibility.sigwx)
      setMapLayerVisible(map, SIGWX_CLOUD_LAYER, hasSigwxCloud && metVisibility.sigwx)
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
    const hasSigwx = addOrUpdateImageOverlay(map, { sourceId: SIGWX_SOURCE, layerId: SIGWX_LAYER, frame: sigwxFrontMeta, opacity: 0.85 })
    const hasSigwxCloud = addOrUpdateImageOverlay(map, { sourceId: SIGWX_CLOUD_SOURCE, layerId: SIGWX_CLOUD_LAYER, frame: sigwxCloudMeta, opacity: 0.65 })
    addOrUpdateSigwxLowLayers(map, sigwxLowMapData)

    setMapLayerVisible(map, SATELLITE_LAYER, hasSat && metVisibility.satellite)
    setMapLayerVisible(map, RADAR_LAYER, hasRadar && metVisibility.radar)
    setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && metVisibility.sigwx)
    setMapLayerVisible(map, SIGWX_CLOUD_LAYER, hasSigwxCloud && metVisibility.sigwx)
    setSigwxLowVisibility(map, metVisibility.sigwx)
  }, [satFrame, radarFrame, sigwxFrontMeta, sigwxCloudMeta, sigwxLowMapData, metVisibility, isStyleReady])

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
  }, [lightningGeoJSON, metVisibility.lightning, isStyleReady])

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
    try {
      const result = routeForm.flightRule === 'VFR'
        ? await buildVfrRoute(routeForm)
        : await buildBriefingRoute(routeForm)
      setRouteResult(result)
      const map = mapRef.current
      if (result.flightRule === 'VFR') {
        const pts = result.previewGeojson.features.filter((f) => f.properties.role === 'route-preview-point')
        const initialWaypoints = [
          { id: result.departureAirport, lon: pts[0].geometry.coordinates[0], lat: pts[0].geometry.coordinates[1], fixed: true },
          { id: result.arrivalAirport, lon: pts[1].geometry.coordinates[0], lat: pts[1].geometry.coordinates[1], fixed: true },
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
    if (id === 'radar') return !radarFrame
    if (id === 'satellite') return !satFrame
    if (id === 'lightning') return lightningCount === 0
    if (id === 'sigmet') return sigmetCount === 0
    if (id === 'airmet') return airmetCount === 0
    if (id === 'sigwx') return !sigwxFrontMeta && !sigwxCloudMeta && sigwxCount === 0
    return false
  }

  function metLayerBadge(id) {
    if (id === 'sigmet') return sigmetCount > 0 ? sigmetCount : null
    if (id === 'airmet') return airmetCount > 0 ? airmetCount : null
    if (id === 'lightning') return lightningCount > 0 ? lightningCount : null
    if (id === 'sigwx') return sigwxCount > 0 ? sigwxCount : null
    return null
  }

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

      {/* Basemap switcher */}
      <div className="basemap-switcher">
        {(() => {
          const current = BASEMAP_OPTIONS.find((o) => o.id === basemapId)
          return (
            <button
              className="basemap-switcher-toggle"
              onClick={() => setBasemapMenuOpen((o) => !o)}
              title="Change base map"
            >
              <img
                className="basemap-switcher-thumb"
                src={current?.thumbnail}
                alt={current?.label}
              />
            </button>
          )
        })()}
        {basemapMenuOpen && (
          <ul className="basemap-switcher-menu">
            {BASEMAP_OPTIONS.map((option) => (
              <li key={option.id}>
                <button
                  className={`basemap-switcher-item${option.id === basemapId ? ' is-active' : ''}`}
                  onClick={() => switchBasemap(option.id)}
                >
                  <img
                    className="basemap-switcher-thumb"
                    src={option.thumbnail}
                    alt={option.label}
                  />
                  <span>{option.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Route check panel */}
      {activePanel === 'route-check' && (
        <section className="route-check-panel" aria-label={'\uacbd\ub85c \ud655\uc778 \ud328\ub110'}>
          <div className="route-check-title">{'\uacbd\ub85c \ud655\uc778'}</div>
          <form className="route-check-form" onSubmit={handleRouteSearch}>
            {/* Row 1: Flight rule + Route Type (IFR only) */}
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
            {/* Row 2 */}
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
            {routeForm.flightRule === 'IFR'
              ? (
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
              )
              : (
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
              )
            }
            {/* Row 3: IFR only / FIR EXIT */}
            {routeForm.flightRule === 'IFR' && (
              <>
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
              </>
            )}

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
                  <div className="route-check-sequence">{vfrWaypoints.map((wp) => wp.id).join(' -> ')}</div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Aviation layers panel */}
      {activePanel === 'aviation' && (
        <div className="dev-layer-panel" aria-label="Aviation layer toggles">
          <div className="dev-layer-panel-title">Aviation</div>
          {AVIATION_WFS_LAYERS.map((layer) => (
            <label key={layer.id} className="dev-layer-toggle">
              <input
                type="checkbox"
                checked={aviationVisibility[layer.id]}
                onChange={() => toggleAviation(layer.id)}
              />
              <span className="dev-layer-swatch" style={{ background: layer.color }} />
              <span>{layer.nameEn}</span>
            </label>
          ))}
        </div>
      )}

      {/* MET layers panel */}
      {activePanel === 'met' && (
        <div className="dev-layer-panel" aria-label="MET layer toggles">
          <div className="dev-layer-panel-title">MET</div>
          {MET_LAYERS.map((layer) => {
            const disabled = isMetLayerDisabled(layer.id)
            const badge = metLayerBadge(layer.id)
            return (
              <label key={layer.id} className={`dev-layer-toggle${disabled ? ' is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={metVisibility[layer.id]}
                  disabled={disabled}
                  onChange={() => toggleMet(layer.id)}
                />
                <span className="dev-layer-swatch" style={{ background: layer.color }} />
                <span>{layer.label}</span>
                {badge != null && <span className="dev-layer-count">{badge}</span>}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MapView


