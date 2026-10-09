// 확대 영역 정기 수집 작업(kim_expanded_00·kim_expanded_06). 수집·계산 자체는 kim-expanded-collector.js가 한다.
//
// 여기서 정하는 것(운영안 "관리 방법", 2026-10-08):
// - 쓸 수 있는지: 설정(enabled)·대용량 키·승인 만료일(KST)·오늘 키가 거부됐는지. 안 되면 수집하지 않고, 한반도 06 UTC는
//   기존처럼 일반 키로 받는다(kim-surface-wind-processor.js가 koreaSixFromExpanded로 판단).
// - 디스크: 시작 전 여유 ≥ 예상 회차 크기 + 3 GiB, 시각마다 3 GiB 아래면 멈춘다.
// - 06 UTC가 시작되면 아직 이어받던 00 UTC는 새 시각을 받지 않는다.
// - 06 UTC는 +0~12h가 모이면 한반도 회차를 잘라 게시한다(21:30 KST까지 안 되면 한반도 수집기가 일반 키로 받는다).
import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { collectionResult } from '../collector-execution.js'
import { MIN_FREE_BYTES } from '../maps/storage-budget.js'
import { collectExpandedRun, expandedCycle, kstCutoffMs } from './kim-expanded-collector.js'
import { publishKoreaFromExpanded } from './kim-korea-crop.js'
import { startExpandedMonitor } from './kim-expanded-monitor.js'
import { appendKimRunEvent } from './kim-run-events.js'
import { readKimNwpLatest, readKimNwpManifest, buildKimNwpRunId, resolveKimNwpRoot, resolveKimNwpRunDir } from './kim-nwp-store.js'
import { KIM_NWP_MODEL } from './kim-nwp-model.js'

// 확대 영역 06 UTC 한 회차(33시각) 최대 크기. 2026-10-09 실측 예보시각당 약 129 MiB(격자 88 + GKTG 32 + 권계면 7 + 지상 2)
// × 33 ≈ 4.5 GB에 날씨에 따른 압축률 차이를 더했다.
const EXPECTED_RUN_BYTES = 5e9
const KOREA_FALLBACK_KST = '21:30'
const stopRequested = { '00': false, '06': false }

const kstDate = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10)
const disabledFile = (root) => path.join(resolveKimNwpRoot(root, 'ea'), 'disabled.json')
const lockFile = (root, cycle) => path.join(resolveKimNwpRoot(root, 'ea'), `run-${cycle}.lock`)

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

export async function processExpandedCycle({
  cycle,
  root = config.storage.base_path,
  signal,
  now = Date.now,
  collect = collectExpandedRun,
  cropKorea = publishKoreaFromExpanded,
  onKoreaPublished = async () => {},
  diskFree = freeBytes,
  startMonitor = startExpandedMonitor,
} = {}) {
  const tmfc = expandedRunTmfc(cycle, now())
  const availability = expandedAvailability({ root, now: now() })
  if (!availability.available) return { type: 'kim_expanded', tmfc, skipped: true, reason: availability.reason, collection: collectionResult('empty', { tmfc }, { normalEmpty: true, reason: availability.reason }) }
  const latest = readKimNwpLatest(root, 'ea')
  const manifest = readKimNwpManifest(root, buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc }), 'ea')
  if (latest?.latestRun === tmfc && manifest?.complete) {
    return { type: 'kim_expanded', tmfc, skipped: true, reason: 'kim_expanded_run_complete', collection: collectionResult('complete', { tmfc }) }
  }
  const elsewhere = expandedRunElsewhere(root, cycle)
  if (elsewhere) {
    return { type: 'kim_expanded', tmfc, skipped: true, reason: 'kim_expanded_running_elsewhere', collection: collectionResult('empty', { tmfc }, { normalEmpty: true, reason: 'kim_expanded_running_elsewhere' }) }
  }
  if (diskFree(root) < EXPECTED_RUN_BYTES + MIN_FREE_BYTES) {
    return { type: 'kim_expanded', tmfc, skipped: true, reason: 'disk_reserve', collection: collectionResult('failed', null, { reason: 'disk_reserve' }) }
  }
  if (cycle === '06') stopRequested['00'] = true
  stopRequested[cycle] = false
  const { hours } = expandedCycle(tmfc)
  const koreaHours = config.kim_nwp?.forecast_hours || []
  let korea = null
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain: 'ea' })
  fs.mkdirSync(path.dirname(lockFile(root, cycle)), { recursive: true })
  fs.writeFileSync(lockFile(root, cycle), `${JSON.stringify({ pid: process.pid, tmfc, startedAt: new Date(now()).toISOString() })}\n`)
  const monitor = startMonitor({ runDir })
  let result
  let memory
  try {
    result = await collect({
      tmfc, hours, root, signal, now,
      beforeHour: () => {
        if (stopRequested[cycle]) return 'next_cycle_started'
        if (diskFree(root) < MIN_FREE_BYTES) return 'disk_reserve'
        return monitor.stopReason()
      },
      onHourDownloaded: async ({ downloaded }) => {
        if (cycle !== '06' || korea || !koreaHours.every(hf => downloaded.includes(hf))) return
        korea = cropKorea({ root, tmfc, hours: koreaHours })
        appendKimRunEvent(runDir, { type: 'expanded_korea_crop', ...korea })
        if (korea?.saved) await onKoreaPublished({ tmfc })
      },
    })
  } finally {
    try { if (JSON.parse(fs.readFileSync(lockFile(root, cycle), 'utf8')).pid === process.pid) fs.rmSync(lockFile(root, cycle), { force: true }) } catch {}
    memory = monitor.stop()
    appendKimRunEvent(runDir, { type: 'expanded_monitor', ...memory })
  }
  result = { ...result, memory }
  if (result.stopReason === 'credential_rejected') markExpandedDisabled({ root, reason: 'kim_bulk_credential_rejected', now: now() })
  const outcome = result.published ? (result.publishedHours === hours.length ? 'complete' : 'partial') : 'failed'
  const data = outcome === 'failed' ? null : { publishedHours: result.publishedHours, planned: result.planned }
  return { ...result, korea, collection: collectionResult(outcome, data,
    outcome === 'complete' ? {} : { reason: result.published ? 'kim_expanded_partial' : result.stopReason || 'kim_expanded_not_published' }) }
}

export default { processExpandedCycle }
