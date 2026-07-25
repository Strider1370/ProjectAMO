import assert from 'node:assert/strict'
import test from 'node:test'
import { collectSite, process as runEchoTop } from '../src/processors/echo-top-processor.js'
import { loadRadarBounds } from '../src/parsers/radar-echo-parser.js'

const requestedMs = Date.UTC(2026, 6, 25, 11, 35)
const goodVolume = { latitude: 37.44, longitude: 126.96, altitudeM: 500, rangeM: Float32Array.from([10000]), sweeps: [], timeCoverageStart: '2026-07-25T11:36:10Z' }

test('a file whose observation falls in the requested bucket is accepted', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => Buffer.from('x'), parseVolume: async () => goodVolume },
  })
  assert.equal(result.status, 'ok')
  assert.equal(result.observedAt, '2026-07-25T11:35:00.000Z')
})

test('a file from the previous bucket is rejected as stale, never republished', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => Buffer.from('x'), parseVolume: async () => ({ ...goodVolume, timeCoverageStart: '2026-07-25T11:28:00Z' }) },
  })
  assert.equal(result.status, 'stale')
  assert.equal(result.volume, null)
})

test('a missing file is reported as missing, not as a crash', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => null, parseVolume: async () => goodVolume },
  })
  assert.equal(result.status, 'missing')
})

test('a parse failure is reported as failed with its reason', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => Buffer.from('x'), parseVolume: async () => { throw new Error('bad header') } },
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'bad header')
})

test('one failing site does not discard the healthy sites', async () => {
  const published = []
  const result = await runEchoTop({
    config: { radar_echo_top: { enabled: true, sites: ['AAA', 'BBB'], threshold_dbz: 18, concurrency: 2, timeout_ms: 1000, retry: 0, delay_minutes: 15, max_frames: 3, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    fetchFile: async (stn) => (stn === 'BBB' ? null : Buffer.from('x')),
    parseVolume: async () => goodVolume,
    publish: (payload) => { published.push(payload); return { tm: payload.tm } },
    now: () => new Date(Date.UTC(2026, 6, 25, 11, 50)),
  })
  assert.equal(result.saved, true)
  assert.equal(published.length, 1)
  assert.deepEqual(published[0].sites.map((s) => s.status), ['ok', 'missing'])
})

test('when no site produces a valid frame nothing is published', async () => {
  const published = []
  const result = await runEchoTop({
    config: { radar_echo_top: { enabled: true, sites: ['AAA'], threshold_dbz: 18, concurrency: 1, timeout_ms: 1000, retry: 0, delay_minutes: 15, max_frames: 3, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    fetchFile: async () => null,
    parseVolume: async () => goodVolume,
    publish: (payload) => { published.push(payload); return { tm: payload.tm } },
    now: () => new Date(Date.UTC(2026, 6, 25, 11, 50)),
  })
  assert.equal(result.saved, false)
  assert.equal(published.length, 0)
})

test('an empty site list fails loudly instead of publishing an empty frame', async () => {
  const result = await runEchoTop({
    config: { radar_echo_top: { enabled: true, sites: [], concurrency: 1, timeout_ms: 1, retry: 0, delay_minutes: 15, max_frames: 3, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    now: () => new Date(Date.UTC(2026, 6, 25, 11, 50)),
  })
  assert.equal(result.saved, false)
  assert.equal(result.reason, 'no sites configured')
})

test('published frame bounds match radar bounds exactly', async () => {
  const published = []
  await runEchoTop({
    config: { radar_echo_top: { enabled: true, sites: ['AAA'], threshold_dbz: 18, concurrency: 1, timeout_ms: 1000, retry: 0, delay_minutes: 15, max_frames: 3, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    fetchFile: async () => Buffer.from('x'),
    parseVolume: async () => goodVolume,
    publish: (payload) => { published.push(payload); return { tm: payload.tm } },
    now: () => new Date(Date.UTC(2026, 6, 25, 11, 50)),
  })
  assert.equal(published.length, 1)
  const { west, south, east, north } = loadRadarBounds()
  const expectedBounds = [[south, west], [north, east]]
  assert.deepEqual(published[0].bounds, expectedBounds)
})
