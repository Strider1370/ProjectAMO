import assert from 'node:assert/strict'
import test from 'node:test'

import { RASTER_ROW_SCALE } from './overlayUtils.js'

import {
  ICING_IMAGE_LAYER_IDS,
  ICING_IMAGE_SOURCE_IDS,
  destroyIcingPotentialOverlay,
  syncIcingPotentialOverlay,
} from './icingPotentialOverlaySync.js'

function installDom() {
  const previousDocument = globalThis.document
  const createdCanvases = []
  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, 'canvas')
      const calls = []
      const canvas = {
        __calls: calls,
        width: 0,
        height: 0,
        getContext(kind) {
          assert.equal(kind, '2d')
          return {
            createImageData(width, height) {
              const imageData = { data: new Uint8ClampedArray(width * height * 4) }
              calls.push({ method: 'createImageData', args: [width, height], imageData })
              return imageData
            },
            putImageData(imageData, x, y) {
              calls.push({ method: 'putImageData', args: [imageData.data.length, x, y], imageData })
            },
          }
        },
        toDataURL(type) {
          calls.push({ method: 'toDataURL', args: [type] })
          return `data:${type};base64,icing`
        },
      }
      createdCanvases.push(canvas)
      return canvas
    },
  }
  return {
    createdCanvases,
    restore() {
      globalThis.document = previousDocument
    },
  }
}

function createMap() {
  const sources = new Map()
  const layers = new Map()
  return {
    sources,
    layers,
    getSource: (id) => sources.get(id),
    addSource(id, source) {
      sources.set(id, {
        ...source,
        updateImage(image) {
          this.url = image.url
          this.coordinates = image.coordinates
          this.updatedImage = image
        },
      })
    },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (layer) => layers.set(layer.id, { ...layer }),
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty(id, prop, value) {
      const layer = layers.get(id)
      if (layer) layer.layout = { ...(layer.layout || {}), [prop]: value }
    },
  }
}

const FIELD = {
  encoding: 'int16-scaled-json-v1',
  scale: 0.0001,
  offset: 0,
  fieldEncoding: {
    icingGrade: { encoding: 'ordinal-json-v1', scale: 1, offset: 0 },
  },
  grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37, dx: 1, dy: 1 },
  icingScore: [0, 2000, 5000, 8000],
  icingGrade: [0, 1, -32768, 3],
}

test('syncIcingPotentialOverlay creates, hides, and destroys a Mapbox image layer', () => {
  const dom = installDom()
  try {
    const map = createMap()
    syncIcingPotentialOverlay(map, { icingField: FIELD, isVisible: true })

    assert.equal(map.getSource(ICING_IMAGE_SOURCE_IDS[0]).type, 'image')
    assert.equal(map.getLayer(ICING_IMAGE_LAYER_IDS[0]).type, 'raster')
    assert.equal(map.getLayer(ICING_IMAGE_LAYER_IDS[0]).paint['raster-opacity'], 1)
    assert.match(map.getSource(ICING_IMAGE_SOURCE_IDS[0]).url, /^data:image\/png/)
    const imageDataCall = dom.createdCanvases[0].__calls.find((call) => call.method === 'createImageData')
    assert.deepEqual(imageDataCall.args, [2, 2 * RASTER_ROW_SCALE])
    const putImageCall = dom.createdCanvases[0].__calls.find((call) => call.method === 'putImageData')
    assert.ok(putImageCall)
    const pixels = putImageCall.imageData.data
    assert.equal(pixels[3], 0)
    assert.equal(pixels[7] > 0, true)

    syncIcingPotentialOverlay(map, { icingField: FIELD, isVisible: false })
    assert.equal(map.getLayer(ICING_IMAGE_LAYER_IDS[0]).layout.visibility, 'none')

    destroyIcingPotentialOverlay(map)
    assert.equal(map.getSource(ICING_IMAGE_SOURCE_IDS[0]), undefined)
    assert.equal(map.getLayer(ICING_IMAGE_LAYER_IDS[0]), undefined)
  } finally {
    dom.restore()
  }
})
