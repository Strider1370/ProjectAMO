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

import { buildFrameTms, missingFrameTms, tmToUtcMs, backfill } from '../src/processors/echo-top-processor.js'

test('frame tms run oldest-first at 5 minute spacing', () => {
  assert.deepEqual(buildFrameTms('202607260015', 4), ['202607260000', '202607260005', '202607260010', '202607260015'])
})

test('frame tms roll back across an hour and a day boundary', () => {
  assert.deepEqual(buildFrameTms('202607260005', 3), ['202607252355', '202607260000', '202607260005'])
})

test('tm parses to the matching UTC instant', () => {
  assert.equal(new Date(tmToUtcMs('202607260015')).toISOString(), '2026-07-25T15:15:00.000Z')
  assert.equal(tmToUtcMs('nope'), null)
})

test('only unpublished frames are backfilled', () => {
  assert.deepEqual(
    missingFrameTms('202607260015', 4, ['202607260005', '202607260015']),
    ['202607260000', '202607260010'],
  )
})

test('backfill collects the gaps oldest-first and never re-fetches what exists', async () => {
  const published = []
  const result = await backfill({
    config: { radar_echo_top: { enabled: true, sites: ['AAA'], threshold_dbz: 18, concurrency: 1, timeout_ms: 1000, retry: 0, delay_minutes: 10, max_frames: 4, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    readMeta: () => ({ frames: [{ tm: '202607260005' }] }),
    // 파일에 요청 tm을 실어 보내고, 파서가 그 시각을 관측시각으로 되돌려준다.
    // 이러면 각 프레임이 자기 시각의 자료로만 발행되는지 실제로 검증된다.
    fetchFile: async (_stn, tm) => Buffer.from(tm),
    parseVolume: async (buffer, { stn }) => ({
      stn, latitude: 37.44, longitude: 126.96, altitudeM: 500,
      rangeM: Float32Array.from([10000]), sweeps: [],
      timeCoverageStart: new Date(tmToUtcMs(buffer.toString())).toISOString(),
    }),
    publish: (payload) => { published.push(payload.tm); return { tm: payload.tm } },
    renderImage: async () => Buffer.from('webp'),
    now: () => new Date(Date.UTC(2026, 6, 25, 15, 25)),
  })
  // max_frames 4, latest tm 202607260015 -> 0000/0005/0010/0015. 0005는 이미 있다.
  assert.deepEqual(published, ['202607260000', '202607260010', '202607260015'], 'gaps only, oldest first')
  assert.equal(result.filled, 3)
  assert.equal(result.pending, 3)
})

test('backfill reports already complete when every frame exists', async () => {
  const result = await backfill({
    config: { radar_echo_top: { enabled: true, sites: ['AAA'], threshold_dbz: 18, concurrency: 1, timeout_ms: 1000, retry: 0, delay_minutes: 10, max_frames: 2, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    readMeta: () => ({ frames: [{ tm: '202607260020' }, { tm: '202607260015' }] }),
    now: () => new Date(Date.UTC(2026, 6, 25, 15, 30)),
  })
  assert.equal(result.reason, 'already complete')
  assert.equal(result.filled, 0)
})
