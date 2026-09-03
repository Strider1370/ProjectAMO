import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import config from '../src/config.js'
import { activeCollectorRegistry } from '../src/collector-registry.js'
import {
  buildInitialCollectionJobs,
  runWithLock,
} from '../src/index.js'

test('blocked API Hub key skips its collection before the processor runs', async () => {
  const result = await runWithLock('radar_echo', async () => assert.fail('processor must not run'), {
    apiHubCategories: ['radar_satellite'],
    isBlocked: () => true,
  })
  assert.deepEqual(result, { skipped: 'api_hub_key_blocked' })
})

test('a non-blocked API Hub key still runs its collection', async () => {
  const result = await runWithLock('radar_echo', async () => ({ saved: true }), {
    apiHubCategories: ['radar_satellite'],
    isBlocked: () => false,
  })
  assert.deepEqual(result, { saved: true })
})

test('KIM scheduler jobs do not preflight-block a valid 18Z aviation-key run', async () => {
  let ran = false
  const result = await runWithLock('kim_surface_wind', async () => {
    ran = true
    return { selectedCredential: 'aviation-key' }
  }, {
    apiHubCategories: [],
    isBlocked: (category) => category === 'kim_nwp',
  })
  assert.deepEqual(result, { selectedCredential: 'aviation-key' })
  assert.equal(ran, true)
})

test('KIM NWP scheduler uses UTC for synoptic release retry windows', () => {
  const collector = activeCollectorRegistry(config).find((item) => item.type === 'kim_surface_wind')
  assert.equal(collector.schedule.expression, config.schedule.kim_surface_wind_interval)
  assert.deepEqual(collector.schedule.cronOptions, { timezone: 'Etc/UTC' })
})

test('KIM NWP scheduler can be disabled without affecting other schedulers', () => {
  const collectors = activeCollectorRegistry({ kim_nwp: { enabled: false } })
  assert.equal(collectors.some((item) => item.type === 'kim_surface_wind'), false)
  assert.equal(collectors.some((item) => item.type === 'metar'), true)
})

test('initial collection can omit KIM NWP for low-resource startup', () => {
  assert.equal(
    buildInitialCollectionJobs({ includeKimNwp: false }).some(([type]) => type === 'kim_surface_wind'),
    false,
  )
  assert.equal(
    buildInitialCollectionJobs({ includeKimNwp: true }).some(([type]) => type === 'kim_surface_wind'),
    true,
  )
})

test('initial collection can omit Echo Top when its source is disabled', () => {
  assert.equal(
    buildInitialCollectionJobs({ includeEchoTop: false }).some(([type]) => type === 'echo_top'),
    false,
  )
  assert.equal(
    buildInitialCollectionJobs({ includeEchoTop: true }).some(([type]) => type === 'echo_top'),
    true,
  )
})

test('initial collection omits every radar and satellite key consumer when that key is disabled', () => {
  const types = buildInitialCollectionJobs({ includeRadarSatellite: false }).map(([type]) => type)

  for (const type of ['radar_echo', 'wissdom', 'qpf', 'hsr', 'hci', 'echo_top', 'satellite', 'satellite_visible']) {
    assert.equal(types.includes(type), false, type)
  }
})

test('visible satellite availability is checked every five minutes', () => {
  assert.equal(config.schedule.satellite_visible_interval, '*/5 * * * *')
})

test('initial satellite collection requests full history through the isolated adapter', async () => {
  const satelliteJob = async (kind, options) => { satelliteJob.calls.push([kind, options]); return { saved: true } }
  satelliteJob.calls = []
  const jobs = buildInitialCollectionJobs({ includeRadarSatellite: true, satelliteJob })
  const signal = new AbortController().signal

  await jobs.find(([type]) => type === 'satellite')[1]({ signal })

  assert.deepEqual(satelliteJob.calls, [['satellite', { signal, fillAll: true }]])
})

test('the long-lived scheduler does not import satellite WASM or image processors', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')

  for (const forbidden of ['satellite-processor.js', 'satellite-visible-processor.js', 'h5wasm', 'sharp']) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})

test('airport info scheduler runs at KST bulletin release and retry times', () => {
  const collector = activeCollectorRegistry(config).find((item) => item.type === 'airport_info')
  assert.equal(collector.schedule.expression, config.schedule.airport_info_interval)
  assert.equal(collector.schedule.expression, '0,30 6,17 * * *')
  assert.deepEqual(collector.schedule.cronOptions, { timezone: 'Asia/Seoul' })
})
