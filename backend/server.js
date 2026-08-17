import express from 'express'
import compression from 'compression'
import crypto from 'node:crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import store from './src/store.js'
import stats from './src/stats.js'
import config from './src/config.js'
import { main as startScheduler } from './src/index.js'
import { startAlertScheduler } from './src/alerts/scheduler.js'
import cors from 'cors'
import helmet from 'helmet'
import sharp from 'sharp'
import cookieParser from 'cookie-parser'
import { sessionMiddleware, ABSOLUTE_TTL_MS } from './src/auth/session.js'
import { createAuthRouter } from './src/auth/router.js'
import { createUser } from './src/db/users.js'
import { isDemoMode, getEffectiveNow } from './src/dev/demo-mode.js'
import { ensureActiveDataView, getActiveDataContext } from './src/dev/data-view.js'
import { createAdminRouter } from './src/admin/router.js'
import { visitTracker } from './src/admin/visits.js'
import { startSampler } from './src/admin/metrics.js'
import cron from 'node-cron'
import { startDailyBackup } from './src/admin/db-backup.js'
import { startOpsAlerts } from './src/alerts/ops-alerts.js'
import { recordBoot } from './src/admin/process-health.js'
import { getDb } from './src/db/index.js'
import { createMeRouter } from './src/me/presets.js'
import { createRoutesRouter } from './src/me/routes.js'
import { createAlertsRouter } from './src/me/alerts.js'
import { createPushRouter } from './src/me/push.js'
import { createDevRouter } from './src/dev/scenario.js'
import { recordRequest, bumpCache } from './src/dev/instrument.js'
import { createMeRequestsRouter } from './src/me/requests.js'
import { createForecasterRouter } from './src/forecaster/router.js'
import adsbProcessor from './src/processors/adsb-processor.js'
import { sampleQueryGrid, classifyVisibility } from './src/processors/flight-category-processor.js'
import { classifyCeilingFt } from './src/processors/flight-category/ceiling-kim.js'
import warningTypes from '../shared/warning-types.js'
import alertDefaults from '../shared/alert-defaults.js'
import { buildVerticalProfile } from './src/briefing/vertical-profile.js'
import { composeBriefing } from './src/briefing/briefing-composer.js'
import { loadAirspaceZoneItems } from './src/briefing/airspace-zones.js'
import { createDefaultTerrainSampler } from './src/terrain/terrain-sampler.js'
import { createTerrainRgbTiler } from './src/terrain/terrain-rgb-tiles.js'
import {
  buildKimCloudPotentialFieldFromGrid,
  buildKimIcingFieldFromGrid,
  KIM_NWP_ICING_LEVEL_IDS,
  KIM_NWP_MOISTURE_LEVEL_IDS,
  buildKimTemperatureFieldFromGrid,
  buildKimSurfaceWindFieldFromWindGrid,
  filterKimNwpIndexForVariables,
} from './src/processors/kim-nwp-model.js'
import {
  readKimNwpGrid,
  readKimNwpIndex,
  readKimNwpLatest,
  validateKimNwpSelection,
} from './src/processors/kim-nwp-store.js'
import { readKtgLatest, readKtgIndex, readKtgCoords, readKtgGridSafe } from './src/processors/ktg-store.js'
import { loadRouteCrossSection } from './src/briefing/enroute-cross-section.js'
import { buildRouteExposure } from './src/briefing/route-exposure.js'
import { attachActiveAipConstraints } from './src/briefing/aip-airway-constraints.js'
import { buildAltitudeCandidates, buildAltitudeWeatherComparison } from './src/briefing/altitude-weather-comparison.js'
import { buildRouteAxis } from './src/briefing/route-axis.js'
import { ctpsIndexForLatLon } from './src/lib/ctps-grid.js'
import { decodeCtpsRecord } from './src/processors/convective-satellite-model.js'
import { echoTopIndexForLatLon } from './src/lib/echo-top-grid.js'
import { decodeEchoTopRecord } from './src/processors/echo-top-model.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// libvips(sharp) 연산 캐시 끔 — 레이더/위성/오버레이 PNG 생성 시 네이티브 메모리가 안 줄고 쌓이는 것 방지. #메모리
sharp.cache(false)
const app = express()
const PORT = process.env.BACKEND_PORT || 3001
const HOST = process.env.BACKEND_HOST || '127.0.0.1'
ensureActiveDataView()
const DATA_ROOT = config.storage.active_path
const LIVE_DATA_ROOT = config.storage.base_path
const terrainSampler = createDefaultTerrainSampler(DATA_ROOT)
const renderTerrainRgbTile = createTerrainRgbTiler({ terrainRoot: path.join(DATA_ROOT, 'terrain') })
const KIM_ICING_REQUIRED_VARIABLES = ['T', 'rh_liq', 'w', 'tqc', 'tqi', 'tqr', 'tqs', 'cld']
const SNAPSHOT_META_CACHE_TTL_MS = 5000
const snapshotMetaCache = { key: null, value: null, expiresAt: 0 }

app.disable('x-powered-by')
app.set('trust proxy', true)
// 보안 헤더. CSP·CORP·COEP는 끔 — 지도 타일/`/data` 이미지의 교차출처 로딩을 깨지 않기 위함(그건 nginx/프론트가 담당).
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false, crossOriginEmbedderPolicy: false }))
app.use(express.json({ limit: '1mb' }))
app.use(compression())

// #7 인증: (개발) CORS credentials + 세션. 공개 API는 saveUninitialized:false라 세션쿠키 안 생김.
// NODE_ENV==='test'는 제외 — route 단위 테스트가 server.js를 import만 하므로 세션스토어 DB open(파일잠금) 회피.
if (process.env.NODE_ENV !== 'test') {
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173', credentials: true }))
  }
  app.use(cookieParser()) // 익명 방문자 쿠키(amo.vid) 파싱 — sessionMiddleware 앞. 관리자 콘솔
  app.use(sessionMiddleware())
  app.use(visitTracker(getDb)) // 방문 추적(비로그인 포함). /api·/data 제외.

  // AUTO_ADMIN_LOGIN=1(로컬 전용): 매 요청을 로컬 admin 계정으로 자동 인증.
  // 서버엔 이미 admin 계정이 있지만 로컬 DB엔 없어서, 매번 로그인하지 않도록 최초 1회 생성 후 세션에 주입.
  // production에서는 절대 켜지지 않게 이중 차단(위 NODE_ENV!=='test' 블록 + 아래 조건).
  if (process.env.AUTO_ADMIN_LOGIN && process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      if (!req.session.userId) {
        const db = getDb()
        let admin = db.prepare('SELECT id, role FROM users WHERE username = ?').get('local_admin')
        if (!admin) admin = createUser(db, { username: 'local_admin', password: 'local-admin-dev-only', role: 'admin', status: 'active' })
        req.session.userId = admin.id
        req.session.role = admin.role
        req.session.absoluteExpiry = Date.now() + ABSOLUTE_TTL_MS
      }
      next()
    })
  }
}

function readJsonFileSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function setGeneratedDataCacheHeaders(res, filePath) {
  const relPath = path.relative(DATA_ROOT, filePath).replace(/\\/g, '/')

  if (/^radar\/echo_korea_\d{12}\.png$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (/^radar\/echotop\/echotop_\d{12}\.webp$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (/^radar\/(?:wissdom\/wissdom_\d+_\d{12}|qpf\/qpf_\d{12}_p\d+)(?:_legend)?\.webp$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (/^satellite\/convective\/(?:ci_\d{12}\.geojson|ctps_\d{12}_(?:all|fl\d{3})\.webp)$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (/^satellite\/sat_korea_\d{12}\.(?:png|webp)$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (/^sigwx_low\/(?:fronts|clouds)_\d{10}\.png$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (
    relPath === 'radar/echo_meta.json'
    || relPath === 'radar/echotop/echotop_meta.json'
    || relPath === 'radar/wissdom/wissdom_meta.json'
    || relPath === 'radar/qpf/qpf_meta.json'
    || relPath === 'satellite/sat_meta.json'
    || relPath === 'satellite/convective/convective_meta.json'
    || /^sigwx_low\/(?:fronts_meta|clouds_meta)_\d{10}\.json$/i.test(relPath)
  ) {
    res.setHeader('Cache-Control', 'no-cache')
    return
  }

  res.setHeader('Cache-Control', 'no-cache')
}

app.use('/data', (req, res, next) => {
  if (/^\/satellite\/convective\/ctps_\d{12}\.bin$/i.test(req.path)) return res.status(404).end()
  // 사이트별 원시 gate 배열이 담긴 합성 바이너리는 브라우저에 절대 노출하지 않는다(FR-009).
  if (/^\/radar\/echotop\/echotop_\d{12}\.bin$/i.test(req.path)) return res.status(404).end()
  next()
})
app.use('/data', express.static(DATA_ROOT, { setHeaders: setGeneratedDataCacheHeaders }))
function isImmutableKimFieldRequest(req) {
  return /^\/kim\/(?:wind|temp|cloud|icing)\/field$/i.test(req.path)
}

function isRevalidatedApiRequest(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  return (
    /^\/(?:airports|warning-types|alert-defaults)$/i.test(req.path)
    || /^\/(?:metar|taf|warning|kma-special-warning|sigmet|airmet|sigwx-low|lightning|amos|adsb|ground-forecast|ground-overview|environment|airport-info|typhoon)$/i.test(req.path)
    || /^\/(?:metar|taf|sigmet)-overseas$/i.test(req.path)
    || /^\/sigwx-low-history$/i.test(req.path)
    || /^\/radar\/echo-meta$/i.test(req.path)
    || /^\/radar\/(?:wissdom|qpf)-meta$/i.test(req.path)
    || /^\/satellite\/meta$/i.test(req.path)
    || /^\/sigwx-(?:front|cloud)-meta$/i.test(req.path)
    || /^\/sigwx-low-(?:fronts|clouds)$/i.test(req.path)
    || /^\/kim\/(?:wind|temp|cloud|icing)\/index$/i.test(req.path)
  )
}

// Phase 2 계측: 테스트 인스턴스에서만 /api 요청 지연·응답크기를 링버퍼에 적재(/dev 관찰 탭 소스).
if (process.env.DISABLE_COLLECTION) {
  app.use('/api', (req, res, next) => {
    const t0 = Date.now()
    res.on('finish', () => {
      recordRequest({
        t: new Date().toISOString(),
        path: req.originalUrl.split('?')[0],
        method: req.method,
        status: res.statusCode,
        ms: Date.now() - t0,
        bytes: Number(res.getHeader('content-length')) || 0,
      })
    })
    next()
  })
}

app.use('/api', (req, res, next) => {
  if (!isImmutableKimFieldRequest(req) && !isRevalidatedApiRequest(req)) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})

// #7 인증 라우터 (공개 날씨 API와 분리). register/login/logout/me. 세션과 동일하게 실서버에서만.
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/auth', createAuthRouter())
  app.use('/api/me', createMeRouter()) // 내 프리셋(로그인 필요, 자기 것만)
  app.use('/api/me', createRoutesRouter()) // 내 저장 경로
  app.use('/api/me', createAlertsRouter()) // #13 예정 비행(알림) 등록·관리
  app.use('/api/me', createPushRouter()) // Web Push(VAPID) 구독·admin 테스트 발송
  app.use('/api/me', createMeRequestsRouter()) // 조종사 문의 생성/상태
  app.use('/api/forecaster', createForecasterRouter()) // 예보관 문의 대기열(담당공항만)
  app.use('/api/admin', createAdminRouter()) // 관리자 콘솔(requireRole admin)
  if (process.env.DISABLE_COLLECTION) {
    // 테스트 인스턴스(cron off)에서만 마운트 — 일반 모드에선 주입이 readLatest/cron에 되돌려져 무의미하므로 아예 노출 안 함.
    app.use('/api/dev', createDevRouter()) // 개발 전용: 가상 악기상 주입/초기화
  }
}

function readLatest(type) {
  const cached = store.getCached(type)
  // 테스트 인스턴스(DISABLE_COLLECTION): 디스크 재조정을 건너뛰고 캐시를 그대로 서빙.
  // → 개발자 주입(in-memory)이 지도·API에 일관 반영되고 파일(운영 원본)은 안 건드림. 수집이 없어 디스크는 어차피 고정.
  if (process.env.DISABLE_COLLECTION) return cached
  const filePath = path.join(DATA_ROOT, type, 'latest.json')

  if (!fs.existsSync(filePath)) return cached

  const latest = readJsonFileSafe(filePath)
  if (!latest) return cached

  const diskHash = latest.content_hash || store.canonicalHash(latest)
  const cachedHash = cached?.content_hash || (cached ? store.canonicalHash(cached) : null)

  if (cached && cachedHash === diskHash) return cached

  store.updateCache(type, latest, diskHash)
  return latest
}

function requestHasMatchingEtag(req, etag) {
  const value = req?.headers?.['if-none-match']
  if (!value) return false
  return value.split(',').map((candidate) => candidate.trim()).includes(etag)
}

function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store')
}

function etagOf(seed) {
  return `"${crypto.createHash('sha256').update(String(seed)).digest('hex')}"`
}

// 공통: ETag/Vary 헤더 + if-none-match 304 + json. Cache-Control만 호출자가 정한다.
// lastModified(optional): 있으면 Last-Modified 헤더도 세운다(304에도 포함). computed_at 등 ms/ISO/Date 허용.
function sendWithEtag(res, payload, etag, cacheControl, { lastModified } = {}) {
  res.setHeader('Cache-Control', cacheControl)
  res.setHeader('ETag', etag)
  res.setHeader('Vary', 'Accept-Encoding')
  if (lastModified != null) res.setHeader('Last-Modified', new Date(lastModified).toUTCString())
  if (requestHasMatchingEtag(res.req, etag)) {
    res.status(304).end()
    return
  }
  res.json(payload)
}

function sendRevalidatedJson(res, payload, etagSeed, { staticConfig = false } = {}) {
  sendWithEtag(res, payload, etagOf(etagSeed), staticConfig ? 'no-cache' : 'no-cache, must-revalidate')
}

function sendLatest(res, type) {
  const data = readLatest(type)
  if (data) return sendRevalidatedJson(res, data, data.content_hash || store.canonicalHash(data))
  setNoStore(res)
  res.status(503).json({ error: `${type} data unavailable` })
}

function sendJsonFile(res, filePath) {
  const payload = readJsonFileSafe(filePath)
  if (payload) return sendRevalidatedJson(res, payload, store.canonicalHash(payload))
  setNoStore(res)
  res.status(503).json({ error: 'data unavailable' })
}

function sendImmutableJson(res, payload, etagSeed) {
  sendWithEtag(res, payload, etagOf(etagSeed), 'public, max-age=86400, immutable')
}

function sendStaticConfigJson(res, payload, name) {
  sendRevalidatedJson(res, payload, `${name}:${store.canonicalHash(payload)}`, { staticConfig: true })
}

function readRecent(type, limit = 10) {
  const dir = path.join(DATA_ROOT, type)
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir)
    .filter((name) => {
      if (!name.endsWith('.json') || name === 'latest.json') return false
      if (type === 'sigwx_low') return /^SIGWX_LOW_\d{10}\.json$/i.test(name)
      return true
    })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)

  return files.map((name) => ({
    ...readJsonFileSafe(path.join(dir, name)),
    file_name: name,
  }))
}

function resolveSigwxTmfc(queryTmfc) {
  const requested = String(queryTmfc || '').trim()
  if (requested) return requested
  const data = readLatest('sigwx_low')
  return data?.tmfc || ''
}

function readSigwxOverlayMeta(kind, tmfc) {
  const normalized = String(tmfc || '').trim()
  if (!/^\d{10}$/.test(normalized)) return null
  const prefix = kind === 'clouds' ? 'clouds_meta' : 'fronts_meta'
  return readJsonFileSafe(path.join(DATA_ROOT, 'sigwx_low', `${prefix}_${normalized}.json`))
}

function sendSigwxOverlayMeta(req, res, kind) {
  const tmfc = resolveSigwxTmfc(req.query.tmfc)
  const payload = readSigwxOverlayMeta(kind, tmfc)
  sendRevalidatedJson(res, payload, `${kind}:${tmfc}:${store.canonicalHash(payload)}`)
}

function buildHashEntry(type) {
  const data = readLatest(type)
  if (!data) return null
  return { hash: data.content_hash || store.canonicalHash(data) }
}

function buildKimNwpSnapshotEntry() {
  const latest = readKimNwpLatest(DATA_ROOT)
  if (!latest) return null
  const index = readKimNwpIndex(DATA_ROOT)
  const uvIndex = index ? filterKimNwpIndexForVariables(index, ['u', 'v']) : null
  const tempIndex = index ? filterKimNwpIndexForVariables(index, ['T']) : null
  const cloudIndex = index
    ? filterKimNwpIndexForLevels(filterKimNwpIndexForVariables(index, ['T', 'rh']), KIM_NWP_MOISTURE_LEVEL_IDS)
    : null
  const icingIndex = index
    ? filterKimNwpIndexForLevels(filterKimNwpIndexForVariables(index, KIM_ICING_REQUIRED_VARIABLES), KIM_NWP_ICING_LEVEL_IDS)
    : null
  return {
    hash: latest.content_hash || store.canonicalHash(latest),
    tmfc: latest.latestRun || null,
    updated_at: latest.updated_at || null,
    variables: {
      uv: { hash: uvIndex ? store.canonicalHash(uvIndex) : null },
      T: { hash: tempIndex ? store.canonicalHash(tempIndex) : null },
      cloud: { hash: cloudIndex ? store.canonicalHash(cloudIndex) : null },
      icing: { hash: icingIndex ? store.canonicalHash(icingIndex) : null },
    },
  }
}

function buildFrameEntry(filePath) {
  const payload = readJsonFileSafe(filePath)
  if (!payload?.tm) return null
  return { tm: payload.tm }
}

function buildRadarGraphicsSnapshotEntry(payload) {
  const frames = payload?.frames || Object.values(payload?.framesByHeight || {}).flat()
  const latest = [...frames].sort((a, b) => (a.validTimeMs || a.timeMs || 0) - (b.validTimeMs || b.timeMs || 0)).at(-1)
  return latest?.tm ? { hash: store.canonicalHash(payload), tm: latest.tm, updated_at: payload.updatedAt || null } : null
}

function buildSigwxOverlaySnapshotEntry(kind) {
  const tmfc = resolveSigwxTmfc()
  const meta = readSigwxOverlayMeta(kind, tmfc)
  if (!meta) return null
  return {
    tmfc: meta.tmfc || tmfc || null,
    source_hash: meta.source_hash || null,
    updated_at: meta.updated_at || null,
    render_version: meta.render_version || null,
  }
}

function fileMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}

const snapshotMetaFile = (...p) => path.join(DATA_ROOT, ...p)
const snapshotMetaLatest = (type) => snapshotMetaFile(type, 'latest.json')

function buildKimSurfaceWindEntry() {
  const data = readLatest('kim_surface_wind')
  if (!data) return null
  return {
    hash: data.content_hash || store.canonicalHash(data),
    tmfc: data.time?.tmfc || null,
    hf: data.time?.hf ?? null,
    updated_at: data.fetched_at || null,
  }
}

function buildConvectiveSnapshotEntry() {
  const meta = readJsonFileSafe(snapshotMetaFile('satellite', 'convective', 'convective_meta.json'))
  return meta ? { hash: store.canonicalHash(meta), tm: meta.tm || null } : null
}

function buildKtgSnapshotEntry() {
  const ktgLatest = readKtgLatest(DATA_ROOT)
  return ktgLatest ? { hash: store.canonicalHash(ktgLatest), tmfc: ktgLatest.tmfc || null } : null
}

// snapshot-meta의 단일 소스 테이블 — payload와 캐시키가 모두 여기서 파생된다(두 목록 표류 제거).
// keys: 출력 키(이중 키는 둘 다) · files: mtime로 캐시 무효화할 정적 파일 · build: 소스별 차이를 숨긴 thunk.
const SNAPSHOT_SOURCES = [
  { keys: ['metar'], files: [snapshotMetaLatest('metar')], build: () => buildHashEntry('metar') },
  { keys: ['metarOverseas', 'metar_overseas'], files: [snapshotMetaLatest('metar_overseas')], build: () => buildHashEntry('metar_overseas') },
  { keys: ['taf'], files: [snapshotMetaLatest('taf')], build: () => buildHashEntry('taf') },
  { keys: ['tafOverseas', 'taf_overseas'], files: [snapshotMetaLatest('taf_overseas')], build: () => buildHashEntry('taf_overseas') },
  { keys: ['warning'], files: [snapshotMetaLatest('warning')], build: () => buildHashEntry('warning') },
  { keys: ['kmaSpecialWarning'], files: [snapshotMetaLatest('kma_special_warning')], build: () => buildHashEntry('kma_special_warning') },
  { keys: ['sigmet'], files: [snapshotMetaLatest('sigmet')], build: () => buildHashEntry('sigmet') },
  { keys: ['sigmetOverseas', 'sigmet_overseas'], files: [snapshotMetaLatest('sigmet_overseas')], build: () => buildHashEntry('sigmet_overseas') },
  { keys: ['airmet'], files: [snapshotMetaLatest('airmet')], build: () => buildHashEntry('airmet') },
  { keys: ['sigwxLow', 'sigwx_low'], files: [snapshotMetaLatest('sigwx_low')], build: () => buildHashEntry('sigwx_low') },
  { keys: ['amos'], files: [snapshotMetaLatest('amos')], build: () => buildHashEntry('amos') },
  { keys: ['lightning'], files: [snapshotMetaLatest('lightning')], build: () => buildHashEntry('lightning') },
  { keys: ['typhoon'], files: [snapshotMetaLatest('typhoon')], build: () => buildHashEntry('typhoon') },
  { keys: ['adsb'], files: [snapshotMetaLatest('adsb')], build: () => buildHashEntry('adsb') },
  { keys: ['kimNwp', 'kim_nwp'], files: [snapshotMetaFile('kim_nwp', 'index.json'), snapshotMetaFile('kim_nwp', 'latest.json')], build: buildKimNwpSnapshotEntry },
  { keys: ['kimSurfaceWind', 'kim_surface_wind'], files: [snapshotMetaLatest('kim_surface_wind')], build: buildKimSurfaceWindEntry },
  { keys: ['groundForecast', 'ground_forecast'], files: [snapshotMetaLatest('ground_forecast')], build: () => buildHashEntry('ground_forecast') },
  { keys: ['groundOverview', 'ground_overview'], files: [snapshotMetaLatest('ground_overview')], build: () => buildHashEntry('ground_overview') },
  { keys: ['environment'], files: [snapshotMetaLatest('environment')], build: () => buildHashEntry('environment') },
  { keys: ['airportInfo'], files: [snapshotMetaLatest('airport_info')], build: () => buildHashEntry('airport_info') },
  { keys: ['takeoffFcst', 'takeoff_fcst'], files: [snapshotMetaLatest('takeoff_fcst')], build: () => buildHashEntry('takeoff_fcst') },
  { keys: ['notam'], files: [snapshotMetaLatest('notam')], build: () => buildHashEntry('notam') },
  { keys: ['echoMeta', 'echo'], files: [snapshotMetaFile('radar', 'echo_meta.json')], build: () => buildFrameEntry(snapshotMetaFile('radar', 'echo_meta.json')) },
  { keys: ['hsrMeta', 'hsr'], files: [snapshotMetaFile('radar', 'hsr', 'hsr_meta.json')], build: () => buildRadarGraphicsSnapshotEntry(readJsonFileSafe(snapshotMetaFile('radar', 'hsr', 'hsr_meta.json'))) },
  { keys: ['hciMeta', 'hci'], files: [snapshotMetaFile('radar', 'hci', 'hci_meta.json')], build: () => buildRadarGraphicsSnapshotEntry(readJsonFileSafe(snapshotMetaFile('radar', 'hci', 'hci_meta.json'))) },
  { keys: ['wissdomMeta', 'wissdom'], files: [snapshotMetaFile('radar', 'wissdom', 'wissdom_meta.json')], build: () => buildRadarGraphicsSnapshotEntry(readJsonFileSafe(snapshotMetaFile('radar', 'wissdom', 'wissdom_meta.json'))) },
  { keys: ['qpfMeta', 'qpf'], files: [snapshotMetaFile('radar', 'qpf', 'qpf_meta.json')], build: () => buildRadarGraphicsSnapshotEntry(readJsonFileSafe(snapshotMetaFile('radar', 'qpf', 'qpf_meta.json'))) },
  { keys: ['echoTopMeta'], files: [snapshotMetaFile('radar', 'echotop', 'echotop_meta.json')], build: () => buildFrameEntry(snapshotMetaFile('radar', 'echotop', 'echotop_meta.json')) },
  { keys: ['satMeta', 'satellite'], files: [snapshotMetaFile('satellite', 'sat_meta.json')], build: () => buildFrameEntry(snapshotMetaFile('satellite', 'sat_meta.json')) },
  { keys: ['satVisibleMeta'], files: [snapshotMetaFile('satellite', 'visible', 'visible_meta.json')], build: () => buildFrameEntry(snapshotMetaFile('satellite', 'visible', 'visible_meta.json')) },
  { keys: ['convectiveMeta'], files: [snapshotMetaFile('satellite', 'convective', 'convective_meta.json')], build: buildConvectiveSnapshotEntry },
  { keys: ['rainviewerMeta', 'rainviewer'], files: [snapshotMetaFile('radar', 'rainviewer_meta.json')], build: () => buildFrameEntry(snapshotMetaFile('radar', 'rainviewer_meta.json')) },
  // ponytail: sigwx 오버레이는 파일 경로가 tmfc 동적 → 정적 files 없음(5s TTL로 커버). 정적화는 필요할 때.
  { keys: ['sigwxFrontMeta'], files: [], build: () => buildSigwxOverlaySnapshotEntry('fronts') },
  { keys: ['sigwxCloudMeta'], files: [], build: () => buildSigwxOverlaySnapshotEntry('clouds') },
  { keys: ['flightCategory'], files: [snapshotMetaLatest('flight_category_overlay')], build: () => buildHashEntry('flight_category_overlay') },
  { keys: ['ktg'], files: [snapshotMetaLatest('ktg')], build: buildKtgSnapshotEntry },
]

function buildSnapshotMetaCacheKey() {
  return [
    `view:${getActiveDataContext().revision}`,
    ...SNAPSHOT_SOURCES
    .flatMap((source) => source.files)
    .map((filePath) => `${filePath}:${fileMtimeMs(filePath)}`),
  ]
    .join('|')
}

function getCachedSnapshotMeta(nowMs = Date.now()) {
  const key = buildSnapshotMetaCacheKey()
  if (snapshotMetaCache.value && snapshotMetaCache.key === key && snapshotMetaCache.expiresAt > nowMs) {
    if (process.env.DISABLE_COLLECTION) bumpCache(true) // Phase 2: 헛fetch 계측(5s TTL 적중)
    return snapshotMetaCache.value
  }
  if (process.env.DISABLE_COLLECTION) bumpCache(false)
  const value = buildSnapshotMeta()
  snapshotMetaCache.key = key
  snapshotMetaCache.value = value
  snapshotMetaCache.expiresAt = nowMs + SNAPSHOT_META_CACHE_TTL_MS
  return value
}

function buildSnapshotMeta() {
  const out = { viewRevision: getActiveDataContext().revision }
  for (const source of SNAPSHOT_SOURCES) {
    const value = source.build()
    for (const key of source.keys) out[key] = value
  }
  return out
}

export function filterKimNwpIndexForMap(index, nowMs = Date.now()) {
  const times = index?.times || []
  const pastTimes = []
  const futureTimes = []
  for (const time of times) {
    const validMs = Date.parse(time.validTime)
    if (!Number.isFinite(validMs)) continue
    if (validMs >= nowMs) futureTimes.push(time)
    else pastTimes.push({ time, validMs })
  }
  const nearestPast = pastTimes.reduce((nearest, candidate) => (
    !nearest || candidate.validMs > nearest.validMs ? candidate : nearest
  ), null)
  const exposedTimes = nearestPast ? [nearestPast.time, ...futureTimes] : futureTimes
  const exposedHfs = new Set(exposedTimes.map((time) => String(time.hf)))
  const availability = {}
  for (const [levelId, byHf] of Object.entries(index?.availability || {})) {
    for (const [hf, entry] of Object.entries(byHf || {})) {
      if (!exposedHfs.has(String(hf))) continue
      availability[levelId] ||= {}
      availability[levelId][String(hf)] = entry
    }
  }
  const levels = (index?.levels || []).filter((level) => availability[level.id])
  return { ...index, levels, times: exposedTimes, availability }
}

export function filterKimNwpIndexForMapVariables(index, requiredVariables = [], nowMs = Date.now()) {
  return filterKimNwpIndexForMap(filterKimNwpIndexForVariables(index, requiredVariables), nowMs)
}

function filterKimNwpIndexForLevels(index, levelIds = []) {
  const allowed = new Set(levelIds)
  const availability = {}
  for (const [levelId, byHf] of Object.entries(index?.availability || {})) {
    if (!allowed.has(levelId)) continue
    availability[levelId] = byHf
  }
  const availableHfs = new Set(Object.values(availability).flatMap((byHf) => Object.keys(byHf || {})))
  return {
    ...index,
    levels: (index?.levels || []).filter((level) => allowed.has(level.id) && availability[level.id]),
    times: (index?.times || []).filter((time) => availableHfs.has(String(time.hf))),
    availability,
  }
}

export function filterKimCloudIndexForMap(index, nowMs = Date.now()) {
  return filterKimNwpIndexForMap(
    filterKimNwpIndexForLevels(filterKimNwpIndexForVariables(index, ['T', 'rh']), KIM_NWP_MOISTURE_LEVEL_IDS),
    nowMs,
  )
}

export function filterKimIcingIndexForMap(index, nowMs = Date.now()) {
  return filterKimNwpIndexForMap(
    filterKimNwpIndexForLevels(filterKimNwpIndexForVariables(index, KIM_ICING_REQUIRED_VARIABLES), KIM_NWP_ICING_LEVEL_IDS),
    nowMs,
  )
}

function selectDefaultKimNwpField(index) {
  const preferredLevel = index?.levels?.find((level) => level.id === '10m') || index?.levels?.[0]
  if (!preferredLevel) return null
  const time = (index.times || []).find((candidate) =>
    index.availability?.[preferredLevel.id]?.[String(candidate.hf)])
  if (!time) return null
  return { tmfc: index.latestRun, hf: time.hf, level: preferredLevel.id }
}

function readSelectedKimField(selection, buildFn) {
  validateKimNwpSelection({ tmfc: selection.tmfc, hf: selection.hf, levelId: selection.level })
  const grid = readKimNwpGrid({
    root: DATA_ROOT,
    model: 'KIMG/NE57',
    tmfc: selection.tmfc,
    hf: Number(selection.hf),
    levelId: selection.level,
  })
  return buildFn(grid)
}

// Kept as named exports for backwards compatibility (used in cross-section route and tests).
function readSelectedKimCloudField(selection) {
  return readSelectedKimField(selection, buildKimCloudPotentialFieldFromGrid)
}
function readSelectedKimIcingField(selection) {
  return readSelectedKimField(selection, buildKimIcingFieldFromGrid)
}

function sendKimField(req, res, { type, buildFn, errorLabel }) {
  try {
    const selection = {
      tmfc: String(req.query.tmfc || ''),
      hf: Number(req.query.hf),
      level: String(req.query.level || ''),
    }
    // Early 304: (tmfc, hf, level) uniquely identifies an immutable KIM field — no need to read the grid.
    const etagSeed = `kim-${type}:${selection.tmfc}:${selection.hf}:${selection.level}`
    const etag = etagOf(etagSeed)
    if (requestHasMatchingEtag(req, etag)) {
      res.status(304).end()
      return
    }
    const field = readSelectedKimField(selection, buildFn)
    sendImmutableJson(res, field, etagSeed)
  } catch (error) {
    res.status(400).json({ error: error.message || errorLabel })
  }
}

// KIM index 라우트 공통: index 읽기 → buildPayload로 변환 후 revalidated 전송, 없으면 503.
function sendKimIndex(res, { buildPayload, errorLabel }) {
  const index = readKimNwpIndex(DATA_ROOT)
  if (index) {
    const payload = buildPayload(index, getEffectiveNow().getTime())
    sendRevalidatedJson(res, payload, store.canonicalHash(payload))
    return
  }
  setNoStore(res)
  res.status(503).json({ error: errorLabel })
}

function sendKimWindField(req, res, { allowDefault = false } = {}) {
  try {
    let selection = {
      tmfc: String(req.query.tmfc || ''),
      hf: Number(req.query.hf),
      level: String(req.query.level || ''),
    }

    if (allowDefault && (!selection.tmfc || !selection.level || !Number.isFinite(selection.hf))) {
      const index = readKimNwpIndex(DATA_ROOT)
      selection = index ? selectDefaultKimNwpField(filterKimNwpIndexForMap(index, getEffectiveNow().getTime())) : null
    }

    if (!selection) {
      res.status(503).json({ error: 'kim wind field unavailable' })
      return
    }

    const etagSeed = `kim-wind:${selection.tmfc}:${selection.hf}:${selection.level}`
    const etag = etagOf(etagSeed)
    if (requestHasMatchingEtag(req, etag)) {
      res.status(304).end()
      return
    }
    const field = readSelectedKimField(selection, buildKimSurfaceWindFieldFromWindGrid)
    sendImmutableJson(res, field, etagSeed)
  } catch (error) {
    res.status(400).json({ error: error.message || 'invalid kim wind selection' })
  }
}

app.get('/api/metar', (_, res) => sendLatest(res, 'metar'))
app.get('/api/taf', (_, res) => sendLatest(res, 'taf'))
app.get('/api/warning', (_, res) => sendLatest(res, 'warning'))
app.get('/api/kma-special-warning', (_, res) => sendLatest(res, 'kma_special_warning'))
app.get('/api/sigmet', (_, res) => sendLatest(res, 'sigmet'))
// 해외(NOAA) — 국내와 별도 파일/별도 API로 유지.
app.get('/api/metar-overseas', (_, res) => sendLatest(res, 'metar_overseas'))
app.get('/api/taf-overseas', (_, res) => sendLatest(res, 'taf_overseas'))
app.get('/api/sigmet-overseas', (_, res) => sendLatest(res, 'sigmet_overseas'))
app.get('/api/airmet', (_, res) => sendLatest(res, 'airmet'))
app.get('/api/sigwx-low', (_, res) => sendLatest(res, 'sigwx_low'))
app.get('/api/lightning', (_, res) => sendLatest(res, 'lightning'))
app.get('/api/typhoon', (_, res) => sendLatest(res, 'typhoon'))
app.get('/api/amos', (_, res) => sendLatest(res, 'amos'))
app.get('/api/takeoff-fcst', (_, res) => sendLatest(res, 'takeoff_fcst'))
app.get('/api/notam', (_, res) => sendLatest(res, 'notam'))
// ADS-B is collected on demand: only refresh adsb.lol when a viewer requests it and
// the snapshot is stale. No viewers -> no upstream calls. Cold start waits for the fetch.
const ADSB_REFRESH_MS = 5 * 60 * 1000
const ADSB_COLD_MS = 30 * 60 * 1000
let adsbRefreshing = null
function adsbFileAgeMs() {
  try {
    return Date.now() - fs.statSync(path.join(LIVE_DATA_ROOT, 'adsb', 'latest.json')).mtimeMs
  } catch {
    return Infinity
  }
}
function triggerAdsbRefresh() {
  if (!adsbRefreshing) {
    adsbRefreshing = Promise.resolve()
      .then(() => adsbProcessor.process())
      .catch((err) => console.error('[adsb] on-demand refresh failed:', err.message))
      .finally(() => { adsbRefreshing = null })
  }
  return adsbRefreshing
}
app.get('/api/adsb', async (_req, res) => {
  const age = adsbFileAgeMs()
  if (age >= ADSB_REFRESH_MS) {
    const pending = triggerAdsbRefresh()
    if (age >= ADSB_COLD_MS) {
      await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 8000))])
    }
  }
  sendLatest(res, 'adsb')
})

// Flight route lookup (origin/destination) via adsbdb.com, proxied + cached so a
// single hover is shared across users. Routes are stable, so cache long; back off on 429.
const adsbRouteCache = new Map()
const ADSB_ROUTE_TTL_MS = 6 * 60 * 60 * 1000
let adsbdbBackoffUntil = 0
app.get('/api/adsb/route/:callsign', async (req, res) => {
  const callsign = String(req.params.callsign || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  if (!callsign) { res.json({ route: null }); return }

  const now = Date.now()
  const cached = adsbRouteCache.get(callsign)
  if (cached && cached.expires > now) { res.json({ route: cached.route }); return }
  if (now < adsbdbBackoffUntil) { res.json({ route: null }); return }

  try {
    const response = await fetch(`https://api.adsbdb.com/v0/callsign/${callsign}`, {
      headers: { 'User-Agent': 'ProjectAMO/1.0 (+https://www.projectamo.co.kr)' },
      signal: AbortSignal.timeout(8000),
    })
    if (response.status === 429) { adsbdbBackoffUntil = now + 60_000; res.json({ route: null }); return }
    if (!response.ok) {
      adsbRouteCache.set(callsign, { route: null, expires: now + ADSB_ROUTE_TTL_MS })
      res.json({ route: null }); return
    }
    const data = await response.json()
    const fr = data?.response?.flightroute
    let route = null
    if (fr?.origin?.icao_code && fr?.destination?.icao_code) {
      route = {
        origin: { icao: fr.origin.icao_code, city: fr.origin.municipality || null },
        destination: { icao: fr.destination.icao_code, city: fr.destination.municipality || null },
      }
    }
    adsbRouteCache.set(callsign, { route, expires: now + ADSB_ROUTE_TTL_MS })
    res.json({ route })
  } catch {
    res.json({ route: null })
  }
})
app.get('/api/kim/surface-wind', (req, res) => {
  const hasSelection = req.query.tmfc || req.query.hf || req.query.level
  const index = readKimNwpIndex(DATA_ROOT)
  if (index) {
    sendKimWindField(req, res, { allowDefault: !hasSelection })
    return
  }
  sendLatest(res, 'kim_surface_wind')
})
app.get('/api/kim/wind/index', (_req, res) => sendKimIndex(res, {
  buildPayload: (index, nowMs) => filterKimNwpIndexForMapVariables(index, ['u', 'v'], nowMs),
  errorLabel: 'kim wind index unavailable',
}))
app.get('/api/kim/wind/field', (req, res) => sendKimWindField(req, res))
app.get('/api/kim/temp/index', (_req, res) => sendKimIndex(res, {
  buildPayload: (index, nowMs) => ({ ...filterKimNwpIndexForMapVariables(index, ['T'], nowMs), type: 'kim_nwp_temp_index' }),
  errorLabel: 'kim temp index unavailable',
}))
app.get('/api/kim/temp/field', (req, res) =>
  sendKimField(req, res, { type: 'temp', buildFn: buildKimTemperatureFieldFromGrid, errorLabel: 'invalid kim temp selection' })
)
app.get('/api/kim/cloud/index', (_req, res) => sendKimIndex(res, {
  buildPayload: (index, nowMs) => ({ ...filterKimCloudIndexForMap(index, nowMs), type: 'kim_nwp_cloud_index' }),
  errorLabel: 'kim cloud index unavailable',
}))
app.get('/api/kim/cloud/field', (req, res) =>
  sendKimField(req, res, { type: 'cloud', buildFn: buildKimCloudPotentialFieldFromGrid, errorLabel: 'invalid kim cloud selection' })
)
app.get('/api/kim/icing/index', (_req, res) => sendKimIndex(res, {
  buildPayload: (index, nowMs) => ({ ...filterKimIcingIndexForMap(index, nowMs), type: 'kim_nwp_icing_index' }),
  errorLabel: 'kim icing index unavailable',
}))
app.get('/api/kim/icing/field', (req, res) =>
  sendKimField(req, res, { type: 'icing', buildFn: buildKimIcingFieldFromGrid, errorLabel: 'invalid kim icing selection' })
)
app.get('/api/ktg/index', (_req, res) => {
  const latest = readKtgLatest(DATA_ROOT)
  const index = latest ? readKtgIndex(DATA_ROOT) : null
  if (latest && index) {
    setNoStore(res)
    // hours: 확보된 예보시간 전체(슬라이더용). 구버전 index엔 없으므로 latest 단일 hf로 대체.
    const hours = index.hours ?? [{ hf: latest.hf, validTime: latest.validTime }]
    res.json({ tmfc: latest.tmfc, hf: latest.hf, validTime: latest.validTime, hours, altLevelsFt: index.altLevelsFt ?? [] })
    return
  }
  setNoStore(res)
  res.status(503).json({ error: 'ktg index unavailable' })
})

app.get('/api/ktg/grid', (req, res) => {
  const altFt = Number(req.query.altFt) || 3000
  const latest = readKtgLatest(DATA_ROOT)
  if (!latest) {
    setNoStore(res)
    res.status(503).json({ error: 'ktg data unavailable' })
    return
  }
  // hf 지정 시 해당 예보시간, 없으면 최신(nearest). 없는 hf 요청은 최신으로 폴백.
  const index = readKtgIndex(DATA_ROOT)
  const hours = index?.hours ?? [{ hf: latest.hf, validTime: latest.validTime }]
  const requestedHf = Number(req.query.hf)
  const match = Number.isFinite(requestedHf) ? hours.find((h) => h.hf === requestedHf) : null
  const hf = match ? match.hf : latest.hf
  const validTime = match ? match.validTime : latest.validTime
  const coords = readKtgCoords({ root: DATA_ROOT, tmfc: latest.tmfc, hf })
  const gridData = readKtgGridSafe({ root: DATA_ROOT, tmfc: latest.tmfc, hf, altFt })
  if (!coords || !gridData) {
    setNoStore(res)
    res.status(503).json({ error: `ktg grid unavailable for ${altFt}ft hf=${hf}` })
    return
  }
  let latMin = Infinity; let latMax = -Infinity; let lonMin = Infinity; let lonMax = -Infinity
  for (const v of coords.lat) { if (v < latMin) latMin = v; if (v > latMax) latMax = v }
  for (const v of coords.lon) { if (v < lonMin) lonMin = v; if (v > lonMax) lonMax = v }
  setNoStore(res)
  res.json({
    altFt,
    grid: { ny: coords.ny, nx: coords.nx, latMin, latMax, lonMin, lonMax },
    ktg: gridData.ktg,
    run: { tmfc: latest.tmfc, hf, validTime },
  })
})

app.get('/api/ground-forecast', (_, res) => sendLatest(res, 'ground_forecast'))
app.get('/api/ground-overview', (_, res) => sendLatest(res, 'ground_overview'))
app.get('/api/environment', (_, res) => sendLatest(res, 'environment'))
app.get('/api/airport-info', (_, res) => sendLatest(res, 'airport_info'))
app.get('/api/terminal-flights', (_, res) => sendLatest(res, 'terminal_flights'))
app.get('/api/overseas-forecast', (_, res) => sendLatest(res, 'overseas_forecast'))

// 지도 도구 '고도 확인' — 단일 점 표고(m). 기존 terrainSampler(브리핑용) 재사용.
app.get('/api/terrain/elevation', (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'invalid lat/lng' })
  }
  const result = terrainSampler.sampleAxis({ samples: [{ index: 0, lon: lng, lat }] })
  res.json({ elevationM: result.terrain.values[0]?.elevationM ?? null })
})

// 지형 근접 색칠용 terrain-RGB 타일. 인천 FIR 안쪽만 표고를 담고 밖은 '자료 없음'이라
// 프런트에서 투명하게 빠진다. 표고는 연직 프로파일과 같은 DEM을 쓴다.
app.get('/api/terrain/rgb/:z/:x/:y.png', async (req, res) => {
  const z = Number(req.params.z)
  const x = Number(req.params.x)
  const y = Number(req.params.y)
  const limit = 2 ** z
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 14 || x < 0 || y < 0 || x >= limit || y >= limit) {
    return res.status(400).json({ error: 'invalid_tile' })
  }
  try {
    const png = await renderTerrainRgbTile({ z, x, y })
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(png)
  } catch (error) {
    if (error?.code === 'TERRAIN_NOT_READY') return res.status(503).json({ error: 'terrain_not_ready' })
    console.error('[terrain-rgb] tile render failed', error)
    res.status(500).json({ error: 'tile_render_failed' })
  }
})

app.get('/api/weather/flight-category-overlay/point', (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  if (!isFinite(lat) || !isFinite(lon)) return res.status(400).json({ error: 'invalid lat/lon' })

  const data = store.getCached('flight_category_overlay')
  if (!data?.query_grid) return res.status(503).json({ error: 'no data' })

  const sample = sampleQueryGrid(data.query_grid, lat, lon)
  if (!sample) {
    return res.status(400).json({ error: 'out of domain' })
  }

  // 시정 값과 밴드
  const vis_m = sample.vis_m >= 0 ? sample.vis_m : null
  const vis_band = vis_m === null ? 'missing' : classifyVisibility(vis_m)

  // 운고 값과 밴드. 경계는 면을 그리는 CEILING_BANDS와 같은 정의를 쓴다.
  const ceil_ft = sample.ceil_ft >= 0 ? sample.ceil_ft : null
  const ceil_band = classifyCeilingFt(ceil_ft)

  // 3시간 추세 계산
  // trend.vis_delta는 query_grid와 같은 128×128 배열이므로 같은 칸 번호를 쓴다.
  // 좌표를 여기서 다시 계산하지 않는다 — 격자와 다른 규칙을 쓰면 엉뚱한 지역의
  // 추세를 이 지점 값이라고 답하게 된다.
  const vis_trend = data.trend?.vis_delta?.[sample.index] ?? null

  // 가장 가까운 관측 지점
  let nearest_station = null
  if (data.stations && data.stations.length > 0) {
    let minDist = Infinity
    for (const stn of data.stations) {
      const dLat = (stn.lat - lat) * 111.0
      const dLon = (stn.lon - lon) * 111.0 * Math.cos((lat * Math.PI) / 180)
      const dist = Math.hypot(dLat, dLon)
      if (dist < minDist) {
        minDist = dist
        nearest_station = {
          id: stn.id,
          name: stn.name,
          source: stn.source,
          distance_km: Math.round(minDist * 10) / 10,
          ceiling_ft: stn.ceiling_ft,
          model_ceiling_ft: stn.model_ceiling_ft,
          diff_ft: stn.diff_ft,
          sky_clear: stn.sky_clear,
          visibility_m: stn.visibility_m,
          obs_tm: stn.obs_tm,
        }
      }
    }
  }

  res.json({
    lat, lon,
    vis_m,
    vis_band,
    ceil_ft,
    ceil_band,
    vis_trend,
    nearest_station,
  })
})

app.get('/api/weather/flight-category-overlay', (req, res) => {
  const data = store.getCached('flight_category_overlay')
  if (!data) {
    res.setHeader('Cache-Control', 'no-cache')
    return res.status(503).json({ error: 'flight-category overlay not available' })
  }
  const etag = `"${data.content_hash || store.canonicalHash(data)}"`
  const payload = {
    type: data.type,
    fetched_at: data.fetched_at,
    computed_at: data.computed_at,
    visibility: data.visibility,
    ceiling: data.ceiling,
    query_grid: data.query_grid,
    stations: data.stations,
    trend: data.trend,
    sources: data.sources,
  }
  sendWithEtag(res, payload, etag, 'no-cache', { lastModified: data.computed_at })
})
app.get('/api/snapshot-meta', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.json(getCachedSnapshotMeta())
})
app.get('/api/sigwx-low-history', (_req, res) => {
  try {
    const payload = readRecent('sigwx_low', 10)
    sendRevalidatedJson(res, payload, store.canonicalHash(payload))
  } catch {
    setNoStore(res)
    res.status(503).json({ error: 'sigwx history unavailable' })
  }
})

app.get('/api/radar/echo-meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'radar', 'echo_meta.json')),
)

app.get('/api/radar/echo-top-meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'radar', 'echotop', 'echotop_meta.json')),
)

app.get('/api/radar/wissdom-meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'radar', 'wissdom', 'wissdom_meta.json')),
)

app.get('/api/radar/qpf-meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'radar', 'qpf', 'qpf_meta.json')),
)

app.get('/api/satellite/meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'satellite', 'sat_meta.json')),
)

app.get('/api/satellite/convective/ctps-point', (req, res) => {
  const { tm, lat, lon, minFl } = req.query
  const allowed = new Set(['all', '50', '100', '150', '200', '250', '300', '350', '400', '450', '500', '550'])
  const latitude = Number(lat), longitude = Number(lon)
  if (typeof tm !== 'string' || !/^\d{12}$/.test(tm) || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !allowed.has(String(minFl))) return res.status(400).json({ error: 'invalid_query' })
  const meta = readJsonFileSafe(path.join(DATA_ROOT, 'satellite', 'convective', 'convective_meta.json'))
  const frame = meta?.frames?.find((item) => item.tm === tm)
  if (!frame?.ctps) return res.status(404).json({ error: 'frame_not_found' })
  const index = ctpsIndexForLatLon(latitude, longitude)
  if (index === null) return res.status(404).json({ error: 'point_unavailable' })
  try {
    const binary = fs.readFileSync(path.join(DATA_ROOT, 'satellite', 'convective', `ctps_${tm}.bin`))
    const point = decodeCtpsRecord(binary, index)
    if (!point || (minFl !== 'all' && point.heightFt < Number(minFl) * 100)) return res.status(404).json({ error: 'point_unavailable' })
    const request = frame.request_tm_utc
    const observedAt = request ? new Date(Date.UTC(Number(request.slice(0, 4)), Number(request.slice(4, 6)) - 1, Number(request.slice(6, 8)), Number(request.slice(8, 10)), Number(request.slice(10, 12)))).toISOString() : null
    sendImmutableJson(res, { tm, observedAt, heightFt: point.heightFt, fl: Math.round(point.heightFt / 100), temperatureC: point.temperatureC, qualityCode: 0, quality: 'normal' }, `ctps-point:${tm}:${latitude}:${longitude}:${minFl}`)
  } catch {
    res.status(503).json({ error: 'data_unavailable' })
  }
})

app.get('/api/radar/echo-top-point', (req, res) => {
  const { tm, lat, lon } = req.query
  const latitude = Number(lat)
  const longitude = Number(lon)
  if (typeof tm !== 'string' || !/^\d{12}$/.test(tm)
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'invalid_query' })
  }

  const meta = readJsonFileSafe(path.join(DATA_ROOT, 'radar', 'echotop', 'echotop_meta.json'))
  const frame = meta?.frames?.find((item) => item.tm === tm)
  if (!frame) return res.status(404).json({ error: 'frame_not_found' })

  const index = echoTopIndexForLatLon(latitude, longitude)
  if (index === null) return res.status(404).json({ error: 'point_unavailable' })

  try {
    const binary = fs.readFileSync(path.join(DATA_ROOT, 'radar', 'echotop', `echotop_${tm}.bin`))
    const point = decodeEchoTopRecord(binary, index)
    if (!point) return res.status(404).json({ error: 'point_unavailable' })
    sendImmutableJson(res, {
      tm,
      observedAt: frame.observedAt ?? null,
      heightM: point.heightM,
      ft: point.ft,
      fl: point.fl,
      quality: point.quality,
      qualityCode: point.qualityCode,
      threshold_dbz: 18,
      reference: 'MSL',
      site: frame.sites?.[point.siteIndex]?.stn ?? null,
    }, `echo-top-point:${tm}:${latitude}:${longitude}`)
  } catch {
    res.status(503).json({ error: 'data_unavailable' })
  }
})

app.get('/api/airports', (_req, res) => sendStaticConfigJson(res, config.airports, 'airports'))
app.get('/api/warning-types', (_req, res) => sendStaticConfigJson(res, warningTypes, 'warning-types'))
app.get('/api/alert-defaults', (_req, res) => sendStaticConfigJson(res, alertDefaults, 'alert-defaults'))

app.get('/api/sigwx-front-meta', (req, res) => sendSigwxOverlayMeta(req, res, 'fronts'))
app.get('/api/sigwx-cloud-meta', (req, res) => sendSigwxOverlayMeta(req, res, 'clouds'))
app.get('/api/sigwx-low-fronts', (req, res) => sendSigwxOverlayMeta(req, res, 'fronts'))
app.get('/api/sigwx-low-clouds', (req, res) => sendSigwxOverlayMeta(req, res, 'clouds'))

app.get('/api/stats', (_req, res) => res.json(stats.getStats()))
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), testMode: !!process.env.DISABLE_COLLECTION }))
// 지도의 "시연용 모드" 배지 + 프런트의 "지금" 기준용 — 누구나 조회 가능(로그인 불필요).
// 켜고 끄기·스냅샷 선택은 /api/admin/*(관리자 전용).
app.get('/api/demo-mode', (_req, res) => {
  const context = getActiveDataContext()
  res.json({
    on: context.mode === 'demo',
    name: context.name,
    now: getEffectiveNow().toISOString(),
    revision: context.revision,
  })
})
app.post('/api/vertical-profile', (req, res) => {
  try {
    res.json(buildVerticalProfile(req.body, terrainSampler))
  } catch (error) {
    if (error.code === 'TERRAIN_NOT_READY') {
      res.status(503).json({ error: error.message })
      return
    }

    res.status(400).json({ error: error.message || 'failed to build vertical profile' })
  }
})

app.post('/api/route-briefing', (req, res) => {
  const body = req.body || {}
  if (!body.departureAirport || !body.arrivalAirport || !body.routeGeometry?.coordinates?.length) {
    return res.status(400).json({ error: 'departureAirport, arrivalAirport, routeGeometry are required' })
  }
  if (!body.etd || !body.eta) {
    return res.status(400).json({ error: 'etd and eta are required' })
  }
  try {
    const data = {
      metar: store.getCached('metar'),
      metarOverseas: store.getCached('metar_overseas'),
      taf: store.getCached('taf'),
      tafOverseas: store.getCached('taf_overseas'),
      sigmet: store.getCached('sigmet'),
      sigmetOverseas: store.getCached('sigmet_overseas'),
      airmet: store.getCached('airmet'),
      warning: store.getCached('warning'),
      amos: store.getCached('amos'),
      takeoff_fcst: store.getCached('takeoff_fcst'),
      notam: store.getCached('notam'),
      typhoon: store.getCached('typhoon'),
      airspaceZones: loadAirspaceZoneItems(),
      dataRoot: DATA_ROOT, // composeBriefing이 enroute 단면 모델을 직접 로드(이전엔 여기서 사후 mutate)
      now: getEffectiveNow().getTime(), // 시연 모드면 스냅샷 기준시각으로 고정(실제 현재시각 아님)
    }
    const briefing = composeBriefing(body, data)

    res.set('Cache-Control', 'no-store')
    res.json(briefing)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/briefing/route-exposure', (req, res) => {
  const body = req.body || {}
  if (!body.routeGeometry?.coordinates?.length) {
    return res.status(400).json({ error: 'routeGeometry required' })
  }
  try {
    setNoStore(res)
    res.json(buildRouteExposure({
      ...body,
      sigmet: store.getCached('sigmet'),
      sigmetOverseas: store.getCached('sigmet_overseas'),
      airmet: store.getCached('airmet'),
      lightning: store.getCached('lightning'),
      typhoon: store.getCached('typhoon'),
    }))
  } catch (error) {
    res.status(400).json({ error: error.message || 'route exposure failed' })
  }
})

function readRouteExposureSnapshot() {
  const cached = {
    sigmet: store.getCached('sigmet'),
    sigmetOverseas: store.getCached('sigmet_overseas'),
    airmet: store.getCached('airmet'),
    lightning: store.getCached('lightning'),
    typhoon: store.getCached('typhoon'),
  }
  const sources = Object.fromEntries(Object.entries(cached).map(([name, data]) => [name, data ? {
    hash: data.content_hash || store.canonicalHash(data),
    observedAt: data.observed_at ?? data.observedAt ?? null,
    fetchedAt: data.fetched_at ?? data.fetchedAt ?? null,
  } : null]))
  return { cached, snapshot: { version: store.canonicalHash(sources), sources } }
}

app.post('/api/briefing/route-exposure/batch', (req, res) => {
  const routes = req.body?.routes
  if (!Array.isArray(routes) || routes.length === 0 || routes.some((route) => !route?.routeGeometry?.coordinates?.length)) {
    return res.status(400).json({ error: 'routes with routeGeometry required' })
  }
  try {
    const { cached, snapshot } = readRouteExposureSnapshot()
    setNoStore(res)
    res.json({
      snapshot,
      results: routes.map(({ id, ...route }) => ({
        id: id ?? null,
        ...buildRouteExposure({ ...route, ...cached }),
        snapshot,
      })),
    })
  } catch (error) {
    res.status(400).json({ error: error.message || 'route exposure batch failed' })
  }
})

app.post('/api/briefing/altitudes', (req, res) => {
  const body = req.body || {}
  if (!body.routeGeometry?.coordinates?.length || !body.routeModel) {
    return res.status(400).json({ error: 'routeGeometry and routeModel required' })
  }
  try {
    const axis = buildRouteAxis(body.routeGeometry)
    const aip = attachActiveAipConstraints({ dataRoot: DATA_ROOT, routeModel: body.routeModel })
    const crossSectionResult = loadRouteCrossSection({ root: DATA_ROOT, routeGeometry: body.routeGeometry, body })
    const candidateResult = buildAltitudeCandidates({
      routeSegments: aip.segments,
      plannedCruiseAltitudeFt: body.plannedCruiseAltitudeFt,
      crossSection: crossSectionResult.crossSection,
    })
    const hazards = [
      ...(store.getCached('sigmet')?.items ?? []).map((item) => ({ source: 'SIGMET', item })),
      ...(store.getCached('sigmet_overseas')?.items ?? []).map((item) => ({ source: 'SIGMET', item })),
      ...(store.getCached('airmet')?.items ?? []).map((item) => ({ source: 'AIRMET', item })),
    ]
    const flightPlanProfiles = Object.fromEntries(candidateResult.candidates.flatMap((candidate) => {
      if (candidate.status !== 'valid' && candidate.status !== 'input_only') return []
      try {
        const profile = buildVerticalProfile({ ...body, plannedCruiseAltitudeFt: candidate.altitudeFt }, terrainSampler).flightPlan.profile
        return [[candidate.altitudeFt, profile]]
      } catch {
        return []
      }
    }))
    const rows = buildAltitudeWeatherComparison({
      candidates: candidateResult.candidates,
      crossSection: crossSectionResult.crossSection,
      turbulence: crossSectionResult.turbulence,
      axis,
      hazards,
      notams: store.getCached('notam')?.items ?? [],
      etd: body.etd,
      eta: body.eta,
      flightPlanProfiles,
    })
    setNoStore(res)
    res.json({
      constraints: { ...candidateResult.constraints, provenance: aip.provenance },
      rows,
      crossSectionRun: crossSectionResult.crossSection?.run ?? null,
      // availableTimes까지 같이 실어야 이 응답을 재사용하는 고도비교 단면도에서도
      // 예보시각 앞뒤 이동이 뜬다(빠지면 목록이 비어 버튼이 통째로 사라진다).
      crossSection: crossSectionResult.available
        ? { ...crossSectionResult.crossSection, turbulence: crossSectionResult.turbulence, availableTimes: crossSectionResult.availableTimes }
        : null,
    })
  } catch (error) {
    res.status(400).json({ error: error.message || 'altitude comparison failed' })
  }
})

app.post('/api/briefing/cross-section', (req, res) => {
  try {
    const { routeGeometry } = req.body || {}
    if (!routeGeometry?.coordinates?.length) {
      return res.status(400).json({ error: 'routeGeometry required' })
    }
    const body = {
      ...req.body,
      referenceTime: req.body?.referenceTime ?? getEffectiveNow().toISOString(),
    }
    const model = loadRouteCrossSection({ root: DATA_ROOT, routeGeometry, body })
    if (!model.available) return res.status(503).json({ error: 'kim run unavailable' })

    setNoStore(res)
    res.json({ ...model.crossSection, turbulence: model.turbulence, availableTimes: model.availableTimes })
  } catch (error) {
    res.status(400).json({ error: error.message || 'cross-section failed' })
  }
})

export { app, buildRadarGraphicsSnapshotEntry, getCachedSnapshotMeta, readSelectedKimCloudField, readSelectedKimIcingField }

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => console.log(`[server] Backend running on ${HOST}:${PORT}`))

  startSampler(getDb()) // 관리자 콘솔: 60초 리소스 샘플링 시작
  recordBoot(config.storage.base_path) // 관리자 콘솔: 재시작 횟수 집계
  startDailyBackup(getDb(), config.storage.base_path, { cron }) // DB 백업: 매일 03:10 KST
  startOpsAlerts(getDb(), { cron }) // 운영 알림: 5분마다 대규모 장애 판정 → 텔레그램

  startAlertScheduler(getDb()) // #13 경로 예보변화 알림: 활성 예정비행 15분 재브리핑 → diff → 알림 적재

  startScheduler().catch((err) => {
    console.error('[server] Scheduler startup error:', err.message)
    process.exit(1)
  })
}
