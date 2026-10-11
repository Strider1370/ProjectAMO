// 확대 영역 다운로드의 층 받기를 작업 스레드(kim-download-worker.js)로 보낸다. collectKimNwpTask 자리에 쓰는
// collectTask를 돌려주며, 결과로 격자 대신 목록 항목(entry)을 준다(큰 배열은 스레드 사이를 오가지 않는다).
//
// 기상청 요청은 작업 스레드가 부탁하면 여기(본 스레드)서 fetchGrid로 한다. 작업 스레드가 죽거나 멈추면 처리 중인
// 층을 실패로 돌려 수집기의 기존 재시도가 다시 받게 하고, 다음 요청 때 스레드를 새로 띄운다.
import { Worker } from 'node:worker_threads'
import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { errorPayload, restoreError } from './kim-derived-worker-entry.js'

const ENTRY = new URL('./kim-download-worker.js', import.meta.url)

// 작업 스레드 힙 한도(MB). 동시에 받는 층 수만큼 격자를 들고 있으므로 동시 수에 맞춘다(동시 4개 → 320 MB).
// 2026-10-11 재연(한 시각 22층, 동시 4개): 본 스레드에서 할 때 회차 중 +400 MB, 작업 스레드 한도 256/320/384 MB에서
// +301/+342/+387 MB(한도가 있어 정리가 잦다). 동시 8개는 384 MB에서 부족, 512 MB에서 됐다.
const WORKER_OLD_SPACE_MB = Number(process.env.KIM_DOWNLOAD_WORKER_HEAP_MB || 64 + 64 * Math.max(1, config.kim_expanded.concurrency || 4))

export function createKimDownloadOffload({ root = config.storage.base_path, fetchGrid = fetchKimGrid, signal,
  createWorker = () => new Worker(ENTRY, { resourceLimits: { maxOldGenerationSizeMb: WORKER_OLD_SPACE_MB, maxYoungGenerationSizeMb: 16 } }) } = {}) {
  let worker = null
  let nextTask = 0
  const tasks = new Map()

  const failAll = (error) => {
    for (const { reject } of tasks.values()) reject(error)
    tasks.clear()
  }

  const start = () => {
    const current = createWorker()
    current.on('message', async (message) => {
      if (message?.type === 'fetch') {
        try {
          const text = await fetchGrid({ ...message.params, signal })
          current.postMessage({ type: 'fetch_result', id: message.id, text })
        } catch (error) {
          current.postMessage({ type: 'fetch_result', id: message.id, error: errorPayload(error) })
        }
        return
      }
      if (message?.type !== 'task_result') return
      const pending = tasks.get(message.id)
      tasks.delete(message.id)
      if (!pending) return
      if (message.error) pending.reject(restoreError(message.error))
      else pending.resolve({ entry: message.entry, reused: message.reused, lastError: message.lastError ? restoreError(message.lastError) : null })
    })
    const lost = (reason) => {
      if (worker !== current) return
      worker = null
      const error = new Error(`kim_download_worker_${reason}`)
      error.code = 'kim_download_worker_lost'
      failAll(error)
    }
    current.on('error', (error) => lost(`error: ${error?.message || error}`.slice(0, 120)))
    current.on('exit', (code) => lost(`exit_${code}`))
    worker = current
    return current
  }

  const collectTask = ({ task }) => {
    if (signal?.aborted) return Promise.reject(signal.reason)
    const current = worker || start()
    return new Promise((resolve, reject) => {
      const id = ++nextTask
      tasks.set(id, { resolve, reject })
      current.postMessage({ type: 'task', id, task, root })
    })
  }

  const close = async () => {
    const current = worker
    worker = null
    const error = new Error('kim_download_worker_closed')
    error.code = 'kim_download_worker_closed'
    failAll(error)
    if (current) await current.terminate()
  }

  return { collectTask, close }
}
