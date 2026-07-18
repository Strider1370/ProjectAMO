import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  advisoryItemsToLabelFeatureCollection,
} from './advisoryLayers.js'

function createMap() {
  const sources = new Map()
  const layers = new Map()
  return {
    layers,
    addSource(id, source) {
      sources.set(id, source)
    },
    getSource(id) {
      return sources.get(id) ?? null
    },
    addLayer(layer) {
      layers.set(layer.id, layer)
    },
    getLayer(id) {
      return layers.get(id) ?? null
    },
    hasImage() {
      return true
    },
    loadImage() {},
    addImage() {},
  }
}

test('advisory map markers render icon layer plus a chart-style text/arrow layer', () => {
  const map = createMap()
  const featureData = { type: 'FeatureCollection', features: [] }
  const labelData = advisoryItemsToLabelFeatureCollection({
    items: [{
      id: 'sigmet-1',
      phenomenon_code: 'TURB',
      sequence_number: '002',
      altitude: { lower_fl: null, upper_fl: 350 },
      motion: { direction_deg: 90, speed_kt: 15 },
      intensity_change: 'NC',
      bbox: { min_lon: 126, max_lon: 128, min_lat: 36, max_lat: 38 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]],
      },
    }],
  }, 'sigmet')

  addAdvisoryLayers(map, 'sigmet', featureData, labelData)

  assert.ok(map.getLayer(ADVISORY_LAYER_DEFS.sigmet.iconLayerId))
  assert.ok(map.getLayer(ADVISORY_LAYER_DEFS.sigmet.arrowLayerId))
  const textLayer = map.getLayer(ADVISORY_LAYER_DEFS.sigmet.textLayerId)
  assert.ok(textLayer?.layout?.['text-field'])

  const [feature] = labelData.features
  assert.equal(feature.properties.chartLine1, 'TOP FL 350   15KT')
  assert.equal(feature.properties.chartLine2, 'NC')
  assert.equal(feature.properties.motionDirection, 90)

  const arrowLayer = map.getLayer(ADVISORY_LAYER_DEFS.sigmet.arrowLayerId)
  // icon-offset would rotate together with icon-rotate and drift into the text —
  // position must come from icon-translate (paint), which stays fixed regardless of rotation.
  assert.equal(arrowLayer.layout?.['icon-offset'], undefined)
  assert.deepEqual(arrowLayer.paint?.['icon-translate'], [42, -26])
})

test('spelled-out intensity codes are abbreviated to match the standard chart format', () => {
  const labelData = advisoryItemsToLabelFeatureCollection({
    items: [{
      id: 'sigmet-2',
      phenomenon_code: 'EMBD_TS',
      altitude: { lower_fl: null, upper_fl: 350 },
      intensity_change: 'NO_CHANGE',
      geometry: {
        type: 'Polygon',
        coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]],
      },
    }],
  }, 'sigmet')

  assert.equal(labelData.features[0].properties.chartLine2, 'NC')
})

test('surface-visibility AIRMETs without altitude/motion still show visibility + intensity', () => {
  const map = createMap()
  const featureData = { type: 'FeatureCollection', features: [] }
  const labelData = advisoryItemsToLabelFeatureCollection({
    items: [{
      id: 'airmet-1',
      phenomenon_code: 'SFC_VIS',
      altitude: { lower_fl: null, upper_fl: null },
      motion: { direction_deg: null, speed_kt: 0 },
      intensity_change: 'INTENSIFY', // real KMA data uses this, not "INTENSIFYING"
      surface_visibility_m: 5000,
      surface_visibility_causes: ['RA', 'FG', 'BR'],
      geometry: {
        type: 'Polygon',
        coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]],
      },
    }],
  }, 'airmet')

  const [feature] = labelData.features
  assert.equal(feature.properties.chartLine1, 'VIS 5000M RA/FG/BR')
  assert.equal(feature.properties.chartLine2, 'INTSF')
  assert.equal(feature.properties.motionDirection, null)

  addAdvisoryLayers(map, 'airmet', featureData, labelData)
  const textLayer = map.getLayer(ADVISORY_LAYER_DEFS.airmet.textLayerId)
  // both lines present and non-empty -> layer's filter must not exclude this feature
  assert.deepEqual(textLayer.filter, ['any', ['!=', ['get', 'chartLine1'], ''], ['!=', ['get', 'chartLine2'], '']])
})
