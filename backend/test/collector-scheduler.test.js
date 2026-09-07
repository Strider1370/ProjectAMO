import assert from 'node:assert/strict'
import test from 'node:test'
import { CronExpressionParser } from 'cron-parser'

import config from '../src/config.js'
import { activeCollectorRegistry } from '../src/collector-registry.js'
import { buildInitialCollectionJobs, registerCollectorSchedules, runWithLock, startCollectorWatchdog } from '../src/index.js'

const enabledConfig = {
  ...config,
  api: { ...config.api, radar_satellite_auth_key: 'test-key' },
}

function scheduler() {
  const calls = []
  return {
    calls,
    schedule(expression, callback, options) {
      calls.push({ expression, callback, options })
      return { stop() {} }
    },
  }
}

function bindingsFor(activeCollectors) {
  return Object.fromEntries(activeCollectors.map((collector) => [collector.binding, async () => ({ saved: true })]))
}

test('overseas NWP schedules three hourly slots per run, including midnight retries', () => {
  const expected = {
    nwp_ecmwf: ['01:40','02:40','03:40','07:40','08:40','09:40','13:40','14:40','15:40','19:40','20:40','21:40'],
    nwp_icon: ['00:40','04:40','05:40','06:40','10:40','11:40','12:40','16:40','17:40','18:40','22:40','23:40'],
    nwp_gfs: ['00:10','01:10','02:10','06:10','07:10','08:10','12:10','13:10','14:10','18:10','19:10','20:10'],
  }
  for (const collector of activeCollectorRegistry(enabledConfig).filter(c => c.type in expected)) {
    const cron = CronExpressionParser.parse(collector.schedule.expression, { currentDate: '2026-09-06T00:00:00Z', tz: collector.schedule.timezone })
    assert.deepEqual(Array.from({ length: 12 }, () => cron.next().toISOString().slice(11, 16)), expected[collector.type])
    assert.ok(cron.next().toISOString().startsWith('2026-09-07'), 'no extra polls between collection windows')
  }
})

test('completed NWP cron checks bypass runner and OFF excludes startup jobs', async () => {
  const fake=scheduler(),collectors=activeCollectorRegistry(enabledConfig),calls=[]
  registerCollectorSchedules({scheduler:fake,config:enabledConfig,processorBindings:bindingsFor(collectors),runWithLock:async type=>calls.push(type),isNwpDue:()=>false})
  for(const [i,collector] of collectors.entries()) if(collector.type.startsWith('nwp_')) await fake.calls[i].callback()
  assert.deepEqual(calls,[])
  assert.ok(!buildInitialCollectionJobs({includeOverseasNwp:false}).some(([type])=>type.startsWith('nwp_')))
})

test('every active collector is registered exactly once with its declared expression and timezone', () => {
  const fakeScheduler = scheduler()
  const collectors = activeCollectorRegistry(enabledConfig)
  const scheduled = registerCollectorSchedules({ scheduler: fakeScheduler, config: enabledConfig, runWithLock, processorBindings: bindingsFor(collectors) })

  assert.deepEqual([...scheduled].sort(), collectors.map((collector) => collector.type).sort())
  assert.deepEqual(fakeScheduler.calls.map((call) => [call.expression, call.options]), collectors.map((collector) => [collector.schedule.expression, collector.schedule.cronOptions]))
})

test('disabled radar collectors are neither scheduled nor monitored', () => {
  const fakeScheduler = scheduler()
  const disabledConfig = { ...enabledConfig, api: { ...enabledConfig.api, radar_satellite_auth_key: '' } }
  const collectors = activeCollectorRegistry(disabledConfig)
  const scheduled = registerCollectorSchedules({ scheduler: fakeScheduler, config: disabledConfig, runWithLock, processorBindings: bindingsFor(collectors) })

  assert.equal(scheduled.has('satellite'), false)
  assert.equal(fakeScheduler.calls.some((call) => call.type === 'satellite'), false)
})

test('watchdog receives only active registry collectors and returns its stop handle', () => {
  const disabledConfig = { ...enabledConfig, api: { ...enabledConfig.api, radar_satellite_auth_key: '' } }
  let started = false
  const watchdog = { start: () => { started = true }, stop() {} }
  const returned = startCollectorWatchdog({
    activeConfig: disabledConfig,
    watchdogFactory: ({ collectors }) => {
      assert.equal(collectors.some((collector) => collector.type === 'satellite'), false)
      return watchdog
    },
  })

  assert.equal(returned, watchdog)
  assert.equal(started, true)
  returned.stop()
})

test('registry preserves each collector API Hub category before scheduling', async () => {
  const collectors = activeCollectorRegistry(enabledConfig)
  assert.deepEqual(collectors.find((collector) => collector.type === 'ground_forecast').apiHubCategories, ['aviation'])
  assert.deepEqual(collectors.find((collector) => collector.type === 'flight_category').apiHubCategories, ['aviation', 'radar_satellite'])

  const fakeScheduler = scheduler()
  const calls = []
  registerCollectorSchedules({
    scheduler: fakeScheduler,
    config: enabledConfig,
    runWithLock: async (type, job, options) => { calls.push({ type, job, options }) },
    processorBindings: bindingsFor(collectors),
  })
  await fakeScheduler.calls.find((call) => call.expression === collectors.find((collector) => collector.type === 'ground_forecast').schedule.expression).callback()
  assert.deepEqual(calls.find((call) => call.type === 'ground_forecast').options.apiHubCategories, ['aviation'])
  assert.equal(calls.find((call) => call.type === 'ground_forecast').options.source, 'scheduled')
})

test('runWithLock records a start before a key-blocked or lock-held skip', async () => {
  const calls = []
  await runWithLock('ground_forecast', async () => ({ saved: true }), {
    source: 'scheduled',
    apiHubCategories: ['aviation'],
    isBlocked: () => true,
    stats: { recordStart: () => calls.push('start'), recordSkip: () => calls.push('skip') },
  })
  assert.deepEqual(calls, ['start', 'skip'])
})

test('successful collector log is one line and never serializes the processor result object', async () => {
  const lines = []
  await runWithLock('ground_forecast', async () => ({ saved: true, rawResponse: 'do-not-log' }), {
    source: 'scheduled',
    logger: { info: (line) => lines.push(line) },
  })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /outcome=succeeded/)
  assert.equal(lines[0].includes('rawResponse'), false)
})
