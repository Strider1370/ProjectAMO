import assert from 'node:assert/strict'
import test from 'node:test'

import config from '../src/config.js'
import {
  AIRPORT_INFO_CRON_OPTIONS,
  KIM_NWP_CRON_OPTIONS,
  buildInitialCollectionJobs,
  runWithLock,
  scheduleAirportInfoJob,
  scheduleKimNwpJob,
  scheduleEchoTopJob,
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
