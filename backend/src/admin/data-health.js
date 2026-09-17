import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { API_OPERATION_REGISTRY, describeExpectedApiCall } from '../api-operation-registry.js'
import { activeCollectorRegistry } from '../collector-registry.js'
import { buildCollectorExecution } from '../collector-execution.js'
import { CATALOG, SOURCES, CHARACTERS } from './data-health-catalog.js'
import { judge } from './freshness.js'
import { MODEL_COMPARISON_AIRPORTS } from '../../../shared/airport-model-comparison.js'
import { readAirportComparison, readCollectionAttempt } from '../airport-model-comparison/store.js'
import { nextNwpCheckAt } from '../airport-model-comparison/lifecycle.js'

// 관리자 콘솔: 카탈로그에 등록된 자료의 수집 상태.
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

// 이벤트 자료의 수는 자료 종류마다 모수가 다르다. 특히 낙뢰는 공항별 표시용
// airports 키 수가 아니라 전국 중복 제거 strike 수를 써야 한다. 이전 activeCount는
// 호환 필드로 유지하되 이 명시 측정값에서만 파생한다.
function unavailableEventMeasurement(data, reason) {
  return {
    availability: 'unavailable',
    count: null,
    unit: null,
    meaning: 'event count cannot be derived from the available payload',
    period: { kind: 'current_snapshot', from: null, to: null },
    coverage: null,
    observedAt: data?.fetched_at ?? null,
    unavailableReason: reason,
  }
}

function countAirportWarnings(data) {
  if (!data?.airports || typeof data.airports !== 'object') return null
  let count = 0
  for (const airport of Object.values(data.airports)) {
    if (!Array.isArray(airport?.warnings)) return null
    count += airport.warnings.length
  }
  return count
}

function eventMeasurement(row, getCached) {
  if (!row.eventDriven) return null
  const data = getCached(row.key)
  if (!data) return unavailableEventMeasurement(null, 'payload_unavailable')
  const observedAt = data.fetched_at ?? null
  if (row.key === 'lightning') {
    const count = Number.isFinite(data.nationwide?.summary?.total_count)
      ? data.nationwide.summary.total_count
      : Array.isArray(data.nationwide?.strikes) ? data.nationwide.strikes.length : null
    if (count == null) return unavailableEventMeasurement(data, 'nationwide_strike_count_unavailable')
    const coverage = data.nationwide?.coverage ?? null
    return {
      availability: 'available',
      count,
      unit: 'deduplicated_nationwide_strikes',
      meaning: 'deduplicated lightning strikes in the nationwide history payload; not affected-airport count or warning count',
      period: {
        kind: 'rolling_history_window',
        minutes: Number.isFinite(data.history_window_minutes) ? data.history_window_minutes : null,
        from: coverage?.from ?? null,
        to: coverage?.to ?? null,
      },
      coverage: coverage ? { status: coverage.status ?? 'unknown', successfulWindows: coverage.successfulWindows?.length ?? null, failedWindows: coverage.failedWindows?.length ?? null } : null,
      observedAt,
    }
  }
  if (row.key === 'warning') {
    if (!Number.isFinite(data.total_count) || data.total_count < 0) return unavailableEventMeasurement(data, 'parsed_airport_warning_count_unavailable')
    return {
      availability: 'available',
      count: data.total_count,
      unit: 'parsed_airport_warning_records',
      meaning: 'validated airport warning records in the parsed aviation warning payload',
      period: { kind: 'current_snapshot', from: null, to: null },
      coverage: null,
      observedAt,
    }
  }
  if (row.key === 'kma_special_warning') {
    const count = countAirportWarnings(data)
    if (count == null) return unavailableEventMeasurement(data, 'parsed_supported_airport_special_warning_count_unavailable')
    return {
      availability: 'available',
      count,
      unit: 'parsed_supported_airport_special_warning_records',
      meaning: 'validated KMA special-warning records mapped to supported airport regions; not a nationwide warning total',
      period: { kind: 'current_snapshot', from: null, to: null },
      coverage: null,
      observedAt,
    }
  }
  if (Array.isArray(data.items)) return {
    availability: 'available',
    count: data.items.length,
    unit: 'payload_event_items',
    meaning: 'event records in the current payload; semantics are specific to this data type',
    period: { kind: 'current_snapshot', from: null, to: null },
    coverage: null,
    observedAt,
  }
  if (Array.isArray(data.typhoons)) return {
    availability: 'available',
    count: data.typhoons.length,
    unit: 'payload_typhoons',
    meaning: 'typhoon records in the current payload',
    period: { kind: 'current_snapshot', from: null, to: null },
    coverage: null,
    observedAt,
  }
  return unavailableEventMeasurement(data, 'event_count_not_derivable')
}

function isCurrentlyFailing(entry) {
  return Boolean(entry?.last_failure && entry.last_failure === entry.last_run)
}

function comparisonHealth(basePath, model, disabled, nowMs, schedule) {
  if (!model) return {}
  const pointers = []
  for (const airportIcao of MODEL_COMPARISON_AIRPORTS) {
    const pointer = readAirportComparison({ root: basePath, airport_icao: airportIcao }).models.find((entry) => entry.model === model)
    if (pointer) pointers.push({ airportIcao, ...pointer })
  }
  const attempt = readCollectionAttempt({ root: basePath, model })
  const successful = new Set([...(attempt?.publishedAirports || []), ...(attempt?.reusedAirports || [])])
  const failed = new Set(attempt?.failedAirports || [])
  const values = (field) => [...new Set(pointers.map((pointer) => pointer[field]).filter(Boolean))]
  const runs = values('run_at')
  const lastError = attempt?.errors?.at(-1) || null
  return {
    modelRunAt: runs.length === 1 ? runs[0] : null,
    availableAt: values('available_at').sort().at(-1) || null,
    collectedAt: values('collected_at').sort().at(-1) || null,
    airportRuns: pointers.map((pointer) => ({ airportIcao: pointer.airportIcao, modelRunAt: pointer.run_at })),
    successAirports: successful.size,
    failedAirports: failed.size,
    nextCheckAt: disabled ? null : model === 'kim' ? attempt?.next_check_at || null : nextNwpCheckAt({model,nowMs,schedule}),
    lastFailure: lastError ? { airportIcao: lastError.airport_icao || null, code: lastError.code, message: lastError.message } : null,
  }
}

// getCached(type)와 getStats()를 주입받는다(store.js·stats.js 직접 의존 대신) — basePath만 있으면
// 순수 함수로 테스트 가능하게. now/sun도 주입 가능(시간 의존 테스트).
export function readDataHealth(basePath, { getCached, getStats, now = Date.now(), sun = {}, cfg = config, activeDataContext = null }) {
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
        durationMs: execution.duration_ms ?? null,
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
    const liveLastSuccessAt = entry?.last_success ?? null
    const lastSuccessAt = liveLastSuccessAt ?? contentAt
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
    const liveCollectionStatus = disabled ? 'disabled' : liveLastSuccessAt
      ? judge({ row, lastSuccessMs: ms(liveLastSuccessAt), nowMs: now, sunsetMs: sun.sunsetMs ?? null, sunriseMs: sun.sunriseMs ?? null })
      : 'unknown'
    const measurement = eventMeasurement(row, getCached)
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
      // Legacy field: older clients use this value. It now comes only from the
      // typed event measurement, never from unrelated airport coverage keys.
      activeCount: measurement?.count ?? null,
      eventMeasurement: measurement,
      provenance: {
        display: {
          source: activeDataContext?.mode === 'demo' ? 'active_demo_snapshot' : activeDataContext?.mode === 'live' ? 'active_live_view' : 'active_view_unknown',
          mode: activeDataContext?.mode ?? 'unknown',
          snapshotName: activeDataContext?.name ?? null,
          revision: activeDataContext?.revision ?? null,
          referenceTime: activeDataContext?.referenceTime ?? null,
          contentAt,
        },
        liveCollection: {
          source: 'live_collector_statistics',
          lastSuccessfulAt: liveLastSuccessAt,
          lastRunAt: entry?.last_run ?? null,
          lastFailureAt: entry?.last_failure ?? null,
          healthStatus: liveCollectionStatus,
          // last_success가 없는 이전 통계 파일은 display content으로 추정하지 않는다.
          evidence: liveLastSuccessAt ? 'collector_stat' : 'not_recorded',
        },
        compatibilityStatus: {
          status,
          basis: liveLastSuccessAt ? 'live_collector_statistics' : contentAt ? 'active_display_content_fallback' : 'no_evidence',
        },
      },
      failing: isCurrentlyFailing(entry),
      lastError: entry?.last_error ?? null,
      operations: operationsFor(row.key),
      ...comparisonHealth(basePath, row.comparisonModel, disabled, now, cfg.schedule),
    }
  })

  const group = (dict, field) => Object.entries(dict).map(([id, meta]) => ({
    id, ...meta, keys: CATALOG.filter((r) => r[field] === id).map((r) => r.key),
  }))

  // 자료 하나에 여러 API가 붙을 수 있고 온디맨드 API는 자료 행 자체가 없다. 따라서 상단
  // 경고는 자료 행 수가 아니라 등록부의 실패 작업 수로 센다. 마지막 결과가 실패인 작업만
  // 현재 조치가 필요한 상태다.
  const apiProblems = API_OPERATION_REGISTRY
    .filter((operation) => operationStats[operation.id]?.last_outcome === 'failed')
    .map((operation) => {
      const execution = operationStats[operation.id]
      return {
        id: operation.id, label: operation.label, provider: operation.provider,
        lastFinishedAt: execution.last_finished_at || null, lastIssue: execution.last_issue || null,
      }
    })

  const collectorLabels = new Map(CATALOG.map((row) => [row.statsKey, row.label]))
  const collectorExecution = buildCollectorExecution({
    collectors: [...collectors.values()], statsTypes, nowMs: now,
  }).map((entry) => ({ ...entry, label: collectorLabels.get(entry.type) || entry.type }))

  return {
    generatedAt: new Date(now).toISOString(),
    counts,
    rows,
    apiProblems,
    collectorExecution,
    groups: { source: group(SOURCES, 'source'), character: group(CHARACTERS, 'character') },
  }
}

export default { readDataHealth }
