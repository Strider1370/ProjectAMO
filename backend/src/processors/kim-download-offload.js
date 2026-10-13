// 확대 영역 다운로드의 층 받기를 자식 프로세스(kim-download-worker.js)로 보낸다. collectKimNwpTask 자리에 쓰는
// collectTask를 돌려주며, 결과로 격자 대신 목록 항목(entry)을 준다(큰 배열은 프로세스 사이를 오가지 않는다).
//
// 기상청 요청은 자식이 부탁하면 여기(백엔드)서 fetchGrid로 한다. 자식이 죽거나 멈추면 처리 중인 층을 실패로
// 돌려 수집기의 기존 재시도가 다시 받게 하고, 다음 요청 때 자식을 새로 띄운다.
//
// 작업 스레드가 아니라 자식 프로세스인 이유: 운영 백엔드는 NODE_OPTIONS=--max-old-space-size=1400으로 뜨는데,
// 이 V8 옵션은 프로세스 전체에 걸려 작업 스레드의 resourceLimits(힙 한도)를 덮는다. 그래서 320 MB로 건 한도가
// 실제로는 1,424 MB였고, 2026-10-12·13 회차에서 다운로드 쪽이 최대 600~770 MB를 붙잡아 백엔드가 1 GB에 닿았다.
// 자식 프로세스는 명령줄 옵션이 NODE_OPTIONS보다 앞서므로 한도가 그대로 걸린다(GKTG 등 계산 자식과 같은 방식).
import { fork } from 'node:child_process'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { errorPayload, restoreError } from './kim-derived-worker-entry.js'

const ENTRY = fileURLToPath(new URL('./kim-download-worker.js', import.meta.url))

// 자식 힙 한도(MB). 동시에 받는 층 수만큼 격자를 들고 있으므로 동시 수에 맞춘다(동시 4개 → 320 MB).
// 2026-10-13 재연(8시각 연속, 동시 4개): 한도 1,424 MB에서 다운로드 쪽 힙 중간 330·최대 1,017 MB,
// 한도 344 MB에서 중간 169·최대 300 MB이고 걸린 시간은 같았다(323초 대 322초).
const CHILD_OLD_SPACE_MB = Number(process.env.KIM_DOWNLOAD_WORKER_HEAP_MB || 64 + 64 * Math.max(1, config.kim_expanded.concurrency || 4))

// 자식 프로세스를 작업 스레드와 같은 모양(on message/error/exit, postMessage, terminate)으로 감싼다.
// CPU 우선순위는 GKTG 등 계산 자식과 같게 낮춘다. 보통 우선순위면 코어 하나를 두고 다툴 때 약 9:1로 이겨,
// 2026-10-13 06 UTC 회차에서 받기가 5시각 앞서가는 동안 시각당 계산이 239초에서 302초로 밀렸다
// (다운로드 처리는 운영 서버에서 시각당 CPU 약 93초). 사이트 응답은 백엔드 본 프로세스가 맡으므로 영향이 없다.
export function forkKimDownloadChild({ forkImpl = fork, oldSpaceMb = CHILD_OLD_SPACE_MB, setPriority = os.setPriority, nice = config.kim_derived_worker.nice } = {}) {
  const child = forkImpl(ENTRY, [], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    execArgv: [`--max-old-space-size=${oldSpaceMb}`],
    serialization: 'advanced',
  })
  try { setPriority(child.pid, nice) } catch {}
  const handle = new EventEmitter()
  child.on('message', (message) => handle.emit('message', message))
  child.on('error', (error) => handle.emit('error', error))
  child.once('exit', (code, signal) => handle.emit('exit', code ?? signal))
  handle.postMessage = (message) => child.send(message)
  handle.terminate = () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    child.once('exit', () => resolve())
    try { child.kill() } catch { resolve() }
  })
  return handle
}

export function createKimDownloadOffload({ root = config.storage.base_path, fetchGrid = fetchKimGrid, signal,
  createWorker = () => forkKimDownloadChild() } = {}) {
  let worker = null
  let nextTask = 0
  const tasks = new Map()

  const failAll = (error) => {
    for (const { reject } of tasks.values()) reject(error)
    tasks.clear()
  }

  const start = () => {
    const current = createWorker()
    const reply = (message) => { try { current.postMessage(message) } catch {} }
    current.on('message', async (message) => {
      if (message?.type === 'fetch') {
        try {
          const text = await fetchGrid({ ...message.params, signal })
          reply({ type: 'fetch_result', id: message.id, text })
        } catch (error) {
          reply({ type: 'fetch_result', id: message.id, error: errorPayload(error) })
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
