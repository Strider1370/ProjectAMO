function abortError() {
  const error = new Error('저장 큐가 종료되었습니다.')
  error.name = 'AbortError'
  return error
}

function statePayload(record, state, error = record.error) {
  return { state, revision: record.ackRevision, error: error ?? record.recoveryError ?? null }
}

function offline(error) {
  return error?.code === 'network_error' || error?.name === 'TypeError'
}

export function createMapSaveQueue({ transport, writeRecovery = async () => true, onState = () => {}, onAck = () => {}, delayMs = 600 } = {}) {
  if (!transport?.create || !transport?.update) throw new Error('create/update transport가 필요합니다.')
  const records = new Map()
  let disposed = false
  let epoch = 0

  const notify = (record, state, error) => {
    if (!disposed) onState(record.id, statePayload(record, state, error))
  }
  const settleWaiters = (record) => {
    for (const waiter of [...record.waiters]) {
      if (record.state === 'conflict' || record.state === 'error' || record.state === 'offline') {
        record.waiters.delete(waiter); waiter.reject(record.error ?? new Error('저장에 실패했습니다.')); continue
      }
      if (record.ackGeneration >= waiter.generation && !record.inFlight && record.generation === record.ackGeneration) {
        record.waiters.delete(waiter); waiter.resolve(record.ackDocument)
      }
    }
  }
  const schedule = (record, immediate = false) => {
    if (disposed || record.cancelled || record.conflict || record.inFlight || record.generation <= record.ackGeneration) return
    if (record.timer) {
      if (!immediate) return
      clearTimeout(record.timer)
      record.timer = null
    }
    const run = () => { record.timer = null; drive(record) }
    record.timer = setTimeout(run, immediate ? 0 : delayMs)
  }
  const drive = async (record) => {
    if (disposed || record.cancelled || record.conflict || record.inFlight || record.generation <= record.ackGeneration) return
    const generation = record.generation
    const document = record.document
    const requestEpoch = epoch
    const controller = new AbortController()
    let finishRequest
    const done = new Promise((resolve) => { finishRequest = resolve })
    record.inFlight = { generation, controller, done }
    record.state = 'saving'; record.error = null
    notify(record, 'saving')
    try {
      const response = record.ackRevision == null || record.ackRevision === 0
        ? await transport.create(document, { signal: controller.signal })
        : await transport.update(record.id, { expectedRevision: record.ackRevision, snapshot: document }, { signal: controller.signal })
      if (disposed || record.cancelled || requestEpoch !== epoch) return
      if (response?.id !== record.id || !Number.isSafeInteger(response?.revision) || response.revision !== (record.ackRevision || 0) + 1) throw new Error('서버의 지도 저장 응답을 확인할 수 없습니다.')
      record.inFlight = null
      record.ackDocument = response
      record.ackRevision = response?.revision
      record.ackGeneration = generation
      // 서버 응답은 최신 로컬 편집보다 오래됐을 수 있다. 현재 문서 내용은 유지하고
      // 서버가 확정한 revision만 복구본에 반영한다.
      record.document = { ...record.document, revision: record.ackRevision, createdAt: response.createdAt ?? record.document.createdAt }
      queueRecovery(record, record.document)
      const isCurrent = record.generation === generation
      onAck(record.id, { document: response, generation, isCurrent })
      if (isCurrent) {
        record.state = 'synced'; notify(record, 'synced')
      } else {
        record.state = 'dirty'; notify(record, 'dirty'); schedule(record, true)
      }
      settleWaiters(record)
    } catch (error) {
      if (disposed || record.cancelled || requestEpoch !== epoch || error?.name === 'AbortError') return
      record.inFlight = null
      record.error = error
      record.state = error?.status === 409 || error?.code === 'revision_conflict' ? 'conflict' : offline(error) ? 'offline' : 'error'
      record.conflict = record.state === 'conflict'
      queueRecovery(record, record.document)
      notify(record, record.state, error)
      settleWaiters(record)
    } finally {
      finishRequest()
    }
  }
  const queueRecovery = (record, document) => {
    const generation = record.generation
    const requestEpoch = epoch
    const recoveryDocument = structuredClone(document)
    const recoveryState = { dirty: record.generation > record.ackGeneration, conflict: Boolean(record.conflict) }
    record.recoveryChain = record.recoveryChain.then(async () => {
      // writeRecovery는 생성 시 캡처한 계정에 묶인다. 계정 전환 후에도 이미 접수한
      // 최신 편집의 로컬 쓰기는 끝내되 이전 화면으로 상태 콜백을 보내지 않는다.
      try {
        const result = await writeRecovery(recoveryDocument, recoveryState)
        if (result === false || result?.ok === false) throw result?.error ?? new Error('복구본을 보관하지 못했습니다.')
        if (!disposed && !record.cancelled && requestEpoch === epoch && generation === record.generation) record.recoveryError = null
      } catch (error) {
        if (!disposed && !record.cancelled && requestEpoch === epoch && generation === record.generation) {
          record.recoveryError = error
          notify(record, record.state, error)
        }
      }
    })
  }
  const get = (id) => records.get(id)
  const flush = (id) => {
    const record = get(id)
    if (disposed) return Promise.reject(abortError())
    if (!record || record.generation === record.ackGeneration) return Promise.resolve(record?.ackDocument ?? null)
    if (record.state === 'conflict' || record.state === 'error' || record.state === 'offline') return Promise.reject(record.error)
    const result = new Promise((resolve, reject) => record.waiters.add({ generation: record.generation, resolve, reject }))
    schedule(record, true)
    return result
  }

  return {
    enqueue(document) {
      if (disposed) throw abortError()
      if (!document?.id) throw new Error('저장할 지도 ID가 필요합니다.')
      let record = get(document.id)
      if (!record) {
        record = { id: document.id, document: null, generation: 0, ackGeneration: 0, ackRevision: Number.isSafeInteger(document.revision) ? document.revision : 0, ackDocument: null, state: document.revision > 0 ? 'dirty' : 'local', error: null, recoveryError: null, inFlight: null, timer: null, waiters: new Set(), recoveryChain: Promise.resolve() }
        records.set(record.id, record)
      }
      record.document = document
      record.generation += 1
      for (const waiter of record.waiters) waiter.generation = record.generation
      record.state = record.conflict ? 'conflict' : record.ackRevision > 0 ? 'dirty' : 'local'
      if (!record.conflict) record.error = null
      notify(record, record.state)
      queueRecovery(record, document)
      schedule(record)
      return record.generation
    },
    flush,
    async flushRecovery(id) {
      const record = get(id)
      await record?.recoveryChain
      if (record?.recoveryError) throw record.recoveryError
    },
    cancel(id) {
      const record = get(id)
      if (!record) return Promise.resolve()
      record.cancelled = true
      if (record.timer) clearTimeout(record.timer)
      for (const waiter of record.waiters) waiter.reject(abortError())
      records.delete(id)
      // 삭제 요청은 진행 중 POST/PUT 응답 뒤에 보내야 서버에서 재생성되지 않는다.
      return Promise.all([record.recoveryChain, record.inFlight?.done])
    },
    retry(id) {
      const record = get(id)
      if (disposed) return Promise.reject(abortError())
      if (!record) return Promise.resolve(null)
      if (record.state === 'conflict') return Promise.reject(record.error)
      record.error = null
      record.state = record.ackRevision > 0 ? 'dirty' : 'local'
      notify(record, record.state)
      schedule(record, true)
      return flush(id)
    },
    dispose() {
      if (disposed) return
      disposed = true; epoch += 1
      for (const record of records.values()) {
        if (record.timer) clearTimeout(record.timer)
        record.inFlight?.controller.abort()
        for (const waiter of record.waiters) waiter.reject(abortError())
        record.waiters.clear()
      }
    },
  }
}
