const API = '/api/me/maps'
const RECOVERY_DB = 'projectamo-my-map-account-v1'
const COMPLETED = 'completed'
const DRAFTS = 'drafts'

const errorMessage = (status, code, limit) => {
  if (status === 413 && limit === 'documents') return '계정에는 지도 1개만 저장할 수 있습니다. 기존 지도를 수정하거나 삭제한 뒤 다시 시도하세요.'
  if (status === 413 && (code === 'map_too_large' || limit === 'account_bytes')) return '계정 지도 저장 한도는 5MB입니다. 지도 내용을 줄인 뒤 다시 시도하세요.'
  if (status === 413) return '지도 항목 또는 좌표 수 한도를 초과했습니다.'
  if (code === 'revision_conflict') return '다른 변경이 먼저 저장되었습니다. 자동으로 덮어쓰지 않았습니다.'
  if (status === 401 || status === 403) return '계정 권한을 확인할 수 없습니다.'
  return '지도 저장 요청을 처리하지 못했습니다.'
}

export class MapAccountError extends Error {
  constructor({ status = 0, code = 'map_request_failed', currentRevision = null, details = null } = {}) {
    super(errorMessage(status, code, details?.limit))
    this.name = 'MapAccountError'
    this.status = status
    this.code = code
    this.currentRevision = Number.isSafeInteger(currentRevision) ? currentRevision : null
    this.details = details
  }
}

async function request(path, init = {}, { signal, fetchImpl = globalThis.fetch } = {}) {
  let response
  try {
    response = await fetchImpl(`${API}${path}`, { credentials: 'include', signal, ...init })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new MapAccountError({ code: 'network_error', details: error })
  }
  let body = null
  try { body = await response.json() } catch { /* non-JSON failures still have an HTTP status */ }
  if (!response.ok) throw new MapAccountError({ status: response.status, code: body?.error, currentRevision: body?.currentRevision, details: body })
  return body
}

export async function listMaps(options = {}) {
  return (await request('/', {}, options)).maps ?? []
}

export async function getMap(id, options = {}) {
  return (await request(`/${encodeURIComponent(id)}`, {}, options)).document
}

export async function createMap(snapshot, options = {}) {
  return (await request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot }) }, options)).document
}

export async function updateMap(id, { expectedRevision, snapshot }, options = {}) {
  return (await request(`/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision, snapshot }) }, options)).document
}

export async function deleteMap(id, options = {}) {
  return request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }, options)
}

export function accountRecoveryKey({ accountId = null, guestId = null } = {}) {
  if (accountId != null && guestId == null && String(accountId)) return `account:${String(accountId)}`
  if (guestId != null && accountId == null && String(guestId)) return `guest:${String(guestId)}`
  throw new Error('accountId 또는 guestId 하나를 명시해야 합니다.')
}

function validAccountKey(accountKey) {
  return typeof accountKey === 'string' && /^(?:account|guest):.+/.test(accountKey)
}

const hasIndexedDb = () => typeof indexedDB !== 'undefined'

function openRecoveryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOVERY_DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(COMPLETED, { keyPath: 'key' })
      request.result.createObjectStore(DRAFTS, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function recoveryRecordKey(accountKey, id) {
  if (!validAccountKey(accountKey) || !id) throw new Error('명시적인 계정 복구 키와 문서 ID가 필요합니다.')
  return `${accountKey}\u0000${String(id)}`
}

function runStore(storeName, mode, action) {
  return openRecoveryDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const result = action(tx.objectStore(storeName))
    tx.oncomplete = () => { db.close(); resolve(result?.result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.onabort = () => { db.close(); reject(tx.error) }
  }))
}

async function save(storeName, accountKey, document) {
  if (!hasIndexedDb()) return { ok: false, error: new Error('이 브라우저에서는 복구본을 보관할 수 없습니다.') }
  try {
    const record = { key: recoveryRecordKey(accountKey, document?.id), accountKey, id: document.id, document, savedAt: Date.now() }
    await runStore(storeName, 'readwrite', (store) => store.put(record))
    return { ok: true }
  } catch (error) { return { ok: false, error } }
}

async function load(storeName, accountKey, id) {
  if (!hasIndexedDb()) return null
  try { return (await runStore(storeName, 'readonly', (store) => store.get(recoveryRecordKey(accountKey, id))))?.document ?? null } catch { return null }
}

async function list(storeName, accountKey) {
  if (!hasIndexedDb() || !validAccountKey(accountKey)) return []
  try {
    const prefix = `${accountKey}\u0000`
    const range = globalThis.IDBKeyRange?.bound(prefix, `${prefix}\uffff`)
    const rows = await runStore(storeName, 'readonly', (store) => store.getAll(range))
    return (rows ?? []).filter((row) => row.accountKey === accountKey).map((row) => row.document)
  } catch { return [] }
}

async function remove(storeName, accountKey, id) {
  if (!hasIndexedDb()) return { ok: false }
  try { await runStore(storeName, 'readwrite', (store) => store.delete(recoveryRecordKey(accountKey, id))); return { ok: true } } catch { return { ok: false } }
}

export const saveCompletedRecovery = (accountKey, document) => save(COMPLETED, accountKey, document)
export const loadCompletedRecovery = (accountKey, id) => load(COMPLETED, accountKey, id)
export const listCompletedRecovery = (accountKey) => list(COMPLETED, accountKey)
export const deleteCompletedRecovery = (accountKey, id) => remove(COMPLETED, accountKey, id)
export const saveDraftRecovery = (accountKey, document) => save(DRAFTS, accountKey, document)
export const loadDraftRecovery = (accountKey, id) => load(DRAFTS, accountKey, id)
export const listDraftRecovery = (accountKey) => list(DRAFTS, accountKey)
export const deleteDraftRecovery = (accountKey, id) => remove(DRAFTS, accountKey, id)
