import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readDataHealth } from '../src/admin/data-health.js'

const NOW = Date.parse('2026-08-10T10:36:00Z')
const base = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-'))
const statsFor = (types) => () => ({ types })

test('판정은 last_success로 한다 — 내용 시각이 낡아도 수집이 돌면 정상', () => {
  const { rows } = readDataHealth(base(), {
    getCached: () => ({ fetched_at: '2026-06-01T00:00:00Z' }),
    getStats: statsFor({ sigmet: { last_success: '2026-08-10T10:33:00Z', last_run: '2026-08-10T10:33:00Z' } }),
    now: NOW,
  })
  const sigmet = rows.find((r) => r.key === 'sigmet')
  assert.equal(sigmet.status, 'ok')
})

test('수집이 멈추면 멈춤으로 잡힌다', () => {
  const { rows, counts } = readDataHealth(base(), {
    getCached: () => null,
    getStats: statsFor({ kim_surface_wind: { last_success: '2026-06-07T12:12:00Z' } }),
    now: NOW,
  })
  assert.equal(rows.find((r) => r.key === 'kim_nwp').status, 'stopped')
  assert.ok(counts.stopped >= 1)
})

test('성공 기록이 아예 없으면 never', () => {
  const { rows } = readDataHealth(base(), { getCached: () => null, getStats: statsFor({}), now: NOW })
  assert.equal(rows.find((r) => r.key === 'metar').status, 'never')
})

test('이벤트성 자료는 0건이어도 정상이고 건수를 함께 낸다', () => {
  const { rows } = readDataHealth(base(), {
    getCached: (key) => (key === 'airmet' ? { fetched_at: '2026-08-10T10:35:00Z', items: [] } : null),
    getStats: statsFor({ airmet: { last_success: '2026-08-10T10:35:00Z' } }),
    now: NOW,
  })
  const airmet = rows.find((r) => r.key === 'airmet')
  assert.equal(airmet.status, 'ok')
  assert.equal(airmet.eventDriven, true)
  assert.equal(airmet.activeCount, 0)
})

test('meta 파일 타입은 파일 시각을 contentAt으로 쓴다', () => {
  const dir = base()
  fs.mkdirSync(path.join(dir, 'radar'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'radar', 'echo_meta.json'), '{}')
  const { rows } = readDataHealth(dir, { getCached: () => null, getStats: statsFor({}), now: NOW })
  assert.ok(rows.find((r) => r.key === 'radar_echo').contentAt)
})

test('쉬는 시간에는 판정하지 않는다 — KST 새벽 2시의 운항편', () => {
  const { rows } = readDataHealth(base(), {
    getCached: () => null,
    getStats: statsFor({ terminal_flights: { last_success: '2026-08-10T14:00:00Z' } }),
    now: Date.parse('2026-08-10T17:00:00Z'),
  })
  assert.equal(rows.find((r) => r.key === 'terminal_flights').status, 'quiet')
})

test('묶음 정보는 34종을 빠짐없이 담는다', () => {
  const { groups } = readDataHealth(base(), { getCached: () => null, getStats: statsFor({}), now: NOW })
  assert.equal(groups.source.reduce((n, g) => n + g.keys.length, 0), 34)
  assert.equal(groups.character.reduce((n, g) => n + g.keys.length, 0), 34)
})
