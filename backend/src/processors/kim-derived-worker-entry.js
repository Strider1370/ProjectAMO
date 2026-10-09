// GKTG·권계면 계산 자식 프로세스. 부모(kim-derived-worker.js)가 일 하나를 주면 처리하고 결과를 보낸 뒤 끝난다.
//
// 기상청 API는 직접 부르지 않고 부모에게 받아 달라고 한다. 사용량 장부(api-hub-usage.json)와 실행 통계는
// 파일을 통째로 덮어쓰는 구조라 두 프로세스가 같이 쓰면 서로의 기록을 지우고, 하루 한도 차단도 부모의
// 메모리 장부에서만 정확하다.
import { fileURLToPath } from 'node:url'

// kim_map_responses: 착빙·구름 지도 응답을 시각별로 미리 만든다(kim-map-responses.js).
// kim_surface_chart: 확대 회차 강수 레이어(지상 일기도) 장을 시각별로 만든다(kim-surface-chart-expanded.js).
export const KIM_DERIVED_JOBS = ['kim_gktg', 'kim_tropopause', 'kim_map_responses', 'kim_surface_chart', 'kim_aci']

const loadProcessor = {
  kim_aci: () => import('./kim-aci-processor.js'),
  kim_gktg: () => import('./kim-gktg-processor.js'),
  kim_tropopause: () => import('./kim-tropopause-processor.js'),
  kim_map_responses: () => import('./kim-map-responses.js'),
  kim_surface_chart: () => import('./kim-surface-chart-expanded.js'),
}

export function errorPayload(error) {
  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    message: typeof error?.message === 'string' ? error.message : String(error),
    ...(typeof error?.code === 'string' ? { code: error.code } : {}),
  }
}

export function restoreError(payload) {
  const error = new Error(payload?.message || 'kim derived worker failed')
  if (payload?.name) error.name = payload.name
  if (payload?.code) error.code = payload.code
  return error
}

// 부모가 정할 수 있는 작업 인자(확대 영역 시각별 계산 등). IPC로 온 값이므로 모양을 확인하고 이것만 넘긴다.
export function jobOptions(options) {
  const out = {}
  if (options == null) return out
  if (typeof options !== 'object') throw new Error('invalid kim derived worker options')
  if (options.domain !== undefined) {
    if (!['kr', 'ea'].includes(options.domain)) throw new Error('invalid kim derived worker domain')
    out.domain = options.domain
  }
  if (options.tmfc !== undefined) {
    if (!/^\d{10}$/.test(String(options.tmfc))) throw new Error('invalid kim derived worker tmfc')
    out.tmfc = String(options.tmfc)
  }
  if (options.forecastHours !== undefined) {
    if (!Array.isArray(options.forecastHours) || !options.forecastHours.every(Number.isInteger)) throw new Error('invalid kim derived worker hours')
    out.forecastHours = [...options.forecastHours]
  }
  if (options.publish !== undefined) out.publish = options.publish === true
  return out
}

export function createWorkerSide({ send, load = loadProcessor }) {
  const controller = new AbortController()
  const pending = new Map()
  const turns = new Map()
  let nextId = 0

  const fetchGrid = ({ signal: _signal, ...params }) => new Promise((resolve, reject) => {
    if (controller.signal.aborted) return reject(controller.signal.reason)
    const id = ++nextId
    pending.set(id, { resolve, reject })
    Promise.resolve(send({ type: 'fetch', id, params })).catch((error) => {
      pending.delete(id)
      reject(error)
    })
  })

  // 무거운 계산 순번을 부모에게 받는다. 돌려받은 함수를 부르면 순번을 돌려준다.
  const turn = () => new Promise((resolve, reject) => {
    if (controller.signal.aborted) return reject(controller.signal.reason)
    const id = ++nextId
    turns.set(id, { resolve, reject })
    Promise.resolve(send({ type: 'turn', id })).catch((error) => {
      turns.delete(id)
      reject(error)
    })
  })

  function abort(reason = new Error('kim derived worker cancelled')) {
    if (controller.signal.aborted) return
    controller.abort(reason)
    for (const { reject } of [...pending.values(), ...turns.values()]) reject(reason)
    pending.clear()
    turns.clear()
  }

  function onMessage(message) {
    if (message?.type === 'turn_result') {
      const waiter = turns.get(message.id)
      if (!waiter) return
      turns.delete(message.id)
      let released = false
      const release = () => {
        if (released) return
        released = true
        Promise.resolve(send({ type: 'turn_release', id: message.id })).catch(() => {})
      }
      if (message.ok) waiter.resolve(release)
      else waiter.reject(restoreError(message.error))
    } else if (message?.type === 'fetch_result') {
      const waiter = pending.get(message.id)
      if (!waiter) return
      pending.delete(message.id)
      if (message.ok) waiter.resolve(message.text)
      else waiter.reject(restoreError(message.error))
    } else if (message?.type === 'abort') {
      abort()
    }
  }

  async function run(kind, options) {
    try {
      if (!KIM_DERIVED_JOBS.includes(kind)) throw new Error('invalid kim derived worker job')
      const processor = await load[kind]()
      const result = await processor.process({ ...jobOptions(options), signal: controller.signal, fetchGrid, turn })
      await send({ type: 'done', ok: true, result })
      return 0
    } catch (error) {
      try { await send({ type: 'done', ok: false, error: errorPayload(error) }) } catch {}
      return 1
    }
  }

  return { run, onMessage, abort, signal: controller.signal }
}

function runProcessWorker() {
  const send = (message) => new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') return reject(new Error('worker IPC unavailable'))
    process.send(message, (error) => (error ? reject(error) : resolve()))
  })
  const worker = createWorkerSide({ send })
  // SIGTERM에도 먼저 취소 신호를 돌려 Python 계산까지 끝내고 'cancelled' 기록을 남긴다.
  process.on('SIGTERM', () => worker.abort())
  process.on('message', async (message) => {
    if (message?.type !== 'job') return worker.onMessage(message)
    const exitCode = await worker.run(message.kind, message.options)
    process.disconnect?.()
    process.exit(exitCode)
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runProcessWorker()
