import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { isSameFiveMinuteBucket, observedBucketMs, parseQcdVolume } from '../src/parsers/radar-qcd-parser.js'

test('observation time is floored to its 5-minute bucket', () => {
  const ms = observedBucketMs({ timeCoverageStart: '2026-07-25T11:37:41Z' })
  assert.equal(new Date(ms).toISOString(), '2026-07-25T11:35:00.000Z')
})

test('a missing or malformed observation time yields null', () => {
  assert.equal(observedBucketMs({ timeCoverageStart: null }), null)
  assert.equal(observedBucketMs({ timeCoverageStart: 'not-a-time' }), null)
})

test('bucket comparison accepts the same bucket and rejects the neighbour', () => {
  const requested = Date.UTC(2026, 6, 25, 11, 35)
  assert.equal(isSameFiveMinuteBucket(Date.UTC(2026, 6, 25, 11, 35), requested), true)
  assert.equal(isSameFiveMinuteBucket(Date.UTC(2026, 6, 25, 11, 30), requested), false)
  assert.equal(isSameFiveMinuteBucket(null, requested), false)
})

// 실제 HDF5 표본은 Task 1이 artifacts/radar-qcd/ 에 받아 둔다(비커밋). 없으면 건너뛴다.
// Resolve fixture dir relative to this test file, not process.cwd(), so test runs consistently from any cwd
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'artifacts', 'radar-qcd')
const fixture = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).find((f) => f.endsWith('.h5')) : null

test('parses a real QCD volume with all 9 sweeps (ragged format)', { skip: fixture ? false : 'no artifacts/radar-qcd/*.h5 fixture' }, async () => {
  const buffer = fs.readFileSync(path.join(fixtureDir, fixture))
  const volume = await parseQcdVolume(buffer, { stn: fixture.slice(0, 3) })

  // All 9 sweeps must be present (critical: top 2 elevations are for echo-top)
  assert.equal(volume.sweeps.length, 9, `Should have all 9 sweeps, got ${volume.sweeps.length}`)

  // All rays accounted for: 9 sweeps × 360 rays each = 3,240 total
  const totalRays = volume.sweeps.reduce((sum, s) => sum + s.azimuthDeg.length, 0)
  assert.equal(totalRays, 3240, `Should have 3,240 total rays, got ${totalRays}`)

  // Verify location and structure
  assert.ok(Number.isFinite(volume.latitude) && Number.isFinite(volume.longitude))
  assert.ok(Number.isFinite(volume.altitudeM))
  assert.equal(volume.rangeM.length, 960, 'Should have 960 gates uniformly')

  // Each sweep produces uniform output (960 gates per ray), even if input is ragged
  assert.ok(volume.sweeps.every((s) => s.dbz.length === s.azimuthDeg.length * volume.rangeM.length),
    'Each sweep dbz must be ray-major with 960 gates per ray')

  // High elevation sweeps (7 and 8: ~7.6° and ~15°) must be present for echo-top
  const sweep7 = volume.sweeps[7]
  const sweep8 = volume.sweeps[8]
  assert.ok(sweep7.elevationDeg > 7, `Sweep 7 should be >7°, got ${sweep7.elevationDeg}°`)
  assert.ok(sweep8.elevationDeg > 14, `Sweep 8 should be >14°, got ${sweep8.elevationDeg}°`)

  // Ragged layout verification: sweep 8 has 240 gates/ray, padded to 960
  // For each ray, gates 240–959 should be _FillValue (padding)
  const gateCount = volume.rangeM.length
  const sweep8GatesPerRay = 240
  const expectedPaddingPerRay = gateCount - sweep8GatesPerRay

  let paddingCount = 0
  for (let r = 0; r < sweep8.azimuthDeg.length; r++) {
    for (let g = sweep8GatesPerRay; g < gateCount; g++) {
      if (sweep8.dbz[r * gateCount + g] === sweep8.fillValue) {
        paddingCount++
      }
    }
  }
  const expectedPaddingTotal = sweep8.azimuthDeg.length * expectedPaddingPerRay
  assert.equal(paddingCount, expectedPaddingTotal,
    `Sweep 8 should have ${expectedPaddingTotal} padding entries (all rays × 720 gates), got ${paddingCount}`)

  // Scale factor and fill value present
  const first = volume.sweeps[0]
  assert.ok(Number.isFinite(first.scaleFactor) && first.scaleFactor > 0)
  assert.equal(first.fillValue, -32768)

  // Scaled values in physical range (ignoring fill)
  const scaled = [...first.dbz].filter((v) => v !== first.fillValue).map((v) => v * first.scaleFactor)
  assert.ok(scaled.every((v) => v > -40 && v < 100))

  assert.match(volume.timeCoverageStart, /^\d{4}-\d{2}-\d{2}T/)
})
