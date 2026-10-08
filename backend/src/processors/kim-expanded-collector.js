// KIM 확대 영역(ea, 90~160°E) 한 회차 수집·계산·게시.
//
// 대용량 키는 KST 15~24시에만 쓸 수 있어, 예보시각을 앞쪽부터 하나씩 받고(기본 격자 22층 + GKTG·권계면 추가 입력)
// 받은 시각은 바로 GKTG·권계면 계산(자식 프로세스, 게시 없음)에 넘긴다. 다음 시각을 받는 동안 앞 시각을 계산한다.
// stop_requests_kst(23:50)가 지나면 새 시각을 받지 않는다. 계산은 키가 필요 없어 자정을 넘겨도 끝까지 한다.
// 다 끝나면 앞에서부터 끊김 없이 받은 시각까지를 게시하되, 회차별 기준(publish_min_hour)에 못 미치면 게시하지 않고
// 이전 회차를 그대로 둔다(짧은 회차로 바꾸면 이전 회차가 덮던 시간이 빈다).
import path from 'node:path'

import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpIndex, buildKimNwpIndexEntry } from './kim-nwp-model.js'
import {
  buildKimNwpRunId, cleanupKimNwpRuns, resolveKimNwpGridPath, resolveKimNwpRunDir,
  writeKimNwpIndex, writeKimNwpLatest, writeKimNwpManifest,
} from './kim-nwp-store.js'
import { collectKimNwpTask, mapKimNwpTasksWithConcurrency } from './kim-surface-wind-processor.js'
import { prefetchGktgSupplements } from './kim-gktg-processor.js'
import { prefetchTropopauseSupplements } from './kim-tropopause-processor.js'
import { runKimDerivedWorker } from './kim-derived-worker.js'
import { kimBulkCredentialOptions, selectKimRunCredential } from './kim-run-credential.js'
import { appendKimRunEvent } from './kim-run-events.js'
import store from '../store.js'

const DOMAIN = 'ea'

// 발표회차 날짜(KST)의 HH:MM KST를 epoch ms로. 00 UTC 회차는 같은 날 15시, 06 UTC는 20:15에 시작해 그날 23:50에 멈춘다.
export function kstCutoffMs(tmfc, hhmm) {
  const [hour, minute] = String(hhmm).split(':').map(Number)
  const dayUtc = Date.UTC(+tmfc.slice(0, 4), +tmfc.slice(4, 6) - 1, +tmfc.slice(6, 8))
  // 00·06 UTC 발표회차의 KST 날짜는 UTC 날짜와 같다.
  return dayUtc + (hour * 60 + minute) * 60_000 - 9 * 3600_000
}

// 앞에서부터 끊김 없이 받은 예보시각들.
export function contiguousHours(planned, okHours) {
  const ok = new Set(okHours)
  const out = []
  for (const hf of planned) {
    if (!ok.has(hf)) break
    out.push(hf)
  }
  return out
}

export function expandedCycle(tmfc) {
  const cycle = String(tmfc).slice(-2)
  const hours = config.kim_expanded.cycles[cycle]
  if (!hours) throw new Error(`kim_expanded_unsupported_cycle_${cycle}`)
  return { cycle, hours, minHour: config.kim_expanded.publish_min_hour[cycle] }
}

export async function collectExpandedRun({
  tmfc,
  hours: plannedHours,
  root = config.storage.base_path,
  now = Date.now,
  stopAtMs,
  signal,
  publish = true,
  fetchGrid = fetchKimGrid,
  collectTask = collectKimNwpTask,
  prefetch = [prefetchGktgSupplements, prefetchTropopauseSupplements],
  runDerived = runKimDerivedWorker,
  onProgress = () => {},
  // 시각마다 받기 전에 부른다. 이유 문자열을 돌려주면 새 시각을 받지 않는다(디스크 보호선, 다음 회차 시작 등).
  beforeHour = () => null,
  // 시각 하나를 다 받았을 때(계산 전). 06 UTC는 +0~12h가 모이면 한반도 회차를 잘라 게시한다.
  onHourDownloaded = async () => {},
} = {}) {
  const { hours: cycleHours, minHour } = expandedCycle(tmfc)
  const hours = plannedHours ?? cycleHours
  const stopAt = stopAtMs ?? kstCutoffMs(tmfc, config.kim_expanded.stop_requests_kst)
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain: DOMAIN })
  const levels = KIM_NWP_LEVELS
  const entries = new Map()
  const downloaded = []
  const computed = []
  const failures = []
  const started = now()
  appendKimRunEvent(runDir, { type: 'expanded_started', hours: hours.length, stopAt: Number.isFinite(stopAt) ? new Date(stopAt).toISOString() : null })

  // 계산은 순서대로 하나씩. 다운로드와 겹쳐 돈다.
  let computeChain = Promise.resolve()
  const compute = (hf) => {
    computeChain = computeChain.then(async () => {
      const at = now()
      const result = { hf }
      for (const kind of ['kim_gktg', 'kim_tropopause']) {
        try {
          const out = await runDerived(kind, { signal, jobOptions: { domain: DOMAIN, tmfc, forecastHours: [hf], publish: false } })
          result[kind] = out?.failures?.length ? out.failures[0].reason : 'ok'
        } catch (error) {
          result[kind] = String(error.code || error.message).slice(0, 200)
        }
      }
      result.ms = now() - at
      if (result.kim_gktg === 'ok' && result.kim_tropopause === 'ok') computed.push(hf)
      else failures.push({ hf, stage: 'compute', gktg: result.kim_gktg, tropopause: result.kim_tropopause })
      appendKimRunEvent(runDir, { type: 'expanded_hour_computed', ...result })
      onProgress({ type: 'computed', ...result })
    })
    return computeChain
  }

  let stopReason = null
  for (const hf of hours) {
    if (signal?.aborted) { stopReason = 'cancelled'; break }
    if (now() >= stopAt) { stopReason = 'request_cutoff'; break }
    const blocked = beforeHour({ hf, downloaded: [...downloaded] })
    if (blocked) { stopReason = blocked; break }
    const at = now()
    let credential
    try {
      credential = selectKimRunCredential({ tmfc, ...kimBulkCredentialOptions(config, now(), { required: true }) })
    } catch (error) {
      stopReason = error.code || error.message
      break
    }
    const hourEntries = []
    let hourFailed = 0
    let lastError = null
    const tasks = levels.map(level => ({ level, tmfc, hf, credential, domain: DOMAIN }))
    await mapKimNwpTasksWithConcurrency(tasks, config.kim_expanded.concurrency, async (task) => {
      try {
        const { grid, lastError: taskError } = await collectTask({ task })
        if (taskError) { hourFailed += 1; lastError = taskError; return }
        hourEntries.push(buildKimNwpIndexEntry(grid, path.relative(root, resolveKimNwpGridPath({ root, model: grid.model, tmfc, hf, levelId: grid.level.id, domain: DOMAIN })).replace(/\\/g, '/')))
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error
        hourFailed += 1
        lastError = error
      }
    }).catch(error => { lastError = error; hourFailed = Math.max(hourFailed, 1) })
    let prefetchError = null
    if (!hourFailed) {
      for (const run of prefetch) {
        try { await run({ root, domain: DOMAIN, tmfc, hf, signal, fetchGrid }) } catch (error) { prefetchError = error; break }
      }
    }
    const ms = now() - at
    const ok = !hourFailed && !prefetchError
    appendKimRunEvent(runDir, { type: 'expanded_hour_collected', hf, ok, grids: hourEntries.length, failedTasks: hourFailed, ms,
      error: ok ? null : String((prefetchError || lastError)?.code || (prefetchError || lastError)?.message || 'failed').slice(0, 300) })
    onProgress({ type: 'collected', hf, ok, ms, grids: hourEntries.length })
    if (!ok) {
      failures.push({ hf, stage: prefetchError ? 'supplement' : 'base', reason: String((prefetchError || lastError)?.code || (prefetchError || lastError)?.message || 'failed').slice(0, 200) })
      continue
    }
    entries.set(hf, hourEntries)
    downloaded.push(hf)
    compute(hf)
    try { await onHourDownloaded({ hf, downloaded: [...downloaded] }) } catch (error) {
      appendKimRunEvent(runDir, { type: 'expanded_hour_hook_failed', hf, error: String(error.code || error.message).slice(0, 300) })
    }
  }
  await computeChain

  const publishable = contiguousHours(hours, downloaded.filter(hf => computed.includes(hf)))
  const lastHour = publishable.at(-1)
  if (failures.some(failure => /HTTP (401|403)|unauthori[sz]ed|forbidden/i.test(failure.reason || ''))) stopReason ||= 'credential_rejected'
  const meetsMinimum = Number.isFinite(lastHour) && lastHour >= minHour
  let published = null
  if (publish && meetsMinimum) published = await publishExpandedRun({ root, tmfc, hours: publishable, entries, runDerived, signal, complete: publishable.length === hours.length })
  const result = { type: 'kim_expanded', tmfc, planned: hours.length, downloaded: downloaded.length, computed: computed.length,
    publishedHours: published ? publishable.length : 0, lastHour: lastHour ?? null, minHour, stopReason, failures,
    published: Boolean(published), ms: now() - started }
  appendKimRunEvent(runDir, { type: published ? 'expanded_published' : 'expanded_not_published', ...result, failures: failures.slice(0, 20) })
  return result
}

// 기본 격자 index·latest와 GKTG·권계면 게시. 파생 계산은 이미 시각별로 끝나 있어 결과를 다시 쓰지 않고 확인·게시만 한다.
async function publishExpandedRun({ root, tmfc, hours, entries, runDerived, signal, complete }) {
  const allEntries = hours.flatMap(hf => entries.get(hf))
  const index = buildKimNwpIndex({ model: KIM_NWP_MODEL, tmfc, entries: allEntries })
  const runId = buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc })
  writeKimNwpManifest(root, { type: 'kim_nwp_manifest', model: KIM_NWP_MODEL, tmfc, runId, usable: true, complete,
    gridCount: allEntries.length, expectedGridCount: allEntries.length, hours, updated_at: new Date().toISOString() }, DOMAIN)
  for (const kind of ['kim_gktg', 'kim_tropopause']) {
    const out = await runDerived(kind, { signal, jobOptions: { domain: DOMAIN, tmfc, forecastHours: hours, publish: true } })
    if (!out?.saved && !out?.unchanged) throw new Error(`kim_expanded_${kind}_publish_failed`)
  }
  // 파생 결과를 먼저 게시하고 기본 격자 latest를 바꾼다(지도·단면이 새 회차를 볼 때 난류·권계면이 함께 있게).
  writeKimNwpIndex(root, index, DOMAIN)
  writeKimNwpLatest(root, { type: 'kim_nwp_latest', model: KIM_NWP_MODEL, latestRun: tmfc, latestRunId: runId, indexPath: 'kim_nwp_ea/index.json',
    hours, updated_at: new Date().toISOString(), content_hash: store.canonicalHash(index) }, DOMAIN)
  cleanupKimNwpRuns({ root, domain: DOMAIN, maxRuns: 1, latestRunId: runId, reason: 'expanded_published' })
  return { runId, hours }
}

export default { collectExpandedRun }
