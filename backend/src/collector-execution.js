const EMPTY_EXECUTION = Object.freeze({
  last_started_at: null,
  last_finished_at: null,
  last_outcome: null,
  last_issue: null,
})

function isQuietAt(quiet, nowMs) {
  if (!quiet) return false
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date(nowMs)))
  return quiet.fromHourKst < quiet.toHourKst
    ? hour >= quiet.fromHourKst && hour < quiet.toHourKst
    : hour >= quiet.fromHourKst || hour < quiet.toHourKst
}

export function buildCollectorExecution({ collectors, statsTypes, nowMs }) {
  return collectors.map((collector) => {
    const execution = statsTypes[collector.type]?.execution ?? EMPTY_EXECUTION
    return {
      type: collector.type,
      outcome: execution.last_outcome ?? 'unknown',
      lastStartedAt: execution.last_started_at,
      lastFinishedAt: execution.last_finished_at,
      lastIssue: execution.last_issue,
      isProblem: execution.last_outcome === 'failed' || execution.last_outcome === 'missed',
    }
  })
}

export function checkContractAt(collector, execution = {}, nowMs, bootedAtMs) {
  const schedule = collector.schedule
  if (!schedule?.maxIntervalMs || !schedule?.graceMs || isQuietAt(schedule.quiet, nowMs)) return null
  const lastScheduledAtMs = Date.parse(execution.last_scheduled_started_at) || bootedAtMs
  if (nowMs < lastScheduledAtMs + schedule.maxIntervalMs + schedule.graceMs) return null
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
