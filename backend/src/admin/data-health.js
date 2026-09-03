import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { API_OPERATION_REGISTRY, describeExpectedApiCall } from '../api-operation-registry.js'
import { activeCollectorRegistry } from '../collector-registry.js'
import { CATALOG, SOURCES, CHARACTERS } from './data-health-catalog.js'
import { judge } from './freshness.js'

// 관리자 콘솔: 자료 34종의 수집 상태.
//
// 판정 기준은 stats의 last_success — "마지막으로 수집이 성공한 시각"이다. 내용이 언제 바뀌었는지
// (store의 fetched_at, meta 파일 mtime)는 참고로만 함께 내려보낸다. SIGMET처럼 위험기상이 없으면
// 내용이 비는 자료를 내용으로 판정하면 평온한 날마다 멈춤으로 잘못 뜬다.
const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null }

function contentTime(basePath, row, getCached) {
  if (row.meta) {
    try { return fs.statSync(path.join(basePath, row.meta)).mtime.toISOString() } catch { return null }
  }
  return getCached(row.key)?.fetched_at ?? null
}

// 이벤트성 자료의 "지금 몇 건" — 수집기마다 담는 자리가 달라 알려진 것만 센다. 못 세면 null이고,
// null이면 화면이 건수를 감춘다(0건으로 단정하지 않는다).
function activeCount(row, getCached) {
  if (!row.eventDriven) return null
  const data = getCached(row.key)
  if (!data) return null
  if (Array.isArray(data.items)) return data.items.length
  if (Array.isArray(data.typhoons)) return data.typhoons.length
  if (data.airports && typeof data.airports === 'object') return Object.keys(data.airports).length
  return null
}

function isCurrentlyFailing(entry) {
  return Boolean(entry?.last_failure && entry.last_failure === entry.last_run)
}

// getCached(type)와 getStats()를 주입받는다(store.js·stats.js 직접 의존 대신) — basePath만 있으면
// 순수 함수로 테스트 가능하게. now/sun도 주입 가능(시간 의존 테스트).
export function readDataHealth(basePath, { getCached, getStats, now = Date.now(), sun = {}, cfg = config }) {
  const statistics = getStats() || {}
  const statsTypes = statistics.types || {}
  const operationStats = statistics.api_operations || {}
  const collectors = new Map(activeCollectorRegistry(cfg).map((collector) => [collector.type, collector]))
  const operationsFor = (key) => API_OPERATION_REGISTRY
    .filter((operation) => operation.callContract.kind !== 'on_demand' && operation.dataHealthKeys.includes(key))
    .map((operation) => {
      const execution = operationStats[operation.id] || {}
      return {
        id: operation.id,
        label: operation.label,
        provider: operation.provider,
        outcome: execution.last_outcome || 'unknown',
        lastStartedAt: execution.last_started_at || null,
        lastFinishedAt: execution.last_finished_at || null,
        lastIssue: execution.last_issue || null,
        expected: operation.callContract.kind === 'collector' && !collectors.has(operation.collectorType)
          ? { kind: 'disabled', label: '비활성' }
          : describeExpectedApiCall(operation, collectors.get(operation.collectorType), now),
      }
    })
  const counts = { total: CATALOG.length, ok: 0, late: 0, stopped: 0, quiet: 0, never: 0, disabled: 0 }

  const rows = CATALOG.map((row) => {
    const entry = statsTypes[row.statsKey]
    const contentAt = contentTime(basePath, row, getCached)
    // last_success는 이번에 새로 생긴 항목이라, 그 전에 수집된 자료에는 값이 없다. 그때는 저장된
    // 자료의 시각을 대신 쓴다 — store.save()는 내용이 그대로여도 fetched_at을 갱신하고, meta
    // 파일은 쓰일 때 수정시각이 바뀌므로 둘 다 "그 시점에 수집이 성공했다"는 증거다.
    // 이게 없으면 배포 직후 34종이 전부 "자료 없음"으로 빨개진다 — 사실도 아니고 쓸모도 없다.
    const lastSuccessAt = entry?.last_success ?? contentAt
    // 일부러 꺼둔 자료는 멈춘 것이 아니다. 판정하면 "24시간째 멈춤" 알림이 손쓸 일 없이 매일 온다.
    const disabled = row.disabledWhen ? row.disabledWhen(cfg) : false
    const status = disabled ? 'disabled' : judge({
      row,
      lastSuccessMs: ms(lastSuccessAt),
      nowMs: now,
      sunsetMs: sun.sunsetMs ?? null,
      sunriseMs: sun.sunriseMs ?? null,
    })
    counts[status] += 1
    return {
      key: row.key,
      statsKey: row.statsKey, // Task 7이 통계를 붙일 때 쓴다 — 저장 키와 다른 행이 셋 있다
      label: row.label,
      source: row.source,
      character: row.character,
      status,
      lastSuccessAt,
      contentAt,
      normalMs: row.normalMs,
      lateMs: row.lateMs,
      stoppedMs: row.stoppedMs,
      eventDriven: row.eventDriven,
      activeCount: activeCount(row, getCached),
      failing: isCurrentlyFailing(entry),
      lastError: entry?.last_error ?? null,
      operations: operationsFor(row.key),
    }
  })

  const group = (dict, field) => Object.entries(dict).map(([id, meta]) => ({
    id, ...meta, keys: CATALOG.filter((r) => r[field] === id).map((r) => r.key),
  }))

  return {
    generatedAt: new Date(now).toISOString(),
    counts,
    rows,
    groups: { source: group(SOURCES, 'source'), character: group(CHARACTERS, 'character') },
  }
}

export default { readDataHealth }
