import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { createDb } from '../src/db/index.js'
import { createAlertTools } from '../src/ai/alert-tools.js'
import { modelToolResult } from '../src/ai/model-context.js'
import { createAiRouter } from '../src/ai/router.js'
import { createAlertsRouter } from '../src/me/alerts.js'
import { registerPersonalAlert, cancelPersonalAlert } from '../src/me/alert-service.js'

const START = Date.parse('2026-09-24T00:00:00Z')
const iso = (hours) => new Date(START + hours * 3600_000).toISOString()
const snapshot = { version: 3, base: { routeForm: { flightRule: 'IFR', departureAirport: 'RKSS', arrivalAirport: 'RKPC' } },
  routeGeometry: { type: 'LineString', coordinates: [[126.79, 37.55], [126.49, 33.5]] }, cruiseAltitudeFt: 31000 }
function setup(t, filename = ':memory:') {
  const db = createDb(filename)
  t.after(() => { if (db.open) db.close() })
  for (const id of [1, 2]) db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(id, `u${id}`, 'unused', iso(0))
  const insert = (userId = 1, value = snapshot) => Number(db.prepare('INSERT INTO routes(user_id,name,payload,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run(userId, '저장 원본', JSON.stringify(value), iso(0), iso(0)).lastInsertRowid)
  const routeId = insert()
  let clock = START
  const now = () => clock
  const tools = createAlertTools({ database: () => db, now })
  const prepare = (extra = {}, owner = 'user:1') => tools.call('prepare_flight_alert', { action: 'register', route_id: routeId, etd: iso(12), eta: iso(13), ...extra }, owner)
  return { db, routeId, tools, insert, now, prepare, advance: (ms) => { clock += ms } }
}
const confirm = (tools, prepared, owner = 'user:1', decision = 'confirm') => tools.confirm({ confirmationToken: prepared.data.confirmationToken, decision }, owner)
const activeCount = (db) => db.prepare('SELECT COUNT(*) n FROM routes WHERE alert_enabled=1').get().n

test('prepare is not execution; receipt and idempotency survive closing and reopening the DB', async (t) => {
  const root = fileURLToPath(new URL('../../artifacts/ai-copilot/', import.meta.url))
  mkdirSync(root, { recursive: true })
  const dir = mkdtempSync(path.join(root, 'confirm-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filename = path.join(dir, 'test.db')
  const x = setup(t, filename)
  const original = x.db.prepare('SELECT * FROM routes').all()
  const prepared = await x.prepare()
  assert.equal(prepared.data.preparationState, 'awaiting_user_confirmation')
  assert.deepEqual(x.db.prepare('SELECT * FROM routes').all(), original)
  assert.equal(JSON.stringify(modelToolResult('prepare_flight_alert', prepared, 'Asia/Seoul')).includes(prepared.data.confirmationToken), false)
  const result = confirm(x.tools, prepared)
  assert.equal(result.outcome, 'registered')
  assert.notEqual(result.alertId, x.routeId)
  assert.equal(activeCount(x.db), 1)
  assert.equal(x.db.prepare('SELECT payload FROM routes WHERE id=?').get(result.alertId).payload,
    JSON.stringify({ ...snapshot, sourceBriefingId: x.routeId }))
  x.db.close()
  const reopened = createDb(filename)
  try {
    const restarted = createAlertTools({ database: () => reopened, now: () => START + 86400_000 })
    const replay = confirm(restarted, prepared)
    assert.equal(replay.alertId, result.alertId)
    assert.equal(replay.replayed, true)
    assert.equal(activeCount(reopened), 1)
  } finally { reopened.close() }
})

test('receipt failure rolls back the business mutation and same token can safely retry', async (t) => {
  const x = setup(t), prepared = await x.prepare()
  x.db.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE ON ai_confirmations BEGIN SELECT RAISE(ABORT, 'injected_failure'); END")
  assert.throws(() => confirm(x.tools, prepared), /injected_failure/)
  assert.equal(activeCount(x.db), 0)
  assert.equal(x.db.prepare('SELECT state FROM ai_confirmations').get().state, 'pending')
  x.db.exec('DROP TRIGGER fail_receipt')
  assert.equal(confirm(x.tools, prepared).outcome, 'registered')
  assert.equal(activeCount(x.db), 1)
})

test('opening a pre-confirmation DB adds the journal without changing saved routes', (t) => {
  const root = fileURLToPath(new URL('../../artifacts/ai-copilot/', import.meta.url))
  mkdirSync(root, { recursive: true })
  const dir = mkdtempSync(path.join(root, 'confirm-migration-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filename = path.join(dir, 'test.db'), x = setup(t, filename)
  const original = x.db.prepare('SELECT * FROM routes').all()
  x.db.exec('DROP TABLE ai_confirmations')
  x.db.close()
  const reopened = createDb(filename)
  try {
    assert.deepEqual(reopened.prepare('SELECT * FROM routes').all(), original)
    assert.equal(reopened.prepare('SELECT COUNT(*) n FROM ai_confirmations').get().n, 0)
  } finally { reopened.close() }
})

test('journal pruning never deletes a monitoring copy or revives an unknown old token', async (t) => {
  const x = setup(t), prepared = await x.prepare()
  const flight = confirm(x.tools, prepared)
  x.advance(8 * 86400_000)
  const next = await x.prepare({ etd: iso(204), eta: iso(205) })
  assert.equal(next.status, 'ok')
  assert.throws(() => confirm(x.tools, prepared), /CONFIRMATION_NOT_FOUND/)
  assert.ok(x.db.prepare('SELECT 1 FROM routes WHERE id=?').get(flight.alertId))
  assert.equal(activeCount(x.db), 1)
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM ai_confirmations').get().n, 1)
})

test('owner, account state, expiry and actual future ETD are rechecked; cancelling a proposal does not change routes', async (t) => {
  const x = setup(t), prepared = await x.prepare()
  assert.throws(() => confirm(x.tools, prepared, 'user:2'), /CONFIRMATION_NOT_FOUND/)
  x.db.prepare("UPDATE users SET status='rejected' WHERE id=1").run()
  assert.throws(() => confirm(x.tools, prepared), /ACCOUNT_INACTIVE/)
  x.db.prepare("UPDATE users SET status='active' WHERE id=1").run()
  assert.equal(confirm(x.tools, prepared, 'user:1', 'cancel').executed, false)
  assert.equal(confirm(x.tools, prepared, 'user:1', 'cancel').replayed, true)
  assert.throws(() => confirm(x.tools, prepared), /CONFIRMATION_CANCELLED/)
  const soon = await x.prepare({ etd: iso(0.01), eta: iso(1) })
  x.advance(40_000)
  assert.throws(() => confirm(x.tools, soon), /ETD_MUST_BE_FUTURE/)
  const expired = await x.prepare()
  x.advance(5 * 60_000)
  assert.throws(() => confirm(x.tools, expired), /CONFIRMATION_EXPIRED/)
  assert.equal(activeCount(x.db), 0)
})

test('original modification/deletion, wrong ID kind and extra arguments cannot retarget confirmation', async (t) => {
  const x = setup(t), prepared = await x.prepare()
  x.db.prepare('UPDATE routes SET name=? WHERE id=?').run('수정', x.routeId)
  assert.throws(() => confirm(x.tools, prepared), /TARGET_CHANGED/)
  const fresh = await x.prepare()
  assert.throws(() => x.tools.confirm({ confirmationToken: fresh.data.confirmationToken, decision: 'confirm', route_id: 2 }, 'user:1'), /INVALID_INPUT/)
  const wrongKind = await x.tools.call('prepare_flight_alert', { action: 'cancel', alert_id: x.routeId }, 'user:1')
  assert.equal(wrongKind.error.code, 'ALERT_NOT_FOUND')
  x.db.prepare('DELETE FROM routes WHERE id=?').run(x.routeId)
  assert.throws(() => confirm(x.tools, fresh), /SAVED_ROUTE_NOT_FOUND/)
  assert.equal(activeCount(x.db), 0)
})

test('multiple flight times stay distinct; identical separate preparations coalesce and stale receipts never re-register', async (t) => {
  const x = setup(t)
  const one = await x.prepare(), two = await x.prepare(), later = await x.prepare({ etd: iso(14), eta: iso(15) })
  const first = confirm(x.tools, one)
  assert.equal(confirm(x.tools, two).outcome, 'already_registered')
  const second = confirm(x.tools, later)
  assert.notEqual(first.alertId, second.alertId)
  const conflict = await x.prepare({ eta: iso(13.5) })
  assert.throws(() => confirm(x.tools, conflict), /FLIGHT_ALREADY_REGISTERED/)
  const list = await x.tools.call('list_my_flight_alerts', { route_id: x.routeId, limit: 1 }, 'user:1')
  assert.equal(list.data.total, 2)
  assert.equal(list.data.nextOffset, 1)
  assert.equal(list.data.flights[0].routeId, x.routeId)
  const cancel = await x.tools.call('prepare_flight_alert', { action: 'cancel', alert_id: first.alertId }, 'user:1')
  assert.equal(confirm(x.tools, cancel).outcome, 'deleted')
  assert.equal(confirm(x.tools, one).replayed, true)
  assert.equal(activeCount(x.db), 1)
  assert.ok(x.db.prepare('SELECT 1 FROM routes WHERE id=?').get(x.routeId))
})

test('cancellation preserves FK notification history and ignores scheduler bookkeeping but not flight changes', async (t) => {
  const x = setup(t), flight = confirm(x.tools, await x.prepare())
  x.db.prepare('INSERT INTO triggered_alerts(user_id,route_id,type,severity,dedup_key,detected_at) VALUES(?,?,?,?,?,?)')
    .run(1, flight.alertId, 'CEIL', 'HIGH', 'test', iso(0))
  const cancel = await x.tools.call('prepare_flight_alert', { action: 'cancel', alert_id: flight.alertId }, 'user:1')
  x.db.prepare('UPDATE routes SET last_briefing_snapshot_id=?,updated_at=? WHERE id=?').run('new-weather', iso(0.01), flight.alertId)
  assert.equal(confirm(x.tools, cancel).outcome, 'disabled')
  assert.equal(x.db.prepare('SELECT alert_enabled FROM routes WHERE id=?').get(flight.alertId).alert_enabled, 0)
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM triggered_alerts').get().n, 1)
  const next = confirm(x.tools, await x.prepare())
  const changed = await x.tools.call('prepare_flight_alert', { action: 'cancel', alert_id: next.alertId }, 'user:1')
  x.db.prepare('UPDATE routes SET etd=? WHERE id=?').run(iso(14), next.alertId)
  assert.throws(() => confirm(x.tools, changed), /TARGET_CHANGED/)
})

test('time conversion is server-owned and missing/invalid conditions produce no execution', async (t) => {
  const x = setup(t)
  const local = await x.tools.call('prepare_flight_alert', { action: 'register', route_id: x.routeId,
    departureLocal: '2026-09-25T00:03', arrivalLocal: '2026-09-25T01:03', displayTimezone: 'Asia/Seoul' }, 'user:1')
  assert.equal(local.data.proposal.etd, '2026-09-24T15:03:00.000Z')
  assert.equal(local.data.proposal.alertStartMinutes, 360)
  const missing = await x.tools.call('prepare_flight_alert', { action: 'register' }, 'user:1')
  assert.deepEqual(missing.data.missingFields, ['route_id', 'etd'])
  for (const etd of ['2026-02-30T00:00:00Z', '2026-09-25T12:00:00', iso(-1)]) {
    assert.equal((await x.prepare({ etd })).status, 'error')
  }
  const noGeometry = x.insert(1, { ...snapshot, routeGeometry: null })
  assert.equal((await x.prepare({ route_id: noGeometry })).error.code, 'SAVED_GEOMETRY_REQUIRED')
  const org = x.insert(1, { ...snapshot, scope: 'organization' })
  assert.equal((await x.prepare({ route_id: org })).error.code, 'ORGANIZATION_CONTEXT_UNSUPPORTED')
  assert.equal(activeCount(x.db), 0)
})

test('shared account service cancels only active owned copies and rejects malformed ETA', (t) => {
  const x = setup(t)
  assert.equal(cancelPersonalAlert(x.db, 1, x.routeId).outcome, 'not_active')
  assert.ok(x.db.prepare('SELECT 1 FROM routes WHERE id=?').get(x.routeId))
  assert.throws(() => registerPersonalAlert(x.db, 1, { templateId: x.routeId, etd: iso(12), eta: 'bad' }, { now: START }), /eta_after_etd/)
})

test('a corrupt owned monitoring copy remains discoverable and cancellable, never usable as a new template', async (t) => {
  const x = setup(t), flight = confirm(x.tools, await x.prepare())
  x.db.prepare('UPDATE routes SET payload=? WHERE id=?').run('broken-json', flight.alertId)
  const listed = await x.tools.call('list_my_flight_alerts', {}, 'user:1')
  assert.equal(listed.data.flights[0].alertId, flight.alertId)
  assert.equal(listed.data.flights[0].routeId, null)
  assert.equal((await x.prepare({ route_id: flight.alertId })).status, 'error')
  const cancel = await x.tools.call('prepare_flight_alert', { action: 'cancel', alert_id: flight.alertId }, 'user:1')
  assert.equal(confirm(x.tools, cancel).outcome, 'deleted')
  assert.ok(x.db.prepare('SELECT 1 FROM routes WHERE id=?').get(x.routeId))
})

test('a conflicting legacy malformed ETA is an explicit conflict, not an internal date error', async (t) => {
  const x = setup(t), flight = confirm(x.tools, await x.prepare())
  x.db.prepare('UPDATE routes SET eta=? WHERE id=?').run('invalid', flight.alertId)
  const next = await x.prepare()
  assert.throws(() => confirm(x.tools, next), /FLIGHT_ALREADY_REGISTERED/)
  assert.equal(activeCount(x.db), 1)
})

test('simultaneous DB connections serialize confirmation and create only one monitoring copy', async (t) => {
  const root = fileURLToPath(new URL('../../artifacts/ai-copilot/', import.meta.url))
  mkdirSync(root, { recursive: true })
  const dir = mkdtempSync(path.join(root, 'confirm-concurrent-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const filename = path.join(dir, 'test.db'), x = setup(t, filename)
  const prepared = await x.prepare(), barrier = new SharedArrayBuffer(4)
  const workers = [0, 1].map(() => new Worker(`
    const { parentPort, workerData: d } = require('node:worker_threads');
    (async () => {
      const { createDb } = await import(d.dbModule);
      const { createAlertTools } = await import(d.toolModule);
      const db = createDb(d.filename);
      try {
        parentPort.postMessage({ ready: true });
        Atomics.wait(new Int32Array(d.barrier), 0, 0);
        const result = createAlertTools({ database: () => db, now: () => d.now }).confirm(d.body, 'user:1');
        parentPort.postMessage({ result });
      } finally { db.close(); }
    })().catch(error => { throw error; });
  `, { eval: true, workerData: { filename, barrier, now: START,
    dbModule: new URL('../src/db/index.js', import.meta.url).href,
    toolModule: new URL('../src/ai/alert-tools.js', import.meta.url).href,
    body: { confirmationToken: prepared.data.confirmationToken, decision: 'confirm' } } }))
  t.after(async () => { await Promise.all(workers.map((worker) => worker.terminate())) })
  let ready = 0
  const results = await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
    worker.once('error', reject)
    worker.on('message', (message) => {
      if (message.result) resolve(message.result)
      if (message.ready && ++ready === workers.length) {
        Atomics.store(new Int32Array(barrier), 0, 1)
        Atomics.notify(new Int32Array(barrier), 0)
      }
    })
  })))
  assert.deepEqual(results.map((r) => r.replayed).sort(), [false, true])
  assert.equal(results[0].alertId, results[1].alertId)
  assert.equal(activeCount(x.db), 1)
})

test('HTTP chat exposes preparation only; authenticated same-origin confirmation executes once and replay is a receipt', async (t) => {
  const x = setup(t), app = express()
  app.use((req, _res, next) => { if (req.headers['x-test-user']) req.session = { userId: Number(req.headers['x-test-user']) }; next() })
  let calls = 0
  app.use('/api/ai', createAiRouter({ enabled: true, personalAlerts: x.tools, executor: {}, now: x.now,
    provider: { complete: async ({ tools, messages }) => {
      assert.equal(tools.some((tool) => /confirm/.test(tool.name)), false)
      assert.ok(tools.some((tool) => tool.name === 'prepare_flight_alert'))
      if (++calls === 1) return { toolCalls: [{ id: 'prepare', name: 'prepare_flight_alert', arguments: {
        action: 'register', route_id: x.routeId, departureLocal: '2026-09-24T12:03' } }] }
      const result = JSON.parse(messages.at(-1).content)
      assert.equal(result.data.confirmationToken, undefined)
      return { text: '변경안을 준비했어요. 확인 버튼을 눌러 주세요.' }
    } } }))
  app.use('/api/me', express.json(), createAlertsRouter({ db: x.db }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = async (p, body, user = '1', source = origin) => {
    const res = await fetch(origin + p, { method: 'POST', headers: { 'content-type': 'application/json', Origin: source, 'x-test-user': user }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() }
  }
  const c = await post('/api/ai/conversations', {})
  const chat = await post('/api/ai/chat', { conversationId: c.body.conversationId, revision: 0, requestId: randomUUID(),
    message: '저장 경로 알람 준비', displayTimezone: 'UTC' })
  assert.equal(chat.body.status, 'completed')
  const prepared = chat.body.cards[0].result
  assert.equal(prepared.data.proposal.etd, '2026-09-24T12:03:00.000Z')
  assert.equal(activeCount(x.db), 0)
  const body = { confirmationToken: prepared.data.confirmationToken, decision: 'confirm' }
  assert.equal((await post('/api/ai/confirm', body, '')).status, 401)
  assert.equal((await post('/api/ai/confirm', body, '2')).status, 404)
  assert.equal((await post('/api/ai/confirm', body, '1', 'https://untrusted.example')).status, 403)
  const executed = await post('/api/ai/confirm', body)
  assert.equal(executed.body.outcome, 'registered')
  assert.equal((await post('/api/ai/confirm', body)).body.replayed, true)
  assert.equal(activeCount(x.db), 1)
  const direct = await post('/api/me/alerts', { templateId: x.routeId, etd: new Date(Date.now() + 86400_000).toISOString() })
  assert.equal(direct.status, 201)
  const removed = await fetch(`${origin}/api/me/alerts/${direct.body.id}`, { method: 'DELETE', headers: { 'x-test-user': '1' } })
  assert.equal(removed.status, 200)
  assert.equal(x.db.prepare('SELECT 1 FROM routes WHERE id=?').get(direct.body.id), undefined)
  assert.ok(x.db.prepare('SELECT 1 FROM routes WHERE id=?').get(x.routeId))
})
