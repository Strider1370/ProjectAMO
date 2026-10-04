import { buildIcingGeometry } from './cloudIcingModel.js'
import { ICING_PRESENTATION, ICING_OUTLINE_COLOR, ICING_OUTLINE_WIDTH, ICING_DOTS, icingOutlineColor } from '../../../shared/weather/cloudIcingPresentation.js'

export const ICING_PATTERN_SOURCE = 'kim-icing-pattern-source'
export const ICING_OUTLINE_SOURCE = 'kim-icing-outer-source'
export const ICING_PATTERN_LAYER = 'kim-icing-pattern-layer'
export const ICING_OUTLINE_LAYER = 'kim-icing-outer-layer'
export const ICING_PATTERN_IMAGE_IDS = ICING_PRESENTATION.slice(1).map(p => `kim-icing-a-dots-${p.grade}`)
const fields = new WeakMap()

export function icingPatternImage(p) {
  const { size, repeats, radius, pixelRatio, opacity } = ICING_DOTS
  const data = new Uint8Array(size * size * 4)
  const rgb = p.fillColor.slice(1).match(/../g).map(v => Number.parseInt(v, 16))
  const spacing = size / repeats
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = Math.hypot((x + .5) % spacing - spacing / 2, (y + .5) % spacing - spacing / 2)
    const alpha = Math.min(1, Math.max(0, radius * pixelRatio + .5 - distance)) * opacity
    data.set([...rgb.map(c => Math.round(c * (1 - alpha) + 255 * alpha)), 255], (y * size + x) * 4)
  }
  return { width: size, height: size, data }
}

export function syncIcingPatternOverlay(map, { icingField, isVisible, basemapId }) {
  if (!map) return
  const visible = !!(isVisible && icingField)
  if (!visible) {
    for (const id of [ICING_PATTERN_LAYER, ICING_OUTLINE_LAYER]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
    return
  }
  for (const p of ICING_PRESENTATION.slice(1)) if (!map.hasImage(`kim-icing-a-dots-${p.grade}`)) map.addImage(`kim-icing-a-dots-${p.grade}`, icingPatternImage(p), { pixelRatio: ICING_DOTS.pixelRatio })
  const model = buildIcingGeometry(icingField)
  for (const [id, data] of [[ICING_PATTERN_SOURCE, model.fills], [ICING_OUTLINE_SOURCE, model.outlines]]) {
    const source = map.getSource(id)
    if (!source) map.addSource(id, { type: 'geojson', data })
    else if (fields.get(map) !== icingField) source.setData(data)
  }
  const before = ['kim-temperature-zero-halo', 'kim-temperature-zero-line'].find(id => map.getLayer(id))
  if (!map.getLayer(ICING_PATTERN_LAYER)) map.addLayer({ id: ICING_PATTERN_LAYER, type: 'fill', source: ICING_PATTERN_SOURCE, slot: 'middle', paint: { 'fill-pattern': ['match', ['get', 'grade'], 1, ICING_PATTERN_IMAGE_IDS[0], 2, ICING_PATTERN_IMAGE_IDS[1], ICING_PATTERN_IMAGE_IDS[2]], 'fill-opacity': 1, 'fill-antialias': false } }, before)
  if (!map.getLayer(ICING_OUTLINE_LAYER)) map.addLayer({ id: ICING_OUTLINE_LAYER, type: 'line', source: ICING_OUTLINE_SOURCE, slot: 'middle', paint: { 'line-color': ICING_OUTLINE_COLOR, 'line-width': ICING_OUTLINE_WIDTH, 'line-opacity': .95 } }, before)
  map.setPaintProperty(ICING_PATTERN_LAYER, 'fill-pattern', ['match', ['get', 'grade'], 1, ICING_PATTERN_IMAGE_IDS[0], 2, ICING_PATTERN_IMAGE_IDS[1], ICING_PATTERN_IMAGE_IDS[2]])
  map.setPaintProperty(ICING_OUTLINE_LAYER, 'line-color', icingOutlineColor(basemapId))
  for (const id of [ICING_PATTERN_LAYER, ICING_OUTLINE_LAYER]) map.setLayoutProperty(id, 'visibility', 'visible')
  fields.set(map, icingField)
}

export function destroyIcingPatternOverlay(map) {
  for (const id of [ICING_OUTLINE_LAYER, ICING_PATTERN_LAYER]) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of [ICING_OUTLINE_SOURCE, ICING_PATTERN_SOURCE]) if (map.getSource(id)) map.removeSource(id)
  for (const id of ICING_PATTERN_IMAGE_IDS) if (map.hasImage(id)) map.removeImage(id)
  fields.delete(map)
}
