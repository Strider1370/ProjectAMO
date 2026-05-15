import mapboxgl from 'mapbox-gl'

export const ADSB_SOURCE_ID = 'adsb-source'
export const ADSB_LAYER_ID = 'adsb-layer'
export const ADSB_SOURCE_IDS = [ADSB_SOURCE_ID]
export const ADSB_LAYER_IDS = [ADSB_LAYER_ID]

export function createAdsbGeoJSON(adsbData) {
  if (!adsbData || !adsbData.aircraft) {
    return { type: 'FeatureCollection', features: [] }
  }

  return {
    type: 'FeatureCollection',
    features: adsbData.aircraft
      .filter(a => Number.isFinite(a.lon) && Number.isFinite(a.lat))
      .map(a => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        properties: {
          icao24: a.icao24,
          callsign: a.callsign || 'UNKNOWN',
          baro_altitude: a.baro_altitude,
          velocity: a.velocity,
          true_track: a.true_track || 0
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

  if (!map.getLayer(ADSB_LAYER_ID)) {
    map.addLayer({
      id: ADSB_LAYER_ID,
      type: 'symbol',
      source: ADSB_SOURCE_ID,
      slot: 'top',
      layout: {
        'text-field': '✈',
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 20,
        'text-rotate': ['-', ['get', 'true_track'], 90],
        'text-rotation-alignment': 'map',
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#10b981', // Emerald green
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      }
    })
  }
}

export function setAdsbVisibility(map, isVisible) {
  if (map.getLayer(ADSB_LAYER_ID)) {
    map.setLayoutProperty(ADSB_LAYER_ID, 'visibility', isVisible ? 'visible' : 'none')
  }
}

export function bindAdsbHover(map) {
  let popup = null

  const onMouseEnter = (e) => {
    map.getCanvas().style.cursor = 'pointer'
    const props = e.features[0].properties

    const altFt = props.baro_altitude ? Math.round(props.baro_altitude * 3.28084) : null
    const spdKt = props.velocity ? Math.round(props.velocity * 1.94384) : null

    const html = `
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; padding: 4px;">
        <div style="font-weight: 800; color: #10b981; border-bottom: 1px solid #eee; margin-bottom: 4px;">
          ${props.callsign} <span style="font-weight: 400; color: #94a3b8; font-size: 10px;">${props.icao24}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="color: #64748b;">Alt:</td><td style="text-align: right; font-weight: 600;">${altFt ? altFt.toLocaleString() + ' ft' : '—'}</td></tr>
          <tr><td style="color: #64748b;">Spd:</td><td style="text-align: right; font-weight: 600;">${spdKt ? spdKt + ' kt' : '—'}</td></tr>
          <tr><td style="color: #64748b;">Hdg:</td><td style="text-align: right; font-weight: 600;">${props.true_track ? Math.round(props.true_track) + '°' : '—'}</td></tr>
        </table>
      </div>
    `

    popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 15
    })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map)
  }

  const onMouseMove = (e) => {
    if (popup) {
      popup.setLngLat(e.lngLat)
    }
  }

  const onMouseLeave = () => {
    map.getCanvas().style.cursor = ''
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

export function syncAdsbLayer(map, { geojson, isVisible }) {
  map.getSource(ADSB_SOURCE_ID)?.setData(geojson)
  setAdsbVisibility(map, isVisible)
}
