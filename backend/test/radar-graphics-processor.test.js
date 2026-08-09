import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { processQpf, processWissdom } from '../src/processors/radar-graphics-processor.js'
import { scheduleRadarGraphicsJobs } from '../src/index.js'

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'amo-radar-graphics-'))
const png = () => sharp({ create: { width: 2, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
  .composite([{ input: Buffer.from([20, 90, 220, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 1, top: 0 }]).png().toBuffer()
const descriptor = ({ tm, title, product }) => ({
  meta: { errCd: '000' }, data: { result: {
    dateTime: `${tm.slice(0, 4)}.${tm.slice(4, 6)}.${tm.slice(6, 8)}.${tm.slice(8, 10)}:${tm.slice(10, 12)}`,
    title, url: `/data/${product}-${tm}.png`, bar: `/data/${product}-legend.png`,
    // 실제 KMA 응답 범위 — 좌표 환산이 한반도 밖으로 나가면 프레임이 버려지므로 진짜 값이어야 한다.
    imageCoverageStartProjX: -386001.375, imageCoverageStartProjY: 4757139, imageCoverageEndProjX: 521047.21875, imageCoverageEndProjY: 3799247,
  } },
})

function depsFor(rootDir, { wissdomTm = null, qpfTm = '202608041705', fail = null } = {}) {
  const calls = []
  const imageCalls = []
  return {
    root: rootDir,
    config: { api: { radar_satellite_auth_key: 'test-only', radar_graphics_url: 'https://kma.invalid' }, radar_graphics: { enabled: true, wissdom_heights_m: [1524], qpf_lead_minutes: [60], frame_step_minutes: 5, delay_minutes: 10, max_frames: 2, timeout_ms: 1 } },
    fetchJson: async (url) => {
      calls.push(url)
      if (fail === 'json') throw new Error('network down')
      const parsed = new URL(url)
      const product = parsed.pathname.includes('wis') ? 'wissdom' : 'qpf'
      return descriptor({ tm: product === 'wissdom' ? (wissdomTm || parsed.searchParams.get('tm')) : qpfTm, title: product, product })
    },
    fetchImage: async (url) => {
      imageCalls.push(url)
      if (fail === 'image') throw new Error('image down')
      return png()
    },
    calls,
    imageCalls,
  }
}

function readMeta(rootDir, type) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'radar', type, `${type}_meta.json`), 'utf8'))
}

test('publishes exact WISSDOM frames as WebP before atomic metadata and removes only declared backgrounds', async () => {
  const dataRoot = root(), deps = depsFor(dataRoot)
  await processWissdom({ now: new Date('2026-08-04T08:07:00Z'), deps })
  const meta = readMeta(dataRoot, 'wissdom')
  const frame = meta.framesByHeight['1524'].at(-1)
  assert.equal(frame.tm, '202608041650')
  const filePath = path.join(dataRoot, frame.path.replace(/^\/data\//, ''))
  assert.equal(fs.existsSync(filePath), true)
  assert.equal(deps.imageCalls.every((url) => !url.includes('authKey')), true)
  const { data } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0)
  assert.deepEqual([...data.slice(4, 8)], [20, 90, 220, 255])
})

test('publishes QPF valid time from its analysis time and preserves last complete metadata on transport failure', async () => {
  const dataRoot = root()
  await processQpf({ now: new Date('2026-08-04T08:07:00Z'), deps: depsFor(dataRoot) })
  const before = fs.readFileSync(path.join(dataRoot, 'radar', 'qpf', 'qpf_meta.json'), 'utf8')
  await processQpf({ now: new Date('2026-08-04T08:12:00Z'), deps: depsFor(dataRoot, { fail: 'json' }) })
  const meta = readMeta(dataRoot, 'qpf')
  assert.equal(meta.frames.at(-1).leadMinutes, 60)
  assert.equal(meta.frames.at(-1).validTimeMs, Date.UTC(2026, 7, 4, 9, 5))
  assert.equal(fs.readFileSync(path.join(dataRoot, 'radar', 'qpf', 'qpf_meta.json'), 'utf8'), before)
})

test('treats missing data as absent but preserves a frame on a wrong returned timestamp', async () => {
  const dataRoot = root()
  await processWissdom({ now: new Date('2026-08-04T08:07:00Z'), deps: depsFor(dataRoot) })
  await processWissdom({ now: new Date('2026-08-04T08:12:00Z'), deps: depsFor(dataRoot, { wissdomTm: '202608041745' }) })
  assert.equal(readMeta(dataRoot, 'wissdom').framesByHeight['1524'].length, 1)
})

test('requests WISSDOM on its ten-minute publication grid and keeps the frame KMA actually answers with', async () => {
  // KMA publishes WISSDOM every ten minutes. Asking on a five-minute boundary makes it answer
  // with the previous ten-minute frame, and a strict equality check then discards every other cycle.
  const dataRoot = root(), deps = depsFor(dataRoot)
  await processWissdom({ now: new Date('2026-08-04T08:07:00Z'), deps })
  assert.equal(new URL(deps.calls[0]).searchParams.get('tm'), '202608041650')

  // An older answer is the newest frame KMA has; publish it under its own timestamp.
  const lagging = depsFor(dataRoot, { wissdomTm: '202608041640' })
  await processWissdom({ now: new Date('2026-08-04T08:17:00Z'), deps: lagging })
  const frames = readMeta(dataRoot, 'wissdom').framesByHeight['1524']
  assert.deepEqual(frames.map((frame) => frame.tm), ['202608041640', '202608041650'])
})

test('does not register graphics collectors without an enabled backend credential', () => {
  const scheduled = []
  const scheduler = { schedule: (...args) => { scheduled.push(args); return args } }
  assert.deepEqual(scheduleRadarGraphicsJobs(scheduler, { radar_graphics: { enabled: false }, api: { radar_satellite_auth_key: 'key' } }), [])
  assert.deepEqual(scheduleRadarGraphicsJobs(scheduler, { radar_graphics: { enabled: true }, api: { radar_satellite_auth_key: '' } }), [])
  // WISSDOM · QPF · HSR · 수상체 넷을 같은 주기로 건다.
  assert.equal(scheduleRadarGraphicsJobs(scheduler, { radar_graphics: { enabled: true }, api: { radar_satellite_auth_key: 'key' } }).length, 4)
  assert.equal(scheduled.length, 4)
})

test('uses one lagged QPF analysis timestamp for every lead and retains only its configured assets', async () => {
  const dataRoot = root(), deps = depsFor(dataRoot, { qpfTm: '202608041700' })
  deps.config.radar_graphics.qpf_lead_minutes = [5, 60]
  deps.config.radar_graphics.max_frames = 1
  await processQpf({ now: new Date('2026-08-04T08:07:00Z'), deps })
  const frames = readMeta(dataRoot, 'qpf').frames
  assert.equal(frames.length, 1)
  assert.equal(frames[0].tm, '202608041700')
  assert.equal(frames[0].leadMinutes, 60)
  assert.equal(frames[0].validTimeMs, Date.UTC(2026, 7, 4, 9, 0))
  assert.equal(fs.readdirSync(path.join(dataRoot, 'radar', 'qpf')).filter((name) => name.endsWith('.webp')).length, 2)
})

test('keeps complete metadata when image validation fails and product failures remain independent', async () => {
  const dataRoot = root()
  await processWissdom({ now: new Date('2026-08-04T08:07:00Z'), deps: depsFor(dataRoot) })
  const before = JSON.stringify(readMeta(dataRoot, 'wissdom'))
  const invalid = depsFor(dataRoot)
  invalid.fetchImage = async () => Buffer.from('not an image')
  const goodQpf = depsFor(dataRoot)
  await Promise.all([processWissdom({ now: new Date('2026-08-04T08:12:00Z'), deps: invalid }), processQpf({ now: new Date('2026-08-04T08:12:00Z'), deps: goodQpf })])
  assert.equal(JSON.stringify(readMeta(dataRoot, 'wissdom')), before)
  assert.equal(readMeta(dataRoot, 'qpf').frames.length, 1)
})

test('drops the QPF white canvas but never edits legend pixels', async () => {
  const dataRoot = root(), deps = depsFor(dataRoot)
  // KMA renders QPF over an opaque near-white canvas, and its legend over pure white with black text.
  const body = await sharp({ create: { width: 2, height: 1, channels: 4, background: { r: 250, g: 250, b: 250, alpha: 1 } } })
    .composite([{ input: Buffer.from([0, 200, 255, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 1, top: 0 }]).png().toBuffer()
  const legend = await sharp({ create: { width: 2, height: 1, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: Buffer.from([0, 0, 0, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 1, top: 0 }]).png().toBuffer()
  deps.fetchImage = async (url) => url.includes('legend') ? legend : body
  await processQpf({ now: new Date('2026-08-04T08:07:00Z'), deps })

  const frame = readMeta(dataRoot, 'qpf').frames.at(-1)
  // A fully opaque WebP drops its alpha channel, so read every published asset as RGBA.
  const published = (relative) => sharp(path.join(dataRoot, relative.replace(/^\/data\//, ''))).ensureAlpha().raw().toBuffer()
  const bodyPixels = await published(frame.path)
  assert.equal(bodyPixels[3], 0, 'the white canvas must not cover the map')
  assert.deepEqual([...bodyPixels.slice(4, 8)], [0, 200, 255, 255], 'precipitation must survive')
  const legendPixels = await published(frame.legendPath)
  assert.deepEqual([...legendPixels.slice(4, 8)], [0, 0, 0, 255], 'legend text must stay opaque')
})

test('publishes a blank render without re-requesting it', async () => {
  // 맑은 날 WISSDOM·QPF는 원래 빈 그림이다. 빈 캔버스를 실패로 보고 다시 받으면 맑은 날 내내
  // 모든 산출물이 3배로 나가 레이더/위성 키의 일일 한도를 태운다. 자료 부재는 재시도 사유가 아니다.
  const blank = await sharp({ create: { width: 2, height: 1, channels: 4, background: { r: 127, g: 127, b: 127, alpha: 0 } } }).png().toBuffer()
  const filled = await sharp({ create: { width: 2, height: 1, channels: 4, background: { r: 250, g: 250, b: 250, alpha: 1 } } })
    .composite([{ input: Buffer.from([0, 200, 255, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 1, top: 0 }]).png().toBuffer()

  const dryRoot = root(), dry = depsFor(dryRoot)
  let dryCalls = 0
  dry.fetchImage = async (url) => { if (!url.includes('legend')) dryCalls += 1; return url.includes('legend') ? filled : blank }
  await processQpf({ now: new Date('2026-08-04T08:07:00Z'), deps: dry })
  assert.equal(dryCalls, 1, 'a blank render must be fetched exactly once')
  assert.equal(readMeta(dryRoot, 'qpf').frames.length, 1, 'the blank frame is still published')
})

test('builds change-detectable snapshot entries for both graphics metadata shapes', async () => {
  process.env.NODE_ENV = 'test'
  const { buildRadarGraphicsSnapshotEntry } = await import('../server.js')
  const wissdom = buildRadarGraphicsSnapshotEntry({ type: 'WISSDOM', updatedAt: '2026-08-04T08:00:00Z', framesByHeight: { '1524': [{ tm: '202608041705' }] } })
  const qpf = buildRadarGraphicsSnapshotEntry({ type: 'QPF', updatedAt: '2026-08-04T08:00:00Z', frames: [{ tm: '202608041700', validTimeMs: Date.UTC(2026, 7, 4, 8, 5) }] })
  assert.equal(wissdom.tm, '202608041705')
  assert.equal(qpf.tm, '202608041700')
  assert.notEqual(wissdom.hash, qpf.hash)
})

test('publishes both assets before their metadata and stops immediately when aborted', async () => {
  const dataRoot = root(), originalRename = fs.renameSync
  const observed = []
  fs.renameSync = (from, to) => {
    observed.push(path.basename(to))
    if (path.basename(to) === 'wissdom_meta.json') {
      assert.equal(fs.readdirSync(path.dirname(to)).filter((name) => name.endsWith('.webp')).length, 2)
    }
    return originalRename(from, to)
  }
  try {
    await processWissdom({ now: new Date('2026-08-04T08:07:00Z'), deps: depsFor(dataRoot) })
  } finally {
    fs.renameSync = originalRename
  }
  assert.deepEqual(observed.slice(-3), ['wissdom_1524_202608041650.webp', 'wissdom_1524_202608041650_legend.webp', 'wissdom_meta.json'])
  const controller = new AbortController(); controller.abort(new Error('stop'))
  await assert.rejects(processQpf({ now: new Date('2026-08-04T08:07:00Z'), deps: depsFor(root()), signal: controller.signal }), /stop/)
})
