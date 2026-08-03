import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ceilingFromLevels, CLD_THRESHOLD, buildCeilingGeoJson, classifyCeilingFt, loadKimCeiling } from './ceiling-kim.js'

const lv = (id, cld, hgt) => ({ id, cld: Float32Array.from([cld]), hgt: Float32Array.from([hgt]) })

test('임계값을 처음 넘는 층의 고도를 운저로 삼는다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', 0.1, 261), lv('950hPa', 0.7, 491)], 0), 491)
})

test('모든 층이 미달이면 운저 없음', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', 0.0, 261), lv('950hPa', 0.2, 491)], 0), null)
})

test('임계값 경계는 이상(>=)으로 판정한다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', CLD_THRESHOLD, 261)], 0), 261)
})

test('결측 층은 건너뛴다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', Number.NaN, 261), lv('950hPa', 0.8, 491)], 0), 491)
})

test('위성이 구름 없다고 하면 그 격자는 운저를 지운다', () => {
  const kim = {
    run: '2026080100',
    grid: { nx: 2, ny: 1, lonMin: 126, latMin: 37, lonMax: 127, latMax: 37 },
    ceilingM: Float32Array.from([300, 300]),
  }
  const alwaysClear = { frameTm: 'x', isClearAt: () => true }
  const fc = buildCeilingGeoJson(kim, alwaysClear)
  assert.equal(fc.features.length, 0)
})

test('운고 밴드 경계는 미터 기준을 피트로 환산해 견준다', () => {
  // 450 m = 1476 ft, 900 m = 2953 ft. 450/900을 피트 값과 그대로 비교하면
  // 300 m(984 ft) 운고가 'high'로 분류되어 위험이 사라진다.
  assert.equal(classifyCeilingFt(984), 'low')
  assert.equal(classifyCeilingFt(1476), 'low')
  assert.equal(classifyCeilingFt(2952), 'mid')
  assert.equal(classifyCeilingFt(2953), 'high')
})

test('운고 결측은 절대 밴드로 분류되지 않는다', () => {
  // null >= 0 은 자바스크립트에서 참이라 결측이 'low'(최악 밴드)로 새어나간다.
  for (const v of [null, undefined, Number.NaN, -1]) {
    assert.equal(classifyCeilingFt(v), 'missing', `${v}가 missing이 아니다`)
  }
})

function writeKimHour(root, run, hf, heightM) {
  const dir = path.join(root, 'kim_nwp', 'runs', `KIMG_NE57_${run}`, 'normalized', `hf${String(hf).padStart(3, '0')}`, '975hPa')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'grid.json'), JSON.stringify({
    grid: { nx: 1, ny: 1, lonMin: 127, lonMax: 127, latMin: 37, latMax: 37 },
    variables: {
      cld: { scale: 1, offset: 0, values: [1] },
      hgt: { scale: 1, offset: 0, values: [heightM] },
    },
  }))
}

test('현재 시각에 가장 가까운 과거 KIM 예보시간의 운고를 읽는다', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kim-ceiling-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = '2026080306'
  writeKimHour(root, run, 0, 300)
  writeKimHour(root, run, 6, 600)
  fs.writeFileSync(path.join(root, 'kim_nwp', 'index.json'), JSON.stringify({
    latestRun: run,
    times: [
      { hf: 0, validTime: '2026-08-03T06:00:00.000Z' },
      { hf: 6, validTime: '2026-08-03T12:00:00.000Z' },
    ],
    availability: {
      '975hPa': {
        0: { variables: ['cld', 'hgt'] },
        6: { variables: ['cld', 'hgt'] },
      },
    },
  }))

  const ceiling = loadKimCeiling(root, Date.parse('2026-08-03T12:20:00.000Z'))
  assert.equal(ceiling.hf, 6)
  assert.equal(ceiling.validTime, '2026-08-03T12:00:00.000Z')
  assert.equal(ceiling.ceilingM[0], 600)
})

test('운고 변수 파일이 없는 예보시간은 선택하지 않는다', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kim-ceiling-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const run = '2026080306'
  writeKimHour(root, run, 3, 450)
  fs.mkdirSync(path.join(root, 'kim_nwp'), { recursive: true })
  fs.writeFileSync(path.join(root, 'kim_nwp', 'index.json'), JSON.stringify({
    latestRun: run,
    times: [
      { hf: 3, validTime: '2026-08-03T09:00:00.000Z' },
      { hf: 6, validTime: '2026-08-03T12:00:00.000Z' },
    ],
    availability: {
      '975hPa': {
        3: { variables: ['cld', 'hgt'] },
        6: { variables: ['cld'] },
      },
    },
  }))

  const ceiling = loadKimCeiling(root, Date.parse('2026-08-03T12:20:00.000Z'))
  assert.notEqual(ceiling, null)
  assert.equal(ceiling.hf, 3)
})
