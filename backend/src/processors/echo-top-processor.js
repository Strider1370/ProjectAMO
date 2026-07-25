import sharp from 'sharp'
import defaultConfig from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { ECHO_TOP_GRID } from '../lib/echo-top-grid.js'
import { isSameFiveMinuteBucket, observedBucketMs, parseQcdVolume } from '../parsers/radar-qcd-parser.js'
import { loadRadarBounds } from '../parsers/radar-echo-parser.js'
import { computeSiteEchoTop, encodeEchoTopBinary, mergeSiteEchoTops, renderEchoTopRgba } from './echo-top-model.js'
import { publishEchoTopFrame } from './echo-top-store.js'

const OUTPUT_WIDTH = 1600

function formatKstTm(dateUtc) {
  const kst = new Date(dateUtc.getTime() + 9 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}`
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

export async function process(deps = {}) {
  const config = deps.config || defaultConfig
  const settings = config.radar_echo_top
  if (!settings?.enabled) return { type: 'radar_echo_top', saved: false, reason: 'disabled' }
  if (!config.api.radar_satellite_auth_key) throw new Error('Radar echo top auth key missing (set KMA_RADAR_SATELLITE_AUTH_KEY)')
  if (!settings.sites.length) return { type: 'radar_echo_top', saved: false, reason: 'no sites configured' }

  const now = (deps.now || (() => new Date()))()
  const targetMs = Math.floor((now.getTime() - settings.delay_minutes * 60 * 1000) / (5 * 60 * 1000)) * 5 * 60 * 1000
  const tm = formatKstTm(new Date(targetMs))

  const collected = await mapWithConcurrency(settings.sites, settings.concurrency, (stn) =>
    collectSite({ stn, tm, requestedMs: targetMs, deps: { ...deps, config } }))

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

export default { process, collectSite }
