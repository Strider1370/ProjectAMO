import test from 'node:test'
import assert from 'node:assert/strict'
import { createMapPersistence } from './mapPersistence.js'

const doc = (id, revision = 0, name = '지도') => ({ id, revision, name, kind: 'personal', groups: [], items: [] })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const turns = () => new Promise((resolve) => setTimeout(resolve, 5))
function fixture({ local = [], summaries = [], account = true } = {}) {
  const saved = new Map(), states = [], installed = [], requests = []
  const recovery = {
    listCompletedRecovery: async (key) => key === 'account:a' || !account ? local : [],
    listDraftRecovery: async () => [],
    saveCompletedRecovery: async (key, row) => { saved.set(key + ':' + row.id, structuredClone(row)); return { ok: true } },
    deleteCompletedRecovery: async () => ({ ok: true }), deleteDraftRecovery: async () => ({ ok: true }),
    saveDraftRecovery: async () => ({ ok: true }),
  }
  const api = {
    listMaps: async () => summaries,
    createMap: async (document) => { requests.push(['create', document]); return { ...document, revision: 1 } },
    updateMap: async (_id, { snapshot, expectedRevision }) => { requests.push(['update', snapshot]); return { ...snapshot, revision: expectedRevision + 1 } },
    deleteMap: async (id) => { requests.push(['delete', id]) },
  }
  const session = createMapPersistence({ scopeKey: account ? 'account:a' : 'guest:browser', account, api, recovery, saveDelayMs: 0,
    onInstall: (value) => installed.push(value), onState: (id, value) => states.push({ id, ...value }) })
  return { session, states, installed, requests, saved, api, recovery }
}

test('같은 revision의 미저장 복구본도 dirty로 다시 저장한다', async () => {
  const f = fixture({ local: [{ id: 'a', document: doc('a', 3, '미저장 변경'), dirty: true }], summaries: [{ id: 'a', revision: 3 }] })
  await f.session.start(); await f.session.flush('a'); await f.session.flushRecovery('a')
  assert.equal(f.requests[0][0], 'update')
  assert.equal(f.requests[0][1].name, '미저장 변경')
  assert.equal(f.saved.get('account:a:a').dirty, false)
  assert.equal(f.saved.get('account:a:a').document.revision, 4)
  f.session.dispose()
})

test('변경하지 않은 저장본도 공유용 flush에서 확정 문서와 revision을 반환한다', async () => {
  const original = doc('a', 3)
  const f = fixture({ local: [{ id: 'a', document: original, dirty: false }], summaries: [{ id: 'a', revision: 3 }] })
  await f.session.start()
  assert.deepEqual(await f.session.flush('a'), original)
  assert.equal(f.requests.length, 0)
  f.session.dispose()
})

test('새 서버 revision과 충돌한 복구본은 새 편집 후에도 재전송하지 않는다', async () => {
  const f = fixture({ local: [{ id: 'a', document: doc('a', 3), dirty: true }], summaries: [{ id: 'a', revision: 4 }] })
  await f.session.start()
  f.session.save(doc('a', 3, '충돌 이후 변경'))
  await f.session.flushRecovery('a'); await turns()
  assert.equal(f.states.at(-1).state, 'conflict')
  assert.equal(f.requests.length, 0)
  assert.equal(f.saved.get('account:a:a').document.name, '충돌 이후 변경')
  await assert.rejects(f.session.retry('a'))
  f.session.dispose()
})

test('서버에서 삭제된 기존 지도는 자동으로 다시 만들지 않는다', async () => {
  const f = fixture({ local: [{ id: 'a', document: doc('a', 3), dirty: false }] })
  await f.session.start(); await turns()
  assert.equal(f.states.at(-1).state, 'conflict')
  assert.equal(f.requests.length, 0)
  assert.equal(f.installed[0].id, 'a')
  f.session.dispose()
})

test('기기 저장 완료 표시는 최신 쓰기가 완료된 뒤에만 나온다', async () => {
  const f = fixture({ account: false }), pending = deferred()
  f.recovery.saveCompletedRecovery = () => pending.promise
  await f.session.start(); f.session.save(doc('guest'))
  await turns(); assert.equal(f.states.at(-1).state, 'dirty')
  pending.resolve({ ok: true }); await f.session.flushRecovery('guest')
  assert.equal(f.states.at(-1).state, 'localOnly')
  assert.equal(f.requests.length, 0)
  f.session.dispose()
})

test('계정 전환 후 이전 목록 응답은 문서를 설치하지 않는다', async () => {
  const f = fixture(), pending = deferred()
  f.api.listMaps = () => pending.promise
  const loading = f.session.start(); f.session.dispose()
  pending.resolve([{ id: 'old-account-map', revision: 1 }]); await loading
  assert.deepEqual(f.installed, [])
})
