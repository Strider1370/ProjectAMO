import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatAlert, composeMessage, shouldPush, sendTelegram, dispatchAlert, dispatchFlightAlerts } from '../src/alerts/sender.js'
import { createDb } from '../src/db/index.js'

const route = { id: 42, name: 'RKSI→RKPC', dep: 'RKSI', dest: 'RKPC', etd: '2026-07-08T10:00:00Z', eta: '2026-07-08T12:10:00Z' }
const NO_EMOJI = /^[^\p{Extended_Pictographic}]*$/u

test('formatAlert: CEIL 통지 문구(태그·역할·전→후·기준·이모지없음)', () => {
  const s = formatAlert({ type: 'CEIL', severity: 'CRITICAL', target: 'RKPC', from: 1500, to_val: '400' }, route)
  assert.match(s, /\[위험\]/)
  assert.match(s, /도착 RKPC/)          // route.dest=RKPC → 역할 부여
  assert.match(s, /운고 1500 → 400ft/)  // 전값→후값
  assert.match(s, /최저운고 기준 미만/)
  assert.match(s, NO_EMOJI)             // 이모지 미사용
})

test('formatAlert: 타입별 분기(교체·경로위험·출발TS)', () => {
  assert.match(formatAlert({ type: 'ALTERNATE_FLIP', severity: 'HIGH', target: 'RKPC' }, route), /\[주의\] 도착 RKPC 교체공항 필요 조건 발생/)
  assert.match(formatAlert({ type: 'ENROUTE_HAZARD', severity: 'HIGH', to: 'TS' }), /\[주의\] 경로상 신규 위험 \(TS\)/)
  assert.match(formatAlert({ type: 'WX', severity: 'HIGH', target: 'RKSI', to: 'TS' }, route), /\[주의\] 출발 RKSI 뇌전\(TS\) 예보/)
})

test('composeMessage: 제목 + 비행 식별(ETD/ETA Z) + 감지시각', () => {
  const msg = composeMessage(
    [{ type: 'CEIL', severity: 'CRITICAL', target: 'RKPC', from: 1500, to: 400 }],
    route, { now: Date.parse('2026-07-08T09:32:00Z') },
  )
  assert.match(msg, /^\[경로 예보변화 알림\]/)
  assert.match(msg, /RKSI→RKPC/)
  assert.match(msg, /ETD 1000Z · ETA 1210Z/)
  assert.match(msg, /감지 0932Z/)
  assert.match(msg, NO_EMOJI)
})

test('shouldPush: HIGH/CRITICAL만 즉시 푸시', () => {
  assert.equal(shouldPush('CRITICAL'), true)
  assert.equal(shouldPush('HIGH'), true)
  assert.equal(shouldPush('MEDIUM'), false)
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

test('dispatchAlert: MEDIUM은 인앱만(텔레그램 미호출)', async () => {
  let called = false
  const fetchImpl = async () => { called = true; return { ok: true, status: 200 } }
  const env = { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '999' }
  const res = await dispatchAlert(null, { type: 'ENROUTE_HAZARD', severity: 'MEDIUM', to_val: 'AIRMET' }, route, { fetchImpl, env })
  assert.equal(res.telegram.skipped, 'in_app_only')
  assert.equal(called, false)
})

test('dispatchAlert: HIGH도 관리자 계정만 텔레그램, 일반 사용자는 not_admin', async () => {
  const db = createDb(':memory:')
  try {
    const now = new Date().toISOString()
    const adminId = db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?, 'admin', ?)").run('adm', 'x', now).lastInsertRowid
    const pilotId = db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?, 'pilot', ?)").run('pil', 'x', now).lastInsertRowid
    const env = { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '999' }
    const alert = { type: 'ALTERNATE_FLIP', severity: 'HIGH', target: 'RKPC' }

    let adminCalled = false
    await dispatchAlert(db, alert, { ...route, user_id: adminId }, { env, fetchImpl: async () => { adminCalled = true; return { ok: true, status: 200 } } })
    assert.equal(adminCalled, true)

    let pilotCalled = false
    const res = await dispatchAlert(db, alert, { ...route, user_id: pilotId }, { env, fetchImpl: async () => { pilotCalled = true; return { ok: true, status: 200 } } })
    assert.equal(pilotCalled, false)
    assert.equal(res.telegram.skipped, 'not_admin')
  } finally { db.close() }
})

test('dispatchFlightAlerts: 한 비행 여러 변화 → 텔레그램 1건(묶음, §5B group_wait)', async () => {
  const db = createDb(':memory:')
  try {
    const now = new Date().toISOString()
    const adminId = db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?, 'admin', ?)").run('adm', 'x', now).lastInsertRowid
    const env = { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '999' }
    const changes = [
      { type: 'CEIL', severity: 'CRITICAL', target: 'RKPC', to_val: '400' },
      { type: 'ALTERNATE_FLIP', severity: 'HIGH', target: 'RKPC' },
      { type: 'ENROUTE_HAZARD', severity: 'MEDIUM', to_val: 'AIRMET' }, // 인앱만 — 묶음 텍스트 제외
    ]
    let calls = 0
    let captured = null
    const fetchImpl = async (url, opts) => { calls++; captured = JSON.parse(opts.body); return { ok: true, status: 200 } }
    const res = await dispatchFlightAlerts(db, changes, { ...route, user_id: adminId }, { env, fetchImpl })
    assert.equal(calls, 1) // 3개 변화여도 전송은 1회
    assert.equal(res.count, 2) // 심각 2개만 푸시 대상
    assert.match(captured.text, /^\[경로 예보변화 알림\]/) // 제목 헤더
    assert.match(captured.text, /운고 400ft/)
    assert.match(captured.text, /교체공항 필요 조건 발생/)
    assert.doesNotMatch(captured.text, /AIRMET/) // MEDIUM은 텔레그램 문구에서 빠짐
  } finally { db.close() }
})
