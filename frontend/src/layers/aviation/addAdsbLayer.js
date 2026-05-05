import mapboxgl from 'mapbox-gl'

export const ADSB_SOURCE_ID = 'adsb-source'
export const ADSB_LAYER_ID = 'adsb-layer'

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

  map.on('mouseenter', ADSB_LAYER_ID, (e) => {
    map.getCanvas().style.cursor = 'pointer'
    const props = e.features[0].properties

    const html = `
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
        <strong>${props.callsign}</strong> (${props.icao24})<br/>
        Alt: ${props.baro_altitude ? Math.round(props.baro_altitude) + ' ft' : 'N/A'}<br/>
        Spd: ${props.velocity ? Math.round(props.velocity) + ' m/s' : 'N/A'}<br/>
        Hdg: ${props.true_track ? Math.round(props.true_track) + '°' : 'N/A'}
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
  })

  map.on('mousemove', ADSB_LAYER_ID, (e) => {
    if (popup) {
      popup.setLngLat(e.lngLat)
    }
  })

  map.on('mouseleave', ADSB_LAYER_ID, () => {
    map.getCanvas().style.cursor = ''
    if (popup) {
      popup.remove()
      popup = null
    }
  })
}
