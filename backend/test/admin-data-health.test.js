import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readDataHealth } from '../src/admin/data-health.js'

function tmpBase() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'data-health-'))
}

test('readDataHealth: store 타입은 getCached의 fetched_at을 그대로 쓴다', () => {
  const base = tmpBase()
  const rows = readDataHealth(base, {
    getCached: (type) => (type === 'metar' ? { fetched_at: '2026-07-27T05:00:00Z' } : null),
    getStats: () => ({ types: {} }),
  })
  const metar = rows.find((r) => r.key === 'metar')
  assert.equal(metar.fetchedAt, '2026-07-27T05:00:00Z')
  const taf = rows.find((r) => r.key === 'taf')
  assert.equal(taf.fetchedAt, null, '캐시가 없으면 null')
})

test('readDataHealth: meta 파일 타입은 파일 수정시각을 쓰고, 파일이 없으면 null', () => {
  const base = tmpBase()
  fs.mkdirSync(path.join(base, 'radar'), { recursive: true })
  fs.writeFileSync(path.join(base, 'radar', 'echo_meta.json'), '{}')

  const rows = readDataHealth(base, { getCached: () => null, getStats: () => ({ types: {} }) })
  const radar = rows.find((r) => r.key === 'radar_echo')
  assert.ok(radar.fetchedAt, '방금 만든 파일이라 시각이 있어야 함')
  const echoTop = rows.find((r) => r.key === 'echo_top')
  assert.equal(echoTop.fetchedAt, null, '아직 안 만들어진 파일은 null')
})

test('readDataHealth: 최신 실행이 실패면 failing=true, 그 뒤에 성공하면 다시 false', () => {
  const base = tmpBase()
  const rows = readDataHealth(base, {
    getCached: () => null,
    getStats: () => ({ types: { metar: { last_run: 't2', last_failure: 't2', last_error: 'timeout' } } }),
  })
  assert.equal(rows.find((r) => r.key === 'metar').failing, true)
  assert.equal(rows.find((r) => r.key === 'metar').lastError, 'timeout')

  const rows2 = readDataHealth(base, {
    getCached: () => null,
    getStats: () => ({ types: { metar: { last_run: 't3', last_failure: 't2', last_error: 'timeout' } } }),
  })
  assert.equal(rows2.find((r) => r.key === 'metar').failing, false, '최신 실행(t3)이 실패시각(t2)보다 나중이면 지금은 정상')
})

test('readDataHealth: 저장 키와 수집 작업 이름이 다른 타입도 실패를 잡는다(flight_category)', () => {
  const rows = readDataHealth(tmpBase(), {
    getCached: (type) => (type === 'flight_category_overlay' ? { fetched_at: '2026-08-10T00:00:00Z' } : null),
    getStats: () => ({ types: { flight_category: { last_run: 't1', last_failure: 't1', last_error: 'sfc_vis unavailable' } } }),
  })
  const row = rows.find((r) => r.key === 'flight_category_overlay')
  assert.equal(row.fetchedAt, '2026-08-10T00:00:00Z')
  assert.equal(row.failing, true)
  assert.equal(row.lastError, 'sfc_vis unavailable')
})
