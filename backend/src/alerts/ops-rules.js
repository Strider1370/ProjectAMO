// 운영 알림 판정 — 순수 함수. 시각과 상태를 받아 "보낼 것"만 돌려준다(발송·DB 접근 없음).
//
// 원칙은 하나다: 울리는 순간 손쓸 일이 있는 것만 보낸다. 개별 자료 하나가 지연되거나 멈춘
// 것으로는 보내지 않는다 — 대개 저절로 돌아오고, 그때마다 울리면 무시하게 되어 진짜 사건이
// 묻힌다. 그건 화면에서 본다.
//
// 스펙: docs/superpowers/specs/2026-08-11-ops-alerting-design.md
export const LONG_STOP_MS = 24 * 3_600_000
export const QUOTA_WARN_PCT = 90
export const DISK_WARN_DAYS = 7
export const RESTART_WINDOW_MS = 3_600_000
export const RESTART_WARN_COUNT = 5

const isDown = (status) => status === 'stopped' || status === 'never'

// ① 한 출처(열쇠)의 자료가 전부 멈춤 = 대규모 호출 불가.
//
// 쉬는 시간인 자료는 분모에서 뺀다. 야간에 위성 가시가 쉬는 것 때문에 "전부 멈춤"이 성립하거나
// 반대로 진짜 전멸인데 안 잡히면 안 된다. 전부 쉬는 시간이면 판정하지 않는다.
export function sourceOutages(health) {
  const groups = health?.groups?.source ?? []
  const byKey = new Map((health?.rows ?? []).map((row) => [row.key, row]))
  const outages = []
  for (const group of groups) {
    const rows = group.keys.map((key) => byKey.get(key)).filter(Boolean).filter((row) => row.status !== 'quiet')
    if (rows.length === 0) continue
    if (rows.every((row) => isDown(row.status))) {
      outages.push({ kind: 'source_down', subject: group.id, label: group.label, count: rows.length })
    }
  }
  return outages
}

// ④ 24시간 넘게 멈춘 자료 — 하루 한 번 묶어서.
//
// ①만으로는 KIM 지상바람 사건(수치예보키 2종 중 하나만 멈춤)을 못 잡는다. 그 사건이 이 작업의
// 출발점이라, 못 잡는 규칙은 미완성이다.
export function longStopped(health, now = Date.now(), thresholdMs = LONG_STOP_MS) {
  return (health?.rows ?? [])
    .filter((row) => isDown(row.status))
    .map((row) => ({ ...row, stoppedForMs: row.lastSuccessAt ? now - Date.parse(row.lastSuccessAt) : Infinity }))
    .filter((row) => row.stoppedForMs >= thresholdMs)
    .sort((a, b) => b.stoppedForMs - a.stoppedForMs)
}

// ② API 전송량 한도 임박 — 다 쓰면 그날 남은 시간 동안 그 열쇠로 아무것도 못 받는다.
export function quotaWarnings(usage, pct = QUOTA_WARN_PCT) {
  return (usage?.keys ?? [])
    .filter((key) => key.status !== 'unconfigured' && key.limitBytes > 0)
    .map((key) => ({ ...key, usedPct: Math.round((key.bytes / key.limitBytes) * 100) }))
    .filter((key) => key.usedPct >= pct)
    .map((key) => ({ kind: 'quota', subject: key.category, label: key.label, usedPct: key.usedPct }))
}

// ③-1 디스크 소진 임박.
export function diskWarning(forecast, days = DISK_WARN_DAYS) {
  if (!forecast || !Number.isFinite(forecast.daysLeft)) return null
  if (forecast.daysLeft > days) return null
  return { kind: 'disk', subject: '', daysLeft: forecast.daysLeft }
}

// ③-2 짧은 시간에 재시작 반복. 정상 배포로도 몇 번은 오르지만 그보다 잦으면 뭔가 죽고 있다.
export function restartWarning(recentBoots = [], now = Date.now(), windowMs = RESTART_WINDOW_MS, limit = RESTART_WARN_COUNT) {
  const inWindow = recentBoots.filter((iso) => now - Date.parse(iso) <= windowMs).length
  if (inWindow < limit) return null
  return { kind: 'restarts', subject: '', count: inWindow }
}

// 즉시 보낼 것들(①②③). ④는 하루 한 번이라 따로 부른다.
export function immediateAlerts({ health, usage, forecast, recentBoots, now = Date.now() } = {}) {
  return [
    ...sourceOutages(health),
    ...quotaWarnings(usage),
    diskWarning(forecast),
    restartWarning(recentBoots, now),
  ].filter(Boolean)
}

// 알림 문구. 제목만 보고도 무슨 일인지 알 수 있어야 한다 — 잠금화면에서는 제목만 보인다.
export function renderAlert(alert) {
  switch (alert.kind) {
    case 'source_down':
      return { title: `자료 수집 멈춤 — ${alert.label}`, body: `${alert.label}로 받는 자료 ${alert.count}종이 전부 멈췄습니다. 열쇠나 기관 쪽 문제일 수 있습니다.` }
    case 'quota':
      return { title: `API 한도 임박 — ${alert.label}`, body: `오늘 전송량 ${alert.usedPct}%. 다 쓰면 초기화까지 이 열쇠로 자료를 못 받습니다.` }
    case 'disk':
      return { title: `디스크 여유 ${alert.daysLeft}일`, body: '지금 증가 속도면 곧 가득 찹니다. 오래된 자료를 정리하세요.' }
    case 'restarts':
      return { title: `서버 재시작 반복 ${alert.count}회`, body: '한 시간 안에 여러 번 재시작됐습니다. 로그를 확인하세요.' }
    default:
      return { title: 'ProjectAMO 운영 알림', body: '' }
  }
}

// ④ 하루 요약 — 대상이 없으면 null이라 아무것도 보내지 않는다.
export function renderDailySummary(rows, now = Date.now()) {
  if (!rows.length) return null
  const days = (ms) => (Number.isFinite(ms) ? `${Math.floor(ms / 86_400_000)}일` : '기록 없음')
  const head = rows.slice(0, 3).map((row) => `${row.label} (${days(row.stoppedForMs)})`).join(' · ')
  return {
    title: `오래 멈춘 자료 ${rows.length}종`,
    body: rows.length > 3 ? `${head} 외 ${rows.length - 3}종` : head,
  }
}

export default {
  sourceOutages, longStopped, quotaWarnings, diskWarning, restartWarning,
  immediateAlerts, renderAlert, renderDailySummary,
  LONG_STOP_MS, QUOTA_WARN_PCT, DISK_WARN_DAYS, RESTART_WINDOW_MS, RESTART_WARN_COUNT,
}
