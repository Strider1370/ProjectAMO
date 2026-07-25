import fs from 'node:fs'
import path from 'node:path'

const META_NAME = 'echotop_meta.json'
// 격자 해상도나 산출 방식이 바뀌면 반드시 올릴 것. 지점 조회는 현재 격자로 색인을 계산해
// 예전 .bin을 읽으므로, 버전이 다른 프레임을 남겨두면 조용히 엉뚱한 칸 값을 돌려준다.
// v2: 격자 2 km -> 1 km(stride 2), 방위 세분 칠하기.
const RENDER_VERSION = 'echotop-18dbz-msl-v2'

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
  try {
    const meta = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    // 다른 산출 버전의 프레임은 현재 격자로 해석할 수 없다 — 없는 것으로 취급해 다시 만들게 한다.
    if (meta?.render_version !== RENDER_VERSION) return null
    return meta
  } catch { return null }
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
    // 실제 관측시각: 정상 사이트들의 최신 관측시각. 없으면 null — 관측하지 않은 프레임은 시간을 만들어내지 않음.
    observedAt: okSites.map((site) => site.observedAt).filter(Boolean).sort().at(-1) || null,
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
