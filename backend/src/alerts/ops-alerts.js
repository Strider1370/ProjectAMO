import config from '../config.js'
import stats from '../stats.js'
import store from '../store.js'
import apiHubUsage from '../api-hub-usage.js'
import { readDataHealth } from '../admin/data-health.js'
import { forecastDiskFull } from '../admin/disk-forecast.js'
import { readMetrics } from '../admin/metrics.js'
import { processHealth } from '../admin/process-health.js'
import { sendTelegram } from './sender.js'
import { immediateAlerts, longStopped, renderAlert, renderDailySummary } from './ops-rules.js'

// 운영 알림 — 판정(ops-rules.js)과 발송(sender.js)을 잇고, 같은 사건을 두 번 보내지 않게 한다.
//
// 받는 사람은 관리자 한 명이고 텔레그램으로 간다(.env의 TELEGRAM_BOT_TOKEN·CHAT_ID).
// 웹푸시를 쓰지 않는 이유는 받는 사람이 하나뿐이라 구독·권한 절차가 과해서다.
//
// 스펙: docs/superpowers/specs/2026-08-11-ops-alerting-design.md
const DAILY_SUMMARY_HOUR_KST = 9
const REPEAT_AFTER_MS = 24 * 3_600_000

const kstHour = (ms) => new Date(ms + 9 * 3_600_000).getUTCHours()
const kstDay = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10)

function lastSent(db, kind, subject = '') {
  const row = db.prepare('SELECT sent_at FROM alerts_sent WHERE kind=? AND subject=?').get(kind, subject)
  return row?.sent_at ?? null
}

function markSent(db, kind, subject, at) {
  db.prepare('INSERT INTO alerts_sent (kind, subject, sent_at) VALUES (?,?,?) ON CONFLICT(kind, subject) DO UPDATE SET sent_at=excluded.sent_at')
    .run(kind, subject, at)
}

function clearSent(db, kind, subject) {
  db.prepare('DELETE FROM alerts_sent WHERE kind=? AND subject=?').run(kind, subject)
}

// 지금 보내야 하나. 사건 종류마다 규칙이 다르다.
// - source_down: 사건이 이어지는 동안 한 번만. 해소되면 기록을 지워 재발 시 다시 보낸다
// - 나머지: 24시간에 한 번까지
function shouldSend(db, alert, nowMs) {
  const at = lastSent(db, alert.kind, alert.subject)
  if (!at) return true
  if (alert.kind === 'source_down') return false
  return nowMs - Date.parse(at) >= REPEAT_AFTER_MS
}

// 지금 상태를 모아 판정 입력으로 만든다.
export function collectState(db, now = Date.now()) {
  const health = readDataHealth(config.storage.active_path, {
    getCached: store.getCached, getStats: stats.getStats, now,
  })
  return {
    health,
    usage: apiHubUsage.snapshot({ now }),
    forecast: forecastDiskFull(readMetrics(db, '7d').series),
    recentBoots: processHealth().recentBoots ?? [],
    now,
  }
}

// 한 바퀴. 보낸 알림 목록을 돌려준다(테스트·로그용).
export async function runOnce(db, { now = Date.now(), send = sendTelegram, state = null } = {}) {
  const input = state ?? collectState(db, now)
  const sentNow = []

  const alerts = immediateAlerts(input)
  const active = new Set(alerts.map((a) => `${a.kind}:${a.subject}`))

  // 해소된 사건의 기록을 지운다 — 지우지 않으면 재발해도 조용하다.
  for (const row of db.prepare("SELECT kind, subject FROM alerts_sent WHERE kind != 'daily_summary'").all()) {
    if (!active.has(`${row.kind}:${row.subject}`)) clearSent(db, row.kind, row.subject)
  }

  for (const alert of alerts) {
    if (!shouldSend(db, alert, now)) continue
    const { title, body } = renderAlert(alert)
    const result = await send(`[ProjectAMO] ${title}\n${body}`)
    if (result?.ok === false) { console.error('[ops-alert] 발송 실패:', result.error ?? result.status); continue }
    if (result?.skipped) { console.warn('[ops-alert] 발송 건너뜀:', result.skipped); continue }
    markSent(db, alert.kind, alert.subject, new Date(now).toISOString())
    sentNow.push(alert)
  }

  // ④ 하루 요약 — 09시 KST 이후, 오늘 아직 안 보냈으면 한 번.
  if (kstHour(now) >= DAILY_SUMMARY_HOUR_KST) {
    const at = lastSent(db, 'daily_summary')
    if (!at || kstDay(Date.parse(at)) !== kstDay(now)) {
      const summary = renderDailySummary(longStopped(input.health, now), now)
      if (summary) {
        const result = await send(`[ProjectAMO] ${summary.title}\n${summary.body}`)
        if (result?.ok !== false && !result?.skipped) {
          markSent(db, 'daily_summary', '', new Date(now).toISOString())
          sentNow.push({ kind: 'daily_summary', subject: '' })
        }
      }
    }
  }

  return sentNow
}

// 5분 틱. 수집기가 아니라 서버에 건다 — 수집이 통째로 죽었을 때야말로 알림이 필요하다.
export function startOpsAlerts(db, { cron, schedule = '*/5 * * * *' } = {}) {
  if (process.env.ALERTS_DISABLED) {
    console.log('[ops-alert] ALERTS_DISABLED — 판정만 하고 발송하지 않음')
    return null
  }
  return cron?.schedule(schedule, () => {
    runOnce(db).catch((error) => console.error('[ops-alert] 실패:', error.message))
  }) ?? null
}

export default { runOnce, collectState, startOpsAlerts }
