import { assertMapFileSize } from './lib/kmzUnzip.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { importMapDocument } from './lib/importMapDocument.js'
import { listMyMapFiles, saveMyMapFile, loadMyMapFile, deleteMyMapFile } from './lib/myMapStore.js'
import { createMapDocument, copyMapDocument, newMapId, initialMapVisibility, scopeId } from './lib/mapDocument.js'
import { createMapPersistence, GUEST_MAP_SCOPE } from './lib/mapPersistence.js'
import { previewMapConversion, convertImportedMap, exportMapKml } from './lib/mapKmlCodec.js'
import { convertDrawSpike, readDrawSpikeState, readMigratedIds, writeMigratedIds } from './lib/importDrawSpike.js'
import { buildDocumentOverlay, effectiveHiddenGroups, itemBounds, MY_MAP_LAYER_IDS, syncDocumentOverlay, removeDocumentOverlay, restackDocumentOverlay } from './lib/mapDocumentOverlay.js'
import useMyMapEditor from './useMyMapEditor.js'
import { syncEditorOverlay, removeEditorOverlay } from './lib/mapEditorOverlay.js'
import { bindEditorInteraction } from './lib/mapEditorInteraction.js'

const VIEW_KEY = 'projectamo.my-map.view.v1'
const viewKey = (key) => key === GUEST_MAP_SCOPE ? VIEW_KEY : `${VIEW_KEY}:${key}`
function readView(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(viewKey(key)) || '{}')
    if (!raw || typeof raw !== 'object') return {}
    return {
      currentId: typeof raw.currentId === 'string' ? raw.currentId : null,
      ...Object.fromEntries(['visibleIds', 'hiddenGroups', 'hiddenItems', 'initialized'].map((key) => [key, Array.isArray(raw[key]) ? raw[key].filter((id) => typeof id === 'string') : []])),
    }
  } catch { return {} }
}
const toggle = (values, id) => { const next = new Set(values); if (next.has(id)) next.delete(id); else next.add(id); return next }
const documentStub = (file) => ({ id: file.id, name: file.name, kind: 'imported', loaded: false, groups: [], items: [], source: { fileName: file.name }, file })

export default function useMyMap(mapRef, isStyleReady, styleRevision, { onOpenPanel, panelOpen = false, interactionBusy = false, priorityLayers = [] } = {}) {
  const { user, loading: authLoading } = useAuth()
  const scopeKey = authLoading ? null : user?.id != null ? `account:${user.id}` : GUEST_MAP_SCOPE
  const scopeRef = useRef(scopeKey); scopeRef.current = scopeKey
  const persistence = useRef(null)
  const [loadedScope, setLoadedScope] = useState(null)
  const [storage, setStorage] = useState({ ready: false, account: false, states: {}, drafts: {}, guestMaps: [], error: null })
  const [documents, setDocuments] = useState([])
  const [view, setView] = useState({})
  const [pendingRestore, setPendingRestore] = useState(null)
  const [currentId, setCurrentId] = useState(view.currentId ?? null)
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState(view.currentId ? 'view' : 'library')
  const [visibleIds, setVisibleIds] = useState(() => new Set(view.visibleIds ?? []))
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set(view.hiddenGroups ?? []))
  const [hiddenItems, setHiddenItems] = useState(() => new Set(view.hiddenItems ?? []))
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  // 기존 /draw 자료를 아직 옮기지 않았는지. 이전 기록은 계정 키별로 따로 둔다.
  const [drawSpike, setDrawSpike] = useState({ pending: 0 })
  const [drawRevision, setDrawRevision] = useState(0)
  const initialized = useRef(new Set(view.initialized ?? []))
  const pending = useRef(new Map()), removed = useRef(new Set()), openSequence = useRef(0)
  const displayIntent = useRef(new Map([...visibleIds].map((id) => [id, true])))
  const setDocumentVisible = useCallback((id, on) => {
    displayIntent.current.set(id, on)
    setVisibleIds((previous) => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next })
  }, [])
  const operations = useRef(new Map())
  const beginOperation = useCallback((message) => {
    const token = Symbol()
    operations.current.set(token, message)
    setBusy(message)
    return () => {
      operations.current.delete(token)
      setBusy([...operations.current.values()].at(-1) ?? null)
    }
  }, [])
  const state = useRef(null)
  state.current = { documents, currentId, selectedId, mode, visibleIds, hiddenGroups, hiddenItems, panelOpen, interactionBusy, onOpenPanel, priorityLayers }
  const wasPanelOpen = useRef(panelOpen)
  useEffect(() => {
    if (wasPanelOpen.current && !panelOpen) openSequence.current += 1
    wasPanelOpen.current = panelOpen
  }, [panelOpen])

  const replaceDocument = useCallback((next) => {
    setDocuments((previous) => previous.map((doc) => doc.id === next.id ? next : doc))
    persistence.current?.save(next)
  }, [])
  const editing = useMyMapEditor({
    document: documents.find((doc) => doc.id === currentId), active: loadedScope === scopeKey && mode === 'edit', selectedId, scopeKey,
    onDocumentChange: replaceDocument, onSelect: setSelectedId, onExit: () => setMode('view'), onError: setError,
  })
  const editRef = useRef(editing)
  editRef.current = { ...editing, documentId: currentId }

  useEffect(() => {
    if (!scopeKey || loadedScope !== scopeKey) return
    try { localStorage.setItem(viewKey(scopeKey), JSON.stringify({ currentId, visibleIds: [...visibleIds], hiddenGroups: [...hiddenGroups], hiddenItems: [...hiddenItems], initialized: [...initialized.current] })) } catch { /* Preferences are independent from source-file saving. */ }
  }, [currentId, visibleIds, hiddenGroups, hiddenItems, scopeKey, loadedScope])

  const installDocument = useCallback((document) => {
    if (removed.current.has(document.id)) return null
    const loaded = { ...document, loaded: document.loaded !== false }
    setDocuments((previous) => previous.some((d) => d.id === loaded.id) ? previous.map((d) => d.id === loaded.id ? loaded : d) : [...previous, loaded])
    if (loaded.loaded && !initialized.current.has(loaded.id)) {
      initialized.current.add(loaded.id)
      const defaults = initialMapVisibility(loaded)
      setHiddenGroups((previous) => new Set([...previous, ...defaults.groups]))
      setHiddenItems((previous) => new Set([...previous, ...defaults.items]))
    }
    return loaded
  }, [])

  useLayoutEffect(() => {
    const restored = scopeKey ? readView(scopeKey) : {}
    setView(restored); setLoadedScope(scopeKey)
    setDocuments(scopeKey ? listMyMapFiles(scopeKey).map(documentStub) : [])
    setCurrentId(restored.currentId ?? null); setSelectedId(null); setMode(restored.currentId ? 'view' : 'library')
    setVisibleIds(new Set(restored.visibleIds ?? [])); setHiddenGroups(new Set(restored.hiddenGroups ?? [])); setHiddenItems(new Set(restored.hiddenItems ?? []))
    initialized.current = new Set(restored.initialized ?? [])
    displayIntent.current = new Map((restored.visibleIds ?? []).map((id) => [id, true]))
    pending.current = new Map(); removed.current = new Set(); openSequence.current += 1
    operations.current.clear(); setBusy(null); setError(null); setNotice(null); setPendingRestore(null)
    const account = Boolean(scopeKey && scopeKey !== GUEST_MAP_SCOPE)
    setStorage({ ready: false, account, states: {}, drafts: {}, guestMaps: [], error: null })
    if (!scopeKey) { persistence.current = null; return undefined }
    const session = createMapPersistence({ scopeKey, account,
      onInstall: installDocument,
      onAck: (id, ack) => setDocuments((previous) => previous.map((doc) => doc.id !== id ? doc : ack.isCurrent ? { ...ack.document, loaded: true } : { ...doc, revision: ack.document.revision, createdAt: ack.document.createdAt })),
      onState: (id, value) => setStorage((previous) => ({ ...previous, states: { ...previous.states, [id]: value } })),
      onDrafts: (drafts) => setStorage((previous) => ({ ...previous, drafts })),
      onGuestMaps: (guestMaps) => setStorage((previous) => ({ ...previous, guestMaps })),
      onError: (message) => setStorage((previous) => ({ ...previous, error: message })),
    })
    persistence.current = session
    void session.start().then(() => { if (persistence.current === session) setStorage((previous) => ({ ...previous, ready: true })) }).catch((failure) => { if (persistence.current === session) setStorage((previous) => ({ ...previous, ready: true, error: failure.message })) })
    return () => { session.dispose(); if (persistence.current === session) persistence.current = null }
  }, [scopeKey, installDocument])

  // 기관 지도 조회·등록은 기관 라운지가 소유한다. 내 지도에서는 기관
  // 자료를 자동으로 조회하거나 표시하지 않는다. 기존 서버 자료는 유지한다.

  const ensureLoaded = useCallback(async (id) => {
    const existing = state.current.documents.find((d) => d.id === id)
    if (!existing) return null
    if (existing.loaded !== false) return existing
    if (pending.current.has(id)) return pending.current.get(id)
    const task = (async () => {
      const owner = scopeRef.current, session = persistence.current
      const finish = beginOperation('보관한 지도 여는 중…'); setError(null)
      try {
        if (existing.kind === 'personal') return await session?.load(id)
        const saved = await loadMyMapFile(id, owner)
        if (!saved.ok) throw new Error('보관한 원본 파일을 찾지 못했습니다. 파일을 다시 열어주세요.')
        const document = await importMapDocument(saved.buffer, existing.source.fileName, { id })
        if (scopeRef.current !== owner) return null
        return installDocument({ ...document, file: existing.file })
      } catch (e) { if (scopeRef.current === owner && e.name !== 'AbortError') setError((e.stage ? e.stage + ': ' : '') + e.message); return null }
      finally { pending.current.delete(id); finish() }
    })()
    pending.current.set(id, task)
    return task
  }, [installDocument, beginOperation])

  useEffect(() => {
    const ids = new Set([view.currentId, ...(view.visibleIds ?? [])].filter(Boolean))
    for (const id of ids) if (documents.some((doc) => doc.id === id && doc.loaded === false)) void ensureLoaded(id)
  }, [ensureLoaded, view, documents])

  const fitItems = useCallback((items, { onlyOutside = false } = {}) => {
    const map = mapRef.current
    if (!map) return
    const bounds = items.map(itemBounds).filter(Boolean)
    if (!bounds.length) return
    const box = [[Math.min(...bounds.map((b) => b[0][0])), Math.min(...bounds.map((b) => b[0][1]))], [Math.max(...bounds.map((b) => b[1][0])), Math.max(...bounds.map((b) => b[1][1]))]]
    const center = [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2]
    const panel = document.querySelector('.my-map-panel')?.getBoundingClientRect()
    const canvas = map.getCanvas().getBoundingClientRect(), point = map.project(center)
    const covered = panel && point.x + canvas.left < panel.right && point.y + canvas.top > panel.top && point.y + canvas.top < panel.bottom
    if (onlyOutside && map.getBounds().contains(center) && !covered) return
    const mobile = canvas.width < 720
    map.fitBounds(box, { padding: { top: 72, bottom: 110, left: mobile ? 36 : Math.min((panel?.width ?? 0) + 40, canvas.width * 0.45), right: 40 }, maxZoom: 12, duration: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 500 })
  }, [mapRef])

  const openDocument = useCallback(async (id) => {
    const seq = ++openSequence.current
    const wasVisible = displayIntent.current.get(id) === true
    setDocumentVisible(id, true)
    setCurrentId(id); setMode('view'); setSelectedId(null)
    const doc = await ensureLoaded(id)
    if (!doc || seq !== openSequence.current) return
    if (!wasVisible && displayIntent.current.get(id) === true) fitItems(doc.items)
  }, [ensureLoaded, fitItems, setDocumentVisible])

  const addFile = useCallback(async (file, { open = true, prepared = null } = {}) => {
    if (!file) return
    const owner = scopeRef.current
    if (prepared && (prepared.scopeKey !== owner || prepared.file !== file)) return null
    const seq = open ? ++openSequence.current : null, id = prepared?.source.id ?? newMapId()
    const finish = beginOperation('지도 내용 해석 중…'); setError(null); setNotice(null)
    try {
      assertMapFileSize(file)
      const document = prepared?.source ?? await importMapDocument(await file.arrayBuffer(), file.name, { id })
      if (scopeRef.current !== owner) return null
      const saved = await saveMyMapFile(file, { id, scopeKey: owner })
      if (scopeRef.current !== owner) return
      if (!saved.ok) setNotice('이 파일을 기기에 보관하지 못했습니다. 현재는 볼 수 있지만 다시 열 때 원본 파일이 필요합니다.')
      const installed = installDocument({ ...document, file: saved.entry ?? { id, name: file.name, size: file.size, addedAt: 0 } })
      if (open) setDocumentVisible(id, true)
      if (open && seq === openSequence.current) { setCurrentId(id); setMode('view'); setSelectedId(null); fitItems(document.items) }
      return installed
    } catch (e) { if (scopeRef.current === owner) setError((e.stage ? e.stage + ': ' : '') + e.message) }
    finally { finish() }
  }, [fitItems, installDocument, beginOperation, setDocumentVisible])

  const toggleDocument = useCallback(async (id) => {
    if (removed.current.has(id)) return
    const on = displayIntent.current.get(id) !== true
    setDocumentVisible(id, on)
    if (on) await ensureLoaded(id)
  }, [ensureLoaded, setDocumentVisible])

  const removeDocument = useCallback(async (id) => {
    const owner = scopeRef.current
    const existing = state.current.documents.find((d) => d.id === id)
    if (!existing) return
    if (existing.kind === 'organization') { setError('기관 지도는 공유 중단 메뉴를 이용하세요.'); return }
    if (existing.kind === 'personal') {
      try { if (!await persistence.current?.remove(existing)) return }
      catch (failure) { if (scopeRef.current === owner) setError(failure.message); return }
    }
    if (existing.file?.addedAt) {
      const result = await deleteMyMapFile(id, owner)
      if (!result.ok) { setError('보관한 파일을 삭제하지 못했습니다. 다시 시도하세요.'); return }
    }
    if (scopeRef.current !== owner) return
    removed.current.add(id)
    setDocuments((previous) => previous.filter((d) => d.id !== id))
    setDocumentVisible(id, false)
    setHiddenGroups((previous) => new Set([...previous].filter((key) => !key.startsWith(id + ':'))))
    setHiddenItems((previous) => new Set([...previous].filter((key) => !key.startsWith(id + ':'))))
    initialized.current.delete(id)
    if (state.current.currentId === id) { setCurrentId(null); setSelectedId(null); setMode('library') }
  }, [setDocumentVisible])

  const draftPending = useRef(null), draftTimer = useRef(null), activeDraftIds = useRef(new Set())
  const flushDraft = useCallback(() => {
    clearTimeout(draftTimer.current)
    const pendingDraft = draftPending.current
    draftPending.current = null
    if (pendingDraft) void pendingDraft.session.writeDraft(pendingDraft.id, pendingDraft.value)
  }, [])
  useEffect(() => () => { flushDraft(); activeDraftIds.current.clear() }, [scopeKey, flushDraft])
  useEffect(() => {
    if (loadedScope !== scopeKey || !persistence.current) return
    if (mode !== 'edit') {
      flushDraft()
      for (const id of activeDraftIds.current) void persistence.current.writeDraft(id, null)
      activeDraftIds.current.clear()
      return
    }
    if (!currentId) return
    for (const id of activeDraftIds.current) if (id !== currentId) { void persistence.current.writeDraft(id, null); activeDraftIds.current.delete(id) }
    if (draftPending.current && draftPending.current.id !== currentId) flushDraft()
    const { draft, geometryEdit, targetGroupId } = editing.editor
    const doc = documents.find((entry) => entry.id === currentId)
    if (!doc) return
    const unfinished = Boolean(geometryEdit || draft?.coordinates.length)
    if (!unfinished && !activeDraftIds.current.has(currentId)) return
    let value = null
    if (unfinished) {
      const base = geometryEdit ? doc.items.find((item) => item.id === geometryEdit.itemId) : null
      value = { id: currentId, documentRevision: doc.revision, draft, geometryEdit, targetGroupId, baseGeometry: base?.geometry ?? null, baseDefinition: base?.definition ?? null }
      activeDraftIds.current.add(currentId)
    } else activeDraftIds.current.delete(currentId)
    draftPending.current = { session: persistence.current, id: currentId, value }
    clearTimeout(draftTimer.current)
    if (unfinished) draftTimer.current = setTimeout(flushDraft, 250)
    else flushDraft()
  }, [editing.editor, currentId, mode, documents, scopeKey, loadedScope, flushDraft])
  useEffect(() => {
    const flush = () => flushDraft()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [flushDraft])
  useEffect(() => {
    const reconnect = () => {
      const session = persistence.current
      for (const [id, value] of Object.entries(storage.states)) if (value.state === 'offline') void session?.retry(id).catch((failure) => { if (persistence.current === session) setError(failure.message) })
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [storage.states])
  useEffect(() => {
    const beforeUnload = (event) => {
      const unfinished = Boolean(editRef.current.editor.geometryEdit || editRef.current.editor.draft?.coordinates.length)
      const pendingSave = Object.values(storage.states).some((value) => !['synced', 'localOnly'].includes(value.state) || value.error)
      if (!unfinished && !pendingSave) return
      flushDraft(); event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [storage.states, flushDraft])
  useEffect(() => {
    if (!pendingRestore || mode !== 'edit' || pendingRestore.id !== currentId) return
    const result = editing.restoreEditorDraft(pendingRestore)
    if (result.ok) {
      persistence.current?.consumeDraft(currentId)
    }
    setPendingRestore(null)
  }, [pendingRestore, mode, currentId])

  const selectItem = useCallback((id) => {
    const doc = state.current.documents.find((d) => d.id === state.current.currentId)
    const item = doc?.items.find((i) => i.id === id)
    if (!item) return
    setSelectedId(id); fitItems([item], { onlyOutside: true })
  }, [fitItems])
  const toggleGroup = useCallback((id) => setHiddenGroups((previous) => toggle(previous, scopeId(state.current.currentId, id))), [])
  const toggleItem = useCallback((id) => setHiddenItems((previous) => toggle(previous, scopeId(state.current.currentId, id))), [])
  const setAllVisible = useCallback((on) => {
    const doc = state.current.documents.find((d) => d.id === state.current.currentId)
    if (!doc) return
    const update = (previous, ids) => { const next = new Set(previous); for (const id of ids) if (on) next.delete(scopeId(doc.id, id)); else next.add(scopeId(doc.id, id)); return next }
    setHiddenGroups((previous) => update(previous, doc.groups.map((g) => g.id)))
    setHiddenItems((previous) => update(previous, doc.items.map((i) => i.id)))
    if (on) setDocumentVisible(doc.id, true)
  }, [setDocumentVisible])
  const fitDocument = useCallback(() => fitItems(state.current.documents.find((d) => d.id === state.current.currentId)?.items ?? []), [fitItems])
  const fitGroup = useCallback((id) => {
    const doc = state.current.documents.find((d) => d.id === state.current.currentId)
    if (!doc) return
    const children = new Set([id])
    let size
    do { size = children.size; doc.groups.forEach((g) => { if (children.has(g.parentId)) children.add(g.id) }) } while (children.size !== size)
    fitItems(doc.items.filter((i) => children.has(i.groupId)))
  }, [fitItems])

  useEffect(() => {
    if (!scopeKey) { setDrawSpike({ pending: 0 }); return }
    const saved = readDrawSpikeState()
    const migrated = readMigratedIds(scopeKey)
    setDrawSpike({ pending: (saved?.features ?? []).filter((feature) => feature?.id != null && !migrated.has(String(feature.id))).length })
  }, [scopeKey, drawRevision])

  const data = useMemo(() => buildDocumentOverlay(documents), [documents])
  const hidden = useMemo(() => effectiveHiddenGroups(documents, hiddenGroups), [documents, hiddenGroups])
  useEffect(() => {
    if (!isStyleReady || !mapRef.current) return
    const hiddenForPreview = new Set(hiddenItems)
    if (editing.editor.geometryEdit) hiddenForPreview.add(scopeId(currentId, editing.editor.geometryEdit.itemId))
    syncDocumentOverlay(mapRef.current, { data, visibleIds, hiddenGroups: hidden, hiddenItems: hiddenForPreview, selectedKey: selectedId ? scopeId(currentId, selectedId) : null })
  }, [mapRef, isStyleReady, styleRevision, data, visibleIds, hidden, hiddenItems, currentId, selectedId, editing.editor.geometryEdit?.itemId])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    if (mode === 'edit' && panelOpen) syncEditorOverlay(map, editing.editor)
    else removeEditorOverlay(map)
  }, [mapRef, isStyleReady, styleRevision, mode, panelOpen, editing.editor])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || mode !== 'edit' || !panelOpen) return undefined
    return bindEditorInteraction(map, () => editRef.current)
  }, [mapRef, isStyleReady, styleRevision, mode, panelOpen])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined
    const click = (event) => {
      if (state.current.interactionBusy || state.current.mode === 'edit') return
      const priority = state.current.priorityLayers.filter((id) => map.getLayer(id))
      if (priority.length && map.queryRenderedFeatures(event.point, { layers: priority }).length) return
      const layers = MY_MAP_LAYER_IDS.filter((id) => map.getLayer(id))
      if (!layers.length) return
      const hit = map.queryRenderedFeatures(event.point, { layers })[0]
      if (!hit) { if (state.current.panelOpen) setSelectedId(null); return }
      const { __file: docId, itemId } = hit.properties
      if (!docId || !itemId) return
      openSequence.current += 1
      setCurrentId(docId); setMode('view'); setSelectedId(itemId)
      state.current.onOpenPanel?.()
    }
    map.on('click', click)
    const restack = () => restackDocumentOverlay(map)
    map.on('styledata', restack)
    return () => { map.off('click', click); map.off('styledata', restack) }
  }, [mapRef, isStyleReady, styleRevision])
  useEffect(() => {
    const map = mapRef.current
    return () => { if (map?.isStyleLoaded()) { removeEditorOverlay(map); removeDocumentOverlay(map) } }
  }, [mapRef])

  // 안내와 오류는 직전 동작의 결과다. 다음 화면으로 넘어가면 지운다.
  // 그대로 두면 편집 화면까지 따라와 언제 생긴 말인지 알 수 없게 된다.
  const clearMessages = () => { setError(null); setNotice(null) }
  const navigate = (next) => {
    let result
    const accepted = editing.requestNavigation(() => { clearMessages(); result = next() })
    return accepted ? result ?? true : false
  }
  const saveCopy = async (id, { open = true } = {}) => {
    const doc = state.current.documents.find((entry) => entry.id === id)
    if (!doc || doc.loaded === false) return null
    const session = persistence.current
    const copy = copyMapDocument(doc, { name: `${doc.name} 복구 사본` })
    installDocument(copy); session.save(copy); setDocumentVisible(copy.id, true)
    await session.flushRecovery(copy.id)
    if (session !== persistence.current) return null
    if (open) { setCurrentId(copy.id); setSelectedId(null); setMode('view') }
    return copy
  }
  const runStorageAction = async (action) => {
    const session = persistence.current
    try { return await action(session) }
    catch (failure) { if (persistence.current === session && failure.name !== 'AbortError') setError(failure.message); return null }
  }
  const saveNewPersonalMap = async (session, copy) => {
    if (!session || session !== persistence.current) return null
    installDocument(copy); session.save(copy); setDocumentVisible(copy.id, true)
    // The copy already exists in memory. A storage failure must offer retry for this
    // copy, not encourage creating another copy through the conversion dialog.
    try { await session.flushRecovery(copy.id) }
    catch (failure) { if (session === persistence.current) setError(failure.message) }
    if (session !== persistence.current) return null
    setCurrentId(copy.id); setSelectedId(null); setMode('view')
    return copy
  }
  return { documents, currentId, selectedId, mode, accountScope: scopeKey, visibleIds, hiddenGroups, hiddenItems, busy, error, notice, storage, drawSpike, ...editing,
    dismissMessages: clearMessages,
    retrySave: (id) => runStorageAction((session) => session.retry(id)),
    copyConflict: (id) => navigate(() => runStorageAction(() => saveCopy(id))),
    openServerVersion: (id) => navigate(() => runStorageAction(async (session) => {
      if (!await saveCopy(id, { open: false })) return
      const document = await session.openServer(id)
      if (document && persistence.current === session) { setCurrentId(id); setSelectedId(null); setMode('view'); setNotice('이전 변경은 복구 사본에 보관하고 계정의 최신 지도를 열었습니다.') }
    })),
    restoreDraft: (id) => navigate(() => runStorageAction(async (session) => {
      const record = storage.drafts[id]
      if (!record) return
      const seq = ++openSequence.current
      const document = await ensureLoaded(id)
      if (session !== persistence.current || seq !== openSequence.current || document?.kind !== 'personal' || document.loaded === false) return
      setCurrentId(id); setMode('edit'); setPendingRestore(record)
    })),
    discardRecoveredDraft: (id) => runStorageAction((session) => session.discardDraft(id)),
    importGuestMap: (id) => navigate(() => runStorageAction(async (session) => {
      const guest = await session.guestDocument(id)
      if (!guest || persistence.current !== session) return
      const copy = copyMapDocument(guest)
      installDocument(copy); session.save(copy); setDocumentVisible(copy.id, true); setCurrentId(copy.id); setMode('view'); setSelectedId(null)
      setNotice('비로그인 지도를 개인 사본으로 가져왔습니다. 기기의 원본은 남아 있습니다.')
    })),
    importDrawSpike: () => navigate(() => runStorageAction(async (session) => {
      if (!storage.ready) return null
      const scope = scopeRef.current
      const migrated = readMigratedIds(scope)
      const result = convertDrawSpike(readDrawSpikeState(), { skipIds: migrated })
      if (!result.document.items.length) { setDrawRevision((value) => value + 1); setNotice('이전할 새 그리기 자료가 없습니다.'); return null }
      installDocument(result.document); session.save(result.document); setDocumentVisible(result.document.id, true)
      // 저장을 확인한 뒤에만 이전 기록을 남긴다. 실패하면 /draw 원본으로 다시 시도할 수 있다.
      await session.flushRecovery(result.document.id)
      if (session !== persistence.current) return null
      writeMigratedIds(scope, new Set([...migrated, ...result.migratedIds]))
      setDrawRevision((value) => value + 1)
      setCurrentId(result.document.id); setSelectedId(null); setMode('view')
      setNotice([`그리기 자료 ${result.counts.converted}개를 개인 지도로 옮겼습니다. 기존 그리기의 원본은 그대로 남아 있습니다.`, ...result.warnings].join(' '))
      return result.document
    })),
    previewConversion: (id) => runStorageAction(async () => {
      const document = await ensureLoaded(id)
      if (!document || document.loaded === false) { setError('지도를 먼저 열어주세요.'); return null }
      return { id: document.id, name: document.name, kind: document.kind, ...previewMapConversion(document) }
    }),
    prepareFileConversion: (file) => runStorageAction(async () => {
      if (!storage.ready) return null
      const source = await addFile(file, { open: false })
      return source ? { source, preview: previewMapConversion(source) } : null
    }),
    duplicateDocument: (id, { name } = {}) => navigate(() => runStorageAction(async (session) => {
      if (!storage.ready) return null
      const source = await ensureLoaded(id)
      if (!source || source.kind !== 'personal' || session !== persistence.current) return null
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) throw new Error('지도 이름은 1~200자로 입력하세요.')
      return saveNewPersonalMap(session, copyMapDocument(source, { name: name.trim(), flatten: false }))
    })),
    convertDocument: (id, { name, targetId = null, edit = false } = {}) => navigate(() => runStorageAction(async (session) => {
      if (!storage.ready) return null
      const source = await ensureLoaded(id)
      if (!source || source.loaded === false || source.kind !== 'imported' || session !== persistence.current) return null
      if (targetId != null) {
        if (state.current.currentId !== targetId || state.current.mode !== 'edit') throw new Error('추가할 개인 지도를 다시 편집 상태로 열어주세요.')
        const result = editRef.current.appendImportedDocument(source)
        if (!result.ok) return null
        try { await session.flushRecovery(targetId) }
        catch (failure) { if (session === persistence.current) setError(failure.message) }
        if (session !== persistence.current) return null
        setNotice('자료를 추가하고 선택했습니다. 가져온 원본은 지도 목록에 남아 있습니다.')
        return result.document
      }
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) throw new Error('지도 이름은 1~200자로 입력하세요.')
      const copy = await saveNewPersonalMap(session, convertImportedMap(source, { name: name.trim() }))
      if (copy) { setNotice('개인 편집본을 만들었습니다. 가져온 원본은 그대로 남아 있습니다.'); if (edit) setMode('edit') }
      return copy
    })),
    exportDocument: (id, scope = {}) => runStorageAction(async () => {
      const document = await ensureLoaded(id)
      if (!document || document.loaded === false) { setError('지도를 먼저 열어주세요.'); return null }
      return { fileName: `${String(document.name || '내 지도').replace(/[\\/:*?"<>|]/g, '_')}.kml`, kml: exportMapKml(document, scope) }
    }),
    createDocument: (name) => navigate(() => {
      if (!storage.ready) return
      const doc = createMapDocument(name)
      installDocument(doc); persistence.current.save(doc); setDocumentVisible(doc.id, true); setCurrentId(doc.id); setSelectedId(null); setMode('edit')
    }),
    startEditing: (id = currentId) => navigate(() => {
      const doc = state.current.documents.find((entry) => entry.id === id)
      if (doc?.kind !== 'personal' || doc.loaded === false) { setError('개인 지도를 먼저 열어주세요.'); return }
      setCurrentId(id); setMode('edit')
    }),
    inspectFile: async (file) => {
      assertMapFileSize(file)
      const owner = scopeRef.current
      if (!storage.ready || !owner) return null
      if (!/\.(kml|kmz)$/i.test(file.name)) throw new Error('KML 또는 KMZ 파일을 선택하세요.')
      const source = await importMapDocument(await file.arrayBuffer(), file.name, { id: newMapId() })
      return scopeRef.current === owner ? { file, source, scopeKey: owner } : null
    },
    addFile: (file, options) => navigate(() => addFile(file, options)), openDocument: (id) => navigate(() => openDocument(id)),
    toggleDocument, removeDocument, selectItem, clearSelection: () => setSelectedId(null),
    showLibrary: () => navigate(() => { openSequence.current += 1; setMode('library'); setSelectedId(null) }),
    toggleGroup, toggleItem, setAllVisible, fitGroup, fitDocument }
}
