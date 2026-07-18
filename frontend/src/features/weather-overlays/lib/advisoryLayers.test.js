import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  advisoryItemsToLabelFeatureCollection,
  resolveAdvisoryLabelCollisions,
} from './advisoryLayers.js'

// 실제 mapbox 투영이 아니라 단순 선형 스케일 — 밀어내기 로직 자체만 검증하면 되므로 충분.
function createProjectionMap(scale = 100) {
  return {
    project: ([lng, lat]) => ({ x: lng * scale, y: -lat * scale }),
    unproject: ([x, y]) => ({ lng: x / scale, lat: -y / scale }),
  }
}

function pointFeature(coordinates) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } }
}

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

test('resolveAdvisoryLabelCollisions pushes coincident points from different kinds apart', () => {
  const map = createProjectionMap()
  const samePoint = [126, 37]
  const groups = [
    { kind: 'sigmet', labelData: { type: 'FeatureCollection', features: [pointFeature(samePoint)] } },
    { kind: 'airmet', labelData: { type: 'FeatureCollection', features: [pointFeature(samePoint)] } },
  ]

  const [sigmetGroup, airmetGroup] = resolveAdvisoryLabelCollisions(map, groups)
  const a = map.project(sigmetGroup.labelData.features[0].geometry.coordinates)
  const b = map.project(airmetGroup.labelData.features[0].geometry.coordinates)
  const distancePx = Math.hypot(a.x - b.x, a.y - b.y)

  assert.ok(distancePx >= 99, `expected pushed-apart points ~100px apart, got ${distancePx}`)
})

test('resolveAdvisoryLabelCollisions leaves well-separated points untouched', () => {
  const map = createProjectionMap()
  const groups = [
    { kind: 'sigmet', labelData: { type: 'FeatureCollection', features: [pointFeature([120, 30])] } },
    { kind: 'airmet', labelData: { type: 'FeatureCollection', features: [pointFeature([135, 40])] } },
  ]

  const [sigmetGroup, airmetGroup] = resolveAdvisoryLabelCollisions(map, groups)

  assert.deepEqual(sigmetGroup.labelData.features[0].geometry.coordinates, [120, 30])
  assert.deepEqual(airmetGroup.labelData.features[0].geometry.coordinates, [135, 40])
})

test('resolveAdvisoryLabelCollisions is a no-op when the map has no project/unproject (e.g. test mocks)', () => {
  const groups = [{ kind: 'sigmet', labelData: { type: 'FeatureCollection', features: [] } }]
  assert.equal(resolveAdvisoryLabelCollisions({}, groups), groups)
})
