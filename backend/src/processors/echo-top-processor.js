import sharp from 'sharp'
import defaultConfig from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { ECHO_TOP_GRID } from '../lib/echo-top-grid.js'
import { isSameFiveMinuteBucket, observedBucketMs, parseQcdVolume } from '../parsers/radar-qcd-parser.js'
import { loadRadarBounds } from '../parsers/radar-echo-parser.js'
import { computeSiteEchoTop, encodeEchoTopBinary, mergeSiteEchoTops, renderEchoTopRgba } from './echo-top-model.js'
import { publishEchoTopFrame, readEchoTopMeta } from './echo-top-store.js'

const OUTPUT_WIDTH = 1600

const FIVE_MIN_MS = 5 * 60 * 1000

function formatKstTm(dateUtc) {
  const kst = new Date(dateUtc.getTime() + 9 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}`
}

// tm(KST 12자리) -> epoch ms. 형식이 어긋나면 null.
export function tmToUtcMs(tm) {
  if (typeof tm !== 'string' || !/^\d{12}$/.test(tm)) return null
  return Date.UTC(
    Number(tm.slice(0, 4)), Number(tm.slice(4, 6)) - 1, Number(tm.slice(6, 8)),
    Number(tm.slice(8, 10)) - 9, Number(tm.slice(10, 12)),
  )
}

// latestTm에서 5분 간격으로 frameCount개, 오래된 것부터.
export function buildFrameTms(latestTm, frameCount) {
  const latestMs = tmToUtcMs(latestTm)
  if (!Number.isFinite(latestMs) || !(frameCount > 0)) return []
  return Array.from({ length: frameCount }, (_, i) =>
    formatKstTm(new Date(latestMs - (frameCount - 1 - i) * FIVE_MIN_MS)))
}

// 아직 발행되지 않은 프레임 시각만, 오래된 것부터.
export function missingFrameTms(latestTm, frameCount, existingTms = []) {
  const have = new Set(existingTms)
  return buildFrameTms(latestTm, frameCount).filter((tm) => !have.has(tm))
}

async function defaultFetchFile(stn, tm, { config }) {
  const params = new URLSearchParams({ tm, data: 'qcd', stn, authKey: config.api.radar_satellite_auth_key })
  const response = await fetchWithTimeout(`${config.radar_echo_top.url}?${params.toString()}`, config.radar_echo_top.timeout_ms)
  if (!response.ok) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  // HDF5 시그니처가 아니면 파일 부재 안내문 등 비HDF5 응답이다.
  const isHdf5 = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x48 && buffer[2] === 0x44 && buffer[3] === 0x46
  return isHdf5 ? buffer : null
}

export async function collectSite({ stn, tm, requestedMs, deps = {} }) {
  const fetchFile = deps.fetchFile || ((s, t) => defaultFetchFile(s, t, { config: deps.config || defaultConfig }))
  const parseVolume = deps.parseVolume || parseQcdVolume
  const retry = deps.config?.radar_echo_top?.retry ?? 0

  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      const buffer = await fetchFile(stn, tm)
      if (!buffer) { if (attempt < retry) continue; return { stn, status: 'missing', observedAt: null, volume: null } }

      const volume = await parseVolume(buffer, { stn })
      const observedMs = observedBucketMs(volume)
      if (!isSameFiveMinuteBucket(observedMs, requestedMs)) {
        // FR-002: 다른 bucket의 파일을 이 프레임으로 발행하지 않는다.
        return { stn, status: 'stale', observedAt: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null, volume: null }
      }
      return { stn, status: 'ok', observedAt: new Date(observedMs).toISOString(), volume }
    } catch (error) {
      if (attempt < retry) continue
      // 키가 로그에 새지 않도록 메시지만 남긴다.
      return { stn, status: 'failed', observedAt: null, volume: null, reason: error.message }
    }
  }
  return { stn, status: 'failed', observedAt: null, volume: null, reason: 'exhausted' }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

async function collectFrame({ tm, requestedMs, settings, config, deps }) {
  const collected = await mapWithConcurrency(settings.sites, settings.concurrency, (stn) =>
    collectSite({ stn, tm, requestedMs, deps: { ...deps, config } }))

  const sites = collected.map(({ stn, status, observedAt, reason }) => ({ stn, status, observedAt, ...(reason ? { reason } : {}) }))
  const usable = collected.filter((site) => site.status === 'ok' && site.volume)
  for (const site of collected) {
    if (site.status !== 'ok') console.warn(`echo_top: ${site.stn} ${site.status}${site.reason ? ` (${site.reason})` : ''} for ${tm}`)
  }
  if (!usable.length) return { type: 'radar_echo_top', saved: false, tm, siteCount: { ok: 0, total: sites.length }, reason: 'no usable site' }

  const siteResults = usable.map((site) => ({ stn: site.stn, ...computeSiteEchoTop(site.volume, { thresholdDbz: settings.threshold_dbz, grid: ECHO_TOP_GRID }) }))
  const composite = mergeSiteEchoTops(siteResults, { grid: ECHO_TOP_GRID })

  // 기존 레이더와 같은 경계를 쓴다 — 두 레이어가 픽셀 단위로 겹치게 하기 위해서다.
  const { west, south, east, north } = loadRadarBounds()
  const bounds = [[south, west], [north, east]]
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const width = OUTPUT_WIDTH
  const height = Math.max(1, Math.round(((mercY(north) - mercY(south)) / ((east - west) * Math.PI / 180)) * width))

  const rgba = renderEchoTopRgba(composite, { grid: ECHO_TOP_GRID, width, height, bounds })
  const image = deps.renderImage
    ? await deps.renderImage(rgba, width, height)
    : await sharp(rgba, { raw: { width, height, channels: 4 } }).webp({ quality: 80 }).toBuffer()

  const publish = deps.publish || publishEchoTopFrame
  publish({
    root: deps.root || config.storage.base_path,
    tm,
    composite: encodeEchoTopBinary(composite, { grid: ECHO_TOP_GRID }),
    image, bounds, width, height, sites,
    maxFrames: settings.max_frames,
  })

  return { type: 'radar_echo_top', saved: true, tm, siteCount: { ok: usable.length, total: sites.length } }
}

// 공통 진입 검사 — 설정이 갖춰지지 않았으면 이유를 담아 돌려준다.
function resolveRun(deps) {
  const config = deps.config || defaultConfig
  const settings = config.radar_echo_top
  if (!settings?.enabled) return { blocked: { type: 'radar_echo_top', saved: false, reason: 'disabled' } }
  if (!config.api.radar_satellite_auth_key) throw new Error('Radar echo top auth key missing (set KMA_RADAR_SATELLITE_AUTH_KEY)')
  if (!settings.sites.length) return { blocked: { type: 'radar_echo_top', saved: false, reason: 'no sites configured' } }

  const now = (deps.now || (() => new Date()))()
  const requestedMs = Math.floor((now.getTime() - settings.delay_minutes * 60 * 1000) / FIVE_MIN_MS) * FIVE_MIN_MS
  return { config, settings, requestedMs, tm: formatKstTm(new Date(requestedMs)) }
}

export async function process(deps = {}) {
  const run = resolveRun(deps)
  if (run.blocked) return run.blocked
  const { config, settings, requestedMs, tm } = run
  return collectFrame({ tm, requestedMs, settings, config, deps })
}

// 시작 시 1회: 아직 없는 과거 프레임을 오래된 것부터 채운다. 레이더가 3시간치를 소급 수집하는데
// 에코탑만 비어 있으면 시간축을 되감았을 때 한쪽 레이어만 사라진다.
// 프레임을 순차로 처리한다 — 사이트 동시성(concurrency)은 그대로 두고 프레임끼리는 겹치지 않게 해
// 정상 운영과 같은 호출 속도를 유지한다(프로브에서 HTTP 429를 한 번 관측했다).
export async function backfill(deps = {}) {
  const run = resolveRun(deps)
  if (run.blocked) return { ...run.blocked, filled: 0 }
  const { config, settings, requestedMs, tm } = run

  const root = deps.root || config.storage.base_path
  const readMeta = deps.readMeta || readEchoTopMeta
  const existing = (readMeta(root)?.frames || []).map((frame) => frame.tm)
  const pending = missingFrameTms(tm, settings.max_frames, existing)
  if (!pending.length) return { type: 'radar_echo_top', saved: false, filled: 0, reason: 'already complete' }

  let filled = 0
  for (const frameTm of pending) {
    const frameMs = tmToUtcMs(frameTm)
    // 아직 관측되지 않은 미래 프레임은 건너뛴다.
    if (!Number.isFinite(frameMs) || frameMs > requestedMs) continue
    try {
      const result = await collectFrame({ tm: frameTm, requestedMs: frameMs, settings, config, deps })
      if (result.saved) filled += 1
    } catch (error) {
      console.warn(`echo_top: backfill failed for ${frameTm}: ${error.message}`)
    }
  }
  console.log(`echo_top: backfill filled ${filled}/${pending.length} frame(s)`)
  return { type: 'radar_echo_top', saved: filled > 0, filled, pending: pending.length }
}

export default { process, backfill, collectSite }
