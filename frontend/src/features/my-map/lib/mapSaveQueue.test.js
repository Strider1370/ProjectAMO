import test from 'node:test'
import assert from 'node:assert/strict'

import { createMapSaveQueue } from './mapSaveQueue.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject })
  return { promise, resolve, reject }
}

async function turns(count = 2) {
  for (let index = 0; index < count; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const document = (id, revision = 0, title = '첫 지도') => ({ id, revision, title, kind: 'personal', groups: [], items: [] })

test('진행 중 새 편집은 이전 응답으로 synced 되지 않고 ACK revision으로 다음 PUT을 보낸다', async () => {
  const first = deferred()
  const second = deferred()
  const creates = []
  const updates = []
  const acknowledgements = []
  const states = []
  const queue = createMapSaveQueue({
    delayMs: 0,
    transport: {
      create: (snapshot) => { creates.push(snapshot); return first.promise },
      update: (id, payload) => { updates.push({ id, payload }); return second.promise },
    },
    onAck: (id, ack) => acknowledgements.push({ id, ...ack }),
    onState: (id, value) => states.push({ id, ...value }),
  })

  queue.enqueue(document('map-1', 0, 'v1'))
  await turns()
  assert.equal(creates.length, 1)
  queue.enqueue(document('map-1', 0, 'v2'))
  const completed = queue.flush('map-1')
  first.resolve(document('map-1', 1, 'server-v1'))
  await turns(3)
  assert.equal(acknowledgements[0].generation, 1)
  assert.equal(acknowledgements[0].isCurrent, false)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].payload.expectedRevision, 1)
  assert.equal(updates[0].payload.snapshot.title, 'v2')
  assert.equal(states.filter((state) => state.state === 'synced').length, 0)

  second.resolve(document('map-1', 2, 'server-v2'))
  assert.deepEqual(await completed, document('map-1', 2, 'server-v2'))
  assert.equal(acknowledgements.at(-1).isCurrent, true)
  assert.equal(states.at(-1).state, 'synced')
})

test('409은 conflict로 남기며 자동 덮어쓰기와 retry를 막는다', async () => {
  const conflict = Object.assign(new Error('conflict'), { status: 409, code: 'revision_conflict' })
  const updates = []
  const states = []
  const queue = createMapSaveQueue({
    delayMs: 0,
    transport: { create: async () => { throw new Error('unexpected create') }, update: async (...args) => { updates.push(args); throw conflict } },
    onState: (_id, value) => states.push(value),
  })
  queue.enqueue(document('map-2', 3))
  await assert.rejects(() => queue.flush('map-2'), (error) => error === conflict)
  assert.equal(updates.length, 1)
  assert.equal(states.at(-1).state, 'conflict')
  await assert.rejects(() => queue.retry('map-2'), (error) => error === conflict)
  queue.enqueue(document('map-2', 3, 'conflict 이후 편집'))
  await turns(3)
  await assert.rejects(() => queue.flush('map-2'), (error) => error === conflict)
  assert.equal(updates.length, 1)
})

test('dispose 뒤에도 캡처된 계정의 최신 복구 쓰기는 마친다', async () => {
  const first = deferred(), saved = []
  const queue = createMapSaveQueue({
    transport: { create: () => new Promise(() => {}), update: async () => null },
    writeRecovery: async (snapshot) => { if (!saved.length) await first.promise; saved.push(snapshot.title); return { ok: true } },
  })
  queue.enqueue(document('last', 0, 'first'))
  await turns()
  queue.enqueue(document('last', 0, 'latest'))
  queue.dispose(); first.resolve()
  await queue.flushRecovery('last')
  assert.deepEqual(saved, ['first', 'latest'])
})

test('유효하지 않은 서버 ACK를 저장 성공으로 보고하지 않는다', async () => {
  const states = []
  const queue = createMapSaveQueue({ delayMs: 0, transport: { create: async () => undefined, update: async () => null }, onState: (_id, value) => states.push(value) })
  queue.enqueue(document('bad'))
  await assert.rejects(queue.flush('bad'), /응답/)
  assert.equal(states.at(-1).state, 'error')
  assert.equal(states.some((value) => value.state === 'synced'), false)
})

test('지도 cancel은 서버 응답을 기다리고 늦은 ACK를 화면에 반영하지 않는다', async () => {
  const request = deferred(), acknowledgements = []
  const queue = createMapSaveQueue({ delayMs: 0, transport: { create: () => request.promise, update: async () => null }, onAck: (...args) => acknowledgements.push(args) })
  queue.enqueue(document('deleted'))
  await turns()
  let done = false
  const cancelled = queue.cancel('deleted').then(() => { done = true })
  await turns(); assert.equal(done, false)
  request.resolve(document('deleted', 1)); await cancelled
  assert.equal(acknowledgements.length, 0)
})

test('실패한 저장은 retry에서 같은 ACK revision으로 다시 시도한다', async () => {
  const failure = new Error('temporary failure')
  const updates = []
  let attempt = 0
  const queue = createMapSaveQueue({
    delayMs: 0,
    transport: {
      create: async () => { throw new Error('unexpected create') },
      update: async (_id, payload) => {
        updates.push(payload)
        attempt += 1
        if (attempt === 1) throw failure
        return document('map-3', 5, 'saved')
      },
    },
  })
  queue.enqueue(document('map-3', 4, 'changed'))
  await assert.rejects(() => queue.flush('map-3'), (error) => error === failure)
  assert.deepEqual(await queue.retry('map-3'), document('map-3', 5, 'saved'))
  assert.equal(updates.length, 2)
  assert.equal(updates[0].expectedRevision, 4)
  assert.equal(updates[1].expectedRevision, 4)
})

test('dispose는 진행 요청을 취소하고 늦은 응답의 콜백을 막는다', async () => {
  const pending = deferred()
  let signal
  const acknowledgements = []
  const states = []
  const queue = createMapSaveQueue({
    delayMs: 0,
    transport: { create: (_document, options) => { signal = options.signal; return pending.promise }, update: async () => null },
    onAck: (_id, value) => acknowledgements.push(value),
    onState: (_id, value) => states.push(value),
  })
  queue.enqueue(document('map-4'))
  await turns()
  const beforeDispose = states.length
  const waiting = queue.flush('map-4')
  queue.dispose()
  assert.equal(signal.aborted, true)
  await assert.rejects(() => waiting, (error) => error.name === 'AbortError')
  pending.resolve(document('map-4', 1))
  await turns()
  assert.equal(acknowledgements.length, 0)
  assert.equal(states.length, beforeDispose)
})

test('복구 저장이 { ok: false }를 돌려도 서버 ACK와 별개로 상태에 남는다', async () => {
  const states = []
  const recoveryFailure = new Error('recovery unavailable')
  const queue = createMapSaveQueue({
    delayMs: 0,
    transport: { create: async () => document('map-5', 1), update: async () => null },
    writeRecovery: async () => ({ ok: false, error: recoveryFailure }),
    onState: (_id, value) => states.push(value),
  })
  queue.enqueue(document('map-5'))
  await queue.flush('map-5')
  await turns()
  assert.equal(states.at(-1).state, 'synced')
  assert.equal(states.at(-1).error, recoveryFailure)
})

test('늦은 이전 복구 쓰기 뒤에도 최신 generation 복구본이 마지막에 기록된다', async () => {
  const firstRecovery = deferred()
  const server = deferred()
  const writes = []
  const queue = createMapSaveQueue({
    delayMs: 0,
    transport: { create: () => server.promise, update: async () => null },
    writeRecovery: (snapshot) => {
      writes.push(snapshot)
      return writes.length === 1 ? firstRecovery.promise : Promise.resolve({ ok: true })
    },
  })
  queue.enqueue(document('map-6', 0, 'old'))
  await turns()
  assert.equal(writes.length, 1)
  queue.enqueue(document('map-6', 0, 'new'))
  await turns()
  assert.equal(writes.length, 1)
  firstRecovery.resolve({ ok: true })
  await turns(3)
  assert.equal(writes.length, 2)
  assert.equal(writes[0].title, 'old')
  assert.equal(writes[1].title, 'new')
  queue.dispose()
})

test('ACK revision은 최신 로컬 문서의 복구본에 병합하고 서버 본문은 덮어쓰지 않는다', async () => {
  const writes = []
  const queue = createMapSaveQueue({
    delayMs: 0,
    transport: { create: async () => document('map-7', 1, 'server older value'), update: async () => null },
    writeRecovery: async (snapshot) => { writes.push(snapshot); return { ok: true } },
  })
  queue.enqueue(document('map-7', 0, 'local newest value'))
  await queue.flush('map-7')
  await turns(3)
  assert.equal(writes.at(-1).revision, 1)
  assert.equal(writes.at(-1).title, 'local newest value')
})

test('429 retry delay also applies to new edits and explicit retry', async () => {
  let attempts=0
  const queue=createMapSaveQueue({delayMs:0,transport:{create:async document=>{
    attempts++
    if(attempts===1) throw Object.assign(new Error('limited'),{status:429,retryAfterSeconds:1})
    return {...document,revision:1}
  },update:async()=>{throw Error('unexpected')}}})
  try {
    queue.enqueue({id:'limited',revision:0,name:'first'})
    await new Promise(resolve=>setTimeout(resolve,30))
    queue.enqueue({id:'limited',revision:0,name:'latest'})
    const pending=queue.retry('limited')
    await new Promise(resolve=>setTimeout(resolve,30))
    assert.equal(attempts,1)
    assert.equal((await pending).name,'latest')
    assert.equal(attempts,2)
  } finally { queue.dispose() }
})
