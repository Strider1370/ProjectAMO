import config from '../config.js'
import { waitForCollectionIdle } from '../index.js'
import {
  getEffectiveNow,
  isDemoMode,
  setDemoMode,
  setDemoNow,
} from './demo-mode.js'
import {
  RESERVED_LIVE_BACKUP,
  discardLiveBackup,
  hasLiveBackup,
  inspectSnapshot,
  loadSnapshot,
  saveSnapshot,
} from './snapshot-store.js'

export function createDemoSession({
  basePath = config.storage.base_path,
  clock = { getEffectiveNow, isDemoMode, setDemoMode, setDemoNow },
  snapshots = {
    discardLiveBackup,
    hasLiveBackup,
    inspectSnapshot,
    loadSnapshot,
    saveSnapshot,
  },
  drain = waitForCollectionIdle,
} = {}) {
  async function captureSnapshot(name) {
    const wasOn = clock.isDemoMode()
    if (!wasOn) clock.setDemoMode(true)
    try {
      await drain()
      return snapshots.saveSnapshot(basePath, name)
    } finally {
      if (!wasOn) clock.setDemoMode(false)
    }
  }

  async function startDemo(name) {
    const report = snapshots.inspectSnapshot(basePath, name)
    if (!report.ready) {
      const notFound = report.blockers.includes('snapshot_not_found')
      const error = new Error(notFound ? 'snapshot_not_found' : 'snapshot_not_ready')
      error.code = notFound ? 'snapshot_not_found' : 'snapshot_not_ready'
      error.report = report
      throw error
    }

    const enteringFromLive = !clock.isDemoMode()
    if (!enteringFromLive && !snapshots.hasLiveBackup(basePath)) {
      const error = new Error('live_backup_missing')
      error.code = 'live_backup_missing'
      throw error
    }
    clock.setDemoMode(true)
    await drain()

    if (enteringFromLive) {
      snapshots.discardLiveBackup(basePath)
      snapshots.saveSnapshot(basePath, RESERVED_LIVE_BACKUP)
    }

    let result
    try {
      result = snapshots.loadSnapshot(basePath, name, { skipBackup: true })
      if (!result) {
        const error = new Error('snapshot_not_found')
        error.code = 'snapshot_not_found'
        throw error
      }
      if (!result.referenceTime) {
        const error = new Error('snapshot_reference_time_missing')
        error.code = 'snapshot_reference_time_missing'
        throw error
      }
    } catch (error) {
      // 디렉터리 단위 교체 도중 I/O 오류가 나도 혼합 상태를 남기지 않도록,
      // 수집은 계속 동결한 채 방금 캡처한 실황 백업으로 즉시 되감는다.
      try {
        snapshots.loadSnapshot(basePath, RESERVED_LIVE_BACKUP, { skipBackup: true })
      } catch (rollbackError) {
        error.rollbackError = rollbackError
      }
      throw error
    }
    clock.setDemoNow(result.referenceTime)
    return {
      ...result,
      name,
      on: true,
      now: clock.getEffectiveNow().toISOString(),
      inspection: report,
    }
  }

  async function stopDemo() {
    const had = snapshots.hasLiveBackup(basePath)
    await drain()
    if (had) {
      const result = snapshots.loadSnapshot(basePath, RESERVED_LIVE_BACKUP, { skipBackup: true })
      if (!result) throw new Error('live_backup_restore_failed')
    }
    clock.setDemoMode(false)
    if (had) snapshots.discardLiveBackup(basePath)
    return {
      on: false,
      restoredLiveBackup: had,
      note: had
        ? '스냅샷 직전 실황으로 즉시 복원하고 시연 모드를 종료했습니다.'
        : '되돌릴 실황 백업이 없어 시연 모드만 종료했습니다.',
    }
  }

  function status() {
    return {
      on: clock.isDemoMode(),
      now: clock.getEffectiveNow().toISOString(),
      hasLiveBackup: snapshots.hasLiveBackup(basePath),
    }
  }

  return { captureSnapshot, startDemo, status, stopDemo }
}

export const demoSession = createDemoSession()

export default demoSession
