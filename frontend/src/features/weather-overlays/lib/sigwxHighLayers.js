import { chartColor } from './wafsChartPalette.js'
import { installHazardFill, HAZARD_LAYER, HAZARD_SOURCE } from './wafsHazardFill.js'

export const HIGH_SOURCE = 'wafs-sigwx-sample'
const SOURCE = HIGH_SOURCE
const TYPES = [
  { id: 'CLOUD', label: 'CB' },
  { id: 'JETSTREAM', label: '제트' },
  { id: 'TURBULENCE', label: '난류', fill: true },
  { id: 'AIRFRAME_ICING', label: '착빙', fill: true },
  { id: 'TROPOPAUSE', label: '대류권계면', dash: [5, 3] },
  { id: 'TROPICAL_CYCLONE', label: '태풍' },
  { id: 'VOLCANO', label: '화산' },
]
const LINE_IDS = TYPES.map(type => `${SOURCE}-${type.id}`)
export const HIGH_LAYERS = [...LINE_IDS, `${SOURCE}-points`]

export function installHighLayers(map, data, palette) {
  installHazardFill(map, data, palette)
  if (map.getSource(SOURCE)) map.getSource(SOURCE).setData(data)
  else map.addSource(SOURCE, { type: 'geojson', data })
  for (const type of TYPES) {
    const id = `${SOURCE}-${type.id}`
    if (!map.getLayer(id)) map.addLayer({
      id, source: SOURCE, type: 'line', slot: 'top',
      filter: ['all', ['==', ['get', 'phenomenon'], type.id], ['==', ['get', 'role'], 'boundary']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': chartColor({ phenomenon: type.id, severity: 'SEV' }, palette),
        'line-width': type.id === 'JETSTREAM' ? 3.5 : type.id === 'TROPOPAUSE' ? 1.3
          : ['case', ['==', ['get', 'severity'], 'SEV'], 2, 1.4],
        // Canvas owns SIGWX strokes; Mapbox owns hazard fills. Lines here only support picking.
        'line-opacity': 0,
        ...(type.dash ? { 'line-dasharray': type.dash } : {}),
      },
    })
    map.setPaintProperty(id, 'line-color', chartColor({ phenomenon: type.id, severity: 'SEV' }, palette))
  }
  if (!map.getLayer(`${SOURCE}-points`)) map.addLayer({
    id: `${SOURCE}-points`, source: SOURCE, type: 'circle', slot: 'top',
    filter: ['in', ['get', 'role'], ['literal', ['marker', 'wind', 'direction']]],
    paint: { 'circle-radius': 8, 'circle-opacity': 0 },
  })
}

export function removeHighLayers(map) {
  for (const id of [...HIGH_LAYERS, HAZARD_LAYER].reverse()) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of [HIGH_SOURCE, HAZARD_SOURCE]) if (map.getSource(id)) map.removeSource(id)
}
