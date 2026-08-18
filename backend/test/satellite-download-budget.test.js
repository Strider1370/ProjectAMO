// 레이더/위성 키의 일일 5GB 한도를 태운 "받아놓고 저장하지 않아 매 주기 다시 받는" 경로를 막는다.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { processSatelliteVisible } from '../src/processors/satellite-visible-processor.js'
import { needsFogRefetch, processSatellite, writeSatelliteAtomic } from '../src/processors/satellite-processor.js'

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'amo-sat-'))

function normalConfig(dataRoot, max_frames = 1) {
  return {
    api: { radar_satellite_auth_key: 'test-key' }, storage: { base_path: dataRoot },
    satellite: { url: 'https://example.invalid', fog_url: 'https://example.invalid', channel: 'IR105', fog_product: 'FOG', region: 'KO', delay_minutes: 0, timeout_ms: 1, max_frames },
  }
}

// 밤 프레임(균일한 어두운 잡음)을 흉내낸다. 실제 운영 01:50 프레임이 평균 21·최대 27이었다.
const nightGrid = () => ({
  data: new Uint16Array(4).fill(200),
  attrs: { width: 2, height: 2, pixelSize: 2000, ulEasting: -1000000, ulNorthing: 1000000 },
})

function depsFor(dataRoot, counter) {
  return {
    root: dataRoot,
    config: {
      api: { radar_satellite_auth_key: 'test-key' },
      satellite: { url: 'https://example.invalid/GK2A/LE1B', delay_minutes: 20, timeout_ms: 1000 },
      storage: { base_path: dataRoot },
    },
    fetchNc: async () => { counter.calls += 1; return Buffer.from('not-really-netcdf') },
    parseNc: async () => nightGrid(),
  }
}

test('a night frame is downloaded once, not on every collection cycle', async () => {
  const dataRoot = root(), counter = { calls: 0 }
  const deps = depsFor(dataRoot, counter)
  const now = new Date('2026-08-09T16:55:00Z') // KST 01:55 — 밤

  const first = await processSatelliteVisible({ now, deps })
  assert.equal(first.reason, 'night', '밤 프레임은 저장하지 않는다')
  assert.equal(counter.calls, 1)

  // 같은 관측시각을 겨냥한 다음 주기. 저장된 그림이 없어도 다시 받아서는 안 된다.
  const second = await processSatelliteVisible({ now: new Date(now.getTime() + 60_000), deps })
  assert.equal(second.reason, 'already-collected')
  assert.equal(counter.calls, 1, '같은 시각의 VI006를 두 번 내려받으면 안 된다')

  // 다음 관측시각이 오면 다시 받는다 — 상한이 수집 자체를 멈춰서는 안 된다.
  await processSatelliteVisible({ now: new Date(now.getTime() + 10 * 60_000), deps })
  assert.equal(counter.calls, 2)
})

test('FOG-less frames stop being re-fetched once the attempt cap is reached', () => {
  assert.equal(needsFogRefetch({ fogPixelCount: 12 }), false, 'FOG가 있으면 다시 받지 않는다')
  assert.equal(needsFogRefetch({ fogPixelCount: null }), true, '첫 실패는 다시 시도한다')
  assert.equal(needsFogRefetch({ fogPixelCount: null, fogAttempts: 1 }), true)
  assert.equal(needsFogRefetch({ fogPixelCount: null, fogAttempts: 2 }), false, '상한에 닿으면 포기한다')
  assert.equal(needsFogRefetch(undefined), false)
})

test('a failed current-frame publish leaves the previous WebP and metadata intact', async () => {
  const dataRoot = root()
  const satelliteDir = path.join(dataRoot, 'satellite')
  fs.mkdirSync(satelliteDir, { recursive: true })
  const tm = '202608182310'
  const requestTm = '202608181410'
  const filename = `sat_korea_${tm}.webp`
  const oldMeta = {
    type: 'SATELLITE', product: 'FOG', channel: 'IR105', region: 'KO',
    render_version: 'fog-composite-v3-kst-tm-webp', tm, request_tm_utc: requestTm,
    latest: { tm, request_tm_utc: requestTm, path: `/data/satellite/${filename}`, fogPixelCount: null, fogAttempts: 0 },
    frames: [{ tm, request_tm_utc: requestTm, path: `/data/satellite/${filename}`, fogPixelCount: null, fogAttempts: 0 }],
  }
  fs.writeFileSync(path.join(satelliteDir, filename), 'last-good-webp')
  const metaFile = path.join(satelliteDir, 'sat_meta.json')
  fs.writeFileSync(metaFile, JSON.stringify(oldMeta))

  await assert.rejects(
    processSatellite({
      now: new Date('2026-08-18T14:10:00.000Z'),
      deps: {
        config: {
          api: { radar_satellite_auth_key: 'test-key' }, storage: { base_path: dataRoot },
          satellite: { url: 'https://example.invalid', fog_url: 'https://example.invalid', channel: 'IR105', fog_product: 'FOG', region: 'KO', delay_minutes: 0, timeout_ms: 1, max_frames: 1 },
        },
        renderFrame: async () => { throw new Error('forced worker termination during frame publication') },
        collectConvective: false,
      },
    }),
    /forced worker termination/,
  )

  assert.equal(fs.readFileSync(path.join(satelliteDir, filename), 'utf8'), 'last-good-webp')
  assert.deepEqual(JSON.parse(fs.readFileSync(metaFile, 'utf8')), oldMeta)
})

test('an interrupted atomic WebP rename leaves the old WebP and metadata readable', () => {
  const dataRoot = root()
  const satelliteDir = path.join(dataRoot, 'satellite')
  fs.mkdirSync(satelliteDir, { recursive: true })
  const webp = path.join(satelliteDir, 'sat_korea_202608182310.webp')
  const meta = path.join(satelliteDir, 'sat_meta.json')
  const oldMeta = { frames: [{ tm: '202608182310', path: '/data/satellite/sat_korea_202608182310.webp' }] }
  fs.writeFileSync(webp, 'last-good-webp')
  fs.writeFileSync(meta, JSON.stringify(oldMeta))
  const interruptedFs = {
    ...fs,
    renameSync(temp, target) {
      if (target === webp) throw new Error('forced termination before WebP publication')
      return fs.renameSync(temp, target)
    },
  }

  assert.throws(() => writeSatelliteAtomic(interruptedFs, webp, 'incomplete-new-webp'), /forced termination/)
  assert.equal(fs.readFileSync(webp, 'utf8'), 'last-good-webp')
  assert.deepEqual(JSON.parse(fs.readFileSync(meta, 'utf8')), oldMeta)
})

test('a metadata rename failure rolls back a replaced same-timestamp WebP', async () => {
  const dataRoot = root(), satelliteDir = path.join(dataRoot, 'satellite')
  fs.mkdirSync(satelliteDir, { recursive: true })
  const tm = '202608182310', requestTm = '202608181410', filename = `sat_korea_${tm}.webp`
  const oldMeta = { type: 'SATELLITE', render_version: 'fog-composite-v3-kst-tm-webp', tm, request_tm_utc: requestTm, frames: [{ tm, request_tm_utc: requestTm, path: `/data/satellite/${filename}`, fogPixelCount: null, fogAttempts: 0 }] }
  fs.writeFileSync(path.join(satelliteDir, filename), 'last-good-webp')
  const metaFile = path.join(satelliteDir, 'sat_meta.json')
  fs.writeFileSync(metaFile, JSON.stringify(oldMeta))
  const interruptedFs = { ...fs, renameSync(temp, target) {
    if (target === metaFile) throw new Error('forced metadata rename failure')
    return fs.renameSync(temp, target)
  } }

  await assert.rejects(processSatellite({
    now: new Date('2026-08-18T14:10:00.000Z'),
    deps: {
      config: normalConfig(dataRoot), fs: interruptedFs, collectConvective: false,
      renderFrame: async () => {
        fs.writeFileSync(path.join(satelliteDir, filename), 'new-webp')
        return { tm, request_tm_utc: requestTm, path: `/data/satellite/${filename}`, fogPixelCount: 4 }
      },
    },
  }), /forced metadata rename failure/)
  assert.equal(fs.readFileSync(path.join(satelliteDir, filename), 'utf8'), 'last-good-webp')
  assert.deepEqual(JSON.parse(fs.readFileSync(metaFile, 'utf8')), oldMeta)
})

test('current mode renders only latest and emits every other missing frame as backfill', async () => {
  const dataRoot = root(), rendered = []
  const work = await processSatellite({
    now: new Date('2026-08-18T14:10:00.000Z'),
    deps: {
      config: normalConfig(dataRoot, 4), collectConvective: false,
      renderFrame: async ({ requestTm, displayTm }) => {
        rendered.push(requestTm)
        return { tm: displayTm, request_tm_utc: requestTm, path: `/data/satellite/sat_korea_${displayTm}.webp`, fogPixelCount: 5 }
      },
    },
  })

  assert.deepEqual(rendered, ['202608181410'])
  assert.deepEqual(work.followUps.map((job) => job.mode), ['backfill', 'backfill', 'backfill'])
})

test('a stale backfill target outside the retained window is not rendered or published', async () => {
  const dataRoot = root(), satelliteDir = path.join(dataRoot, 'satellite')
  fs.mkdirSync(satelliteDir, { recursive: true })
  const latestTm = '202608182310', latestRequestTm = '202608181410'
  const metaFile = path.join(satelliteDir, 'sat_meta.json')
  const oldMeta = { type: 'SATELLITE', render_version: 'fog-composite-v3-kst-tm-webp', tm: latestTm, request_tm_utc: latestRequestTm, frames: [] }
  fs.writeFileSync(metaFile, JSON.stringify(oldMeta))
  let renders = 0
  const work = await processSatellite({
    now: new Date('2026-08-18T14:10:00.000Z'), mode: 'backfill', frame: { requestTm: '202608181300', displayTm: '202608182200' },
    deps: { config: normalConfig(dataRoot, 2), collectConvective: false, renderFrame: async () => { renders += 1; return null } },
  })

  assert.equal(work.result.saved, false)
  assert.equal(renders, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(metaFile, 'utf8')), oldMeta)
})

test('a failed FOG retry does not attach a follow-up descriptor to its thrown error', async () => {
  const dataRoot = root(), satelliteDir = path.join(dataRoot, 'satellite')
  fs.mkdirSync(satelliteDir, { recursive: true })
  const tm = '202608182310', requestTm = '202608181410'
  fs.writeFileSync(path.join(satelliteDir, 'sat_meta.json'), JSON.stringify({ type: 'SATELLITE', render_version: 'fog-composite-v3-kst-tm-webp', tm, request_tm_utc: requestTm, frames: [{ tm, request_tm_utc: requestTm, path: `/data/satellite/sat_korea_${tm}.webp`, fogPixelCount: null, fogAttempts: 1 }] }))

  await assert.rejects(processSatellite({
    now: new Date('2026-08-18T14:10:00.000Z'), mode: 'fog_retry', frame: { requestTm, displayTm: tm, fogAttempts: 1 },
    deps: { config: normalConfig(dataRoot), collectConvective: false, renderFrame: async () => { throw new Error('FOG retry failed') } },
  }), (error) => {
    assert.equal(error.followUps, undefined)
    return /FOG retry failed/.test(error.message)
  })
})
