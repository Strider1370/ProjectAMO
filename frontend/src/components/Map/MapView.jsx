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
import { buildBriefingRoute, buildVfrRoute } from '../../services/navdata/routePlanner.js'
import { fetchAdsbData } from '../../api/adsbApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, setAdsbVisibility, ADSB_SOURCE_ID } from '../../layers/aviation/addAdsbLayer.js'
import './MapView.css'

// ── Constants ────────────────────────────────────────────────────────────────

const ROAD_VISIBILITY_ZOOM  = 8
const ROUTE_PREVIEW_SOURCE  = 'briefing-route-preview'
const ROUTE_PREVIEW_LINE    = 'briefing-route-preview-line'
const ROUTE_PREVIEW_POINT   = 'briefing-route-preview-point'

const ROUTE_HL_WP_ICON  = 'route-hl-wp-icon'
const ROUTE_HL_WP_LABEL = 'route-hl-wp-label'
const ROUTE_HL_NA_ICON  = 'route-hl-na-icon'
const ROUTE_HL_NA_LABEL = 'route-hl-na-label'
const ROUTE_HL_AW_LINE  = 'route-hl-aw-line'
const ROUTE_HL_AW_LABEL = 'route-hl-aw-label'
const ROUTE_HL_LAYER_IDS = [ROUTE_HL_WP_ICON, ROUTE_HL_WP_LABEL, ROUTE_HL_NA_ICON, ROUTE_HL_NA_LABEL, ROUTE_HL_AW_LINE, ROUTE_HL_AW_LABEL]

const VFR_WP_CIRCLE = 'vfr-wp-circle'
const VFR_WP_LABEL  = 'vfr-wp-label'

const AIRPORT_SOURCE_ID     = 'kma-weather-airports'
const AIRPORT_CIRCLE_LAYER  = 'kma-weather-airports-circle'
const AIRPORT_LABEL_LAYER   = 'kma-weather-airports-label'

const SATELLITE_SOURCE      = 'kma-satellite-overlay'
const SATELLITE_LAYER       = 'kma-satellite-overlay'
const RADAR_SOURCE          = 'kma-radar-overlay'
const RADAR_LAYER           = 'kma-radar-overlay'
const SIGWX_SOURCE          = 'kma-sigwx-overlay'
const SIGWX_LAYER           = 'kma-sigwx-overlay'
const LIGHTNING_SOURCE      = 'kma-lightning'
const LIGHTNING_GROUND_LAYER = 'kma-lightning-ground'
const LIGHTNING_CLOUD_LAYER  = 'kma-lightning-cloud'

const GEO_BOUNDARY_COLOR     = '#facc15'
const GEO_BOUNDARY_WIDTH     = 1
const GEO_SIGUNGU_MIN_ZOOM   = 9
const GEO_LAYERS = [
  { sourceId: 'geo-neighbors', layerId: 'geo-neighbors-line', url: '/Geo/korea_neighbors_masked.v1.geojson', minzoom: 0 },
  { sourceId: 'geo-sido',      layerId: 'geo-sido-line',      url: '/Geo/sido.json',                         minzoom: 0,                    maxzoom: GEO_SIGUNGU_MIN_ZOOM },
  { sourceId: 'geo-sigungu',   layerId: 'geo-sigungu-line',   url: '/Geo/sigungu.json',                      minzoom: GEO_SIGUNGU_MIN_ZOOM },
]

const HIDDEN_ROAD_COLOR = 'rgba(255,255,255,0)'
const VISIBLE_ROAD_COLORS = { roads: '#d6dde6', trunks: '#c6d1dd', motorways: '#b9c7d4' }

// MET layer definitions (order = display order in panel)
const MET_LAYERS = [
  { id: 'radar',     label: 'Radar',     color: '#38bdf8' },
  { id: 'satellite', label: 'Satellite', color: '#64748b' },
  { id: 'lightning', label: 'Lightning', color: '#facc15' },
  { id: 'sigmet',    label: 'SIGMET',    color: ADVISORY_LAYER_DEFS.sigmet.color },
  { id: 'airmet',    label: 'AIRMET',    color: ADVISORY_LAYER_DEFS.airmet.color },
  { id: 'sigwx',     label: 'SIGWX',     color: '#a78bfa' },
  { id: 'adsb',      label: 'ADS-B',     color: '#10b981' },
]

const emptyGeoJSON = { type: 'FeatureCollection', features: [] }

// ── VFR waypoint helpers ─────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyRoadVisibility(map, show) {
  map.setConfigProperty('basemap', 'colorRoads',     show ? VISIBLE_ROAD_COLORS.roads     : HIDDEN_ROAD_COLOR)
  map.setConfigProperty('basemap', 'colorTrunks',    show ? VISIBLE_ROAD_COLORS.trunks    : HIDDEN_ROAD_COLOR)
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

// ── Initial state factories ───────────────────────────────────────────────────

function initAviationVisibility() {
  return AVIATION_WFS_LAYERS.reduce((acc, l) => { acc[l.id] = l.defaultVisible; return acc }, {})
}

function initMetVisibility() {
  return MET_LAYERS.reduce((acc, l) => { acc[l.id] = false; return acc }, {})
}

// ── Route helpers (unchanged from original) ──────────────────────────────────

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

// ── Airport layers ────────────────────────────────────────────────────────────

function addAirportLayers(map, data) {
  if (!map.getSource(AIRPORT_SOURCE_ID)) {
    map.addSource(AIRPORT_SOURCE_ID, { type: 'geojson', data })
  }
  if (!map.getLayer(AIRPORT_CIRCLE_LAYER)) {
    map.addLayer({
      id: AIRPORT_CIRCLE_LAYER, type: 'circle', source: AIRPORT_SOURCE_ID, slot: 'top',
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 5],
        'circle-color':  ['case', ['boolean', ['feature-state', 'selected'], false], '#f97316', '#0f766e'],
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

// ── Lightning layers ──────────────────────────────────────────────────────────

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

// ── Geo boundary layers ───────────────────────────────────────────────────────

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

// ── Route state ───────────────────────────────────────────────────────────────

const initialRouteForm = {
  flightRule: 'IFR',
  departureAirport: 'RKSS', entryFix: 'GOGET',
  exitFix: 'REMOS', arrivalAirport: 'RKPC', routeType: 'ALL',
}

// ── Component ─────────────────────────────────────────────────────────────────

function MapView({
  activePanel,
  airports = [],
  echoMeta = null,
  satMeta = null,
  sigmetData = null,
  airmetData = null,
  lightningData = null,
  sigwxFrontMeta = null,
  selectedAirport,
  onAirportSelect,
}) {
  const mapContainerRef  = useRef(null)
  const mapRef           = useRef(null)
  const onSelectRef      = useRef(onAirportSelect)
  const [error,               setError]             = useState(null)
  const [isStyleReady,        setIsStyleReady]       = useState(false)
  const [aviationVisibility,  setAviationVisibility] = useState(initAviationVisibility)
  const [metVisibility,       setMetVisibility]      = useState(initMetVisibility)
  const [routeForm,           setRouteForm]          = useState(initialRouteForm)
  const [routeResult,         setRouteResult]        = useState(null)
  const [routeError,          setRouteError]         = useState(null)
  const [routeLoading,        setRouteLoading]       = useState(false)
  const [adsbData,            setAdsbData]           = useState(null)
  const [basemapId,           setBasemapId]          = useState('standard')
  const [basemapMenuOpen,     setBasemapMenuOpen]    = useState(false)
  const [vfrWaypoints,        setVfrWaypoints]       = useState([])
  const [hoveredWpInfo,       setHoveredWpInfo]      = useState(null)
  const vfrWaypointsRef = useRef([])
  const hideTimerRef    = useRef(null)

  useEffect(() => { onSelectRef.current = onAirportSelect }, [onAirportSelect])
  useEffect(() => { vfrWaypointsRef.current = vfrWaypoints }, [vfrWaypoints])

  const airportGeoJSON   = useMemo(() => createAirportGeoJSON(airports),         [airports])
  const lightningGeoJSON = useMemo(() => createLightningGeoJSON(lightningData),   [lightningData])
  const adsbGeoJSON      = useMemo(() => createAdsbGeoJSON(adsbData),             [adsbData])
  const radarFrame       = useMemo(() => getRadarFrame(echoMeta),                 [echoMeta])
  const satFrame         = useMemo(() => getSatFrame(satMeta),                    [satMeta])
  const sigmetFeatures   = useMemo(() => advisoryItemsToFeatureCollection(sigmetData, 'sigmet'),      [sigmetData])
  const sigmetLabels     = useMemo(() => advisoryItemsToLabelFeatureCollection(sigmetData, 'sigmet'), [sigmetData])
  const airmetFeatures   = useMemo(() => advisoryItemsToFeatureCollection(airmetData, 'airmet'),      [airmetData])
  const airmetLabels     = useMemo(() => advisoryItemsToLabelFeatureCollection(airmetData, 'airmet'), [airmetData])

  const sigmetCount  = sigmetFeatures.features.length
  const airmetCount  = airmetFeatures.features.length
  const lightningCount = lightningGeoJSON.features.length

  function toggleAviation(id) {
    setAviationVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleMet(id) {
    setMetVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ── ADS-B Polling ─────────────────────────────────────────────────────────

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

  // ── Map init ──────────────────────────────────────────────────────────────

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
      addVfrWaypointLayers(map)
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
      setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && metVisibility.sigwx)

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
              .setHTML(`<pre class="mapbox-advisory-popup">${desc.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</pre>`)
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

  // ── Sync aviation layer visibility ───────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    AVIATION_WFS_LAYERS.forEach((l) => setLayerVisibility(map, l, aviationVisibility[l.id]))
  }, [aviationVisibility])

  // ── Route highlight (경로 구간 레이어 강제 표시) ──────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    if (routeResult?.flightRule === 'IFR') {
      applyRouteHighlight(map, routeResult.navpointIds)
    } else {
      clearRouteHighlight(map)
    }
  }, [routeResult, isStyleReady])

  // ── VFR waypoint sync ────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || vfrWaypoints.length < 2) return
    addVfrWaypointLayers(map)
    map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(buildVfrGeoJSON(vfrWaypoints))
  }, [vfrWaypoints, isStyleReady])

  // ── VFR WP hover (X 버튼 표시용) ────────────────────────────────────────

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

  // ── Sync MET overlays ─────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return

    const hasSat   = addOrUpdateImageOverlay(map, { sourceId: SATELLITE_SOURCE, layerId: SATELLITE_LAYER, frame: satFrame,   opacity: 0.92 })
    const hasRadar = addOrUpdateImageOverlay(map, { sourceId: RADAR_SOURCE,     layerId: RADAR_LAYER,     frame: radarFrame, opacity: 0.88 })
    const hasSigwx = addOrUpdateImageOverlay(map, { sourceId: SIGWX_SOURCE,     layerId: SIGWX_LAYER,     frame: sigwxFrontMeta, opacity: 0.85 })

    setMapLayerVisible(map, SATELLITE_LAYER, hasSat   && metVisibility.satellite)
    setMapLayerVisible(map, RADAR_LAYER,     hasRadar && metVisibility.radar)
    setMapLayerVisible(map, SIGWX_LAYER,     hasSigwx && metVisibility.sigwx)
  }, [satFrame, radarFrame, sigwxFrontMeta, metVisibility, isStyleReady])

  // ── Sync SIGMET / AIRMET ──────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    updateAdvisoryLayerData(map, 'sigmet', sigmetFeatures, sigmetLabels)
    updateAdvisoryLayerData(map, 'airmet', airmetFeatures, airmetLabels)
    setAdvisoryVisibility(map, 'sigmet', metVisibility.sigmet)
    setAdvisoryVisibility(map, 'airmet', metVisibility.airmet)
  }, [sigmetFeatures, sigmetLabels, airmetFeatures, airmetLabels, metVisibility.sigmet, metVisibility.airmet, isStyleReady])

  // ── Sync lightning ────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    addLightningLayers(map, lightningGeoJSON)
    map.getSource(LIGHTNING_SOURCE)?.setData(lightningGeoJSON)
    setLightningVisibility(map, metVisibility.lightning)
  }, [lightningGeoJSON, metVisibility.lightning, isStyleReady])

  // ── Sync geo boundaries ───────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    setGeoBoundaryVisibility(map, metVisibility.satellite || metVisibility.radar)
  }, [metVisibility.satellite, metVisibility.radar, isStyleReady])

  // ── Sync ADS-B ────────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    map.getSource(ADSB_SOURCE_ID)?.setData(adsbGeoJSON)
    setAdsbVisibility(map, metVisibility.adsb)
  }, [adsbGeoJSON, metVisibility.adsb, isStyleReady])

  // ── Sync airport data ─────────────────────────────────────────────────────

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

  // ── Sync airport selected state ───────────────────────────────────────────

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

  // ── Route panel clear ─────────────────────────────────────────────────────

  useEffect(() => {
    if (activePanel === 'route-check') return
    setRouteResult(null)
    setRouteError(null)
    setVfrWaypoints([])
    const map = mapRef.current
    if (map?.isStyleLoaded() && map.getSource(ROUTE_PREVIEW_SOURCE)) {
      map.getSource(ROUTE_PREVIEW_SOURCE).setData(emptyGeoJSON)
    }
  }, [activePanel])

  // ── Route search ──────────────────────────────────────────────────────────

  function updateRouteField(field, value) {
    setRouteForm((prev) => ({ ...prev, [field]: value }))
  }

  function switchFlightRule(rule) {
    setRouteForm((prev) => ({ ...prev, flightRule: rule }))
    setRouteResult(null)
    setRouteError(null)
    setVfrWaypoints([])
    const map = mapRef.current
    if (map?.isStyleLoaded() && map.getSource(ROUTE_PREVIEW_SOURCE)) {
      map.getSource(ROUTE_PREVIEW_SOURCE).setData(emptyGeoJSON)
    }
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
          { id: result.arrivalAirport,   lon: pts[1].geometry.coordinates[0], lat: pts[1].geometry.coordinates[1], fixed: true },
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
          map.getSource(ROUTE_PREVIEW_SOURCE).setData(result.previewGeojson)
          const coords = result.previewGeojson.features.flatMap((f) =>
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

  // ── Layer panel helpers ───────────────────────────────────────────────────

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
    if (id === 'radar')     return !radarFrame
    if (id === 'satellite') return !satFrame
    if (id === 'lightning') return lightningCount === 0
    if (id === 'sigmet')    return sigmetCount === 0
    if (id === 'airmet')    return airmetCount === 0
    if (id === 'sigwx')     return !sigwxFrontMeta
    return false
  }

  function metLayerBadge(id) {
    if (id === 'sigmet')    return sigmetCount  > 0 ? sigmetCount  : null
    if (id === 'airmet')    return airmetCount  > 0 ? airmetCount  : null
    if (id === 'lightning') return lightningCount > 0 ? lightningCount : null
    return null
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
        >×</button>
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
        <section className="route-check-panel" aria-label="Route check panel">
          <div className="route-check-title">Route Check</div>
          <form className="route-check-form" onSubmit={handleRouteSearch}>
            {/* Row 1: Flight rule + Route Type (IFR only) */}
            <div className={`route-check-flight-rule${routeForm.flightRule === 'VFR' ? ' full-width' : ''}`}>
              <label className="route-check-radio">
                <input type="radio" name="flightRule" value="IFR" checked={routeForm.flightRule === 'IFR'} onChange={() => switchFlightRule('IFR')} />
                IFR
              </label>
              <label className="route-check-radio">
                <input type="radio" name="flightRule" value="VFR" checked={routeForm.flightRule === 'VFR'} onChange={() => switchFlightRule('VFR')} />
                VFR
              </label>
            </div>
            {routeForm.flightRule === 'IFR' && (
              <label>Route Type
                <select value={routeForm.routeType} onChange={(e) => updateRouteField('routeType', e.target.value)}>
                  <option value="ALL">All</option>
                  <option value="RNAV">RNAV</option>
                  <option value="ATS">ATS</option>
                </select>
              </label>
            )}
            {/* Row 2 */}
            <label>DEP Airport<input value={routeForm.departureAirport} onChange={(e) => updateRouteField('departureAirport', e.target.value)} /></label>
            {routeForm.flightRule === 'IFR'
              ? <label>Entry Fix<input value={routeForm.entryFix} onChange={(e) => updateRouteField('entryFix', e.target.value)} /></label>
              : <label>ARR Airport<input value={routeForm.arrivalAirport} onChange={(e) => updateRouteField('arrivalAirport', e.target.value)} /></label>
            }
            {/* Row 3: IFR only */}
            {routeForm.flightRule === 'IFR' && (
              <>
                <label>ARR Airport<input value={routeForm.arrivalAirport} onChange={(e) => updateRouteField('arrivalAirport', e.target.value)} /></label>
                <label>Exit Fix<input value={routeForm.exitFix} onChange={(e) => updateRouteField('exitFix', e.target.value)} /></label>
              </>
            )}
            <button type="submit" disabled={routeLoading}>{routeLoading ? 'Searching...' : 'Search'}</button>
          </form>
          {routeError && <div className="route-check-error">{routeError}</div>}
          {routeResult && (
            <div className="route-check-result">
              <dl>
                <div>
                  <dt>Distance</dt>
                  <dd>{routeResult.flightRule === 'VFR' && vfrWaypoints.length >= 2 ? calcVfrDistance(vfrWaypoints) : routeResult.distanceNm} NM</dd>
                </div>
                {routeResult.flightRule === 'IFR' && (
                  <div><dt>Segments</dt><dd>{routeResult.segments.length}</dd></div>
                )}
              </dl>
              {routeResult.flightRule === 'IFR' && (
                <div className="route-check-sequence">{routeResult.displaySequence.join(' → ')}</div>
              )}
              {routeResult.flightRule === 'VFR' && vfrWaypoints.length >= 2 && (
                <div className="route-check-sequence">{vfrWaypoints.map((wp) => wp.id).join(' → ')}</div>
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
            const badge    = metLayerBadge(layer.id)
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
