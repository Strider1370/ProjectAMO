import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import config from '../src/config.js'
import {
  AIRPORT_INFO_CRON_OPTIONS,
  KIM_NWP_CRON_OPTIONS,
  buildInitialCollectionJobs,
  runWithLock,
  scheduleAirportInfoJob,
  scheduleEchoTopJob,
  scheduleKimNwpJob,
  scheduleSatelliteJobs,
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
  const calls = []
  const fakeScheduler = {
    schedule: (...args) => {
      calls.push(args)
      return { stop() {} }
    },
  }

  scheduleKimNwpJob(fakeScheduler)

  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], config.schedule.kim_surface_wind_interval)
  assert.equal(typeof calls[0][1], 'function')
  assert.deepEqual(calls[0][2], KIM_NWP_CRON_OPTIONS)
  assert.deepEqual(KIM_NWP_CRON_OPTIONS, { timezone: 'Etc/UTC' })
})

test('KIM NWP scheduler can be disabled without affecting other schedulers', () => {
  const calls = []
  const fakeScheduler = { schedule: (...args) => calls.push(args) }

  assert.equal(scheduleKimNwpJob(fakeScheduler, false), null)
  assert.equal(calls.length, 0)
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

test('Echo Top scheduler can be disabled without registering a cron job', () => {
  const calls = []
  const fakeScheduler = { schedule: (...args) => calls.push(args) }

  assert.equal(scheduleEchoTopJob(fakeScheduler, { radar_echo_top: { enabled: false } }), null)
  assert.equal(calls.length, 0)
})

test('Echo Top scheduler does not register when the radar and satellite key is unavailable', () => {
  const calls = []
  const fakeScheduler = { schedule: (...args) => calls.push(args) }

  assert.equal(scheduleEchoTopJob(fakeScheduler, { radar_echo_top: { enabled: true }, api: { radar_satellite_auth_key: '' } }), null)
  assert.equal(calls.length, 0)
})

test('satellite schedulers register normal and visible jobs through the shared worker queue', () => {
  const calls = []
  const fakeScheduler = { schedule: (...args) => calls.push(args) }
  const satelliteJob = async (kind) => { satelliteJob.calls.push(kind); return { saved: true } }
  satelliteJob.calls = []

  const registrations = scheduleSatelliteJobs(fakeScheduler, satelliteJob)

  assert.equal(registrations.length, 2)
  assert.deepEqual(calls.map(([interval]) => interval), [config.schedule.satellite_interval, config.schedule.satellite_visible_interval])
  assert.equal(typeof calls[0][1], 'function')
  assert.equal(typeof calls[1][1], 'function')
  calls[0][1]()
  calls[1][1]()
  assert.deepEqual(satelliteJob.calls, ['satellite', 'satellite_visible'])
})

test('initial satellite collection calls the isolated adapter', async () => {
  const satelliteJob = async (kind) => { satelliteJob.calls.push(kind); return { saved: true } }
  satelliteJob.calls = []
  const jobs = buildInitialCollectionJobs({ includeRadarSatellite: true, satelliteJob })

  await jobs.find(([type]) => type === 'satellite')[1]({ signal: new AbortController().signal })

  assert.deepEqual(satelliteJob.calls, ['satellite'])
})

test('the long-lived scheduler does not import satellite WASM or image processors', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')

  for (const forbidden of ['satellite-processor.js', 'satellite-visible-processor.js', 'h5wasm', 'sharp']) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})

test('airport info scheduler runs at KST bulletin release and retry times', () => {
  const calls = []
  const fakeScheduler = {
    schedule: (...args) => {
      calls.push(args)
      return { stop() {} }
    },
  }

  scheduleAirportInfoJob(fakeScheduler)

  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], config.schedule.airport_info_interval)
  assert.equal(calls[0][0], '0,30 6,17 * * *')
  assert.equal(typeof calls[0][1], 'function')
  assert.deepEqual(calls[0][2], AIRPORT_INFO_CRON_OPTIONS)
  assert.deepEqual(AIRPORT_INFO_CRON_OPTIONS, { timezone: 'Asia/Seoul' })
})
