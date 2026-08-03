import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import config from '../config.js'
import processor, { parseAsosCeiling, ASOS_STATIONS } from './asos-ceiling-processor.js'

// 46필드, index 25=CA_TOT(전운량), 27=CH_MIN(운고), 32=VS(시정).
// 필러 기본값은 -9(결측)로 둔다 — 0으로 두면 "결측"과 "진짜 맑음"을 실수로 섞는다.
const row = (stn, { ch = '-9', ca = '-9', vs = '-9' } = {}) =>
  Array.from({ length: 46 }, (_, i) =>
    i === 1 ? stn : i === 25 ? ca : i === 27 ? ch : i === 32 ? vs : '-9').join(' ')

test('CH_MIN -9, CA_TOT -9(둘 다 결측)는 제외한다', () => {
  const text = `#START7777\n${row('108', { ch: '-9', ca: '-9' })}\n${row('112', { ch: '10' })}\n#7777END`
  const out = parseAsosCeiling(text)
  assert.equal(out.length, 1)
  assert.equal(out[0].stn, 112)
  assert.equal(Math.round(out[0].ceiling_ft), 3281)   // 10 × 100 m × 3.281
})

test('CH_MIN -9, CA_TOT 0(진짜 맑음)은 sky_clear로 남긴다', () => {
  const text = `#START7777\n${row('108', { ch: '-9', ca: '0' })}\n#7777END`
  const out = parseAsosCeiling(text)
  assert.equal(out.length, 1)
  assert.equal(out[0].stn, 108)
  assert.equal(out[0].sky_clear, true)
  assert.equal(out[0].ceiling_ft, null)
})

test('일반 운고는 그대로 유지한다', () => {
  const text = `#START7777\n${row('112', { ch: '10', ca: '2' })}\n#7777END`
  const out = parseAsosCeiling(text)
  assert.equal(out.length, 1)
  assert.equal(out[0].sky_clear, false)
  assert.equal(Math.round(out[0].ceiling_ft), 3281)
  assert.equal(out[0].cloud_amount, 2)
})

test('시정은 10 m 단위라 10을 곱해 미터로 바꾼다', () => {
  // 실측: 서울 station VS=3750일 때 시정 격자는 22,800 m — ×10(37,500 m)이
  // 격자와 같은 자릿수가 된다. ×1(3,750 m)이면 격자와 6배 어긋난다.
  const text = `#START7777\n${row('108', { ch: '10', vs: '3750' })}\n#7777END`
  const out = parseAsosCeiling(text)
  assert.equal(out[0].visibility_m, 37500)
})

test('시정 결측(-9)은 null이다', () => {
  const text = `#START7777\n${row('108', { ch: '10', vs: '-9' })}\n#7777END`
  const out = parseAsosCeiling(text)
  assert.equal(out[0].visibility_m, null)
})

test('NSC 상한(25000 ft) 이상은 sky_clear로 취급한다', () => {
  // 76 × 100 m × 3.281 = 24,935.6 ft → 아직 상한 미만, 실측 운고로 남는다
  const belowCap = row('108', { ch: '76', ca: '2' })
  // 77 × 100 m × 3.281 = 25,263.7 ft → 상한 이상, sky_clear로 바뀐다
  const aboveCap = row('112', { ch: '77', ca: '2' })
  const out = parseAsosCeiling(`#START7777\n${belowCap}\n${aboveCap}\n#7777END`)
  assert.equal(out[0].sky_clear, false)
  assert.equal(out[0].ceiling_ft, 24936)
  assert.equal(out[1].sky_clear, true)
  assert.equal(out[1].ceiling_ft, null)
})

test('지점명이 깨지지 않는다', () => {
  const seoul = ASOS_STATIONS.find((s) => s.stn === 108)
  assert.equal(seoul.name, '서울')
  assert.equal(Buffer.from(seoul.name, 'utf8').length, 6)   // 한글 2자 = UTF-8 6바이트
})

async function withAsosFetch(t, responseForTm, run) {
  const originalFetch = globalThis.fetch
  const originalBasePath = config.storage.base_path
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asos-ceiling-'))
  const requested = []
  globalThis.fetch = async (url) => {
    const tm = new URL(url).searchParams.get('tm')
    requested.push(tm)
    const text = responseForTm(tm)
    return { ok: true, arrayBuffer: async () => Buffer.from(text, 'ascii') }
  }
  config.storage.base_path = tempRoot
  t.after(() => {
    globalThis.fetch = originalFetch
    config.storage.base_path = originalBasePath
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })
  const result = await run()
  return { requested, result }
}

test('매시 15분 수집은 직전 시간이 아니라 현재 정시 자료를 먼저 쓴다', async (t) => {
  const currentTm = '202608031000'
  const text = `#START7777\n${row('108', { ch: '10', ca: '2' })}\n#7777END`
  const { requested, result } = await withAsosFetch(t, () => text, () =>
    processor.process({ now: new Date('2026-08-03T01:15:00.000Z') }))

  assert.equal(requested[0], currentTm)
  assert.equal(result.station_count, 1)
})

test('현재 정시 응답에 관측행이 없으면 한 시간 전 자료로 폴백한다', async (t) => {
  const currentTm = '202608031000'
  const previousTm = '202608030900'
  const previousText = `#START7777\n${row('108', { ch: '10', ca: '2' })}\n#7777END`
  const { requested, result } = await withAsosFetch(t,
    (tm) => tm === currentTm ? '#START7777\n#7777END' : previousText,
    () => processor.process({ now: new Date('2026-08-03T01:15:00.000Z') }))

  assert.deepEqual(requested, [currentTm, previousTm])
  assert.equal(result.station_count, 1)
})
