import mapboxgl from 'mapbox-gl'
import circle from '@turf/circle'
import { point } from '@turf/helpers'
import { aircraftClass, aircraftSize } from './aircraftClass.js'
import { airlineLogoId, airlineCode, airlineLogoFile, isKoreanAirline, AIRLINE_NAMES, AIRLINE_LOGOS } from './airlines.js'
import { operatorLogoId, operatorCode, operatorLogoFile, OPERATOR_LOGOS, OPERATOR_NAMES } from './operators.js'
import { typeNameKo, routeLabel, fetchRoute } from './flightInfo.js'

// Logo image path for a map/popup operator id — airline ICAO (svg) or non-airline
// operator code (png), whichever set actually contains it.
function logoSrc(id) {
  if (AIRLINE_LOGOS.has(id)) return `/Symbols/airlines/${airlineLogoFile(id)}`
  if (OPERATOR_LOGOS.has(id)) return `/Symbols/operators/${operatorLogoFile(id)}`
  return ''
}

export const ADSB_SOURCE_ID = 'adsb-source'
export const ADSB_TRAIL_SOURCE_ID = 'adsb-trail-source'
export const ADSB_LAYER_ID = 'adsb-layer'
export const ADSB_LOGO_LAYER_ID = 'adsb-logo-layer'
export const ADSB_TRAIL_LAYER_ID = 'adsb-trail-layer'
export const ADSB_RANGE_SOURCE_ID = 'adsb-range-source'
export const ADSB_RANGE_LAYER_ID = 'adsb-range-layer'
export const ADSB_SOURCE_IDS = [ADSB_SOURCE_ID, ADSB_TRAIL_SOURCE_ID, ADSB_RANGE_SOURCE_ID]
export const ADSB_LAYER_IDS = [ADSB_RANGE_LAYER_ID, ADSB_TRAIL_LAYER_ID, ADSB_LAYER_ID, ADSB_LOGO_LAYER_ID]

const ADSB_COVERAGE_CENTERS = [[124.7, 34.0], [131.0, 37.3]]
const ADSB_COVERAGE_RADIUS_NM = 250

export function createAdsbCoverageGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: ADSB_COVERAGE_CENTERS.map((center) => circle(point(center), ADSB_COVERAGE_RADIUS_NM, {
      units: 'nauticalmiles',
      steps: 96,
    })),
  }
}

const CLASS_LABELS_KO = {
  heavy: '대형기', jet: '협동체', regional: '리저널', turboprop: '터보프롭',
  piston: '경항공기', helicopter: '헬기', unknown: '',
}

// Short motion tail behind each aircraft: heading/speed-based (not a historical path),
// pointing where it came from, length scaled by ground speed for a sense of movement.
const TAIL_SECONDS = 75
const TAIL_MIN_M = 3000
const TAIL_MAX_M = 40000

function destPoint(lon, lat, bearingDeg, distM) {
  const R = 6371000
  const br = (bearingDeg * Math.PI) / 180
  const dr = distM / R
  const la1 = (lat * Math.PI) / 180
  const lo1 = (lon * Math.PI) / 180
  const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br))
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2))
  return [(lo2 * 180) / Math.PI, (la2 * 180) / Math.PI]
}

export function createAdsbTrailGeoJSON(adsbData) {
  if (!adsbData || !adsbData.aircraft) {
    return { type: 'FeatureCollection', features: [] }
  }
  return {
    type: 'FeatureCollection',
    features: adsbData.aircraft
      .filter(a => Number.isFinite(a.lon) && Number.isFinite(a.lat)
        && Number.isFinite(a.true_track) && Number.isFinite(a.velocity) && a.velocity > 10)
      .map(a => {
        const dist = Math.min(TAIL_MAX_M, Math.max(TAIL_MIN_M, a.velocity * TAIL_SECONDS))
        const tail = destPoint(a.lon, a.lat, (a.true_track + 180) % 360, dist)
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [tail, [a.lon, a.lat]] },
          properties: { icao24: a.icao24 },
        }
      }),
  }
}

export function createAdsbGeoJSON(adsbData) {
  if (!adsbData || !adsbData.aircraft) {
    return { type: 'FeatureCollection', features: [] }
  }

  return {
    type: 'FeatureCollection',
    features: adsbData.aircraft
      .filter(a => Number.isFinite(a.lon) && Number.isFinite(a.lat)
        && Number.isFinite(a.true_track) && Number.isFinite(a.velocity))
      .map(a => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        properties: {
          icao24: a.icao24,
          callsign: a.callsign || 'UNKNOWN',
          baro_altitude: a.baro_altitude,
          velocity: a.velocity,
          true_track: a.true_track || 0,
          aircraft_class: aircraftClass(a.type_code, a.category),
          icon_scale: aircraftSize(a.type_code, aircraftClass(a.type_code, a.category)),
          operator: airlineLogoId(a.callsign) || operatorLogoId(a.registration),
          airline_name: AIRLINE_NAMES[airlineCode(a.callsign)] || OPERATOR_NAMES[operatorCode(a.registration)] || '',
          type_code: a.type_code || '',
          registration: a.registration || '',
          vertical_rate: a.vertical_rate,
          wind_direction: a.wind_direction,
          wind_speed: a.wind_speed,
          outside_air_temperature: a.outside_air_temperature,
          squawk: a.squawk || ''
        }
      }))
  }
}

export function addAdsbLayers(map) {
  if (!map.getSource(ADSB_SOURCE_ID)) {
    map.addSource(ADSB_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    })
  }

  if (!map.getSource(ADSB_TRAIL_SOURCE_ID)) {
    map.addSource(ADSB_TRAIL_SOURCE_ID, {
      type: 'geojson',
      lineMetrics: true,
      data: { type: 'FeatureCollection', features: [] }
    })
  }

  if (!map.getSource(ADSB_RANGE_SOURCE_ID)) {
    map.addSource(ADSB_RANGE_SOURCE_ID, {
      type: 'geojson',
      data: createAdsbCoverageGeoJSON(),
    })
  }

  if (!map.getLayer(ADSB_RANGE_LAYER_ID)) {
    map.addLayer({
      id: ADSB_RANGE_LAYER_ID,
      type: 'line',
      source: ADSB_RANGE_SOURCE_ID,
      slot: 'top',
      paint: {
        'line-color': '#38bdf8',
        'line-width': 1.5,
        'line-dasharray': [3, 3],
        'line-opacity': 0.8,
      },
    })
  }

  // Motion tail — added before the icons so it renders beneath them.
  if (!map.getLayer(ADSB_TRAIL_LAYER_ID)) {
    map.addLayer({
      id: ADSB_TRAIL_LAYER_ID,
      type: 'line',
      source: ADSB_TRAIL_SOURCE_ID,
      slot: 'top',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': 2,
        'line-gradient': ['interpolate', ['linear'], ['line-progress'],
          0, 'rgba(16,185,129,0)', 1, 'rgba(16,185,129,0.85)'],
      }
    })
  }

  if (!map.getLayer(ADSB_LAYER_ID)) {
    map.addLayer({
      id: ADSB_LAYER_ID,
      type: 'symbol',
      source: ADSB_SOURCE_ID,
      slot: 'top',
      layout: {
        'icon-image': ['concat', 'aircraft-', ['get', 'aircraft_class']],
        // Per-aircraft scale from real wingspan (see aircraftSize).
        'icon-size': ['get', 'icon_scale'],
        'icon-rotate': ['get', 'true_track'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    })
  }

  // Airline logo chip above the aircraft (upright, collision-managed).
  if (!map.getLayer(ADSB_LOGO_LAYER_ID)) {
    map.addLayer({
      id: ADSB_LOGO_LAYER_ID,
      type: 'symbol',
      source: ADSB_SOURCE_ID,
      slot: 'top',
      minzoom: 6,
      filter: ['!=', ['get', 'operator'], ''],
      layout: {
        'icon-image': ['concat', 'airline-', ['get', 'operator']],
        'icon-anchor': 'bottom-left',
        'icon-offset': [10, -8],
        'icon-rotation-alignment': 'viewport',
        'icon-allow-overlap': false,
        'icon-optional': true
      }
    })
  }
}

export function setAdsbVisibility(map, isVisible) {
  const visibility = isVisible ? 'visible' : 'none'
  for (const id of ADSB_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility)
  }
}

export function bindAdsbHover(map) {
  let popup = null
  let hoveredKey = null

  const buildHtml = (props, routeText) => {
    const altFt = Number.isFinite(props.baro_altitude) ? Math.round(props.baro_altitude * 3.28084) : null
    const spdKt = Number.isFinite(props.velocity) ? Math.round(props.velocity * 1.94384) : null
    const hdg = Number.isFinite(props.true_track) ? Math.round(props.true_track) : null
    const vsFpm = Number.isFinite(props.vertical_rate) ? Math.round(props.vertical_rate * 196.85) : null
    const windDirection = Number.isFinite(props.wind_direction) ? Math.round(props.wind_direction) : null
    const windSpeedKt = Number.isFinite(props.wind_speed) ? Math.round(props.wind_speed) : null
    const outsideAirTemperature = Number.isFinite(props.outside_air_temperature) ? Math.round(props.outside_air_temperature) : null

    const classKo = CLASS_LABELS_KO[props.aircraft_class] || ''
    const typeText = [typeNameKo(props.type_code), classKo ? `· ${classKo}` : ''].filter(Boolean).join(' ')

    let vsText = '—'
    if (vsFpm !== null) {
      if (vsFpm > 100) vsText = `상승(▲ ${vsFpm.toLocaleString()} fpm)`
      else if (vsFpm < -100) vsText = `하강(▼ ${Math.abs(vsFpm).toLocaleString()} fpm)`
      else vsText = '순항'
    }

    const emergency = { 7500: '납치', 7600: '통신두절', 7700: '비상' }[props.squawk]

    const logo = props.operator
      ? `<img src="${logoSrc(props.operator)}" alt="" style="height: 22px; max-width: 76px; object-fit: contain;" />`
      : ''

    const row = (label, value, accent) => `<tr>
      <td style="color: #64748b; padding: 1px 0; white-space: nowrap;">${label}</td>
      <td style="text-align: right; font-weight: 600; color: ${accent || '#0f172a'}; padding: 1px 0 1px 14px;">${value}</td>
    </tr>`

    const rows = [
      typeText ? row('기종', typeText) : '',
      routeText ? row('경로', routeText) : '',
      row('고도', altFt !== null ? `${altFt.toLocaleString()} ft` : '—'),
      outsideAirTemperature !== null ? row('외기온도(OAT)', `${outsideAirTemperature} °C`) : '',
      windDirection !== null || windSpeedKt !== null ? row('바람', `${windDirection ?? '—'}° / ${windSpeedKt ?? '—'} kt`) : '',
      row('지상속도(GS)', spdKt !== null ? `${spdKt} kt` : '—'),
      row('방향', hdg !== null ? `${hdg}°` : '—'),
      row('상승률', vsText),
      emergency ? row('비상', `${props.squawk} ${emergency}`, '#dc2626') : '',
    ].filter(Boolean).join('')

    const regBadge = props.registration
      ? `<span style="font-weight: 400; color: #94a3b8; font-size: 10px;">${props.registration}</span>` : ''

    return `
      <div style="font-family: 'Pretendard', sans-serif; font-size: 12px; line-height: 1.45; padding: 2px; min-width: 240px;">
        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #10b981; padding-bottom: 6px; margin-bottom: 6px;">
          ${logo}
          <div style="min-width: 0;">
            <div style="font-weight: 800; font-size: 14px; color: #0f172a;">${props.callsign} ${regBadge}</div>
            ${props.airline_name ? `<div style="font-size: 11px; color: #64748b;">${props.airline_name}</div>` : ''}
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse;">${rows}</table>
      </div>
    `
  }

  const onMouseEnter = (e) => {
    map.getCanvas().style.cursor = 'pointer'
    const props = e.features[0].properties
    const key = props.callsign
    hoveredKey = key

    popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 15, maxWidth: '320px' })
      .setLngLat(e.lngLat)
      .setHTML(buildHtml(props, null))
      .addTo(map)

    if (key && key !== 'UNKNOWN' && isKoreanAirline(key)) {
      fetchRoute(key).then((route) => {
        if (!popup || hoveredKey !== key) return
        const text = routeLabel(route)
        if (text) popup.setHTML(buildHtml(props, text))
      })
    }
  }

  const onMouseMove = (e) => {
    if (popup) {
      popup.setLngLat(e.lngLat)
    }
  }

  const onMouseLeave = () => {
    map.getCanvas().style.cursor = ''
    hoveredKey = null
    if (popup) {
      popup.remove()
      popup = null
    }
  }

  map.on('mouseenter', ADSB_LAYER_ID, onMouseEnter)
  map.on('mousemove', ADSB_LAYER_ID, onMouseMove)
  map.on('mouseleave', ADSB_LAYER_ID, onMouseLeave)

  return () => {
    map.off('mouseenter', ADSB_LAYER_ID, onMouseEnter)
    map.off('mousemove', ADSB_LAYER_ID, onMouseMove)
    map.off('mouseleave', ADSB_LAYER_ID, onMouseLeave)
    if (popup) {
      popup.remove()
      popup = null
    }
  }
}

export function syncAdsbLayer(map, { geojson, trailGeojson, isVisible }) {
  map.getSource(ADSB_SOURCE_ID)?.setData(geojson)
  if (trailGeojson) map.getSource(ADSB_TRAIL_SOURCE_ID)?.setData(trailGeojson)
  map.getSource(ADSB_RANGE_SOURCE_ID)?.setData(createAdsbCoverageGeoJSON())
  setAdsbVisibility(map, isVisible)
}
