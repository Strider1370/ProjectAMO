import assert from 'node:assert/strict'
import test from 'node:test'

import {
  INITIAL_WISSDOM_HEIGHT_M,
  deriveRadarWindOverlayState,
  resolveVerticalRailSource,
} from './useRadarWindOverlay.js'

test('WISSDOM defaults to the configured 1,524 m height', () => {
  assert.equal(INITIAL_WISSDOM_HEIGHT_M, 1524)
  assert.deepEqual(
    deriveRadarWindOverlayState({ requestedVisible: false, radarEnabled: true, exactFrameAvailable: true }),
    { requestedVisible: false, effectiveVisible: false },
  )
})

test('WISSDOM only renders when radar is enabled and its frame exactly matches', () => {
  assert.deepEqual(
    deriveRadarWindOverlayState({ requestedVisible: true, radarEnabled: true, exactFrameAvailable: false }),
    { requestedVisible: true, effectiveVisible: false },
  )
  assert.deepEqual(
    deriveRadarWindOverlayState({ requestedVisible: true, radarEnabled: false, exactFrameAvailable: true }),
    { requestedVisible: false, effectiveVisible: false },
  )
  assert.deepEqual(
    deriveRadarWindOverlayState({ requestedVisible: true, radarEnabled: true, exactFrameAvailable: true }),
    { requestedVisible: true, effectiveVisible: true },
  )
})

test('WISSDOM keeps the selected height when an exact frame temporarily disappears', () => {
  const selectedHeightM = 2134
  const unavailable = deriveRadarWindOverlayState({
    requestedVisible: true,
    radarEnabled: true,
    exactFrameAvailable: false,
  })

  assert.equal(selectedHeightM, 2134)
  assert.equal(unavailable.effectiveVisible, false)
})

test('the vertical rail selects WISSDOM when it is the only active source', () => {
  assert.equal(resolveVerticalRailSource({ preferredSource: 'kim', kimActive: false, radarWindActive: true }), 'wissdom')
})

test('the vertical rail returns to KIM when radar turns off without changing KIM selection', () => {
  const kimSelection = { tmfc: '2026080400', hf: 3, level: '850hPa' }

  assert.equal(resolveVerticalRailSource({ preferredSource: 'wissdom', kimActive: true, radarWindActive: false }), 'kim')
  assert.deepEqual(kimSelection, { tmfc: '2026080400', hf: 3, level: '850hPa' })
})
