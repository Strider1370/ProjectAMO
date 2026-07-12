// #13 알림 발송 seam — diff가 적재한 알림(triggered_alerts 행)을 채널로 내보낸다. 얇게: 문구 포맷 + 채널 분기 하나.
// 인앱 = 이미 행 저장(무동작, 모든 사용자) · 텔레그램 = 관리자 계정 + env 있으면 sendMessage(딥링크 버튼) · Web Push = Phase 2(자리만).
// 과한 추상화 금지(§7): 채널별 클래스/레지스트리 없이 dispatchAlert 한 곳에서 분기.

// 심각도 → 글자 태그(이모지 미사용, 공식 통지 톤).
const SEV_TAG = { CRITICAL: '[위험]', HIGH: '[주의]', MEDIUM: '[정보]', LOW: '[참고]', INFO: '[참고]' }

// Zulu 시각(HHMMZ). 항공 표기 관례상 콜론 없이.
const hhmmZ = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

// 공항 ICAO → 계획상 역할(출발/도착/교체). route 행에 dep/dest/altn 있을 때만, 없으면 ICAO만.
function airportRole(icao, route) {
  if (icao === route.dep) return '출발'
  if (icao === route.dest) return '도착'
  if (icao === route.altn) return '교체'
  return null
}
const at = (icao, route) => { const r = airportRole(icao, route); return r ? `${r} ${icao}` : icao }
// 전값→후값. 전값(prev) 모르면 후값만.
const shift = (from, to, unit = '') => (from != null && from !== '' ? `${from} → ${to}${unit}` : `${to}${unit}`)

// 변화 1건 → 통지 한 줄. 담백한 통지체·글자 태그·전→후·Zulu. alert = triggered_alerts 행/변경객체.
export function formatAlert(alert, route = {}) {
  const tag = SEV_TAG[alert.severity] ?? '[알림]'
  const target = alert.target ?? ''
  const from = alert.from_val ?? alert.from
  const to = alert.to_val ?? alert.to
  switch (alert.type) {
    case 'CEIL':
      return `${tag} ${at(target, route)} 운고 ${shift(from, to, 'ft')} — 최저운고 기준 미만`
    case 'VIS':
      return `${tag} ${at(target, route)} 시정 ${shift(from, to, 'm')} — 최저시정 기준 미만`
    case 'ALTERNATE_FLIP':
      return `${tag} ${at(target, route)} 교체공항 필요 조건 발생`
    case 'ENROUTE_HAZARD':
      return `${tag} 경로상 신규 위험 (${to ?? target})`
    case 'ENROUTE_ICE_TURB':
      return `${tag} 경로 ${target === 'icing' ? '착빙' : '난류'} ${shift(from, to)} 등급`
    case 'WX':
      return `${tag} ${at(target, route)} 뇌전(TS) 예보`
    default:
      return `${tag} ${at(target, route)} ${alert.type}`
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
  const body = alerts.map((a) => formatAlert(a, route)).join('\n')
  const detected = deps.now ? `\n\n감지 ${hhmmZ(new Date(deps.now).toISOString())}` : ''
  return `[경로 예보변화 알림]\n${flightHeading(route)}\n\n${body}${detected}`
}

// HIGH/CRITICAL만 즉시 푸시(텔레그램), MEDIUM 이하는 인앱만(§5-4 차등채널).
export function shouldPush(severity) {
  return severity === 'CRITICAL' || severity === 'HIGH'
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

// 발송 결과를 각 알림 행에 기록. pushed_at은 실제 텔레그램 전송된 행만, channel_status는 전부(인앱 저장 표시).
function markAlerts(db, alerts, pushedIds, telegram, deps) {
  if (!db) return
  const at = new Date(deps.now ?? Date.now()).toISOString()
  const status = JSON.stringify({ inapp: 'stored', telegram })
  for (const a of alerts) if (a.id) {
    db.prepare('UPDATE triggered_alerts SET pushed_at=?, channel_status=? WHERE id=?')
      .run(pushedIds.has(a.id) ? at : null, status, a.id)
  }
}

// 한 비행의 이번 평가 변화들을 텔레그램 1건으로 묶어 발송(§5B group_wait: 여러 변화 → 푸시 1건).
// 인앱은 이미 행 저장 완료(모든 변화). 텔레그램은 관리자 계정 + 심각(HIGH/CRITICAL) 변화만 한 줄씩 묶고, 없으면 skip.
export async function dispatchFlightAlerts(db, alerts = [], route = {}, deps = {}) {
  const push = alerts.filter((a) => shouldPush(a.severity))
  const text = push.length ? composeMessage(push, route, deps) : ''
  const telegram = push.length && isAdminUser(db, route.user_id ?? alerts[0]?.user_id)
    ? await sendTelegram(text, { routeId: route.id ?? alerts[0]?.route_id }, deps)
    : { skipped: push.length ? 'not_admin' : 'in_app_only' }
  const pushedIds = telegram.ok === true ? new Set(push.map((a) => a.id)) : new Set()
  markAlerts(db, alerts, pushedIds, telegram, deps)
  return { text, telegram, count: push.length }
}

// 단건 편의 래퍼(개별 발송·테스트). 묶음 경로 재사용.
export async function dispatchAlert(db, alert, route = {}, deps = {}) {
  const { telegram } = await dispatchFlightAlerts(db, [alert], route, deps)
  return { text: formatAlert(alert, route), telegram }
}

export default { formatAlert, composeMessage, shouldPush, sendTelegram, dispatchFlightAlerts, dispatchAlert }
