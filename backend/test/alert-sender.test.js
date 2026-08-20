import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatAlert, composeMessage, sendTelegram, dispatchFlightAlerts } from '../src/alerts/sender.js'
import { createDb } from '../src/db/index.js'

const route = { id: 42, name: 'RKSI→RKPC', dep: 'RKSI', dest: 'RKPC', etd: '2026-07-08T10:00:00Z', eta: '2026-07-08T12:10:00Z' }
const NO_EMOJI = /^[^\p{Extended_Pictographic}]*$/u

const mkUser = (db, name, role = 'pilot') => db
  .prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)')
  .run(name, 'x', role, new Date().toISOString()).lastInsertRowid
const mkSub = (db, uid, endpoint) => db
  .prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)')
  .run(uid, endpoint, 'p', 'a', new Date().toISOString()).lastInsertRowid

test('formatAlert: 다섯 종류를 사람 말로 낸다', () => {
  assert.match(formatAlert({ type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'personal' }), /도착 RKPC.*내 미니마 미만/)
  assert.match(formatAlert({ type: 'MINIMA', target: 'RKTU', role: 'dest', bound: 'airport' }), /접근최저치 미만/)
  assert.match(formatAlert({ type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'default' }), /IFR 이하/)
  assert.match(formatAlert({ type: 'TS', target: 'RKSI', role: 'dep' }), /출발 RKSI.*뇌전/)
  assert.match(formatAlert({ type: 'FG', target: 'RKPK', role: 'altn' }), /교체 RKPK.*안개/)
  assert.match(formatAlert({ type: 'SN', target: 'RKPC', role: 'dest' }), /눈/)
  assert.match(formatAlert({ type: 'SIGMET', target: 'SIGMET WS01' }), /SIGMET WS01/)
  assert.match(formatAlert({ type: 'TS', target: 'RKSI', role: 'dep' }), NO_EMOJI) // 이모지 미사용
})

test('composeMessage: 제목 + 비행 식별(ETD/ETA Z) + 감지시각', () => {
  const msg = composeMessage(
    [{ type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'personal' }],
    route, { now: Date.parse('2026-07-08T09:32:00Z') },
  )
  assert.match(msg, /^\[경로 예보변화 알림\]/)
  assert.match(msg, /RKSI→RKPC/)
  assert.match(msg, /ETD 1000Z · ETA 1210Z/)
  assert.match(msg, /감지 0932Z/)
  assert.match(msg, NO_EMOJI)
})

test('sendTelegram: env 없으면 skip', async () => {
  const r = await sendTelegram('hi', { routeId: 1 }, { env: {} })
  assert.equal(r.skipped, 'no_telegram_env')
})

test('sendTelegram: env 있으면 sendMessage POST + 딥링크 버튼', async () => {
  let captured = null
  const fetchImpl = async (url, opts) => { captured = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200 } }
  const env = { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '999', FRONTEND_ORIGIN: 'https://amo.example' }
  const r = await sendTelegram('경고 문구', { routeId: 42 }, { fetchImpl, env })
  assert.equal(r.ok, true)
  assert.match(captured.url, /botTOK\/sendMessage/)
  assert.equal(captured.body.chat_id, '999')
  assert.equal(captured.body.reply_markup.inline_keyboard[0][0].url, 'https://amo.example/?flight=42')
})

test('텔레그램은 관리자 계정만 — 일반 사용자는 not_admin', async () => {
  const db = createDb(':memory:')
  try {
    const adminId = mkUser(db, 'adm', 'admin')
    const pilotId = mkUser(db, 'pil', 'pilot')
    const env = { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '999' }
    const alert = { type: 'FG', target: 'RKPC', role: 'dest' }

    let adminCalled = false
    await dispatchFlightAlerts(db, [alert], { ...route, user_id: adminId }, { env, fetchImpl: async () => { adminCalled = true; return { ok: true, status: 200 } }, sendPushImpl: async () => {} })
    assert.equal(adminCalled, true)

    let pilotCalled = false
    const res = await dispatchFlightAlerts(db, [alert], { ...route, user_id: pilotId }, { env, fetchImpl: async () => { pilotCalled = true; return { ok: true, status: 200 } }, sendPushImpl: async () => {} })
    assert.equal(pilotCalled, false)
    assert.equal(res.telegram.skipped, 'not_admin')
  } finally { db.close() }
})

test('dispatchFlightAlerts: 한 비행 여러 변화 → 텔레그램 1건(묶음, §5B group_wait)', async () => {
  const db = createDb(':memory:')
  try {
    const adminId = mkUser(db, 'adm', 'admin')
    const env = { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '999' }
    const changes = [
      { type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'personal' },
      { type: 'TS', target: 'RKSI', role: 'dep' },
      { type: 'SIGMET', target: 'SIGMET WS01' },
    ]
    let calls = 0
    let captured = null
    const fetchImpl = async (url, opts) => { calls++; captured = JSON.parse(opts.body); return { ok: true, status: 200 } }
    const res = await dispatchFlightAlerts(db, changes, { ...route, user_id: adminId }, { env, fetchImpl, sendPushImpl: async () => {} })
    assert.equal(calls, 1) // 3개 변화여도 전송은 1회
    assert.equal(res.count, 3) // 심각도로 거르지 않는다 — 판정은 diff가 이미 끝냈다
    assert.match(captured.text, /^\[경로 예보변화 알림\]/)
    assert.match(captured.text, /도착 RKPC 내 미니마 미만/)
    assert.match(captured.text, /출발 RKSI 뇌전/)
    assert.match(captured.text, /SIGMET WS01/)
  } finally { db.close() }
})

test('dispatchFlightAlerts: 경로 소유자의 구독으로 푸시한다', async () => {
  const db = createDb(':memory:')
  try {
    const uid = mkUser(db, 'pilot')
    mkSub(db, uid, 'https://push.example/1')

    const sent = []
    const result = await dispatchFlightAlerts(
      db,
      [{ id: 1, type: 'MINIMA', target: 'RKPC', role: 'dest', bound: 'personal' }],
      { id: 7, user_id: uid, dep: 'RKSI', dest: 'RKPC' },
      { now: Date.now(), sendPushImpl: async (sub, payload) => { sent.push({ sub, payload }) } },
    )

    assert.equal(result.push.sent, 1)
    assert.equal(sent[0].sub.endpoint, 'https://push.example/1')
    assert.match(sent[0].payload.body, /RKPC/)
    // 탭했을 때 그 비행으로 착지해야 한다.
    assert.match(sent[0].payload.url, /\?flight=7/)
  } finally { db.close() }
})

test('dispatchFlightAlerts: 만료된 구독은 지운다', async () => {
  const db = createDb(':memory:')
  try {
    const uid = mkUser(db, 'pilot')
    mkSub(db, uid, 'https://push.example/gone')

    const gone = async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }) }
    const result = await dispatchFlightAlerts(db, [{ id: 1, type: 'FG', target: 'RKPC', role: 'dest' }],
      { id: 7, user_id: uid }, { now: Date.now(), sendPushImpl: gone })

    assert.equal(result.push.pruned, 1)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n, 0)
  } finally { db.close() }
})

test('구독이 없으면 조용히 넘어간다 — 인앱은 이미 저장됐다', async () => {
  const db = createDb(':memory:')
  try {
    const uid = mkUser(db, 'pilot')
    const result = await dispatchFlightAlerts(db, [{ id: 1, type: 'TS', target: 'RKSI', role: 'dep' }],
      { id: 7, user_id: uid }, { now: Date.now(), sendPushImpl: async () => {} })
    assert.equal(result.push.sent, 0)
  } finally { db.close() }
})

// 위험기상이 셋이면 폰은 한 번 울려야 한다. 변화마다 따로 보내면 알림이 세 번 쌓여
// 무엇을 봐야 하는지가 묻힌다(§5B group_wait).
test('dispatchFlightAlerts: 변화가 여럿이어도 푸시는 한 건으로 묶인다', async () => {
  const db = createDb(':memory:')
  try {
    const uid = mkUser(db, 'pilot')
    mkSub(db, uid, 'https://push.example/1')
    const sent = []
    const changes = [
      { id: 1, type: 'MINIMA', target: 'RKSI', role: 'dep', bound: 'personal' },
      { id: 2, type: 'TS', target: 'RKSI', role: 'dep' },
      { id: 3, type: 'SIGMET', target: 'SIGMET WS01' },
    ]
    const res = await dispatchFlightAlerts(db, changes, { id: 7, user_id: uid, dep: 'RKSI', dest: 'RKPK' },
      { now: Date.now(), sendPushImpl: async (sub, payload) => { sent.push(payload) } })

    assert.equal(res.push.sent, 1, '구독 1개에 발송 1회')
    assert.equal(sent.length, 1, '변화 3건이어도 폰은 한 번만 울린다')
    assert.deepEqual(sent[0].body.split('\n'), [
      '출발 RKSI 내 미니마 미만 예보',
      '출발 RKSI 뇌전 예보',
      '경로상 신규 SIGMET (SIGMET WS01)',
    ], '세 줄이 한 알림 안에 들어간다')
  } finally { db.close() }
})
