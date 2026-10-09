import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import stats from '../src/stats.js'

test('성공에만 last_success가 찍히고 실패는 그대로 둔다', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))

  stats.recordSuccess('metar', {}, 100)
  const afterSuccess = stats.getStats().types.metar.last_success
  assert.ok(afterSuccess, '성공하면 값이 있어야 한다')

  stats.recordFailure('metar', 'boom', 100)
  const entry = stats.getStats().types.metar
  assert.equal(entry.last_success, afterSuccess, '실패는 last_success를 건드리지 않는다')
  assert.equal(entry.last_run, entry.last_failure, 'last_run은 실패에도 갱신된다')
})

test('예전 통계 파일을 읽어도 last_success 칸이 생긴다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-'))
  fs.mkdirSync(path.join(dir, 'stats'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'stats', 'latest.json'), JSON.stringify({
    since: '2026-01-01T00:00:00Z',
    types: { metar: { total_runs: 5, success: 5, failure: 0, last_run: '2026-01-01T00:05:00Z' } },
    recent_runs: [],
  }))
  stats.initFromFile(dir)
  assert.equal(stats.getStats().types.metar.last_success, null, '없던 값은 null로 채운다')
})

test('할 일이 없어 끝낸 성공 실행은 그 이유를 수집 시간표에 남긴다', (t) => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))
  const runs = []
  stats.setRunListener((entry) => runs.push(entry))
  t.after(() => stats.setRunListener(null))
  stats.recordSuccess('kim_surface_chart', { skipped: true, reason: 'kim_surface_chart_from_expanded' }, 5)
  stats.recordSuccess('kim_surface_chart', { saved: true }, 5)
  assert.deepEqual(runs.map((run) => [run.outcome, run.reason]), [['succeeded', 'kim_surface_chart_from_expanded'], ['succeeded', null]])
})
