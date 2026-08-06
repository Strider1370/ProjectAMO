// 가시영상(GK2A VI006) 수집기.
//
// 조종사 브리핑에서 실제로 쓰이는 위성 자료는 가시·적외·수증기 셋뿐이고, 상용 제품(ForeFlight)도
// 낮=가시 / 밤=적외 한 쌍으로 정리해 쓴다. 우리는 적외(+안개 합성)를 이미 갖고 있어 가시만 더한다.
//
// 그래픽 API(nph-gk2a_imgp)는 가시에 강수용 무지개 색표를 씌워 판독이 안 되고, LE1B 이미지에는
// 해안선·위경도선·로고가 구워져 나온다. 그래서 값(NetCDF)을 받아 우리가 흑백으로 그린다.
//
// 밤에는 아무것도 안 보인다 — 반사광을 보는 자료라 원리상 그렇다. 화면 쪽에서 그 사실을 알린다.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import config from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { parseSatelliteNC } from '../parsers/satellite-parser.js'
import { KO_DISPLAY_GRID, displayPixelToSourceIndex } from '../lib/satellite-ko-grid.js'

const CHANNEL = 'VI006'
const REGION = 'KO'
const MAX_FRAMES = 12

// 12비트(0~4095) 반사도. 한낮 표본에서 중앙값이 288, 95%가 1836이었다 — 선형으로 펴면 화면이
// 거의 검게 나온다. 제곱근에 가까운 감마로 어두운 쪽을 들어올려야 구름 결과 지표가 같이 읽힌다.
const MAX_COUNT = 4095
const GAMMA = 2.0

function paths(root) {
  const dir = path.join(root, 'satellite', 'visible')
  return { dir, meta: path.join(dir, 'visible_meta.json') }
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temp, data)
  fs.renameSync(temp, file)
}

// typ05 API는 요청 시각을 UTC로 받는다(응답 이미지 제목에서 확인).
export function utcTm(date, stepMinutes = 10) {
  const d = new Date(date.getTime())
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / stepMinutes) * stepMinutes, 0, 0)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
}

// UTC 관측시각 → 우리 프레임 표기(KST 12자리). 나머지 위성 산출물과 표기를 맞춘다.
export function kstTmFromUtc(tmUtc) {
  const ms = Date.UTC(+tmUtc.slice(0, 4), +tmUtc.slice(4, 6) - 1, +tmUtc.slice(6, 8), +tmUtc.slice(8, 10), +tmUtc.slice(10, 12))
  const k = new Date(ms + 9 * 3600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}${p(k.getUTCHours())}${p(k.getUTCMinutes())}`
}

export function toDisplayLevel(rawCount) {
  if (!Number.isFinite(rawCount) || rawCount < 0) return 0
  const normalized = Math.min(1, rawCount / MAX_COUNT)
  return Math.round(255 * Math.pow(normalized, 1 / GAMMA))
}

export async function renderVisible(parsed) {
  const { data, attrs } = parsed
  const { width: srcW, height: srcH, pixelSize, ulEasting, ulNorthing } = attrs
  const outW = KO_DISPLAY_GRID.width
  const outH = KO_DISPLAY_GRID.height
  const buf = Buffer.alloc(outW * outH * 4)
  let lit = 0

  for (let py = 0; py < outH; py += 1) {
    for (let px = 0; px < outW; px += 1) {
      const idx = displayPixelToSourceIndex(px, py, { width: srcW, height: srcH, pixelSize, ulEasting, ulNorthing })
      if (idx === null) continue
      const level = toDisplayLevel(Number(data[idx]))
      if (level <= 0) continue
      lit += 1
      const o = (py * outW + px) * 4
      buf[o] = level; buf[o + 1] = level; buf[o + 2] = level; buf[o + 3] = 255
    }
  }
  return { buffer: buf, width: outW, height: outH, litPixels: lit }
}

export async function processSatelliteVisible({ now = new Date(), deps = {} } = {}) {
  const activeConfig = deps.config || config
  if (!activeConfig.api?.radar_satellite_auth_key) return { saved: false, reason: 'no-auth-key' }
  const root = deps.root || activeConfig.storage.base_path
  const target = paths(root)
  const previous = readJson(target.meta)

  const delayMinutes = activeConfig.satellite?.delay_minutes ?? 20
  const tmUtc = utcTm(new Date(now.getTime() - delayMinutes * 60_000))
  const tm = kstTmFromUtc(tmUtc)
  if ((previous?.frames || []).some((frame) => frame.tm === tm)) return { saved: false, tm, reason: 'already-collected' }

  const url = `${activeConfig.satellite.url}/${CHANNEL}/${REGION}/data?date=${tmUtc}&authKey=${activeConfig.api.radar_satellite_auth_key}`
  const response = await fetchWithTimeout(url, activeConfig.satellite?.timeout_ms || 60_000)
  if (!response.ok) return { saved: false, tm, reason: `http-${response.status}` }
  const parsed = await parseSatelliteNC(Buffer.from(await response.arrayBuffer()))

  const rendered = await renderVisible(parsed)
  // 밤에는 반사광이 없어 전부 0이 된다 — 빈 그림을 굳이 저장하지 않는다.
  if (rendered.litPixels === 0) return { saved: false, tm, reason: 'night' }

  const webp = await sharp(rendered.buffer, { raw: { width: rendered.width, height: rendered.height, channels: 4 } })
    .webp({ quality: 82 }).toBuffer()
  const filename = `vis_korea_${tm}.webp`
  fs.mkdirSync(target.dir, { recursive: true })
  writeAtomic(path.join(target.dir, filename), webp)

  const frame = {
    tm,
    tm_utc: tmUtc,
    timeMs: Date.UTC(+tm.slice(0, 4), +tm.slice(4, 6) - 1, +tm.slice(6, 8), +tm.slice(8, 10) - 9, +tm.slice(10, 12)),
    path: `/data/satellite/visible/${filename}`,
    bounds: KO_DISPLAY_GRID.bounds,
    channel: CHANNEL,
    source: 'KMA GK2A',
  }
  const frames = [...(previous?.frames || []).filter((item) => item.tm !== frame.tm), frame]
    .sort((a, b) => a.tm.localeCompare(b.tm)).slice(-MAX_FRAMES)
  const meta = { type: 'GK2A_VISIBLE', updatedAt: new Date().toISOString(), tm, frames, latest: frame }
  writeAtomic(target.meta, `${JSON.stringify(meta, null, 2)}\n`)

  const keep = new Set(frames.map((item) => path.basename(item.path)))
  for (const file of fs.readdirSync(target.dir)) {
    if (/^vis_korea_\d{12}\.webp$/.test(file) && !keep.has(file)) fs.unlinkSync(path.join(target.dir, file))
  }
  return { saved: true, tm, frameCount: frames.length, bytes: webp.length }
}

export default { processSatelliteVisible }
