// 이용자가 올린 지도 파일을 브라우저에 보관한다.
//
// 원본 바이트를 그대로 둔다. 맥케이 파일은 원본 1.8MB인데 풀면 15.8MB고 지도용으로
// 바꾸면 더 커진다. 원본만 두고 켤 때마다 다시 푸는 편이 낫다 — 그 비용이 0.8초다.
//
// 큰 파일은 IndexedDB에, 목록은 localStorage에 둔다. 패널을 열 때 목록만 바로 읽으면
// 되기 때문이다. 같은 구조를 features/monitoring/lib/monitoringSlideshow.js가 이미 쓴다.
const LIST_KEY = 'my_map_files'
const DB_NAME = 'projectamo-my-map'
const STORE = 'files'
const GUEST_SCOPE = 'guest:browser'
const listKey = (scopeKey) => !scopeKey || scopeKey === GUEST_SCOPE ? LIST_KEY : `${LIST_KEY}:${scopeKey}`
const fileKey = (scopeKey, id) => !scopeKey || scopeKey === GUEST_SCOPE ? id : `${scopeKey}\u0000${id}`

const hasLocalStorage = () => {
  try { return typeof window !== 'undefined' && !!window.localStorage } catch { return false }
}
const hasIndexedDb = () => typeof indexedDB !== 'undefined'

export function normalizeFileList(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object' && x.id && x.name)
    .map((x) => ({
      id: String(x.id),
      name: String(x.name),
      size: Number.isFinite(x.size) ? x.size : 0,
      addedAt: Number.isFinite(x.addedAt) ? x.addedAt : 0,
    }))
}

export function listMyMapFiles(scopeKey = GUEST_SCOPE) {
  if (!hasLocalStorage()) return []
  try {
    const raw = JSON.parse(window.localStorage.getItem(listKey(scopeKey)) ?? 'null')
    return normalizeFileList(raw?.files)
  } catch { return [] }
}

function writeList(files, scopeKey) {
  if (!hasLocalStorage()) return false
  try {
    window.localStorage.setItem(listKey(scopeKey), JSON.stringify({ version: 1, files }))
    return true
  } catch { return false }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runTransaction(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const result = run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(result?.result)
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveMyMapFile(file, { id: requestedId, scopeKey = GUEST_SCOPE } = {}) {
  if (!file) return { ok: false, error: new Error('파일이 없습니다.') }
  if (!hasIndexedDb()) return { ok: false, error: new Error('이 브라우저에서는 파일을 보관할 수 없습니다.') }
  const id = requestedId ?? (globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}`)
  try {
    const buffer = await file.arrayBuffer()
    const db = await openDb()
    await runTransaction(db, 'readwrite', (store) => store.put(buffer, fileKey(scopeKey, id)))
    db.close()
    const entry = { id, name: String(file.name ?? ''), size: Number(file.size ?? 0), addedAt: Date.now() }
    if (!writeList([...listMyMapFiles(scopeKey).filter((f) => f.id !== id), entry], scopeKey)) {
      return { ok: false, error: new Error('파일 목록을 보관하지 못했습니다.') }
    }
    return { ok: true, entry }
  } catch (error) {
    // 자리가 부족한 것이 가장 흔한 실패다. 호출부는 이걸 받아도 이번에 연 파일은
    // 계속 보여준다 — 보관 실패가 표시 실패가 되면 안 된다.
    return { ok: false, error }
  }
}

export async function loadMyMapFile(id, scopeKey = GUEST_SCOPE) {
  if (!hasIndexedDb()) return { ok: false, buffer: null }
  try {
    const db = await openDb()
    const buffer = await runTransaction(db, 'readonly', (store) => store.get(fileKey(scopeKey, id)))
    db.close()
    return buffer ? { ok: true, buffer } : { ok: false, buffer: null }
  } catch { return { ok: false, buffer: null } }
}

export async function deleteMyMapFile(id, scopeKey = GUEST_SCOPE) {
  if (!hasIndexedDb()) return { ok: false }
  try {
    const previous = listMyMapFiles(scopeKey)
    if (!writeList(previous.filter((f) => f.id !== id), scopeKey)) return { ok: false }
    let db = null
    // 목록을 먼저 지우므로 DB 열기 실패까지 되돌려야 원본에 다시 접근할 수 있다.
    try {
      db = await openDb()
      await runTransaction(db, 'readwrite', (store) => store.delete(fileKey(scopeKey, id)))
    } catch (error) { writeList(previous, scopeKey); throw error }
    finally { db?.close() }
    return { ok: true }
  } catch { return { ok: false } }
}
