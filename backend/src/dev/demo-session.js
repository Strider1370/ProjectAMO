import config from '../config.js'
import store from '../store.js'
import { quiesceCollections } from '../index.js'
import { dataView } from './data-view.js'
import { inspectSnapshot, nextSnapshotName, saveSnapshot } from './snapshot-store.js'

export function createDemoSession({
  basePath = config.storage.base_path,
  activePath = config.storage.active_path,
  views = dataView,
  snapshots = { inspectSnapshot, nextSnapshotName, saveSnapshot },
  reloadActive = (root) => store.initActiveFromFiles(root),
  drain = quiesceCollections,
} = {}) {
  let transitioning = false
  let pendingCaptures = 0
  let captureQueue = Promise.resolve()

  async function exclusive(action, { allowPendingCaptures = false } = {}) {
    if (transitioning || (!allowPendingCaptures && pendingCaptures > 0)) {
      const error = new Error('demo_transition_in_progress')
      error.code = 'demo_transition_in_progress'
      throw error
    }
    transitioning = true
    try {
      return await action()
    } finally {
      transitioning = false
    }
  }

  function captureSnapshot(requestedName = null) {
    pendingCaptures += 1
    const capture = captureQueue.then(() => exclusive(async () => {
      await drain()
      const name = requestedName || snapshots.nextSnapshotName(basePath)
      const saved = snapshots.saveSnapshot(basePath, name)
      const before = views.current()
      if (before.mode !== 'demo' || before.name !== name) return saved

      try {
        const context = views.activateDemo(name)
        reloadActive(activePath)
        return { ...saved, referenceTime: context.referenceTime, revision: context.revision, generation: context.generation }
      } catch (error) {
        // activateDemo는 새 generation view를 완성한 뒤에만 active symlink를 바꾼다.
        // 따라서 여기서 실패해도 이전 active generation/cache는 그대로다.
        throw error
      }
    }, { allowPendingCaptures: true }))
    captureQueue = capture.catch(() => {})
    return capture.finally(() => { pendingCaptures -= 1 })
  }

  async function startDemo(name) {
    return exclusive(() => {
      const report = snapshots.inspectSnapshot(basePath, name)
      if (!report.ready) {
        const notFound = report.blockers.includes('snapshot_not_found')
        const error = new Error(notFound ? 'snapshot_not_found' : 'snapshot_not_ready')
        error.code = notFound ? 'snapshot_not_found' : 'snapshot_not_ready'
        error.report = report
        throw error
      }
      const before = views.current()
      try {
        const context = views.activateDemo(name)
        reloadActive(activePath)
        return {
          name,
          on: true,
          now: context.referenceTime,
          referenceTime: context.referenceTime,
          revision: context.revision,
          restored: report.types,
          inspection: report,
        }
      } catch (error) {
        if (before.mode === 'live') views.activateLive()
        else views.activateDemo(before.name)
        reloadActive(activePath)
        throw error
      }
    })
  }

  async function stopDemo() {
    return exclusive(() => {
      const context = views.activateLive()
      reloadActive(activePath)
      return {
        on: false,
        now: new Date().toISOString(),
        revision: context.revision,
        restoredLiveBackup: false,
        note: '저장돼 있던 최신 실황 경로로 즉시 전환했습니다.',
      }
    })
  }

  function status() {
    const context = views.current()
    return {
      on: context.mode === 'demo',
      name: context.name,
      now: context.referenceTime || new Date().toISOString(),
      revision: context.revision,
      hasLiveBackup: false,
    }
  }

  return { captureSnapshot, startDemo, status, stopDemo }
}

export const demoSession = createDemoSession()

export default demoSession
