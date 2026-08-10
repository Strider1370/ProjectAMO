import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import stats from '../src/stats.js'

test('누적 성공률과 표본 수를 낸다', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))
  stats.recordSuccess('metar', {}, 100)
  stats.recordSuccess('metar', {}, 300)
  stats.recordFailure('metar', 'boom', 200)

  const s = stats.getTypeSummary('metar')
  assert.equal(s.totalRuns, 3)
  assert.ok(Math.abs(s.successRate - 2 / 3) < 1e-9)
  assert.equal(s.avgMs, 200) // 100·300·200의 평균
  assert.equal(s.lastError, 'boom')
  assert.ok(s.since)
})

test('실행 기록이 없으면 성공률과 평균은 null', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))
  const s = stats.getTypeSummary('taf')
  assert.equal(s.successRate, null)
  assert.equal(s.avgMs, null)
  assert.equal(s.totalRuns, 0)
})

test('모르는 타입은 빈 요약을 준다', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))
  assert.equal(stats.getTypeSummary('nope').totalRuns, 0)
})
