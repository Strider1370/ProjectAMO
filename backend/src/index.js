import cron from 'node-cron'
import config from './config.js'
import store from './store.js'
import stats from './stats.js'
import metarProcessor from './processors/metar-processor.js'
import tafProcessor from './processors/taf-processor.js'
import warningProcessor from './processors/warning-processor.js'
import sigmetProcessor from './processors/sigmet-processor.js'
import airmetProcessor from './processors/airmet-processor.js'
import sigwxLowProcessor from './processors/sigwx-low-processor.js'
import amosProcessor from './processors/amos-processor.js'
import lightningProcessor from './processors/lightning-processor.js'
import radarEchoProcessor from './processors/radar-echo-processor.js'
import echoTopProcessor from './processors/echo-top-processor.js'
import rainviewerProcessor from './processors/rainviewer-processor.js'
import kimSurfaceWindProcessor from './processors/kim-surface-wind-processor.js'
import satelliteProcessor from './processors/satellite-processor.js'
import groundForecastProcessor from './processors/ground-forecast-processor.js'
import environmentProcessor from './processors/environment-processor.js'
import airportInfoProcessor from './processors/airport-info-processor.js'
import takeoffForecastProcessor from './processors/takeoff-forecast-processor.js'
import ktgProcessor from './processors/ktg-processor.js'
import flightCategoryProcessor from './processors/flight-category-processor.js'
import asosCeilingProcessor from './processors/asos-ceiling-processor.js'
import notamProcessor from './processors/notam-processor.js'
import overseasProcessor from './processors/overseas-weather-processor.js'
import typhoonProcessor from "./processors/typhoon-processor.js";
import { ensureActiveDataView } from './dev/data-view.js'

// ADS-B is collected on demand by the /api/adsb route (only when a viewer is watching),
// so it is intentionally not scheduled here.
const locks = { metar: false, taf: false, warning: false, sigmet: false, airmet: false, sigwx_low: false, amos: false, lightning: false, radar_echo: false, echo_top: false, rainviewer: false, kim_surface_wind: false, ktg: false, satellite: false, ground_forecast: false, environment: false, airport_info: false, takeoff_fcst: false, flight_category: false, asos_ceiling: false, notam: false, metar_overseas: false, taf_overseas: false, sigmet_overseas: false };
const activeControllers = new Map()
const KIM_NWP_CRON_OPTIONS = { timezone: 'Etc/UTC' }
const AIRPORT_INFO_CRON_OPTIONS = { timezone: 'Asia/Seoul' }

async function runWithLock(type, job) {
  if (locks[type]) {
    console.warn(`${type}: skipped (already running)`);
    stats.recordSkip(type); // 수집 주기 < 처리시간 신호(관찰 탭)
    return;
  }

  locks[type] = true;
  const controller = new AbortController()
  activeControllers.set(type, controller)
  const t0 = Date.now();
  try {
    const result = await job({ signal: controller.signal });
    console.log(`[${new Date().toISOString()}] ${type}:`, result);
    stats.recordSuccess(type, result, Date.now() - t0);
  } catch (error) {
    if (controller.signal.aborted) {
      console.warn(`[${new Date().toISOString()}] ${type}: cancelled for data transition`)
      stats.recordSkip(type)
    } else {
      console.error(`[${new Date().toISOString()}] ${type} failed:`, error.message);
      stats.recordFailure(type, error.message, Date.now() - t0);
    }
  } finally {
    activeControllers.delete(type)
    locks[type] = false;
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
}

export function abortActiveCollections() {
  for (const controller of activeControllers.values()) {
    if (!controller.signal.aborted) {
      controller.abort(new Error('collection_cancelled_for_data_transition'))
    }
  }
}

export async function quiesceCollections(options) {
  abortActiveCollections()
  await waitForCollectionIdle(options)
}

function scheduleKimNwpJob(scheduler = cron, enabled = config.kim_nwp?.enabled !== false) {
  if (!enabled) return null
  return scheduler.schedule(
    config.schedule.kim_surface_wind_interval,
    () => runWithLock("kim_surface_wind", kimSurfaceWindProcessor.process),
    KIM_NWP_CRON_OPTIONS,
  )
}

function scheduleAirportInfoJob(scheduler = cron) {
  return scheduler.schedule(
    config.schedule.airport_info_interval,
    () => runWithLock("airport_info", airportInfoProcessor.process),
    AIRPORT_INFO_CRON_OPTIONS,
  )
}

function scheduleTakeoffFcstJob(scheduler = cron) {
  return scheduler.schedule(
    config.schedule.takeoff_fcst_interval,
    () => runWithLock("takeoff_fcst", takeoffForecastProcessor.process),
    AIRPORT_INFO_CRON_OPTIONS, // fctm이 KST 기반이라 Asia/Seoul
  )
}

// 시작 시점 NOTAM 캐시가 재크롤이 필요할 만큼 오래됐나. 없음/빈것/시각손상은 stale로 간주(크롤).
function isNotamCacheStale() {
  const cached = store.getCached('notam')
  const fetchedMs = Date.parse(cached?.fetched_at)
  if (!(cached?.items?.length > 0) || !Number.isFinite(fetchedMs)) return true
  const maxAgeMs = (config.notam?.startup_max_age_hours ?? 6) * 3600000
  return Date.now() - fetchedMs >= maxAgeMs
}

function buildInitialCollectionJobs({ includeKimNwp = config.kim_nwp?.enabled !== false && config.kim_nwp?.collect_on_startup !== false } = {}) {
  const jobs = [
    ["metar", metarProcessor.processAll],
    ["taf", tafProcessor.processAll],
    ["warning", warningProcessor.process],
    ["sigmet", sigmetProcessor.process],
    ["metar_overseas", overseasProcessor.processMetar],
    ["taf_overseas", overseasProcessor.processTaf],
    ["sigmet_overseas", overseasProcessor.processSigmet],
    ["airmet", airmetProcessor.process],
    ["sigwx_low", sigwxLowProcessor.process],
    ["amos", amosProcessor.process],
    ["lightning", lightningProcessor.process],
    ["radar_echo", radarEchoProcessor.process],
    ["echo_top", echoTopProcessor.process],
    ["rainviewer", rainviewerProcessor.process],
    ["satellite", satelliteProcessor.process],
    ["ground_forecast", groundForecastProcessor.process],
    ["environment", environmentProcessor.process],
    ["airport_info", airportInfoProcessor.process],
    ["takeoff_fcst", takeoffForecastProcessor.process],
    ['typhoon', typhoonProcessor.process],
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

  cron.schedule(config.schedule.metar_interval, () => runWithLock("metar", metarProcessor.processAll));
  cron.schedule(config.schedule.taf_interval, () => runWithLock("taf", tafProcessor.processAll));
  cron.schedule(config.schedule.warning_interval, () => runWithLock("warning", warningProcessor.process));
  cron.schedule(config.schedule.sigmet_interval, () => runWithLock("sigmet", sigmetProcessor.process));
  // 해외(NOAA) — 국내와 같은 주기, 별도 job·별도 저장 파일.
  cron.schedule(config.schedule.metar_interval, () => runWithLock("metar_overseas", overseasProcessor.processMetar));
  cron.schedule(config.schedule.taf_interval, () => runWithLock("taf_overseas", overseasProcessor.processTaf));
  cron.schedule(config.schedule.sigmet_interval, () => runWithLock("sigmet_overseas", overseasProcessor.processSigmet));
  cron.schedule(config.schedule.airmet_interval, () => runWithLock("airmet", airmetProcessor.process));
  cron.schedule(config.schedule.sigwx_low_interval, () => runWithLock("sigwx_low", sigwxLowProcessor.process));
  cron.schedule(config.schedule.amos_interval, () => runWithLock("amos", amosProcessor.process));
  cron.schedule(config.schedule.lightning_interval, () => runWithLock("lightning", lightningProcessor.process));
  cron.schedule(config.schedule.typhoon_interval, () => runWithLock("typhoon", typhoonProcessor.process));
  cron.schedule(config.schedule.radar_echo_interval, () => runWithLock("radar_echo", radarEchoProcessor.process));
  cron.schedule(config.schedule.echo_top_interval, () => runWithLock("echo_top", echoTopProcessor.process));
  // 시작 시 1회: 비어 있는 과거 에코탑 프레임을 채운다. 같은 락을 쓰므로 5분 cron과 겹치지 않는다.
  runWithLock("echo_top", echoTopProcessor.backfill);
  cron.schedule(config.schedule.rainviewer_interval, () => runWithLock("rainviewer", rainviewerProcessor.process));
  scheduleKimNwpJob();
  cron.schedule(config.schedule.ktg_interval, () => runWithLock('ktg', ktgProcessor.process), KIM_NWP_CRON_OPTIONS);
  cron.schedule(config.schedule.satellite_interval, () => runWithLock("satellite", satelliteProcessor.process));
  // 발표 시각이 KST 기준이라 서버 TZ와 무관하게 Asia/Seoul로 고정.
  cron.schedule(config.schedule.ground_forecast_interval, () => runWithLock("ground_forecast", groundForecastProcessor.process), { timezone: 'Asia/Seoul' });
  cron.schedule(config.schedule.environment_interval, () => runWithLock("environment", environmentProcessor.process));
  scheduleAirportInfoJob();
  scheduleTakeoffFcstJob();
  cron.schedule(config.schedule.flight_category_interval, () => runWithLock('flight_category', flightCategoryProcessor.process))
  cron.schedule(config.schedule.asos_ceiling_interval, () => runWithLock('asos_ceiling', asosCeilingProcessor.process), { timezone: 'Asia/Seoul' })
  cron.schedule(config.schedule.notam_interval, () => runWithLock("notam", notamProcessor.process))

  // 서버 시작 직후 1회 즉시 수집
  console.log("Running initial data collection...");
  await Promise.allSettled(
    buildInitialCollectionJobs().map(([type, job]) => runWithLock(type, job)),
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

export { AIRPORT_INFO_CRON_OPTIONS, KIM_NWP_CRON_OPTIONS, buildInitialCollectionJobs, main, runWithLock, scheduleAirportInfoJob, scheduleTakeoffFcstJob, scheduleKimNwpJob }
export default { AIRPORT_INFO_CRON_OPTIONS, KIM_NWP_CRON_OPTIONS, abortActiveCollections, activeCollectionTypes, buildInitialCollectionJobs, main, quiesceCollections, runWithLock, scheduleAirportInfoJob, scheduleTakeoffFcstJob, scheduleKimNwpJob, waitForCollectionIdle }
