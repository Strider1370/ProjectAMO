import fs from 'node:fs'
import path from 'node:path'

const META_NAME = 'echotop_meta.json'
const RENDER_VERSION = 'echotop-18dbz-msl-v1'

export function echoTopDir(root) { return path.join(root, 'radar', 'echotop') }

function assertTm(tm) {
  if (typeof tm !== 'string' || !/^\d{12}$/.test(tm)) throw new Error(`Invalid Echo Top frame tm: ${tm}`)
  return tm
}

function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  fs.writeFileSync(temp, data)
  fs.renameSync(temp, filePath)
}

export function readEchoTopMeta(root) {
  const filePath = path.join(echoTopDir(root), META_NAME)
  if (!fs.existsSync(filePath)) return null
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

function tmToIso(tm) {
  // tm은 KST 12자리. 실제 관측시각은 사이트 메타의 observedAt이 우선한다.
  return new Date(Date.UTC(
    Number(tm.slice(0, 4)), Number(tm.slice(4, 6)) - 1, Number(tm.slice(6, 8)),
    Number(tm.slice(8, 10)) - 9, Number(tm.slice(10, 12)),
  )).toISOString()
}

function cleanup(root, meta) {
  const keep = new Set()
  for (const frame of meta.frames) { keep.add(`echotop_${frame.tm}.webp`); keep.add(`echotop_${frame.tm}.bin`) }
  const dir = echoTopDir(root)
  if (!fs.existsSync(dir)) return
  for (const filename of fs.readdirSync(dir)) {
    if (/^echotop_\d{12}\.(?:webp|bin)$/.test(filename) && !keep.has(filename)) fs.unlinkSync(path.join(dir, filename))
  }
}

export function publishEchoTopFrame({ root, tm, composite, image, bounds, width, height, sites = [], maxFrames = 12 }) {
  assertTm(tm)
  const dir = echoTopDir(root)
  writeAtomic(path.join(dir, `echotop_${tm}.bin`), composite)
  writeAtomic(path.join(dir, `echotop_${tm}.webp`), image)

  const okSites = sites.filter((site) => site.status === 'ok')
  const record = {
    tm,
    // 실제 관측시각: 정상 사이트들의 최신 관측시각. 없으면 프레임 시각으로 대체.
    observedAt: okSites.map((site) => site.observedAt).filter(Boolean).sort().at(-1) || tmToIso(tm),
    bounds, width, height,
    path: `/data/radar/echotop/echotop_${tm}.webp`,
    threshold_dbz: 18,
    reference: 'MSL',
    sites,
    siteCount: { ok: okSites.length, total: sites.length },
  }

  const byTm = new Map((readEchoTopMeta(root)?.frames || []).map((frame) => [frame.tm, frame]))
  byTm.set(tm, record)
  const frames = [...byTm.values()].sort((a, b) => a.tm.localeCompare(b.tm)).slice(-maxFrames)
  const latest = frames.at(-1) || null

  const meta = {
    type: 'RADAR_ECHO_TOP',
    version: 1,
    render_version: RENDER_VERSION,
    threshold_dbz: 18,
    reference: 'MSL',
    source: 'KMA radar site QCD — ProjectAMO 재산출 (KMA 공식 ETOP 아님)',
    updated_at: new Date().toISOString(),
    tm: latest?.tm || null,
    latest,
    frames,
  }
  writeAtomic(path.join(dir, META_NAME), `${JSON.stringify(meta, null, 2)}\n`)
  cleanup(root, meta)
  return meta
}

export default { echoTopDir, publishEchoTopFrame, readEchoTopMeta }
