import config from '../config.js'
import store from '../store.js'
import { quiesceCollections } from '../index.js'
import { dataView } from './data-view.js'
import { inspectSnapshot, saveSnapshot } from './snapshot-store.js'

export function createDemoSession({
  basePath = config.storage.base_path,
  activePath = config.storage.active_path,
  views = dataView,
  snapshots = { inspectSnapshot, saveSnapshot },
  reloadActive = (root) => store.initActiveFromFiles(root),
  drain = quiesceCollections,
} = {}) {
  let transitioning = false

  function exclusive(action) {
    if (transitioning) {
      const error = new Error('demo_transition_in_progress')
      error.code = 'demo_transition_in_progress'
      throw error
    }
    transitioning = true
    try {
      return action()
    } finally {
      transitioning = false
    }
  }

  async function captureSnapshot(name) {
    await drain()
    return snapshots.saveSnapshot(basePath, name)
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

    return exclusive(() => {
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
