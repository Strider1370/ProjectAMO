import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classifyVisibility, buildVisibilityGeoJson, loadCtpsMask, pickTrendBaseline, buildTrend } from './flight-category-processor.js'
import { SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'
import { encodeCtpsBinary } from './convective-satellite-model.js'

test('시정 밴드 경계값', () => {
  assert.equal(classifyVisibility(2999), 'severe')
  assert.equal(classifyVisibility(3000), 'below')
  assert.equal(classifyVisibility(4999), 'below')
  assert.equal(classifyVisibility(5000), 'marginal')
  assert.equal(classifyVisibility(6999), 'marginal')
  assert.equal(classifyVisibility(7000), 'clear')
})

test('결측은 missing이며 절대 clear가 아니다', () => {
  assert.equal(classifyVisibility(-1), 'missing')
  // 파서가 숫자 파싱에 실패하면 NaN이 나온다. NaN >= 0 은 false라 missing으로 떨어진다.
  assert.equal(classifyVisibility(NaN), 'missing')
  assert.equal(classifyVisibility(undefined), 'missing')
  // 시정 0은 결측이 아니라 최악의 실제 관측이다.
  assert.equal(classifyVisibility(0), 'severe')
})

test('clear 구역은 폴리곤을 만들지 않는다', () => {
  const grid = new Float32Array(SFC_W * SFC_H).fill(9000)
  grid[SFC_W * 100 + 100] = 1000
  const bands = buildVisibilityGeoJson(grid).features.map((f) => f.properties.band)
  assert.ok(bands.includes('severe'))
  assert.ok(!bands.includes('clear'))
})

function makeRoot(tm, cloudy) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctps-'))
  const dir = path.join(root, 'satellite', 'convective')
  fs.mkdirSync(dir, { recursive: true })
  const size = 900 * 900
  fs.writeFileSync(path.join(dir, `ctps_${tm}.bin`), encodeCtpsBinary({
    attrs: { width: 900, height: 900, pixelSize: 2000, ulEasting: -899000, ulNorthing: 899000 },
    heightFt: new Uint32Array(size).fill(cloudy ? 12000 : 4294967295),
    temperatureCentiC: new Int16Array(size).fill(cloudy ? -1000 : 32767),
    quality: new Uint8Array(size).fill(cloudy ? 0 : 255),
  }))
  fs.writeFileSync(path.join(dir, 'convective_meta.json'), JSON.stringify({ frames: [{ tm }], latest: { tm } }))
  return root
}

test('저장본이 없으면 null', () => {
  assert.equal(loadCtpsMask(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'))), null)
})

test('구름 있는 프레임에서 국내 좌표는 clear가 아니다', () => {
  const mask = loadCtpsMask(makeRoot('202608010300', true))
  assert.equal(mask.frameTm, '202608010300')
  assert.equal(mask.isClearAt(37.5, 127.0), false)
})

test('무효 픽셀은 clear로 본다', () => {
  const mask = loadCtpsMask(makeRoot('202608010300', false))
  assert.equal(mask.isClearAt(37.5, 127.0), true)
})

test('결측은 추세를 만들지 않는다', () => {
  const t = buildTrend({ query_grid: { vis: [5000, -1, 4000] } }, { query_grid: { vis: [7000, 6000, -1] } })
  assert.equal(t.vis_delta[0], -2000)
  assert.equal(t.vis_delta[1], null)   // 지금이 결측
  assert.equal(t.vis_delta[2], null)   // 3시간 전이 결측
})

test('3시간 전 산출물이 없으면 추세는 null', () => {
  assert.equal(buildTrend({ query_grid: { vis: [5000] } }, null), null)
})

test('3시간에 가까운 과거 산출물을 고른다', () => {
  const now = new Date('2026-08-01T12:00:00Z')
  const target3hAgo = new Date(now.getTime() - 3 * 3600 * 1000)
  const recent = [
    { computed_at: new Date(target3hAgo.getTime() + 5 * 60 * 1000).toISOString() },
    { computed_at: new Date(target3hAgo.getTime() - 8 * 60 * 1000).toISOString() },
    { computed_at: new Date(target3hAgo.getTime() + 15 * 60 * 1000).toISOString() },
  ]
  const baseline = pickTrendBaseline(recent, now)
  // 가장 가까운 것은 5분 차이
  assert.equal(baseline.computed_at, recent[0].computed_at)
})

test('20분을 넘으면 null', () => {
  const now = new Date('2026-08-01T12:00:00Z')
  const target3hAgo = new Date(now.getTime() - 3 * 3600 * 1000)
  const recent = [
    { computed_at: new Date(target3hAgo.getTime() + 25 * 60 * 1000).toISOString() },
  ]
  const baseline = pickTrendBaseline(recent, now)
  assert.equal(baseline, null)
})
