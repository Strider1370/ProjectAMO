import assert from 'node:assert/strict'
import test from 'node:test'
import { MOTION_DEFAULTS, createMotionInput, deriveObservedMotion } from '../src/processors/radar-motion.js'

const geometry = {
  nx: 32,
  ny: 32,
  gridToLatLon(x, y) {
    return { lon: 126 + x / 100, lat: 38 - y / 100 }
  },
}

function echoAt(cells) {
  const refl = new Int16Array(geometry.nx * geometry.ny)
  for (const [x, y, value = 4200] of cells) refl[y * geometry.nx + x] = value
  return refl
}

const comparedFromMs = Date.UTC(2026, 6, 22, 12, 0)
const observedAtMs = comparedFromMs + 5 * 60 * 1000

test('uses the high-density 8 km sampling defaults', () => {
  assert.equal(MOTION_DEFAULTS.candidateStride, 4)
  assert.equal(MOTION_DEFAULTS.patchRadius, 6)
})

test('derives an eastbound observed-motion line from adjacent radar inputs', () => {
  const previous = createMotionInput(echoAt([[8, 12], [9, 12], [8, 13], [9, 13]]), geometry, { stride: 1 })
  const current = createMotionInput(echoAt([[10, 12], [11, 12], [10, 13], [11, 13]]), geometry, { stride: 1 })

  const result = deriveObservedMotion(previous, current, {
    observedAtMs,
    comparedFromMs,
    gridToLatLon: geometry.gridToLatLon,
    minReflectivity: 3000,
    candidateStride: 1,
    maxSearchCells: 3,
    maxCandidates: 10,
  })

  assert.equal(result.type, 'FeatureCollection')
  assert.ok(result.features.length > 0)
  const eastbound = result.features.find((feature) => feature.properties.bearingDeg > 45 && feature.properties.bearingDeg < 135)
  assert.ok(eastbound)
  assert.equal(eastbound.properties.observedAtMs, observedAtMs)
  assert.equal(eastbound.properties.comparedFromMs, comparedFromMs)
  assert.ok(eastbound.properties.speedKt > 0)
})

test('uses the published coordinate line for a northbound bearing', () => {
  const northGrid = {
    ...geometry,
    gridToLatLon(x, y) {
      return { lon: 126 + x / 100, lat: 36 + y / 100 }
    },
  }
  const previous = createMotionInput(echoAt([[12, 8], [13, 8], [12, 9], [13, 9]]), northGrid, { stride: 1 })
  const current = createMotionInput(echoAt([[12, 10], [13, 10], [12, 11], [13, 11]]), northGrid, { stride: 1 })

  const result = deriveObservedMotion(previous, current, {
    observedAtMs,
    comparedFromMs,
    gridToLatLon: northGrid.gridToLatLon,
    minReflectivity: 3000,
    candidateStride: 1,
    maxSearchCells: 3,
    maxCandidates: 10,
  })

  assert.ok(result.features.some((feature) => feature.properties.bearingDeg < 45 || feature.properties.bearingDeg > 315))
})

test('rejects uniform echo fields with no unique displacement', () => {
  const refl = new Int16Array(geometry.nx * geometry.ny).fill(4200)
  const input = createMotionInput(refl, geometry, { stride: 1 })
  const result = deriveObservedMotion(input, input, {
    gridToLatLon: geometry.gridToLatLon,
    minReflectivity: 3000,
    candidateStride: 4,
    maxSearchCells: 3,
  })

  assert.deepEqual(result.features, [])
})

test('does not publish motion for stationary or weak echoes', () => {
  const stationary = createMotionInput(echoAt([[10, 12]]), geometry, { stride: 1 })
  const weak = createMotionInput(echoAt([[10, 12, 1200]]), geometry, { stride: 1 })

  const stationaryResult = deriveObservedMotion(stationary, stationary, {
    observedAtMs,
    comparedFromMs,
    gridToLatLon: geometry.gridToLatLon,
    minReflectivity: 3000,
    candidateStride: 1,
    maxSearchCells: 3,
  })
  const weakResult = deriveObservedMotion(weak, weak, {
    observedAtMs,
    comparedFromMs,
    gridToLatLon: geometry.gridToLatLon,
    minReflectivity: 3000,
    candidateStride: 1,
    maxSearchCells: 3,
  })

  assert.deepEqual(stationaryResult.features, [])
  assert.deepEqual(weakResult.features, [])
})

test('abandons motion derivation when its deadline has already elapsed', () => {
  const previous = createMotionInput(echoAt([[8, 12], [9, 12], [8, 13], [9, 13]]), geometry, { stride: 1 })
  const current = createMotionInput(echoAt([[10, 12], [11, 12], [10, 13], [11, 13]]), geometry, { stride: 1 })
  const result = deriveObservedMotion(previous, current, {
    deadlineAtMs: Date.now() - 1,
    gridToLatLon: geometry.gridToLatLon,
    candidateStride: 1,
    maxSearchCells: 3,
  })
  assert.deepEqual(result.features, [])
})
