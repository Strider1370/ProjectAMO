// #13 알림 발송 seam — diff가 적재한 알림(triggered_alerts 행)을 채널로 내보낸다. 얇게: 문구 포맷 + 채널 분기 하나.
// 인앱 = 이미 행 저장(무동작, 모든 사용자) · 텔레그램 = 관리자 계정 + env 있으면 sendMessage(딥링크 버튼) · Web Push = 경로 소유자.
// 과한 추상화 금지(§7): 채널별 클래스/레지스트리 없이 dispatchFlightAlerts 한 곳에서 분기.
import { sendPush } from '../push/send.js'

// Zulu 시각(HHMMZ). 항공 표기 관례상 콜론 없이.
const hhmmZ = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

const ROLE_KO = { dep: '출발', dest: '도착', altn: '교체' }
const at = (alert) => (alert.role && ROLE_KO[alert.role] ? `${ROLE_KO[alert.role]} ${alert.target}` : alert.target)

// 어느 미니마가 걸렸는지에 따라 말이 달라진다. 공항 접근최저치 때문에 걸렸는데
// "내 미니마 미만"이라고 하면 거짓말이 된다 — 그리고 그 경우가 더 무거운 상황이다.
const MINIMA_KO = {
  airport: '접근최저치 미만',   // 그 밑에선 아무도 착륙하지 못한다
  personal: '내 미니마 미만',
  default: 'IFR 이하',          // 미니마 미설정 — VFR 기본값(1500ft/5000m)으로 판정했다
}

// 변화 1건 → 통지 한 줄. 담백한 통지체(이모지 미사용, 공식 통지 톤).
export function formatAlert(alert) {
  switch (alert.type) {
    case 'MINIMA': return `${at(alert)} ${MINIMA_KO[alert.bound] ?? '최저치 미만'} 예보`
    case 'TS': return `${at(alert)} 뇌전 예보`
    case 'FG': return `${at(alert)} 안개 예보`
    case 'SN': return `${at(alert)} 눈 예보`
    case 'SIGMET': return `경로상 신규 SIGMET (${alert.target})`
    default: return `${at(alert)} ${alert.type}`
  }
}

// 비행 식별 헤더 한 줄: 이름 + ETD/ETA(Z).
function flightHeading(route) {
  const name = route.name || [route.dep, route.dest].filter(Boolean).join(' → ') || '저장 경로'
  const times = [route.etd && `ETD ${hhmmZ(route.etd)}`, route.eta && `ETA ${hhmmZ(route.eta)}`].filter(Boolean).join(' · ')
  return times ? `${name}  (${times})` : name
}

// 묶음 메시지 전문: 제목 + 비행 식별 + 변화 줄들 + 감지 시각. [비행 브리핑 열기] 버튼은 sendTelegram이 붙임.
export function composeMessage(alerts, route = {}, deps = {}) {
  const body = alerts.map((a) => formatAlert(a)).join('\n')
  const detected = deps.now ? `\n\n감지 ${hhmmZ(new Date(deps.now).toISOString())}` : ''
  return `[경로 예보변화 알림]\n${flightHeading(route)}\n\n${body}${detected}`
}

// 텔레그램 sendMessage. env(TELEGRAM_BOT_TOKEN·CHAT_ID) 없으면 skip. 딥링크 = FRONTEND_ORIGIN/?flight=<id>.
export async function sendTelegram(text, { routeId } = {}, { fetchImpl = fetch, env = process.env } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN
  const chatId = env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return { skipped: 'no_telegram_env' }
  const base = env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
  const url = routeId != null ? `${base}/?flight=${routeId}` : base
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: routeId != null ? { inline_keyboard: [[{ text: '비행 브리핑 열기', url }]] } : undefined,
      }),
    })
    return { ok: res.ok, status: res.status }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// 텔레그램 발송 대상: 관리자 계정 알림만(일반 사용자는 인앱만). users.role='admin' 확인.
function isAdminUser(db, userId) {
  if (!db || userId == null) return false
  try { return db.prepare('SELECT role FROM users WHERE id=?').get(userId)?.role === 'admin' }
  catch { return false }
}

// 발송 결과를 각 알림 행에 기록. pushed_at은 실제로 폰/텔레그램으로 나간 행만, channel_status는 전부(인앱 저장 표시).
function markAlerts(db, alerts, pushedIds, channels, deps) {
  if (!db) return
  const at = new Date(deps.now ?? Date.now()).toISOString()
  const status = JSON.stringify({ inapp: 'stored', ...channels })
  for (const a of alerts) if (a.id) {
    db.prepare('UPDATE triggered_alerts SET pushed_at=?, channel_status=? WHERE id=?')
      .run(pushedIds.has(a.id) ? at : null, status, a.id)
  }
}

// 경로 소유자에게 Web Push. 만료 구독(404/410)은 me/push.js의 테스트 발송과 같은 방식으로 정리한다.
// sendPushImpl은 테스트 주입용 — 실제로는 push/send.js의 sendPush를 쓴다.
async function pushToOwner(db, alerts, route, deps) {
  const userId = route.user_id ?? alerts[0]?.user_id
  if (!db || userId == null || alerts.length === 0) return { sent: 0, pruned: 0 }
  const send = deps.sendPushImpl ?? sendPush
  const subs = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?').all(userId)
  if (subs.length === 0) return { sent: 0, pruned: 0 }

  const routeId = route.id ?? alerts[0]?.route_id
  const payload = {
    title: route.name || [route.dep, route.dest].filter(Boolean).join(' → ') || '비행 알림',
    body: alerts.map((a) => formatAlert(a)).join('\n'),
    url: routeId != null ? `/?flight=${routeId}` : '/',
  }

  let sent = 0
  const stale = []
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      sent += 1
    } catch (err) {
      // 만료·해지된 구독은 지운다. 그 밖의 오류는 알림 하나 때문에 평가 전체를 멈추지 않도록 삼킨다.
      if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(s.id)
      else console.warn(`[alert-sender] push 실패(user ${userId}):`, err?.message)
    }
  }
  if (stale.length) {
    const del = db.prepare('DELETE FROM push_subscriptions WHERE id=?')
    stale.forEach((id) => del.run(id))
  }
  return { sent, pruned: stale.length }
}

// 이 비행의 이번 변화들을 한 건으로 묶어 보낸다(§5B group_wait). 인앱은 이미 행 저장 완료.
// 폰과 앱이 같은 규칙을 쓰므로 여기서 다시 거르지 않는다 — 판정은 diff.js가 이미 끝냈다.
export async function dispatchFlightAlerts(db, alerts = [], route = {}, deps = {}) {
  if (alerts.length === 0) return { text: '', telegram: { skipped: 'no_changes' }, push: { sent: 0, pruned: 0 }, count: 0 }
  const text = composeMessage(alerts, route, deps)
  const telegram = isAdminUser(db, route.user_id ?? alerts[0]?.user_id)
    ? await sendTelegram(text, { routeId: route.id ?? alerts[0]?.route_id }, deps)
    : { skipped: 'not_admin' }
  const push = await pushToOwner(db, alerts, route, deps)
  const pushedIds = telegram.ok === true || push.sent > 0 ? new Set(alerts.map((a) => a.id)) : new Set()
  markAlerts(db, alerts, pushedIds, { telegram, push }, deps)
  return { text, telegram, push, count: alerts.length }
}

export default { formatAlert, composeMessage, sendTelegram, dispatchFlightAlerts }
