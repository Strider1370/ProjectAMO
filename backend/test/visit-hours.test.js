import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db/index.js'
import { recordVisit, hourlyPattern } from '../src/admin/visits.js'

test('방문하면 그 시각 칸이 오른다', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'v1')
  recordVisit(db, 'v2')
  const total = db.prepare('SELECT SUM(n) n FROM visit_hours').get().n
  assert.equal(total, 2)
})

test('요일×시각으로 묶어 낸다', () => {
  const db = createDb(':memory:')
  // 2026-08-10은 월요일
  db.prepare('INSERT INTO visit_hours (day,hour,n) VALUES (?,?,?)').run('2026-08-10', 8, 5)
  db.prepare('INSERT INTO visit_hours (day,hour,n) VALUES (?,?,?)').run('2026-08-17', 8, 3)
  const { cells } = hourlyPattern(db, { weeks: 52 })
  const mon8 = cells.find((c) => c.dow === 0 && c.hour === 8)
  assert.equal(mon8.n, 8, '같은 요일·시각은 합산한다')
})

test('2주 미만이면 ready가 거짓이다', () => {
  const db = createDb(':memory:')
  db.prepare('INSERT INTO visit_hours (day,hour,n) VALUES (?,?,?)').run('2026-08-10', 8, 1)
  const out = hourlyPattern(db, { weeks: 4 })
  assert.equal(out.ready, false)
  assert.equal(out.days, 1)
})
