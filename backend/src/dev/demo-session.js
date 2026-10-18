import config from '../config.js'
import store from '../store.js'
import { waitForCollectionIdle } from '../index.js'
import adsbProcessor from '../processors/adsb-processor.js'
import { dataView } from './data-view.js'
import { inspectSnapshot, nextSnapshotName, saveSnapshot } from './snapshot-store.js'

export function createDemoSession({
  basePath = config.storage.base_path,
  activePath = config.storage.active_path,
  views = dataView,
  snapshots = { inspectSnapshot, nextSnapshotName, saveSnapshot },
  reloadActive = (root) => store.initActiveFromFiles(root),
  // 저장 전에 짧은 수집(METAR·레이더 등)이 파일을 다 쓸 때까지 잠깐 기다린다. 수집을 끊지 않는다. 확대 회차는
  // 몇 시간씩 돌아 기다리지 않는다(이미 게시한 회차만 담는다). 1분 안에 안 끝나면 그대로 담는다.
  // 항공기 위치는 지도를 보는 사람이 있을 때만 받는다. 저장 직전에 한 번 받아 기준시각과 맞춘다(점검은 30분 차이까지 허용).
  refreshBeforeCapture = () => adsbProcessor.process().catch(() => {}),
  drain = () => waitForCollectionIdle({ timeoutMs: 60_000, ignore: (type) => type.startsWith('kim_expanded_') }).catch(() => {}),
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
      await refreshBeforeCapture()
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
