import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { runOnce } from '../src/alerts/ops-alerts.js'

const NOW = Date.parse('2026-08-11T01:00:00Z') // KST 10:00 — 하루 요약 시각 이후
const ago = (ms) => new Date(NOW - ms).toISOString()

// 발송을 가로채 무엇이 나갔는지만 본다. 실제 텔레그램은 호출하지 않는다.
function spy() {
  const sent = []
  return { sent, send: async (text) => { sent.push(text); return { ok: true } } }
}

function stateWith(statuses, extra = {}) {
  const rows = statuses.map((status, i) => ({
    key: `p${i}`, label: `자료${i}`, status, lastSuccessAt: ago(3_600_000),
  }))
  return {
    health: { rows, groups: { source: [{ id: 'kma_nwp', label: '수치예보키', keys: rows.map((r) => r.key) }] } },
    usage: { keys: [] },
    forecast: { daysLeft: 41 },
    recentBoots: [],
    now: NOW,
    ...extra,
  }
}

test('대규모 장애면 한 번 보낸다', async () => {
  const db = createDb(':memory:')
  const { sent, send } = spy()
  await runOnce(db, { now: NOW, send, state: stateWith(['stopped', 'stopped']) })
  assert.equal(sent.length, 1)
  assert.match(sent[0], /수치예보키/)
})

test('같은 사건이 이어지는 동안 다시 보내지 않는다 — 5분마다 288번 울리면 안 된다', async () => {
  const db = createDb(':memory:')
  const { sent, send } = spy()
  const state = stateWith(['stopped', 'stopped'])
  await runOnce(db, { now: NOW, send, state })
  await runOnce(db, { now: NOW + 5 * 60_000, send, state })
  await runOnce(db, { now: NOW + 60 * 60_000, send, state })
  assert.equal(sent.length, 1, '첫 번째만 나가야 한다')
})

test('해소됐다가 재발하면 다시 보낸다', async () => {
  const db = createDb(':memory:')
  const { sent, send } = spy()
  await runOnce(db, { now: NOW, send, state: stateWith(['stopped', 'stopped']) })
  await runOnce(db, { now: NOW + 600_000, send, state: stateWith(['ok', 'ok']) })       // 복구 — 알림 없음
  await runOnce(db, { now: NOW + 1_200_000, send, state: stateWith(['stopped', 'stopped']) })
  assert.equal(sent.length, 2, '재발은 새 사건이다')
})

test('복구됐다고 알리지 않는다', async () => {
  const db = createDb(':memory:')
  const { sent, send } = spy()
  await runOnce(db, { now: NOW, send, state: stateWith(['stopped', 'stopped']) })
  const before = sent.length
  await runOnce(db, { now: NOW + 600_000, send, state: stateWith(['ok', 'ok']) })
  assert.equal(sent.length, before, '복구 알림은 없다')
})

test('아무 일 없으면 한 통도 안 간다', async () => {
  const db = createDb(':memory:')
  const { sent, send } = spy()
  await runOnce(db, { now: NOW, send, state: stateWith(['ok', 'ok']) })
  assert.equal(sent.length, 0)
})

test('하루 요약은 하루 한 번만 나간다', async () => {
  const db = createDb(':memory:')
  const { sent, send } = spy()
  const state = stateWith(['ok', 'ok'])
  state.health.rows[0] = { key: 'kim', label: 'KIM 격자', status: 'stopped', lastSuccessAt: ago(64 * 86_400_000) }
  state.health.groups.source[0].keys = ['kim', 'p1']

  await runOnce(db, { now: NOW, send, state })
  await runOnce(db, { now: NOW + 3_600_000, send, state })
  assert.equal(sent.length, 1, '같은 날 두 번 보내지 않는다')
  assert.match(sent[0], /오래 멈춘 자료/)

  await runOnce(db, { now: NOW + 86_400_000, send, state })
  assert.equal(sent.length, 2, '다음 날엔 다시 보낸다')
})

test('하루 요약 시각(09시 KST) 전에는 보내지 않는다', async () => {
  const db = createDb(':memory:')
  const { sent, send } = spy()
  const early = Date.parse('2026-08-10T22:00:00Z') // KST 07:00
  const state = stateWith(['ok', 'ok'])
  state.health.rows[0] = { key: 'kim', label: 'KIM 격자', status: 'stopped', lastSuccessAt: new Date(early - 64 * 86_400_000).toISOString() }
  await runOnce(db, { now: early, send, state })
  assert.equal(sent.length, 0)
})

test('발송이 실패하면 보낸 것으로 기록하지 않는다 — 다음 바퀴에 다시 시도한다', async () => {
  const db = createDb(':memory:')
  let calls = 0
  const send = async () => { calls += 1; return calls === 1 ? { ok: false, error: 'network' } : { ok: true } }
  const state = stateWith(['stopped', 'stopped'])
  await runOnce(db, { now: NOW, send, state })
  await runOnce(db, { now: NOW + 300_000, send, state })
  assert.equal(calls, 2, '첫 실패 후 다시 보내야 한다')
})

test('텔레그램 설정이 없으면 보낸 것으로 기록하지 않는다', async () => {
  const db = createDb(':memory:')
  let calls = 0
  const send = async () => { calls += 1; return { skipped: 'no_telegram_env' } }
  const state = stateWith(['stopped', 'stopped'])
  await runOnce(db, { now: NOW, send, state })
  await runOnce(db, { now: NOW + 300_000, send, state })
  assert.equal(calls, 2, '설정이 생기면 바로 나가야 한다')
})
