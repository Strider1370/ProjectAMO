const EMPTY_EXECUTION = Object.freeze({
  last_started_at: null,
  last_finished_at: null,
  last_outcome: null,
  last_issue: null,
})

// A collector has to distinguish a usable empty response from a failed run.
// Keep this tiny contract independent from scheduler/statistics ownership so
// processors and the publication store can share it without a dependency on
// the server bootstrap.
export const COLLECTION_OUTCOMES = Object.freeze(['complete', 'partial', 'empty', 'failed'])

export function collectionResult(outcome, data = null, { normalEmpty = false, reason = null } = {}) {
  if (!COLLECTION_OUTCOMES.includes(outcome)) throw new Error(`invalid_collection_outcome:${outcome}`)
  if (outcome === 'failed') {
    if (data !== null) throw new Error('failed_collection_cannot_publish_data')
    return { outcome, data: null, normalEmpty: false, reason: reason || 'collection_failed' }
  }
  if (data === null || typeof data !== 'object') throw new Error(`collection_outcome_requires_data:${outcome}`)
  if (outcome === 'empty' && !normalEmpty) throw new Error('empty_collection_requires_source_confirmation')
  if (outcome !== 'empty' && normalEmpty) throw new Error('normal_empty_only_applies_to_empty_outcome')
  return { outcome, data, normalEmpty, reason }
}

export function validateCollectionOutcome(outcome, allowedOutcomes = COLLECTION_OUTCOMES) {
  if (!COLLECTION_OUTCOMES.includes(outcome) || !Array.isArray(allowedOutcomes) || !allowedOutcomes.includes(outcome)) {
    throw new Error(`unsupported_collection_outcome:${outcome}`)
  }
  return outcome
}

export function validateCollectionResult(result, allowedOutcomes = COLLECTION_OUTCOMES) {
  const normalized = collectionResult(result?.outcome, result?.data, {
    normalEmpty: result?.normalEmpty,
    reason: result?.reason,
  })
  validateCollectionOutcome(normalized.outcome, allowedOutcomes)
  return normalized
}

function isQuietAt(quiet, nowMs) {
  if (!quiet) return false
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date(nowMs)))
  return quiet.fromHourKst < quiet.toHourKst
    ? hour >= quiet.fromHourKst && hour < quiet.toHourKst
    : hour >= quiet.fromHourKst || hour < quiet.toHourKst
}

function kstVirtualMs(epochMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epochMs)).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
}

function deadlineBaseAfterQuiet(lastScheduledAtMs, nowMs, quiet) {
  if (!quiet) return lastScheduledAtMs
  const nowKst = kstVirtualMs(nowMs)
  const dayMs = 24 * 3600_000
  let quietEnd = Math.floor(nowKst / dayMs) * dayMs + quiet.toHourKst * 3600_000
  if (quietEnd > nowKst) quietEnd -= dayMs
  const lastScheduledKst = kstVirtualMs(lastScheduledAtMs)
  return lastScheduledKst < quietEnd ? quietEnd : lastScheduledKst
}

export function buildCollectorExecution({ collectors, statsTypes, nowMs }) {
  return collectors.map((collector) => {
    const execution = statsTypes[collector.type]?.execution ?? EMPTY_EXECUTION
    return {
      type: collector.type,
      outcome: execution.last_outcome ?? 'unknown',
      lastStartedAt: execution.last_started_at,
      lastStartSource: execution.last_start_source ?? null,
      lastFinishedAt: execution.last_finished_at,
      lastIssue: execution.last_issue,
      provenance: {
        source: 'live_collector_statistics',
        schedule: {
          expression: collector.schedule.expression,
          timezone: collector.schedule.timezone,
          maxIntervalMs: collector.schedule.maxIntervalMs,
          graceMs: collector.schedule.graceMs,
        },
      },
      isProblem: execution.last_outcome === 'failed' || execution.last_outcome === 'missed',
    }
  })
}

export function checkContractAt(collector, execution = {}, nowMs, bootedAtMs) {
  const schedule = collector.schedule
  if (!Number.isFinite(schedule?.maxIntervalMs) || schedule.maxIntervalMs <= 0 || !Number.isFinite(schedule?.graceMs) || schedule.graceMs < 0 || isQuietAt(schedule.quiet, nowMs)) return null
  const lastScheduledAtMs = Date.parse(execution.last_scheduled_started_at) || bootedAtMs
  const deadlineBase = deadlineBaseAfterQuiet(lastScheduledAtMs, nowMs, schedule.quiet)
  const comparisonNow = schedule.quiet ? kstVirtualMs(nowMs) : nowMs
  if (comparisonNow < deadlineBase + schedule.maxIntervalMs + schedule.graceMs) return null
  return {
    type: collector.type,
    outcome: 'missed',
    code: 'start_overdue',
    message: 'scheduled collector start overdue',
  }
}

export function createExecutionWatchdog({ collectors, getStats, recordMissed, now = Date.now, bootedAtMs = now() }) {
  let interval = null
  const reportedAt = new Map()

  function check(nowMs = now()) {
    const types = getStats().types || {}
    const missed = []
    for (const collector of collectors) {
      const execution = types[collector.type]?.execution || EMPTY_EXECUTION
      const incident = checkContractAt(collector, execution, nowMs, bootedAtMs)
      const contractStart = execution.last_scheduled_started_at || bootedAtMs
      if (!incident || execution.last_outcome === 'missed' || reportedAt.get(collector.type) === contractStart) continue
      recordMissed(collector.type, incident)
      reportedAt.set(collector.type, contractStart)
      missed.push(collector.type)
    }
    return missed
  }

  return {
    check,
    start() {
      if (!interval) interval = setInterval(() => check(), 60_000)
      interval?.unref?.()
    },
    stop() {
      if (interval) clearInterval(interval)
      interval = null
    },
  }
}
