import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MET_LAYERS,
  RADAR_RAINRATE_LEGEND,
  SATELLITE_LAYER,
  RADAR_LAYER,
  QPF_SOURCE,
  QPF_LAYER,
  WISSDOM_SOURCE,
  WISSDOM_LAYER,
  SIGWX_LAYER,
  SIGWX_CLOUD_LAYER,
  WEATHER_OVERLAY_LAYER_IDS,
  WEATHER_OVERLAY_SOURCE_IDS,
  ensureMapImage,
  installWeatherOverlayLayers,
  syncAdvisoryLayers,
  syncLightningLayers,
  syncRasterAndSigwxLayers,
} from './weatherOverlayLayers.js'
import { LIGHTNING_SOURCE } from './lightningLayers.js'
import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'

function createMockMap() {
  const sources = new Map()
  const layers = new Map()
  const layoutCalls = []
  const paintCalls = []

  return {
    layers,
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

function syncRasterImmediately(map, options) {
  const installed = Boolean(options.visible && addOrUpdateImageOverlay(map, options))
  if (map.getLayer(options.layerId)) {
    map.setLayoutProperty(options.layerId, 'visibility', installed ? 'visible' : 'none')
  }
  return installed
}

test('weather overlay exports keep MET panel metadata intact', () => {
  assert.equal(MET_LAYERS.find((layer) => layer.id === 'sigmet')?.label, 'SIGMET')
  assert.equal(MET_LAYERS.find((layer) => layer.id === 'adsb'), undefined)
  assert.equal(RADAR_RAINRATE_LEGEND[0].label, '150')
  assert.equal(RADAR_RAINRATE_LEGEND.at(-1).label, '0.0')
})

test('routes infrared, WISSDOM, and QPF through the 200ms raster transition', () => {
  const calls = []
  syncRasterAndSigwxLayers(createMockMap(), {
    satelliteFrame: { path: '/ir.webp', bounds: [[30, 120], [40, 130]] },
    radarFrame: null,
    wissdomFrame: { path: '/wissdom.webp', bounds: [[30, 120], [40, 130]] },
    qpfFrame: { path: '/qpf.webp', bounds: [[30, 120], [40, 130]] },
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    sigwxLowMapData: null,
    visibility: { satellite: true, radar: false, radarHsr: true, radarOverseas: false, sigwx: false },
  }, {
    syncRaster: (_map, options) => calls.push(options),
  })

  assert.deepEqual(calls.slice(0, 3).map(({ sourceId, transitionMs, visible }) => ({ sourceId, transitionMs, visible })), [
    { sourceId: 'kma-satellite-overlay', transitionMs: 200, visible: true },
    { sourceId: 'kma-wissdom-overlay', transitionMs: 200, visible: true },
    { sourceId: 'kma-qpf-overlay', transitionMs: 200, visible: true },
  ])
  assert.equal(calls[0].opacity, 1)
  assert.equal(calls[0].beforeLayerId, 'gk2a-visible-overlay')
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
  }, { syncRaster: syncRasterImmediately })

  assert.ok(map.getLayer(SATELLITE_LAYER))
  assert.ok(map.getLayer(RADAR_LAYER))
  assert.ok(map.getLayer(SIGWX_LAYER))
  assert.ok(map.getLayer(SIGWX_CLOUD_LAYER))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === SATELLITE_LAYER && prop === 'visibility' && value === 'visible'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === RADAR_LAYER && prop === 'visibility' && value === 'none'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === SIGWX_LAYER && prop === 'visibility' && value === 'visible'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === SIGWX_CLOUD_LAYER && prop === 'visibility' && value === 'none'))
})

test('syncRasterAndSigwxLayers does not load SIGWX icons when the SIGWX layer is hidden', () => {
  const map = createMockMap()
  const loadedUrls = []
  map.hasImage = (id) => String(id).startsWith('sigwx-chip-') || String(id).startsWith('lightning-')
  map.loadImage = (url, callback) => {
    loadedUrls.push(url)
    callback(null, { url })
  }

  syncRasterAndSigwxLayers(map, {
    satelliteFrame: { path: '/sat.png', bounds: [[30, 120], [40, 130]] },
    radarFrame: { path: '/radar.png', bounds: [[30, 120], [40, 130]] },
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    sigwxLowMapData: {
      polygons: { type: 'FeatureCollection', features: [] },
      lines: { type: 'FeatureCollection', features: [] },
      labels: { type: 'FeatureCollection', features: [] },
      icons: { type: 'FeatureCollection', features: [] },
      arrowLabels: { type: 'FeatureCollection', features: [] },
      textChips: { type: 'FeatureCollection', features: [] },
      iconImages: [{ id: 'sigwx-test-mist.png', url: '/Symbols/Reference%20Symbols/icon_sigwx/test-mist.png' }],
    },
    visibility: { satellite: true, radar: true, sigwx: false },
    showVisibleSigwxFrontOverlay: false,
    showVisibleSigwxCloudOverlay: false,
  }, { syncRaster: syncRasterImmediately })

  assert.deepEqual(loadedUrls, [])
})

test('syncRasterAndSigwxLayers loads SIGWX icons when the SIGWX layer is visible', () => {
  const map = createMockMap()
  const loadedUrls = []
  map.hasImage = (id) => String(id).startsWith('sigwx-chip-') || String(id).startsWith('lightning-')
  map.loadImage = (url, callback) => {
    loadedUrls.push(url)
    callback(null, { url })
  }

  syncRasterAndSigwxLayers(map, {
    satelliteFrame: null,
    radarFrame: null,
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    sigwxLowMapData: {
      polygons: { type: 'FeatureCollection', features: [] },
      lines: { type: 'FeatureCollection', features: [] },
      labels: { type: 'FeatureCollection', features: [] },
      icons: { type: 'FeatureCollection', features: [] },
      arrowLabels: { type: 'FeatureCollection', features: [] },
      textChips: { type: 'FeatureCollection', features: [] },
      iconImages: [{ id: 'sigwx-test-visible-mist.png', url: '/Symbols/Reference%20Symbols/icon_sigwx/test-visible-mist.png' }],
    },
    visibility: { satellite: false, radar: false, sigwx: true },
    showVisibleSigwxFrontOverlay: false,
    showVisibleSigwxCloudOverlay: false,
  }, { syncRaster: syncRasterImmediately })

  assert.deepEqual(loadedUrls, ['/Symbols/Reference%20Symbols/icon_sigwx/test-visible-mist.png'])
})

test('styleimagemissing loads a registered SIGWX icon on demand', () => {
  const map = createMockMap()
  const handlers = []
  const loadedUrls = []
  const url = '/Symbols/Reference%20Symbols/icon_sigwx/test-missing-mist.png'

  map.hasImage = (id) => String(id).startsWith('sigwx-chip-') || String(id).startsWith('lightning-')
  map.on = (event, handler) => {
    if (event === 'styleimagemissing') handlers.push(handler)
  }
  map.loadImage = (imageUrl, callback) => {
    loadedUrls.push(imageUrl)
    callback(null, { url: imageUrl })
  }

  installWeatherOverlayLayers(map)
  syncRasterAndSigwxLayers(map, {
    satelliteFrame: null,
    radarFrame: null,
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    sigwxLowMapData: {
      polygons: { type: 'FeatureCollection', features: [] },
      lines: { type: 'FeatureCollection', features: [] },
      labels: { type: 'FeatureCollection', features: [] },
      icons: { type: 'FeatureCollection', features: [] },
      arrowLabels: { type: 'FeatureCollection', features: [] },
      textChips: { type: 'FeatureCollection', features: [] },
      iconImages: [{ id: 'sigwx-test-missing-mist.png', url }],
    },
    visibility: { satellite: false, radar: false, sigwx: false },
    showVisibleSigwxFrontOverlay: false,
    showVisibleSigwxCloudOverlay: false,
  }, { syncRaster: syncRasterImmediately })

  handlers[0]?.({ id: 'sigwx-test-missing-mist.png' })

  assert.equal(handlers.length, 1)
  assert.deepEqual(loadedUrls, [url])
})

test('syncAdvisoryLayers and syncLightningLayers update installed sources and visibility', () => {
  const map = createMockMap()
  const empty = { type: 'FeatureCollection', features: [] }

  syncAdvisoryLayers(map, {
    sigmetFeatures: empty,
    sigmetLabels: empty,
    sigmetIntlFeatures: empty,
    sigmetIntlLabels: empty,
    airmetFeatures: empty,
    airmetLabels: empty,
    visibility: { sigmet: true, sigmet_intl: true, airmet: false },
  })
  syncLightningLayers(map, {
    lightningGeoJSON: empty,
    visibility: { lightning: true },
    blinkLightning: true,
    lightningBlinkOff: false,
  })

  assert.ok(map.getSource(LIGHTNING_SOURCE))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === 'kma-sigmet-advisories-fill' && prop === 'visibility' && value === 'visible'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === 'noaa-sigmet-advisories-fill' && prop === 'visibility' && value === 'visible'))
  assert.ok(map.layoutCalls.some(([id, prop, value]) => id === 'kma-airmet-advisories-fill' && prop === 'visibility' && value === 'none'))
  assert.ok(map.paintCalls.some(([id, prop]) => id === 'kma-lightning-ground' && prop === 'icon-opacity'))
})

test('weather overlay ownership exports are unique', () => {
  assert.equal(new Set(WEATHER_OVERLAY_SOURCE_IDS).size, WEATHER_OVERLAY_SOURCE_IDS.length)
  assert.equal(new Set(WEATHER_OVERLAY_LAYER_IDS).size, WEATHER_OVERLAY_LAYER_IDS.length)
})

test('weather overlay sync keeps WISSDOM above radar and QPF above WISSDOM', () => {
  const map = createMockMap()
  const bounds = [[30, 120], [40, 130]]

  installWeatherOverlayLayers(map)
  syncRasterAndSigwxLayers(map, {
    satelliteFrame: null,
    radarFrame: { path: '/radar.webp', bounds },
    wissdomFrame: { path: '/wissdom.webp', bounds },
    qpfFrame: { path: '/qpf.webp', bounds },
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    sigwxLowMapData: null,
    visibility: { satellite: false, radar: true, radarOverseas: false, sigwx: false },
    showVisibleSigwxFrontOverlay: false,
    showVisibleSigwxCloudOverlay: false,
  }, { syncRaster: syncRasterImmediately })

  const layerOrder = [...map.layers.keys()]
  assert.ok(layerOrder.indexOf(RADAR_LAYER) < layerOrder.indexOf(WISSDOM_LAYER))
  assert.ok(layerOrder.indexOf(WISSDOM_LAYER) < layerOrder.indexOf(QPF_LAYER))
  assert.equal(map.getLayer(WISSDOM_LAYER).slot, 'middle')
  assert.equal(map.getLayer(QPF_LAYER).slot, 'middle')
  assert.equal(map.getLayer('kma-sigmet-advisories-fill').slot, 'top')
})

test('weather overlay installation preserves WISSDOM and QPF ownership on a fresh style', () => {
  const map = createMockMap()
  const bounds = [[30, 120], [40, 130]]

  installWeatherOverlayLayers(map)
  syncRasterAndSigwxLayers(map, {
    satelliteFrame: null,
    radarFrame: { path: '/radar.webp', bounds },
    wissdomFrame: { path: '/wissdom.webp', bounds },
    qpfFrame: { path: '/qpf.webp', bounds },
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    sigwxLowMapData: null,
    visibility: { satellite: false, radar: true, radarOverseas: false, sigwx: false },
    showVisibleSigwxFrontOverlay: false,
    showVisibleSigwxCloudOverlay: false,
  }, { syncRaster: syncRasterImmediately })

  assert.ok(map.getLayer(WISSDOM_LAYER))
  assert.ok(map.getLayer(QPF_LAYER))
  assert.ok(WEATHER_OVERLAY_SOURCE_IDS.includes(WISSDOM_SOURCE))
  assert.ok(WEATHER_OVERLAY_SOURCE_IDS.includes(QPF_SOURCE))
  assert.ok(WEATHER_OVERLAY_LAYER_IDS.includes(WISSDOM_LAYER))
  assert.ok(WEATHER_OVERLAY_LAYER_IDS.includes(QPF_LAYER))
})

test('installWeatherOverlayLayers can run with empty data', () => {
  const map = createMockMap()
  installWeatherOverlayLayers(map)
  assert.ok(map.getSource('kma-sigmet-advisories'))
  assert.ok(map.getSource(LIGHTNING_SOURCE))
  assert.ok(map.getLayer('kma-sigmet-advisories-fill'))
  assert.ok(map.getLayer('kma-lightning-ground'))
  assert.ok(map.getLayer('kma-lightning-cloud'))
  for (const layerId of map.layers.keys()) {
    assert.ok(WEATHER_OVERLAY_LAYER_IDS.includes(layerId), `${layerId} is missing from WEATHER_OVERLAY_LAYER_IDS`)
  }
})

test('ensureMapImage avoids duplicate loads while a SIGWX icon is pending', () => {
  const images = new Map()
  const loadCalls = []
  const map = {
    hasImage(id) {
      return images.has(id)
    },
    addImage(id, image) {
      images.set(id, image)
    },
    loadImage(url, callback) {
      loadCalls.push({ url, callback })
    },
  }

  ensureMapImage(map, { id: 'sigwx-widespread_mist.png', url: '/Symbols/Reference%20Symbols/icon_sigwx/widespread_mist.png' })
  ensureMapImage(map, { id: 'sigwx-widespread_mist.png', url: '/Symbols/Reference%20Symbols/icon_sigwx/widespread_mist.png' })

  assert.equal(loadCalls.length, 1)
})

test('ensureMapImage avoids reloading a SIGWX icon after it was already added for the map', () => {
  const loadCalls = []
  const map = {
    hasImage() {
      return false
    },
    addImage() {},
    loadImage(url, callback) {
      loadCalls.push({ url, callback })
    },
  }

  ensureMapImage(map, { id: 'sigwx-widespread_mist.png', url: '/Symbols/Reference%20Symbols/icon_sigwx/widespread_mist.png' })
  loadCalls[0].callback(null, { url: loadCalls[0].url })
  ensureMapImage(map, { id: 'sigwx-widespread_mist.png', url: '/Symbols/Reference%20Symbols/icon_sigwx/widespread_mist.png' })

  assert.equal(loadCalls.length, 1)
})
