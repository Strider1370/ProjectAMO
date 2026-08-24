import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ADVISORY_LAYER_DEFS,
  addAdvisoryLayers,
  advisorySymbolUrl,
  advisoryItemsToFeatureCollection,
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

test('advisory marker layers retain their shared interior point data', () => {
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

  assert.ok(map.getLayer(ADVISORY_LAYER_DEFS.sigmet.fillLayerId))
  assert.ok(map.getLayer(ADVISORY_LAYER_DEFS.sigmet.lineLayerId))
  assert.ok(map.getLayer(ADVISORY_LAYER_DEFS.sigmet.iconLayerId))
  assert.equal(map.getLayer(ADVISORY_LAYER_DEFS.sigmet.arrowLayerId), null)

  const [feature] = labelData.features
  assert.equal(feature.properties.chartLine1, 'TOP FL 350')
  assert.equal(feature.properties.chartLine2, 'NC')
  assert.equal(feature.properties.motionLabel, '15KT')
  assert.equal(feature.properties.motionDirection, 90)
  assert.equal(feature.properties.markerKey, 'sigmet-TURB-90-15KT')

})

test('frequent thunderstorm uses the shared thunderstorm symbol', () => {
  assert.match(advisorySymbolUrl('sigmet_intl', 'FRQ_TS'), /icon_SIGMET\/TS\.png$/)
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

})



test('advisory popup fields keep the pilot-facing label, validity, altitude, and motion', () => {
  const data = advisoryItemsToFeatureCollection({
    items: [{ id: 'sigmet-popup', phenomenon_code: 'OBSC_TS', sequence_number: 'J02', valid_from: '2026-07-22T05:00:00.000Z', valid_to: '2026-07-22T09:00:00.000Z', altitude: { lower_fl: null, upper_fl: 350 }, motion: { direction_deg: 68, speed_kt: 25 }, geometry: { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] } }],
  }, 'sigmet')
  const { properties } = data.features[0]
  assert.equal(properties.label, 'SIGMET J02 가림뇌우')
  assert.equal(properties.phenomenonLabel, '가림뇌우')
  assert.equal(properties.validity, '07/22 14:00 KST ~ 07/22 18:00 KST')
  assert.equal(properties.altitude, '상한 FL350 · 하한 미제공')
  assert.equal(properties.motion, '68deg 25KT')
  const overseas = advisoryItemsToFeatureCollection({
    items: [{ id: 'sigmet-motion', source: 'NOAA', fir: 'WAAF', phenomenon_code: 'VA', motion: { direction_text: 'NE', direction_deg: 45, speed_kt: 15 }, geometry: { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] } }],
  }, 'sigmet_intl')
  assert.equal(overseas.features[0].properties.motion, 'NE 15KT')
})

test('advisory popup altitude distinguishes an explicit surface base from an unspecified base', () => {
  const data = advisoryItemsToFeatureCollection({
    items: [
      { id: 'surface-base', altitude: { lower_fl: 0, upper_fl: 100, lower_ref: 'SFC' }, geometry: { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] } },
      { id: 'top-only', altitude: { lower_fl: null, upper_fl: 320 }, geometry: { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] } },
    ],
  }, 'sigmet')

  assert.equal(data.features[0].properties.altitude, 'SFC-FL100')
  assert.equal(data.features[1].properties.altitude, '상한 FL320 · 하한 미제공')
})

test('overseas SIGMET labels retain the FIR that scopes its sequence number', () => {
  const data = advisoryItemsToFeatureCollection({
    items: [{ id: 'sigmet-overseas', source: 'NOAA', fir: 'ZBPE', sequence_number: '1', phenomenon_code: 'EMBD_TS', geometry: { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] } }],
  }, 'sigmet_intl')
  const { properties } = data.features[0]
  assert.equal(properties.label, 'SIGMET 1 · ZBPE (베이징 FIR) 차폐뇌우')
  assert.equal(properties.fir, 'ZBPE (베이징 FIR)')
})

// 강풍 AIRMET은 고도도 시정도 없어 chartLine1이 비고, motion.speed_kt는 현상의 이동속도라 0이다.
// 기호 안에 찍을 풍속은 surface_wind에서만 나온다 — 여기가 끊기면 마름모가 다시 빈 채로 그려진다.
test('surface wind AIRMET carries the wind speed itself, not the phenomenon motion speed', () => {
  const geometry = { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] }
  const data = advisoryItemsToLabelFeatureCollection({
    items: [
      { id: 'sfc-wind', phenomenon_code: 'SFC_WIND', motion: { direction_deg: null, speed_kt: 0 }, surface_wind: { direction_deg: 270, speed_kt: 30 }, geometry },
      { id: 'sfc-vis', phenomenon_code: 'SFC_VIS', surface_visibility_m: 5000, surface_visibility_causes: ['FG', 'BR'], surface_wind: { direction_deg: null, speed_kt: null }, geometry },
    ],
  }, 'airmet')

  assert.equal(data.features[0].properties.windLabel, '30')
  assert.equal(data.features[0].properties.motionLabel, '')
  assert.equal(data.features[1].properties.windLabel, '')
  assert.equal(data.features[1].properties.chartLine1, 'VIS 5000M FG/BR')
})
