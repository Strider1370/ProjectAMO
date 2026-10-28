// 확대 영역 정기 수집 작업(kim_expanded_00·kim_expanded_06). 수집·계산 자체는 kim-expanded-collector.js가 한다.
//
// 여기서 정하는 것(운영안 "관리 방법", 2026-10-08):
// - 쓸 수 있는지: 설정(enabled)·대용량 키·승인 만료일(KST)·오늘 키가 거부됐는지. 안 되면 수집하지 않고, 한반도 06 UTC는
//   기존처럼 일반 키로 받는다(kim-surface-wind-processor.js가 koreaSixFromExpanded로 판단).
// - 디스크: 시작 전 여유 ≥ 예상 회차 크기 + 1.5 GiB, 시각마다 1.5 GiB 아래면 멈춘다(EXPANDED_MIN_FREE_BYTES).
// - 06 UTC가 시작되면 아직 이어받던 00 UTC는 새 시각을 받지 않는다.
// - 06 UTC는 정해진 시각을 기다리지 않는다. 5분마다 +0h가 기상청에 올라왔는지 확인하고 올라왔으면 바로 시작한다
//   (start_without_check_kst까지 확인이 안 되면 확인 없이 시작). 시작한 회차가 덜 끝났으면 retry_gap_minutes 뒤에 다시 시도한다.
// - 06 UTC는 +0~12h가 모이면 한반도 회차를 잘라 게시한다(21:30 KST까지 안 되면 한반도 수집기가 일반 키로 받는다).
//   그 시각들의 GKTG 계산이 끝나면 한반도 GKTG도 잘라 게시한다. 못 하면 onKoreaGktgFallback(예전처럼 한반도에서 계산)을 부른다.
import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { collectionResult } from '../collector-execution.js'
import { collectExpandedRun, expandedCycle, kstCutoffMs } from './kim-expanded-collector.js'
import { publishKoreaFromExpanded } from './kim-korea-crop.js'
import { publishKoreaGktgFromExpanded } from './kim-gktg-processor.js'
import { startExpandedMonitor } from './kim-expanded-monitor.js'
import { appendKimRunEvent } from './kim-run-events.js'
import { readKimNwpLatest, readKimNwpManifest, buildKimNwpRunId, resolveKimNwpRoot, resolveKimNwpRunDir } from './kim-nwp-store.js'
import { KIM_NWP_MODEL } from './kim-nwp-model.js'
import { kimHourUploaded } from './kim-run-availability.js'
import { EXPANDED_MIN_FREE_BYTES, EXPECTED_RUN_BYTES } from './kim-expanded-disk.js'
import { kimBulkCredentialOptions, selectKimRunCredential } from './kim-run-credential.js'

const KOREA_FALLBACK_KST = '21:30'
const stopRequested = { '00': false, '06': false }
// 시연 서버(dev/demo-instance.js)가 켜져 있는 동안 확대 회차를 시작하지 않는다(서버 메모리 1.9 GB에 둘을 같이 둘 수 없다).
let pausedReason = null
export function pauseExpandedRuns(reason) { pausedReason = reason }
export function resumeExpandedRuns() { pausedReason = null }

const kstDate = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10)
const disabledFile = (root) => path.join(resolveKimNwpRoot(root, 'ea'), 'disabled.json')
const lockFile = (root, cycle) => path.join(resolveKimNwpRoot(root, 'ea'), `run-${cycle}.lock`)
const attemptFile = (root, cycle) => path.join(resolveKimNwpRoot(root, 'ea'), `attempt-${cycle}.json`)

function readAttempt(root, cycle) {
  try { return JSON.parse(fs.readFileSync(attemptFile(root, cycle), 'utf8')) } catch { return null }
}

function writeAttempt(root, cycle, attempt) {
  try { fs.writeFileSync(attemptFile(root, cycle), `${JSON.stringify(attempt)}\n`) } catch {}
}

// 확인하고 시작하는 회차(start_without_check_kst가 있는 06 UTC)를 지금 시작하지 않을 이유. 시작하면 null.
// - 오늘 이미 시작했던 회차: 끝난 지(끝 기록이 없으면 시작한 지) retry_gap_minutes가 지나야 다시 시도한다.
// - 아직 시작 전: +0h가 기상청에 올라왔을 때만 시작한다. start_without_check_kst가 지나면 확인 없이 시작한다.
export async function expandedStartBlocked({ root = config.storage.base_path, cycle, tmfc, now = Date.now(), checkUploaded = kimHourUploaded, signal }) {
  const fallback = config.kim_expanded.start_without_check_kst?.[cycle]
  if (!fallback) return null
  const attempt = readAttempt(root, cycle)
  if (attempt?.tmfc === tmfc) {
    const lastMs = Date.parse(attempt.endedAt || attempt.startedAt)
    return now - lastMs < config.kim_expanded.retry_gap_minutes * 60_000 ? 'kim_expanded_retry_wait' : null
  }
  if (now >= kstCutoffMs(tmfc, fallback)) return null
  let credential
  try {
    credential = selectKimRunCredential({ tmfc, ...kimBulkCredentialOptions(config, now, { required: true }) })
  } catch (error) {
    return error.code || 'kim_bulk_credential_unavailable'
  }
  try {
    return await checkUploaded({ tmfc, hf: 0, credential, signal }) ? null : 'kim_expanded_not_uploaded'
  } catch {
    return 'kim_expanded_upload_check_failed'
  }
}

// 다른 프로세스(수동 실행 등)가 같은 회차(00·06)를 받는 중이면 그 프로세스 정보. 프로세스가 없으면 남은 잠금은 무시한다.
export function expandedRunElsewhere(root, cycle, pid = process.pid) {
  let lock
  try { lock = JSON.parse(fs.readFileSync(lockFile(root, cycle), 'utf8')) } catch { return null }
  if (!Number.isInteger(lock?.pid) || lock.pid === pid) return null
  try { process.kill(lock.pid, 0) } catch (error) { if (error.code === 'ESRCH') return null }
  return lock
}

// 확대 수집을 지금 쓸 수 있는지와 그 이유.
export function expandedAvailability({ root = config.storage.base_path, now = Date.now() } = {}) {
  if (!config.kim_expanded?.enabled) return { available: false, reason: 'kim_expanded_disabled' }
  if (!config.api?.kma_bulk_auth_key) return { available: false, reason: 'kim_bulk_credential_unavailable' }
  if (config.kim_bulk?.valid_until_kst && kstDate(now) > config.kim_bulk.valid_until_kst) return { available: false, reason: 'kim_bulk_credential_expired' }
  try {
    const disabled = JSON.parse(fs.readFileSync(disabledFile(root), 'utf8'))
    if (disabled?.dateKst === kstDate(now)) return { available: false, reason: disabled.reason || 'kim_expanded_auto_disabled' }
  } catch {}
  return { available: true, reason: null }
}

// 키가 거부되면(401·403) 그날은 확대 수집을 멈추고 한반도 06 UTC를 일반 키로 돌린다. 다음 날 다시 시도한다.
export function markExpandedDisabled({ root = config.storage.base_path, reason, now = Date.now() }) {
  fs.mkdirSync(path.dirname(disabledFile(root)), { recursive: true })
  fs.writeFileSync(disabledFile(root), `${JSON.stringify({ dateKst: kstDate(now), reason, at: new Date(now).toISOString() })}\n`)
}

// 한반도 06 UTC를 확대 영역에서 잘라 쓰는 중이면 true: 한반도 수집기는 21:30 KST까지 그 회차를 일반 키로 받지 않는다.
export function koreaSixFromExpanded({ tmfc, root = config.storage.base_path, now = Date.now() }) {
  if (String(tmfc).slice(-2) !== '06') return false
  if (!expandedAvailability({ root, now }).available) return false
  return now < kstCutoffMs(tmfc, KOREA_FALLBACK_KST)
}

function freeBytes(root) {
  try {
    const stat = fs.statfsSync(root)
    return stat.bavail * stat.bsize
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function expandedRunTmfc(cycle, now = Date.now()) {
  return `${kstDate(now).replaceAll('-', '')}${cycle}`
}

// 폴더 안 파일 크기 합(바이트). 없으면 0.
export function directoryBytes(dir) {
  let total = 0
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return 0 }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += directoryBytes(full)
    else if (entry.isFile()) { try { total += fs.statSync(full).size } catch { /* 지워진 파일 */ } }
  }
  return total
}

export async function processExpandedCycle({
  cycle,
  root = config.storage.base_path,
  signal,
  now = Date.now,
  collect = collectExpandedRun,
  cropKorea = publishKoreaFromExpanded,
  onKoreaPublished = async () => {},
  cropKoreaGktg = publishKoreaGktgFromExpanded,
  onKoreaGktgFallback = async () => {},
  koreaGktgEnabled = config.kim_gktg?.enabled !== false,
  diskFree = freeBytes,
  runBytes = directoryBytes,
  startMonitor = startExpandedMonitor,
  checkUploaded = kimHourUploaded,
} = {}) {
  const tmfc = expandedRunTmfc(cycle, now())
  const availability = expandedAvailability({ root, now: now() })
  if (!availability.available) return { type: 'kim_expanded', tmfc, skipped: true, reason: availability.reason, collection: collectionResult('empty', { tmfc }, { normalEmpty: true, reason: availability.reason }) }
  if (pausedReason) return { type: 'kim_expanded', tmfc, skipped: true, reason: pausedReason, collection: collectionResult('empty', { tmfc }, { normalEmpty: true, reason: pausedReason }) }
  const latest = readKimNwpLatest(root, 'ea')
  const manifest = readKimNwpManifest(root, buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }), 'ea')
  // 회차 완료는 기본 격자로만 판정한다. ACI가 빠진 시각은 수집기가 회차 끝에서 다시 시도하며, 그 때문에 정기 재시도마다
  // 회차 전체를 다시 확인(30분 안팎)하지 않는다.
  if (latest?.latestRun === tmfc && manifest?.complete) {
    return { type: 'kim_expanded', tmfc, skipped: true, reason: 'kim_expanded_run_complete', collection: collectionResult('complete', { tmfc }) }
  }
  const elsewhere = expandedRunElsewhere(root, cycle)
  if (elsewhere) {
    return { type: 'kim_expanded', tmfc, skipped: true, reason: 'kim_expanded_running_elsewhere', collection: collectionResult('empty', { tmfc }, { normalEmpty: true, reason: 'kim_expanded_running_elsewhere' }) }
  }
  const blocked = await expandedStartBlocked({ root, cycle, tmfc, now: now(), checkUploaded, signal })
  if (blocked) {
    return { type: 'kim_expanded', tmfc, skipped: true, reason: blocked, collection: collectionResult('empty', { tmfc }, { normalEmpty: true, reason: blocked }) }
  }
  // 끊긴 회차를 이어서 할 때는 이미 받아 둔 만큼은 새로 쓰지 않는다. 회차 전체 크기를 다시 요구하면
  // 옛 회차와 끊긴 회차가 함께 있는 동안 절대 이어서 하지 못한다(2026-10-28 06 UTC가 배포 재시작 뒤 그렇게 멈췄다).
  const existingRunBytes = runBytes(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain: 'ea' }))
  if (diskFree(root) < Math.max(0, EXPECTED_RUN_BYTES - existingRunBytes) + EXPANDED_MIN_FREE_BYTES) {
    return { type: 'kim_expanded', tmfc, skipped: true, reason: 'disk_reserve', collection: collectionResult('failed', null, { reason: 'disk_reserve' }) }
  }
  if (cycle === '06') stopRequested['00'] = true
  stopRequested[cycle] = false
  const { hours } = expandedCycle(tmfc)
  const koreaHours = config.kim_nwp?.forecast_hours || []
  let korea = null
  let koreaGktg = null
  let gktgResults = null
  // 한반도 회차를 잘라 게시했고 그 시각들의 GKTG 계산이 모두 끝났으면 한반도 GKTG를 잘라 게시한다(한 번만).
  const tryKoreaGktg = async () => {
    if (cycle !== '06' || !koreaGktgEnabled || !korea?.saved || koreaGktg || !gktgResults || !koreaHours.every(hf => gktgResults.has(hf))) return
    koreaGktg = { pending: true }
    try {
      const published = await cropKoreaGktg({ root, tmfc, hours: koreaHours, hourResults: koreaHours.map(hf => gktgResults.get(hf)) })
      koreaGktg = { saved: true, revision: published?.revision }
      appendKimRunEvent(runDir, { type: 'expanded_korea_gktg', revision: published?.revision || null, fields: published?.entries?.length ?? null })
    } catch (error) {
      koreaGktg = { saved: false }
      appendKimRunEvent(runDir, { type: 'expanded_korea_gktg_failed', error: String(error.code || error.message).slice(0, 200) })
      await onKoreaGktgFallback({ tmfc })
    }
  }
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain: 'ea' })
  fs.mkdirSync(path.dirname(lockFile(root, cycle)), { recursive: true })
  const startedAt = new Date(now()).toISOString()
  fs.writeFileSync(lockFile(root, cycle), `${JSON.stringify({ pid: process.pid, tmfc, startedAt })}\n`)
  writeAttempt(root, cycle, { tmfc, startedAt })
  const monitor = startMonitor({ runDir })
  let result
  let memory
  try {
    result = await collect({
      tmfc, hours, root, signal, now,
      beforeHour: () => {
        if (pausedReason) return pausedReason
        if (stopRequested[cycle]) return 'next_cycle_started'
        if (diskFree(root) < EXPANDED_MIN_FREE_BYTES) return 'disk_reserve'
        return monitor.stopReason()
      },
      onHourDownloaded: async ({ downloaded }) => {
        if (cycle !== '06' || korea || !koreaHours.every(hf => downloaded.includes(hf))) return
        korea = cropKorea({ root, tmfc, hours: koreaHours })
        appendKimRunEvent(runDir, { type: 'expanded_korea_crop', ...korea })
        if (korea?.saved) {
          await onKoreaPublished({ tmfc })
          await tryKoreaGktg()
        }
      },
      onGktgComputed: async ({ results }) => {
        gktgResults = results
        await tryKoreaGktg()
      },
    })
  } finally {
    try { if (JSON.parse(fs.readFileSync(lockFile(root, cycle), 'utf8')).pid === process.pid) fs.rmSync(lockFile(root, cycle), { force: true }) } catch {}
    writeAttempt(root, cycle, { tmfc, startedAt, endedAt: new Date(now()).toISOString() })
    memory = monitor.stop()
    appendKimRunEvent(runDir, { type: 'expanded_monitor', ...memory })
  }
  result = { ...result, memory }
  // 회차가 끝나도 한반도 GKTG를 못 잘랐으면(그 시각 계산 실패·중단 등) 예전처럼 한반도에서 계산한다.
  if (cycle === '06' && koreaGktgEnabled && korea?.saved && !koreaGktg) {
    appendKimRunEvent(runDir, { type: 'expanded_korea_gktg_missing' })
    await onKoreaGktgFallback({ tmfc })
  }
  if (result.stopReason === 'credential_rejected') markExpandedDisabled({ root, reason: 'kim_bulk_credential_rejected', now: now() })
  const outcome = result.published ? (result.publishedHours === hours.length ? 'complete' : 'partial') : 'failed'
  const data = outcome === 'failed' ? null : { publishedHours: result.publishedHours, planned: result.planned }
  return { ...result, korea, collection: collectionResult(outcome, data,
    outcome === 'complete' ? {} : { reason: result.published ? 'kim_expanded_partial' : result.stopReason || 'kim_expanded_not_published' }) }
}

export default { processExpandedCycle }
