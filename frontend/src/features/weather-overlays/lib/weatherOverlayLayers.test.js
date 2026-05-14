import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MET_LAYERS,
  RADAR_RAINRATE_LEGEND,
  SATELLITE_LAYER,
  RADAR_LAYER,
  SIGWX_LAYER,
  SIGWX_CLOUD_LAYER,
  syncAdvisoryLayers,
  syncLightningLayers,
  syncRasterAndSigwxLayers,
} from './weatherOverlayLayers.js'
import { LIGHTNING_SOURCE } from './lightningLayers.js'

function createMockMap() {
  const sources = new Map()
  const layers = new Map()
  const layoutCalls = []
  const paintCalls = []

  return {
    layoutCalls,
    paintCalls,
    addSource(id, source) {
      sources.set(id, {
        ...source,
        setData(data) {
          this.data = data
        },
      })
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
    setLayoutProperty(id, prop, value) {
      layoutCalls.push([id, prop, value])
    },
    setPaintProperty(id, prop, value) {
      paintCalls.push([id, prop, value])
    },
    hasImage() {
      return true
    },
    addImage() {},
    loadImage(url, callback) {
      callback(null, { url })
    },
  }
}

test('weather overlay exports keep MET panel metadata intact', () => {
  assert.equal(MET_LAYERS.find((layer) => layer.id === 'sigmet')?.label, 'SIGMET')
  assert.equal(MET_LAYERS.find((layer) => layer.id === 'adsb')?.label, 'ADS-B')
  assert.equal(RADAR_RAINRATE_LEGEND[0].label, '150')
  assert.equal(RADAR_RAINRATE_LEGEND.at(-1).label, '0.0')
})

test('syncRasterAndSigwxLayers installs raster overlays and visibility from the weather model', () => {
  const map = createMockMap()

  syncRasterAndSigwxLayers(map, {
    satelliteFrame: { path: '/sat.png', bounds: [[30, 120], [40, 130]] },
    radarFrame: { path: '/radar.png', bounds: [[30, 120], [40, 130]] },
    selectedSigwxFrontMeta: { path: '/sigwx-front.png', bounds: [[30, 120], [40, 130]] },
    selectedSigwxCloudMeta: { path: '/sigwx-cloud.png', bounds: [[30, 120], [40, 130]] },
    sigwxLowMapData: null,
    visibility: { satellite: true, radar: false, sigwx: true },
    showVisibleSigwxFrontOverlay: true,
    showVisibleSigwxCloudOverlay: false,
  })

  assert.ok(map.getLayer(SATELLITE_LAYER))
  assert.ok(map.getLayer(RADAR_LAYER))
  assert.ok(map.getLayer(SIGWX_LAYER))
  assert.ok(map.getLayer(SIGWX_CLOUD_LAYER))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === SATELLITE_LAYER && prop === 'visibility' && value === 'visible'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === RADAR_LAYER && prop === 'visibility' && value === 'none'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === SIGWX_LAYER && prop === 'visibility' && value === 'visible'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === SIGWX_CLOUD_LAYER && prop === 'visibility' && value === 'none'))
})

test('syncAdvisoryLayers and syncLightningLayers update installed sources and visibility', () => {
  const map = createMockMap()
  const empty = { type: 'FeatureCollection', features: [] }

  syncAdvisoryLayers(map, {
    sigmetFeatures: empty,
    sigmetLabels: empty,
    airmetFeatures: empty,
    airmetLabels: empty,
    visibility: { sigmet: true, airmet: false },
  })
  syncLightningLayers(map, {
    lightningGeoJSON: empty,
    visibility: { lightning: true },
    blinkLightning: true,
    lightningBlinkOff: false,
  })

  assert.ok(map.getSource(LIGHTNING_SOURCE))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === 'kma-sigmet-advisories-fill' && prop === 'visibility' && value === 'visible'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === 'kma-airmet-advisories-fill' && prop === 'visibility' && value === 'none'))
  assert.ok(map.paintCalls.some(([id, prop]) => id === 'kma-lightning-ground' && prop === 'icon-opacity'))
})
