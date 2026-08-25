import test from 'node:test'
import assert from 'node:assert/strict'

import { syncKmaCompositeLayers } from './kmaCompositeLayers.js'

test('routes HSR, HCI, and visible satellite through the 200ms raster transition', () => {
  const calls = []
  syncKmaCompositeLayers({}, {
    hsrMeta: { frames: [{ timeMs: 1, path: '/hsr.webp', bounds: [[30, 120], [40, 130]] }] },
    hciMeta: { frames: [{ timeMs: 1, path: '/hci.webp', bounds: [[30, 120], [40, 130]] }] },
    visibleMeta: { frames: [{ timeMs: 1, path: '/visible.webp', bounds: [[30, 120], [40, 130]] }] },
    selectedMs: 1,
    visibility: { radarHsr: true, radarHci: true, satelliteVisible: true },
  }, {
    syncRaster: (_map, options) => calls.push(options),
  })

  assert.deepEqual(calls.map(({ sourceId, transitionMs, visible }) => ({ sourceId, transitionMs, visible })), [
    { sourceId: 'kma-hsr-overlay', transitionMs: 200, visible: true },
    { sourceId: 'kma-hci-overlay', transitionMs: 200, visible: true },
    { sourceId: 'gk2a-visible-overlay', transitionMs: 200, visible: true },
  ])
  assert.equal(calls.find((call) => call.sourceId === 'gk2a-visible-overlay').opacity, 1)
  assert.deepEqual(calls.find((call) => call.sourceId === 'gk2a-visible-overlay').rasterPaint, {
    'raster-brightness-min': 0.12,
    'raster-brightness-max': 1,
    'raster-contrast': 0,
  })
  assert.equal(calls.find((call) => call.sourceId === 'gk2a-visible-overlay').beforeLayerId, 'kma-radar-overlay')
})

test('applies the requested visible-satellite brightness and contrast without changing radar priority', () => {
  const calls = []
  syncKmaCompositeLayers({}, {
    visibleMeta: { frames: [{ timeMs: 1, path: '/visible.webp', bounds: [[30, 120], [40, 130]] }] },
    selectedMs: 1,
    visibleSatelliteVisuals: { brightness: 24, contrast: 30 },
    visibility: { satelliteVisible: true },
  }, {
    syncRaster: (_map, options) => calls.push(options),
  })

  const visible = calls.find((call) => call.sourceId === 'gk2a-visible-overlay')
  assert.equal(visible.opacity, 1)
  assert.deepEqual(visible.rasterPaint, {
    'raster-brightness-min': 0.24,
    'raster-brightness-max': 1,
    'raster-contrast': 0.3,
  })
})

test('selects raw KMA tm metadata at the requested frame time', () => {
  const calls = []
  syncKmaCompositeLayers({}, {
    hsrMeta: { frames: [{ tm: '202608041025', path: '/hsr.webp', bounds: [[30, 120], [40, 130]] }] },
    selectedMs: Date.UTC(2026, 7, 4, 1, 25),
    visibility: { radarHsr: true },
  }, {
    syncRaster: (_map, options) => calls.push(options),
  })

  assert.equal(calls[0].frame?.path, '/hsr.webp')
  assert.equal(calls[0].visible, true)
})

test('hides HSR while the selected QPF forecast replaces observed precipitation', () => {
  const calls = []
  syncKmaCompositeLayers({}, {
    hsrMeta: { frames: [{ timeMs: 1, path: '/hsr.webp', bounds: [[30, 120], [40, 130]] }] },
    qpfFrame: { validTimeMs: 2, path: '/qpf.webp', bounds: [[30, 120], [40, 130]] },
    selectedMs: 2,
    visibility: { radarHsr: true },
  }, {
    syncRaster: (_map, options) => calls.push(options),
  })

  assert.equal(calls[0].frame, null)
  assert.equal(calls[0].visible, false)
})
