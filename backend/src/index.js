import cron from 'node-cron'
import net from 'node:net'
import config from './config.js'
import store from './store.js'
import stats, { normalizeCollectorIssue } from './stats.js'
import metarProcessor from './processors/metar-processor.js'
import tafProcessor from './processors/taf-processor.js'
import warningProcessor from './processors/warning-processor.js'
import kmaSpecialWarningProcessor from './processors/kma-special-warning-processor.js'
import sigmetProcessor from './processors/sigmet-processor.js'
import airmetProcessor from './processors/airmet-processor.js'
import sigwxLowProcessor from './processors/sigwx-low-processor.js'
import amosProcessor from './processors/amos-processor.js'
import lightningProcessor from './processors/lightning-processor.js'
import radarGraphicsProcessor from './processors/radar-graphics-processor.js'
import echoTopProcessor from './processors/echo-top-processor.js'
import rainviewerProcessor from './processors/rainviewer-processor.js'
import kimSurfaceWindProcessor from './processors/kim-surface-wind-processor.js'
import groundForecastProcessor from './processors/ground-forecast-processor.js'
import environmentProcessor from './processors/environment-processor.js'
import airportInfoProcessor from './processors/airport-info-processor.js'
import takeoffForecastProcessor from './processors/takeoff-forecast-processor.js'
import ktgProcessor from './processors/ktg-processor.js'
import flightCategoryProcessor from './processors/flight-category-processor.js'
import asosCeilingProcessor from './processors/asos-ceiling-processor.js'
import notamProcessor from './processors/notam-processor.js'
import overseasProcessor from './processors/overseas-weather-processor.js'
import terminalFlightProcessor from './processors/terminal-flight-processor.js'
import overseasForecastProcessor from './processors/overseas-forecast-processor.js'
import typhoonProcessor from "./processors/typhoon-processor.js";
import { ensureActiveDataView } from './dev/data-view.js'
import apiHubUsage from './api-hub-usage.js'
import { runSatelliteWorker } from './satellite/worker-runner.js'
import { createSatelliteWorkQueue } from './satellite/work-queue.js'
import { activeCollectorRegistry, assertCollectorRegistry } from './collector-registry.js'
import { createExecutionWatchdog } from './collector-execution.js'
import { collectNwpModel, isNwpCollectionDue, peerComparisonRevision } from './airport-model-comparison/lifecycle.js'

net.setDefaultAutoSelectFamily(false)

// ADS-B is collected on demand by the /api/adsb route (only when a viewer is watching),
// so it is intentionally not scheduled here.
const locks = { metar: false, taf: false, warning: false, kma_special_warning: false, sigmet: false, airmet: false, amos: false, lightning: false, wissdom: false, satellite_visible: false, qpf: false, echo_top: false, rainviewer: false, kim_surface_wind: false, ktg: false, satellite: false, ground_forecast: false, environment: false, airport_info: false, takeoff_fcst: false, asos_ceiling: false, notam: false, metar_overseas: false, taf_overseas: false, sigmet_overseas: false, terminal_flights: false, overseas_forecast: false };
const activeControllers = new Map()
const satelliteWorkQueue = createSatelliteWorkQueue({ runWorker: runSatelliteWorker })
let collectorWatchdog = null

function safeCollectorLog(type, outcome, fields = {}) {
  return `[collector] ${type} outcome=${outcome} ${Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${key === 'message' ? JSON.stringify(value) : value}`)
    .join(' ')}`
}

async function runWithLock(type, job, { source = 'manual', apiHubCategories = [], isBlocked = (category) => apiHubUsage.snapshot().keys.find((key) => key.category === category)?.status === 'blocked', stats: recorder = stats, logger = console } = {}) {
  if (['nwp_ecmwf','nwp_icon','nwp_gfs'].includes(type) && !isNwpCollectionDue({model:type.slice(4)})) return {skipped:'nwp_complete_or_disabled'}
  const run = recorder.recordStart(type, { source })
  if (apiHubCategories.length > 0 && apiHubCategories.every(isBlocked)) {
    logger.warn?.(safeCollectorLog(type, 'skipped', { code: 'api_hub_key_blocked' }))
    recorder.recordSkip(type, 'api_hub_key_blocked', run)
    return { skipped: 'api_hub_key_blocked' }
  }
  if (locks[type]) {
    logger.warn?.(safeCollectorLog(type, 'skipped', { code: 'already_running' }))
    recorder.recordSkip(type, 'already_running', run)
    return { skipped: 'already_running' }
  }

  locks[type] = true;
  const controller = new AbortController()
  activeControllers.set(type, controller)
  const t0 = Date.now();
  const peerBefore = ['kim_surface_wind','nwp_icon','nwp_gfs'].includes(type) ? peerComparisonRevision() : null
  try {
    const result = await job({ signal: controller.signal });
    if(type==='kim_surface_wind' && (result?.comparison?.failed || result?.comparison?.failedAirports?.length)) throw new Error('kim_airport_comparison_incomplete')
    const durationMs = Date.now() - t0
    logger.info?.(safeCollectorLog(type, 'succeeded', { duration_ms: durationMs, ...(typeof result?.saved === 'boolean' ? { saved: result.saved } : {}) }))
    recorder.recordSuccess(type, result, durationMs, run)
    return result
  } catch (error) {
    if (controller.signal.aborted) {
      logger.warn?.(safeCollectorLog(type, 'skipped', { code: 'collection_cancelled_for_data_transition' }))
      recorder.recordSkip(type, 'collection_cancelled_for_data_transition', run)
    } else {
      const issue = normalizeCollectorIssue({ outcome: 'failed', code: 'collector_failed', message: error?.message, at: new Date().toISOString() })
      logger.error?.(safeCollectorLog(type, 'failed', { code: issue.code, message: issue.message }))
      recorder.recordFailure(type, issue.message, Date.now() - t0, run)
    }
    return undefined
  } finally {
    activeControllers.delete(type)
    locks[type] = false;
    if (peerBefore !== null && peerBefore !== peerComparisonRevision() && isNwpCollectionDue({model:'ecmwf'})) {
      await runWithLock('nwp_ecmwf', processorBindings.nwp_ecmwf, {source:'manual'})
    }
  }
}

export function activeCollectionTypes() {
  return Object.entries(locks).filter(([, active]) => active).map(([type]) => type)
}

export async function waitForCollectionIdle({ timeoutMs = 120_000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (activeCollectionTypes().length > 0) {
    if (Date.now() >= deadline) {
      throw new Error(`collection_drain_timeout:${activeCollectionTypes().join(',')}`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  const remainingTimeoutMs = deadline - Date.now()
  await satelliteWorkQueue.whenIdle({ timeoutMs: remainingTimeoutMs, pollMs })
}

export function abortActiveCollections() {
  const reason = new Error('collection_cancelled_for_data_transition')
  for (const controller of activeControllers.values()) {
    if (!controller.signal.aborted) {
      controller.abort(reason)
    }
  }
  return satelliteWorkQueue.cancel(reason)
}

export async function quiesceCollections(options) {
  await abortActiveCollections()
  await waitForCollectionIdle(options)
}

export function runSatelliteCollection(kind, { signal, fillAll = false } = {}) {
  return satelliteWorkQueue.enqueue({
    kind,
    mode: 'current',
    now: new Date().toISOString(),
    ...(fillAll ? { fillAll: true } : {}),
  }, { signal })
}

const processorBindings = {
  nwp_ecmwf: ({signal}) => collectNwpModel({model:'ecmwf',signal}),
  nwp_icon: ({signal}) => collectNwpModel({model:'icon',signal}),
  nwp_gfs: ({signal}) => collectNwpModel({model:'gfs',signal}),
  metar: metarProcessor.processAll, taf: tafProcessor.processAll, warning: warningProcessor.process,
  kma_special_warning: kmaSpecialWarningProcessor.process, sigmet: sigmetProcessor.process, airmet: airmetProcessor.process,
  sigwx_low: sigwxLowProcessor.process, amos: amosProcessor.process, lightning: lightningProcessor.process,
  wissdom: radarGraphicsProcessor.processWissdom, qpf: radarGraphicsProcessor.processQpf, hsr: radarGraphicsProcessor.processHsr, hci: radarGraphicsProcessor.processHci,
  echo_top: echoTopProcessor.process, rainviewer: rainviewerProcessor.process, kim_surface_wind: kimSurfaceWindProcessor.process,
  ground_forecast: groundForecastProcessor.process, environment: environmentProcessor.process, airport_info: airportInfoProcessor.process,
  takeoff_fcst: takeoffForecastProcessor.process, ktg: ktgProcessor.process, flight_category: flightCategoryProcessor.process,
  asos_ceiling: asosCeilingProcessor.process, notam: notamProcessor.process, metar_overseas: overseasProcessor.processMetar,
  taf_overseas: overseasProcessor.processTaf, sigmet_overseas: overseasProcessor.processSigmet, terminal_flights: terminalFlightProcessor.process,
  overseas_forecast: overseasForecastProcessor.process, typhoon: typhoonProcessor.process,
  satellite: ({ signal }) => runSatelliteCollection('satellite', { signal }),
  satellite_visible: ({ signal }) => runSatelliteCollection('satellite_visible', { signal }),
}

function scheduleCollector({ scheduler = cron, collector, job, runOptions = {}, runner = runWithLock, scheduledTypes, isNwpDue = isNwpCollectionDue, now = Date.now, activeConfig = config }) {
  scheduledTypes.add(collector.type)
  return scheduler.schedule(
    collector.schedule.expression,
    () => {
      if (collector.type.startsWith('nwp_') && !isNwpDue({model:collector.type.slice(4),root:activeConfig.storage.base_path,nowMs:now(),settings:activeConfig.overseas_nwp})) return
      return runner(collector.type, job, { ...runOptions, apiHubCategories: collector.apiHubCategories, source: 'scheduled' })
    },
    collector.schedule.cronOptions,
  )
}

export function registerCollectorSchedules({ scheduler = cron, config: activeConfig = config, runWithLock: runner = runWithLock, processorBindings: bindings = processorBindings, isNwpDue = isNwpCollectionDue, now = Date.now } = {}) {
  const activeCollectors = activeCollectorRegistry(activeConfig)
  assertCollectorRegistry({ activeCollectors, processorBindings: bindings })
  const scheduledTypes = new Set()
  for (const collector of activeCollectors) {
    scheduleCollector({ scheduler, collector, job: bindings[collector.binding], runner, scheduledTypes, isNwpDue, now, activeConfig })
  }
  const activeTypes = new Set(activeCollectors.map((collector) => collector.type))
  const missing = [...activeTypes].filter((type) => !scheduledTypes.has(type))
  const unexpected = [...scheduledTypes].filter((type) => !activeTypes.has(type))
  if (missing.length || unexpected.length) throw new Error(`collector_schedule_mismatch:missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'}`)
  return scheduledTypes
}

// Compatibility seam for the radar-graphics processor tests; timing, enablement,
// timezone, and API Hub categories still come only from the collector registry.
export function scheduleRadarGraphicsJobs(scheduler = cron, activeConfig = config) {
  const graphicJobs = new Set([
    radarGraphicsProcessor.processWissdom,
    radarGraphicsProcessor.processQpf,
    radarGraphicsProcessor.processHsr,
    radarGraphicsProcessor.processHci,
  ])
  const scheduledTypes = new Set()
  return activeCollectorRegistry(activeConfig)
    .filter((collector) => graphicJobs.has(processorBindings[collector.binding]))
    .map((collector) => scheduleCollector({ scheduler, collector, job: processorBindings[collector.binding], scheduledTypes }))
}

// 시작 시점 NOTAM 캐시가 재크롤이 필요할 만큼 오래됐나. 없음/빈것/시각손상은 stale로 간주(크롤).
function isNotamCacheStale() {
  const cached = store.getCached('notam')
  const fetchedMs = Date.parse(cached?.fetched_at)
  if (!(cached?.items?.length > 0) || !Number.isFinite(fetchedMs)) return true
  const maxAgeMs = (config.notam?.startup_max_age_hours ?? 6) * 3600000
  return Date.now() - fetchedMs >= maxAgeMs
}

function buildInitialCollectionJobs({
  includeOverseasNwp = config.overseas_nwp?.enabled !== false,
  includeKimNwp = config.kim_nwp?.enabled !== false && config.kim_nwp?.collect_on_startup !== false,
  includeRadarSatellite = activeCollectorRegistry(config).some((collector) => collector.type === 'satellite'),
  includeEchoTop = includeRadarSatellite && config.radar_echo_top?.enabled !== false,
  satelliteJob = runSatelliteCollection,
} = {}) {
  const jobs = [
    ...(includeOverseasNwp && config.overseas_nwp?.enabled !== false ? ['nwp_ecmwf','nwp_icon','nwp_gfs'].map(type=>[type,processorBindings[type]]) : []),
    ["metar", metarProcessor.processAll],
    ["taf", tafProcessor.processAll],
    ["warning", warningProcessor.process],
    ['kma_special_warning', kmaSpecialWarningProcessor.process],
    ["sigmet", sigmetProcessor.process],
    ["metar_overseas", overseasProcessor.processMetar],
    ["taf_overseas", overseasProcessor.processTaf],
    ["sigmet_overseas", overseasProcessor.processSigmet],
    ["airmet", airmetProcessor.process],
    ["sigwx_low", sigwxLowProcessor.process],
    ["amos", amosProcessor.process],
    ["lightning", lightningProcessor.process],
    ...(includeRadarSatellite ? [
      ...(activeCollectorRegistry(config).some((collector) => collector.type === 'wissdom') ? [['wissdom', radarGraphicsProcessor.processWissdom], ['qpf', radarGraphicsProcessor.processQpf], ['hsr', radarGraphicsProcessor.processHsr], ['hci', radarGraphicsProcessor.processHci]] : []),
      ...(includeEchoTop ? [["echo_top", echoTopProcessor.process]] : []),
    ] : []),
    ["rainviewer", rainviewerProcessor.process],
    ...(includeRadarSatellite ? [
      ['satellite', ({ signal }) => satelliteJob('satellite', { signal, fillAll: true })],
      ['satellite_visible', ({ signal }) => satelliteJob('satellite_visible', { signal, fillAll: true })],
    ] : []),
    ["ground_forecast", groundForecastProcessor.process],
    ["environment", environmentProcessor.process],
    ["airport_info", airportInfoProcessor.process],
    ["takeoff_fcst", takeoffForecastProcessor.process],
    ['typhoon', typhoonProcessor.process],
    ['terminal_flights', terminalFlightProcessor.process],
    ['overseas_forecast', overseasForecastProcessor.process],
  ]
  if (includeKimNwp) jobs.splice(10, 0, ["kim_surface_wind", kimSurfaceWindProcessor.process])
  if (config.ktg?.collect_on_startup !== false) jobs.push(["ktg", ktgProcessor.process])
  if (config.flight_category?.collect_on_startup !== false) jobs.push(["flight_category", flightCategoryProcessor.process])
  if (config.asos_ceiling?.collect_on_startup !== false) jobs.push(["asos_ceiling", asosCeilingProcessor.process])
  // NOTAM 시작 크롤: 명시적으로 끄지 않았고(collect_on_startup) 캐시가 오래됐을 때만.
  // 유효한 최신 스냅샷이 이미 있으면(신선도 내) 굳이 재크롤 안 하고 그걸 그대로 씀 — 재시작해도 즉시 표시.
  if (config.notam?.collect_on_startup !== false && isNotamCacheStale()) jobs.push(["notam", notamProcessor.process])
  return jobs
}

function runOptionsForCollector(type, activeConfig = config, source = 'manual') {
  const collector = activeCollectorRegistry(activeConfig).find((item) => item.type === type)
  return { source, apiHubCategories: collector?.apiHubCategories ?? [] }
}

export function startCollectorWatchdog({ activeConfig = config, watchdogFactory = createExecutionWatchdog } = {}) {
  collectorWatchdog?.stop()
  collectorWatchdog = watchdogFactory({
    collectors: activeCollectorRegistry(activeConfig),
    getStats: stats.getStats,
    recordMissed: stats.recordMissed,
    bootedAtMs: Date.now(),
  })
  collectorWatchdog.start()
  return collectorWatchdog
}

async function main() {
  ensureActiveDataView()
  store.ensureDirectories(config.storage.base_path);
  store.initLiveFromFiles(config.storage.base_path);
  store.initActiveFromFiles(config.storage.active_path);
  stats.initFromFile(config.storage.base_path);

  // 테스트 인스턴스: DISABLE_COLLECTION이면 자동수집(cron)·초기수집을 건너뛴다.
  // store는 이미 파일에서 로드됨(위 initFromFiles) → 데이터가 그 시점으로 "고정". 개발자가 자유 조작 가능.
  if (process.env.DISABLE_COLLECTION) {
    console.log('[collection] DISABLE_COLLECTION 설정됨 — 자동수집/초기수집 생략 (데이터 고정, 테스트 모드).')
    return
  }

  console.log("Scheduler started");

  registerCollectorSchedules()
  if (activeCollectorRegistry(config).some((collector) => collector.type === 'echo_top')) {
    runWithLock('echo_top', echoTopProcessor.backfill, runOptionsForCollector('echo_top', config, 'manual'))
  } else {
    console.warn('[collection] KMA radar/satellite key disabled — radar and satellite collection skipped.')
  }
  startCollectorWatchdog()

  // 서버 시작 직후 1회 즉시 수집
  console.log("Running initial data collection...");
  await Promise.allSettled(
    buildInitialCollectionJobs().map(([type, job]) => runWithLock(type, job, runOptionsForCollector(type, config, 'startup'))),
  );
  console.log("Initial data collection complete.");
}

const __filename = new URL(import.meta.url).pathname
if (process.argv[1] && (__filename === process.argv[1] || __filename.endsWith(process.argv[1]))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { buildInitialCollectionJobs, main, processorBindings, runWithLock }
export default { abortActiveCollections, activeCollectionTypes, buildInitialCollectionJobs, main, quiesceCollections, registerCollectorSchedules, runSatelliteCollection, runWithLock, startCollectorWatchdog, waitForCollectionIdle }
