import { buildTemperatureContours } from './cloudIcingModel.js'
import { MAP_ISOTHERM_COLOR } from '../../../shared/weather/cloudIcingPresentation.js'
import { color } from '../../../shared/theme/tokens.js'

export const TEMPERATURE_CONTOUR_SOURCE = 'kim-temperature-contour-source'
export const TEMPERATURE_CONTOUR_LAYER_IDS = ['kim-temperature-zero-halo', 'kim-temperature-cold-halo', 'kim-temperature-zero-line', 'kim-temperature-cold-line', 'kim-temperature-contour-labels']
const states = new WeakMap()

export function syncTemperatureContourOverlay(map, { temperatureField, isVisible }) {
  if (!map) return
  if (!isVisible || !temperatureField) {
    for (const id of TEMPERATURE_CONTOUR_LAYER_IDS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
    return
  }
  const source = map.getSource(TEMPERATURE_CONTOUR_SOURCE), old = states.get(map)
  if (!source) map.addSource(TEMPERATURE_CONTOUR_SOURCE, { type: 'geojson', data: buildTemperatureContours(temperatureField, false) })
  else if (old?.field !== temperatureField || old?.version !== 2) source.setData(buildTemperatureContours(temperatureField, false))
  // Light underlays keep the red contours legible on dark and satellite basemaps.
  for (const [id, zero, halo] of [
    [TEMPERATURE_CONTOUR_LAYER_IDS[0], true, true], [TEMPERATURE_CONTOUR_LAYER_IDS[1], false, true],
    [TEMPERATURE_CONTOUR_LAYER_IDS[2], true, false], [TEMPERATURE_CONTOUR_LAYER_IDS[3], false, false],
  ]) if (!map.getLayer(id)) map.addLayer({
    id, type: 'line', source: TEMPERATURE_CONTOUR_SOURCE, slot: 'middle', filter: [zero ? '==' : '!=', ['get', 'temperature'], 0],
    paint: { 'line-color': halo ? color.bg1 : MAP_ISOTHERM_COLOR, 'line-width': (zero ? 2 : 1.2) + (halo ? 2 : 0), ...(zero ? {} : { 'line-dasharray': [5, 3] }) },
  })
  const id = TEMPERATURE_CONTOUR_LAYER_IDS[4]
  if (!map.getLayer(id)) map.addLayer({ id, type: 'symbol', source: TEMPERATURE_CONTOUR_SOURCE, slot: 'middle', layout: { 'symbol-placement': 'line', 'symbol-spacing': 250, 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'] }, paint: { 'text-color': MAP_ISOTHERM_COLOR, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } })
  for (const id of TEMPERATURE_CONTOUR_LAYER_IDS) map.setLayoutProperty(id, 'visibility', 'visible')
  for (const id of TEMPERATURE_CONTOUR_LAYER_IDS.slice(2, 4)) map.setPaintProperty(id, 'line-color', MAP_ISOTHERM_COLOR)
  map.setPaintProperty(TEMPERATURE_CONTOUR_LAYER_IDS[4], 'text-color', MAP_ISOTHERM_COLOR)
  states.set(map, { field: temperatureField, version: 2 })
}

export function destroyTemperatureContourOverlay(map) {
  for (const id of [...TEMPERATURE_CONTOUR_LAYER_IDS].reverse()) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(TEMPERATURE_CONTOUR_SOURCE)) map.removeSource(TEMPERATURE_CONTOUR_SOURCE)
  states.delete(map)
}
