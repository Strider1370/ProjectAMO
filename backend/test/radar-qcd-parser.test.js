import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
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
const fixtureDir = path.join(process.cwd(), '..', 'artifacts', 'radar-qcd')
const fixture = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).find((f) => f.endsWith('.h5')) : null

test('parses a real QCD volume', { skip: fixture ? false : 'no artifacts/radar-qcd/*.h5 fixture' }, async () => {
  const buffer = fs.readFileSync(path.join(fixtureDir, fixture))
  const volume = await parseQcdVolume(buffer, { stn: fixture.slice(0, 3) })

  assert.ok(Number.isFinite(volume.latitude) && Number.isFinite(volume.longitude))
  assert.ok(Number.isFinite(volume.altitudeM))
  assert.ok(volume.rangeM.length > 0)
  assert.ok(volume.sweeps.length > 0)
  assert.ok(volume.sweeps.every((s) => Number.isFinite(s.elevationDeg) && s.azimuthDeg.length > 0))
  assert.ok(volume.sweeps.every((s) => s.dbz.length === s.azimuthDeg.length * volume.rangeM.length))
  assert.match(volume.timeCoverageStart, /^\d{4}-\d{2}-\d{2}T/)
  // 검증 표본 기준: 스케일 적용 후 dBZ가 물리적으로 타당한 범위에 있어야 한다.
  const first = volume.sweeps[0]
  const scaled = [...first.dbz].filter((v) => v !== first.fillValue).map((v) => v * first.scaleFactor)
  assert.ok(scaled.every((v) => v > -40 && v < 100))
})
