import { ICING_PRESENTATION, ICING_DOTS, MAP_ISOTHERM_COLOR } from '../../../shared/weather/cloudIcingPresentation.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { syncIcingPatternOverlay, destroyIcingPatternOverlay, ICING_PATTERN_LAYER, ICING_OUTLINE_LAYER, ICING_PATTERN_IMAGE_IDS, icingPatternImage } from './icingPatternOverlay.js'
import { syncTemperatureContourOverlay, destroyTemperatureContourOverlay, TEMPERATURE_CONTOUR_LAYER_IDS } from './temperatureContourOverlay.js'

function mapFixture() {
  const layers = new Map(), sources = new Map(), images = new Map(), order = []
  return {
    layers, sources, images, order, uploads: 0,
    getLayer: id => layers.get(id), getSource: id => sources.get(id), hasImage: id => images.has(id),
    addImage(id, image) { assert.equal((image.width & (image.width - 1)), 0); images.set(id, image) },
    removeImage: id => images.delete(id),
    addSource(id, source) { sources.set(id, { ...source, setData: data => { this.uploads++; sources.get(id).data = data } }) },
    removeSource: id => sources.delete(id),
    addLayer(layer, before) { layers.set(layer.id, layer); const i = order.indexOf(before); if (i >= 0) order.splice(i, 0, layer.id); else order.push(layer.id) },
    removeLayer(id) { layers.delete(id); order.splice(order.indexOf(id), 1) },
    setPaintProperty(id, key, value) { const l = layers.get(id); l.paint = { ...l.paint, [key]: value } },
    setLayoutProperty(id, key, value) { const l = layers.get(id); l.layout = { ...l.layout, [key]: value } },
    reload() { layers.clear(); sources.clear(); images.clear(); order.length = 0 },
  }
}
const field = { grid: { nx: 3, ny: 2, lonMin: 126, lonMax: 128, latMin: 35, latMax: 36 }, icingGrade: [1, 2, 3, 1, 2, 3], T: [283.15, 263.15, 243.15, 283.15, 263.15, 243.15] }

test('late icing response is drawn below contours; hide/reload/cleanup preserve all parts', () => {
  const map = mapFixture()
  const temp = { temperatureField: field, isVisible: true }
  const ice = { icingField: field, isVisible: true }
  syncTemperatureContourOverlay(map, temp)
  syncIcingPatternOverlay(map, ice)
  assert.equal(map.getLayer(ICING_PATTERN_LAYER).paint['fill-antialias'], false, 'grade polygons must not acquire implicit internal outlines')
  assert.ok(map.order.indexOf(ICING_OUTLINE_LAYER) < map.order.indexOf(TEMPERATURE_CONTOUR_LAYER_IDS[0]))
  syncIcingPatternOverlay(map, ice); syncTemperatureContourOverlay(map, temp)
  assert.equal(map.uploads, 0, 'visibility sync reuses existing geometry')
  syncIcingPatternOverlay(map, { ...ice, isVisible: false })
  for (const id of [ICING_PATTERN_LAYER, ICING_OUTLINE_LAYER]) assert.equal(map.getLayer(id).layout.visibility, 'none')
  syncIcingPatternOverlay(map, ice)
  for (let i = 0; i < 2; i++) {
    map.reload(); syncIcingPatternOverlay(map, ice); syncTemperatureContourOverlay(map, temp)
    assert.equal(map.images.size, 3)
    assert.equal(map.layers.size, 7)
  }
  syncTemperatureContourOverlay(map, { ...temp, detail: true })
  assert.equal(map.uploads, 0)
  assert.equal(map.getSource('kim-temperature-contour-source').data.features.length, 2)
  destroyIcingPatternOverlay(map); destroyTemperatureContourOverlay(map)
  assert.equal(map.layers.size + map.sources.size + map.images.size, 0)
})

test('A has distinct opaque grade faces with identical dot spacing and white dots', () => {
  assert.equal(ICING_DOTS.size / ICING_DOTS.repeats / ICING_DOTS.pixelRatio, 9)
  const images = ICING_PRESENTATION.slice(1).map(p => icingPatternImage(p))
  for (const [i, image] of images.entries()) {
    const rgb = ICING_PRESENTATION[i + 1].fillColor.slice(1).match(/../g).map(v => parseInt(v, 16))
    assert.deepEqual([...image.data.slice(0, 4)], [...rgb, 255])
    for (let at = 3; at < image.data.length; at += 4) assert.equal(image.data[at], 255)
    const dot = [...image.data.slice((7 * 64 + 7) * 4, (7 * 64 + 7) * 4 + 3)]
    assert.ok(dot.every((c, j) => c >= rgb[j]) && dot.some((c, j) => c > rgb[j]), 'white dots brighten every grade')
  }
  assert.notDeepEqual(images[0].data, images[1].data)
  assert.notDeepEqual(images[1].data, images[2].data)
})

test('installed layers get A paint and dark background outline; old detail source is replaced', () => {
  const map = mapFixture()
  map.addSource('kim-temperature-contour-source', { data: { features: [{ properties: { temperature: -10 } }] } })
  syncTemperatureContourOverlay(map, { temperatureField: field, isVisible: true, detail: true })
  assert.deepEqual(map.getSource('kim-temperature-contour-source').data.features.map(f => f.properties.temperature), [0, -20])
  for (const id of TEMPERATURE_CONTOUR_LAYER_IDS.slice(2,4)) assert.equal(map.getLayer(id).paint['line-color'], MAP_ISOTHERM_COLOR)
  assert.equal(map.getLayer(TEMPERATURE_CONTOUR_LAYER_IDS[4]).paint['text-color'], MAP_ISOTHERM_COLOR)
  syncIcingPatternOverlay(map, { icingField: field, isVisible: true })
  map.setPaintProperty(ICING_PATTERN_LAYER, 'fill-pattern', 'kim-icing-dots-1')
  syncIcingPatternOverlay(map, { icingField: field, isVisible: true, basemapId: 'satellite' })
  assert.ok(ICING_PATTERN_IMAGE_IDS.every(id => map.getLayer(ICING_PATTERN_LAYER).paint['fill-pattern'].includes(id)))
  assert.equal(map.getLayer(ICING_OUTLINE_LAYER).paint['line-color'], '#e6edf5')
  syncTemperatureContourOverlay(map, { temperatureField: field, isVisible: false })
  assert.ok(TEMPERATURE_CONTOUR_LAYER_IDS.every(id => map.getLayer(id).layout.visibility === 'none'))
})
