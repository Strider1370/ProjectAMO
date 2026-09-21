import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MapAccountError,
  accountRecoveryKey,
  createMap,
  deleteMap,
  loadCompletedRecovery,
  getMap,
  listCompletedRecovery,
  listMaps,
  loadDraftRecovery,
  recoveryRecordKey,
  saveCompletedRecovery,
  saveDraftRecovery,
  updateMap,
} from './mapAccountStore.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function fakeIndexedDb() {
  const databases = new Map()
  return {
    open(name) {
      const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => {
        let database = databases.get(name)
        const upgrade = !database
        if (!database) {
          const stores = new Map()
          database = {
            createObjectStore(storeName) { stores.set(storeName, new Map()) },
            transaction(storeName) {
              const transaction = { oncomplete: null, onerror: null, onabort: null }
              transaction.objectStore = () => {
                const store = stores.get(storeName)
                const complete = () => queueMicrotask(() => transaction.oncomplete?.())
                return {
                  put(value) { store.set(value.key, structuredClone(value)); complete(); return { result: value.key } },
                  get(key) { const result = store.get(key); complete(); return { result: result && structuredClone(result) } },
                  getAll(range) {
                    const result = [...store.values()]
                      .filter((value) => !range || (value.key >= range.lower && value.key <= range.upper))
                      .map((value) => structuredClone(value))
                    complete()
                    return { result }
                  },
                  delete(key) { store.delete(key); complete(); return { result: undefined } },
                }
              }
              return transaction
            },
            close() {},
          }
          databases.set(name, database)
        }
        request.result = database
        if (upgrade) request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    },
  }
}

test('계정 지도 API는 세션 쿠키·취소 신호와 계약 경로를 사용한다', async () => {
  const calls = []
  const controller = new AbortController()
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (init.method === 'POST') return json({ document: { id: 'new', revision: 1 } }, 201)
    if (init.method === 'PUT') return json({ document: { id: 'a b', revision: 3 } })
    if (init.method === 'DELETE') return json({ ok: true })
    if (url.endsWith('/maps/')) return json({ maps: [{ id: 'a' }] })
    return json({ document: { id: 'a b', revision: 2 } })
  }

  assert.deepEqual(await listMaps({ fetchImpl, signal: controller.signal }), [{ id: 'a' }])
  assert.deepEqual(await getMap('a b', { fetchImpl }), { id: 'a b', revision: 2 })
  assert.deepEqual(await createMap({ id: 'new' }, { fetchImpl }), { id: 'new', revision: 1 })
  assert.deepEqual(await updateMap('a b', { expectedRevision: 2, snapshot: { id: 'a b' } }, { fetchImpl }), { id: 'a b', revision: 3 })
  assert.deepEqual(await deleteMap('a b', { fetchImpl }), { ok: true })

  assert.equal(calls[0].init.credentials, 'include')
  assert.equal(calls[0].init.signal, controller.signal)
  assert.equal(calls[1].url, '/api/me/maps/a%20b')
  assert.deepEqual(JSON.parse(calls[2].init.body), { snapshot: { id: 'new' } })
  assert.deepEqual(JSON.parse(calls[3].init.body), { expectedRevision: 2, snapshot: { id: 'a b' } })
})

test('저장 개수와 용량 제한을 구분해 안내한다', async () => {
  await assert.rejects(
    () => createMap({ id: 'second' }, { fetchImpl: async () => json({ error: 'map_limit_exceeded', limit: 'documents' }, 413) }),
    (error) => error.message.includes('지도 1개만'),
  )
  await assert.rejects(
    () => createMap({ id: 'big' }, { fetchImpl: async () => json({ error: 'map_too_large', limit: 'request_bytes' }, 413) }),
    (error) => error.message.includes('5MB'),
  )
})

test('413과 revision conflict는 호출자가 분기할 수 있는 오류로 변환한다', async () => {
  const tooLarge = async () => json({ error: 'map_too_large' }, 413)
  await assert.rejects(
    () => createMap({ id: 'big' }, { fetchImpl: tooLarge }),
    (error) => error instanceof MapAccountError && error.status === 413 && error.code === 'map_too_large',
  )

  const conflict = async () => json({ error: 'revision_conflict', currentRevision: 9 }, 409)
  await assert.rejects(
    () => updateMap('a', { expectedRevision: 1, snapshot: { id: 'a' } }, { fetchImpl: conflict }),
    (error) => error instanceof MapAccountError && error.status === 409 && error.currentRevision === 9,
  )
})

test('복구 키는 명시적 계정 또는 guest 범위에 묶이고, 보관소가 없으면 섞이지 않는다', async () => {
  const account = accountRecoveryKey({ accountId: 'u-1' })
  const other = accountRecoveryKey({ accountId: 'u-2' })
  const guest = accountRecoveryKey({ guestId: 'offline-1' })
  assert.equal(account, 'account:u-1')
  assert.equal(guest, 'guest:offline-1')
  assert.notEqual(recoveryRecordKey(account, 'same'), recoveryRecordKey(other, 'same'))
  assert.notEqual(recoveryRecordKey(account, 'same'), recoveryRecordKey(guest, 'same'))
  assert.throws(() => accountRecoveryKey({ accountId: 'u', guestId: 'g' }))

  const originalIndexedDb = globalThis.indexedDB
  const originalKeyRange = globalThis.IDBKeyRange
  globalThis.indexedDB = fakeIndexedDb()
  globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) }
  try {
    assert.equal((await saveCompletedRecovery(account, { id: 'same', title: 'account' })).ok, true)
    assert.equal((await saveCompletedRecovery(other, { id: 'same', title: 'other' })).ok, true)
    assert.equal((await saveDraftRecovery(guest, { id: 'same', title: 'guest draft' })).ok, true)
    assert.deepEqual(await loadCompletedRecovery(account, 'same'), { id: 'same', title: 'account' })
    assert.deepEqual(await listCompletedRecovery(other), [{ id: 'same', title: 'other' }])
    assert.deepEqual(await loadDraftRecovery(guest, 'same'), { id: 'same', title: 'guest draft' })
  } finally {
    if (originalIndexedDb === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = originalIndexedDb
    if (originalKeyRange === undefined) delete globalThis.IDBKeyRange
    else globalThis.IDBKeyRange = originalKeyRange
  }

  const saved = await saveCompletedRecovery(account, { id: 'same' })
  assert.equal(saved.ok, false)
  assert.equal(await loadDraftRecovery(guest, 'same'), null)
})
