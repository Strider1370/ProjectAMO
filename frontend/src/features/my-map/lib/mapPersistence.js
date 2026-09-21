import * as store from './mapAccountStore.js'
import { createMapSaveQueue } from './mapSaveQueue.js'

export const GUEST_MAP_SCOPE = 'guest:browser'
export const personalMapStub = (summary) => ({ ...summary, kind: 'personal', loaded: false, groups: [], items: [], source: null })
const conflictError = () => new store.MapAccountError({ status: 409, code: 'revision_conflict' })
const recoveryRecord = (value) => value?.document ? value : { id: value?.id, document: value, dirty: true }

// One instance belongs to one authenticated account or the browser's guest area.
// No asynchronous callback may install that instance's data into another account.
export function createMapPersistence({ scopeKey, account = false, onInstall, onAck, onState, onDrafts, onGuestMaps, onError, api = store, recovery = store, saveDelayMs = 600 }) {
  let disposed = false
  const controller = new AbortController()
  const blocked = new Map(), documents = new Map(), localWrites = new Map(), draftWrites = new Map()
  const drafts = new Map()
  const deleting = new Set()
  const alive = (callback, ...args) => { if (!disposed) callback?.(...args) }
  const install = (document) => { documents.set(document.id, document); alive(onInstall, document); return document }
  const writeCompleted = (document, state = {}) => recovery.saveCompletedRecovery(scopeKey, { id: document.id, document, ...state })
  const writeLocal = (document, metadata, notify = true) => {
    const snapshot = structuredClone(document)
    const task = (localWrites.get(document.id) ?? Promise.resolve()).then(async () => {
      const result = await writeCompleted(snapshot, metadata)
      if (notify && documents.get(document.id) === document) alive(onState, document.id, { state: result.ok ? (metadata.conflict ? 'conflict' : 'localOnly') : 'error', error: result.error ?? null, revision: document.revision })
      if (!result.ok && !notify) alive(onError, '이 기기에 지도 복구본을 보관하지 못했습니다.')
      return result
    })
    localWrites.set(document.id, task)
    return task
  }
  const queue = account ? createMapSaveQueue({
    delayMs: saveDelayMs,
    transport: { create: api.createMap, update: api.updateMap },
    writeRecovery: writeCompleted,
    onState: (id, value) => {
      alive(onState, id, value)
    },
    onAck: (id, ack) => {
      const current = documents.get(id)
      if (current) documents.set(id, ack.isCurrent ? ack.document : { ...current, revision: ack.document.revision, createdAt: ack.document.createdAt })
      alive(onAck, id, ack)
    },
  }) : null

  const save = (document) => {
    if (disposed || deleting.has(document.id)) return
    documents.set(document.id, document)
    if (blocked.has(document.id)) {
      alive(onState, document.id, { state: 'conflict', error: blocked.get(document.id), revision: document.revision })
      // A latched conflict keeps accepting local edits without retrying a PUT.
      void writeLocal(document, { dirty: true, conflict: true }, false)
    } else if (queue) queue.enqueue(document)
    else {
      alive(onState, document.id, { state: 'dirty', error: null, revision: document.revision })
      void writeLocal(document, { dirty: false })
    }
  }

  return {
    async start() {
      const [local, savedDrafts, guests, remote] = await Promise.all([
        recovery.listCompletedRecovery(scopeKey), recovery.listDraftRecovery(scopeKey),
        account ? recovery.listCompletedRecovery(GUEST_MAP_SCOPE) : [],
        account ? api.listMaps({ signal: controller.signal }).then((maps) => ({ maps }), (error) => ({ error })) : { maps: [] },
      ])
      if (disposed) return
      for (const draft of savedDrafts) drafts.set(draft.id, draft)
      alive(onDrafts, Object.fromEntries(drafts))
      alive(onGuestMaps, guests.map(recoveryRecord).filter((row) => row.document?.kind === 'personal').map(({ document }) => ({ id: document.id, name: document.name, itemCount: document.items.length })))
      if (remote.error) alive(onError, '계정 지도 목록을 불러오지 못했습니다. 이 기기의 복구본을 표시합니다.')
      const summaries = new Map((remote.maps ?? []).map((summary) => [summary.id, summary]))
      for (const value of local) {
        const row = recoveryRecord(value), document = row.document
        if (!document?.id || document.kind !== 'personal') continue
        const summary = summaries.get(document.id)
        summaries.delete(document.id)
        if (!account) {
          install(document); alive(onState, document.id, { state: 'localOnly', revision: document.revision, error: null }); continue
        }
        if (summary && !row.dirty && !row.conflict && summary.revision > document.revision) {
          install(personalMapStub(summary)); continue
        }
        install(document)
        const conflict = row.conflict || (!remote.error && (summary ? summary.revision !== document.revision : document.revision > 0))
        if (conflict) {
          const error = conflictError(); blocked.set(document.id, error)
          alive(onState, document.id, { state: 'conflict', error, revision: document.revision })
        } else if (row.dirty || (!summary && !remote.error)) save(document)
        else alive(onState, document.id, { state: remote.error ? 'offline' : 'synced', error: remote.error ?? null, revision: document.revision })
      }
      for (const summary of summaries.values()) install(personalMapStub(summary))
    },
    save,
    async load(id) {
      if (deleting.has(id)) return null
      const existing = documents.get(id)
      if (existing && existing.loaded !== false) return existing
      if (!account) return null
      const document = await api.getMap(id, { signal: controller.signal })
      if (disposed || deleting.has(id)) return null
      install(document)
      await writeLocal(document, { dirty: false }, false)
      alive(onState, id, { state: 'synced', error: null, revision: document.revision })
      return disposed ? null : document
    },
    async remove(document) {
      if (deleting.has(document.id)) return false
      deleting.add(document.id)
      try {
      await queue?.cancel(document.id)
      await localWrites.get(document.id)
      await draftWrites.get(document.id)
      if (disposed) return false
      if (account) {
        try { await api.deleteMap(document.id, { signal: controller.signal }) }
        catch (error) { if (error.status !== 404) throw error }
      }
      const result = await recovery.deleteCompletedRecovery(scopeKey, document.id)
      if (!result.ok) throw new Error('이 기기의 복구본을 삭제하지 못했습니다.')
      await recovery.deleteDraftRecovery(scopeKey, document.id)
      documents.delete(document.id); blocked.delete(document.id); drafts.delete(document.id)
      alive(onDrafts, Object.fromEntries(drafts))
      return !disposed
      } catch (error) { deleting.delete(document.id); throw error }
    },
    retry(id) {
      if (blocked.has(id)) return Promise.reject(blocked.get(id))
      if (queue) {
        const document = documents.get(id)
        if (document && document.loaded !== false) queue.enqueue(document)
        return queue.retry(id)
      }
      const document = documents.get(id)
      return document ? writeLocal(document, { dirty: false }) : Promise.resolve()
    },
    async flush(id) {
      if (blocked.has(id)) throw blocked.get(id)
      if (queue) return (await queue.flush(id)) ?? documents.get(id) ?? null
      const result = await localWrites.get(id)
      if (result?.ok === false) throw result.error ?? new Error('기기에 저장하지 못했습니다.')
      return documents.get(id)
    },
    async flushRecovery(id) {
      await queue?.flushRecovery(id)
      const result = await localWrites.get(id)
      if (result?.ok === false) throw result.error ?? new Error('복구 사본을 보관하지 못했습니다.')
      return result
    },
    async openServer(id) {
      await queue?.cancel(id)
      await localWrites.get(id)
      const document = await api.getMap(id, { signal: controller.signal })
      if (disposed) return null
      blocked.delete(id); install(document)
      await writeLocal(document, { dirty: false }, false)
      alive(onState, id, { state: 'synced', error: null, revision: document.revision })
      return document
    },
    async guestDocument(id) {
      const value = await recovery.loadCompletedRecovery(GUEST_MAP_SCOPE, id)
      return disposed ? null : recoveryRecord(value)?.document ?? null
    },
    writeDraft(id, value) {
      if (deleting.has(id)) return Promise.resolve({ ok: false })
      const snapshot = value ? structuredClone(value) : null
      const task = (draftWrites.get(id) ?? Promise.resolve()).then(async () => {
        const result = snapshot ? await recovery.saveDraftRecovery(scopeKey, snapshot) : await recovery.deleteDraftRecovery(scopeKey, id)
        if (!result.ok) alive(onError, '진행 중인 그리기의 복구본을 보관하지 못했습니다.')
        if (result.ok && !snapshot && drafts.delete(id)) alive(onDrafts, Object.fromEntries(drafts))
        return result
      })
      draftWrites.set(id, task)
      return task
    },
    consumeDraft(id) { drafts.delete(id); alive(onDrafts, Object.fromEntries(drafts)) },
    async discardDraft(id) {
      const result = await this.writeDraft(id, null)
      if (result.ok) { drafts.delete(id); alive(onDrafts, Object.fromEntries(drafts)) }
      return result
    },
    dispose() { disposed = true; controller.abort(); queue?.dispose() },
  }
}
