import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMapCommand, bulkPointItems } from './lib/mapCommands.js'
import { copyJson, createMapItem, circleGeometry, validateItem, newMapId } from './lib/mapDocument.js'
import { greatCircleNm } from '../draw-spike/lib/shapeBuilders.js'

const emptyEditor = () => ({ pane: 'list', selectionIds: new Set(), selectionMode: false, activeTool: null, continuousPoint: false, targetGroupId: null, draft: null, geometryEdit: null, exitPending: false })
const labels = { point: '지점', line: '선', polygon: '면', circle: '원' }

export default function useMyMapEditor({ document, active, selectedId, scopeKey, onDocumentChange, onSelect, onExit, onError }) {
  const [editor, setEditor] = useState(emptyEditor)
  const [historyRevision, setHistoryRevision] = useState(0)
  const state = useRef(null), histories = useRef(new Map()), coalescing = useRef(null), pendingExit = useRef(null), recentStyles = useRef(new Map())
  state.current = { document, active, selectedId, editor, onDocumentChange, onSelect, onExit, onError }
  const changeEditor = useCallback((patch) => {
    const next = typeof patch === 'function' ? patch(state.current.editor) : { ...state.current.editor, ...patch }
    state.current.editor = next
    setEditor(next)
  }, [])
  useEffect(() => { changeEditor(emptyEditor()); coalescing.current = null; pendingExit.current = null }, [active, document?.id, changeEditor])
  useEffect(() => { histories.current.clear(); recentStyles.current.clear(); changeEditor(emptyEditor()); coalescing.current = null; pendingExit.current = null }, [scopeKey, changeEditor])
  const failure = useCallback((error) => { const message = error?.message ?? String(error); state.current.onError?.(message); return { ok: false, error: message } }, [])
  const publish = useCallback((next) => {
    state.current.document = next
    state.current.onDocumentChange(next)
    state.current.onError?.(null)
    const e = state.current.editor
    if (e.targetGroupId != null && !next.groups.some((g) => g.id === e.targetGroupId)) changeEditor({ targetGroupId: null })
    const ids = new Set(next.items.map((item) => item.id))
    if ([...e.selectionIds].some((id) => !ids.has(id))) changeEditor({ selectionIds: new Set([...e.selectionIds].filter((id) => ids.has(id))) })
    if (state.current.selectedId && !ids.has(state.current.selectedId)) { state.current.onSelect(null); changeEditor({ pane: 'list' }) }
  }, [changeEditor])
  const commit = useCallback((command, { coalesce } = {}) => {
    try {
      const before = state.current.document
      if (!state.current.active || !before) throw new Error('편집 중인 지도를 찾지 못했습니다.')
      const next = applyMapCommand(before, command)
      if (next === before) return { ok: true }
      const history = histories.current.get(before.id) ?? { undo: [], redo: [] }
      if (!coalesce || coalescing.current !== `${before.id}:${coalesce}`) history.undo = [...history.undo, before].slice(-50)
      history.redo = []
      histories.current.set(before.id, history)
      coalescing.current = coalesce ? `${before.id}:${coalesce}` : null
      publish(next); setHistoryRevision((value) => value + 1)
      return { ok: true }
    } catch (error) { return failure(error) }
  }, [failure, publish])
  const unfinished = useCallback(() => Boolean(state.current.editor.geometryEdit || state.current.editor.draft?.coordinates.length), [])
  const requestNavigation = useCallback((next) => {
    if (unfinished()) { pendingExit.current = next; changeEditor({ exitPending: true }); return false }
    next(); return true
  }, [changeEditor, unfinished])
  const continueEditing = useCallback(() => { pendingExit.current = null; changeEditor({ exitPending: false }) }, [changeEditor])
  const discardAndExit = useCallback(() => {
    const next = pendingExit.current
    pendingExit.current = null
    changeEditor({ draft: null, geometryEdit: null, activeTool: null, exitPending: false })
    next?.()
  }, [changeEditor])
  const setEditorPane = (pane) => requestNavigation(() => changeEditor({ pane, activeTool: null, draft: null, geometryEdit: null }))
  const selectEditorItem = (id) => requestNavigation(() => {
    state.current.onSelect(id)
    changeEditor({ pane: 'item', activeTool: null, draft: null, geometryEdit: null })
  })
  const setActiveTool = (kind) => requestNavigation(() => changeEditor({ activeTool: kind, draft: kind ? { kind, coordinates: [], pointer: null } : null, geometryEdit: null, pane: 'list', selectionMode: false, selectionIds: new Set() }))
  const makeItem = useCallback((kind, geometry, definition = null) => {
    const { document: doc, editor: e } = state.current
    const number = doc.items.filter((item) => item.kind === kind).length + 1
    const style = recentStyles.current.get(kind)
    return createMapItem(kind, geometry, { name: `${labels[kind]} ${number}`, groupId: e.targetGroupId, definition, ...(style ? { style: { ...style } } : {}) })
  }, [])
  const finishDraft = useCallback(() => {
    const draft = state.current.editor.draft
    if (!draft?.coordinates.length) return failure(new Error('지도에서 위치를 선택하세요.'))
    try {
      const points = draft.coordinates
      let geometry, definition = null
      if (draft.kind === 'line') geometry = { type: 'LineString', coordinates: points }
      else if (draft.kind === 'polygon') geometry = { type: 'Polygon', coordinates: [[...points, points[0]]] }
      else if (draft.kind === 'circle') {
        if (!draft.pointer) throw new Error('원의 반경을 정하세요.')
        definition = { center: points[0], radiusNm: greatCircleNm(points[0], draft.pointer) }
        geometry = circleGeometry(definition)
      } else throw new Error('지도에서 지점을 선택하세요.')
      const item = makeItem(draft.kind, geometry, definition)
      const result = commit({ type: 'addItems', items: [item] })
      if (result.ok) { state.current.onSelect(item.id); changeEditor({ draft: null, activeTool: null, pane: 'item' }) }
      return result
    } catch (error) { return failure(error) }
  }, [changeEditor, commit, failure, makeItem])
  const addDraftPoint = useCallback((coordinate) => {
    const { draft, continuousPoint } = state.current.editor
    if (!draft) return
    if (draft.kind === 'point') {
      try {
        const item = makeItem('point', { type: 'Point', coordinates: coordinate })
        const result = commit({ type: 'addItems', items: [item] })
        if (result.ok) { state.current.onSelect(item.id); if (!continuousPoint) changeEditor({ draft: null, activeTool: null, pane: 'item' }) }
        return result
      } catch (error) { return failure(error) }
    }
    if (draft.kind === 'circle' && draft.coordinates.length) {
      changeEditor({ draft: { ...draft, pointer: coordinate } }); return finishDraft()
    }
    const last = draft.coordinates.at(-1)
    if (last && last[0] === coordinate[0] && last[1] === coordinate[1]) return
    changeEditor({ draft: { ...draft, coordinates: [...draft.coordinates, coordinate], pointer: coordinate } })
  }, [changeEditor, commit, failure, finishDraft, makeItem])
  const updateDraftPointer = useCallback((coordinate) => {
    const draft = state.current.editor.draft
    if (draft) changeEditor({ draft: { ...draft, pointer: coordinate } })
  }, [changeEditor])
  const undoDraftPoint = () => { const draft = state.current.editor.draft; if (draft) changeEditor({ draft: { ...draft, coordinates: draft.coordinates.slice(0, -1) } }) }
  const cancelDraft = () => changeEditor({ draft: null, activeTool: null })
  const beginGeometryEdit = (id) => requestNavigation(() => {
    const item = state.current.document.items.find((entry) => entry.id === id)
    if (!item || item.kind === 'compound') return failure(new Error('복합 원본 도형은 속성만 수정할 수 있습니다.'))
    changeEditor({ geometryEdit: { itemId: id, item: copyJson(item), selectedVertex: null }, draft: null, activeTool: null, pane: 'item' })
  })
  const updateGeometryPreview = (item, selectedVertex = state.current.editor.geometryEdit?.selectedVertex) => {
    const edit = state.current.editor.geometryEdit
    if (edit) changeEditor({ geometryEdit: { ...edit, item, selectedVertex } })
  }
  const updateGeometryDefinition = (patch) => {
    const edit = state.current.editor.geometryEdit
    if (!edit || edit.item.kind !== 'circle') return failure(new Error('원을 형태 수정 중일 때 사용할 수 있습니다.'))
    try {
      const definition = { ...edit.item.definition, ...patch }
      updateGeometryPreview({ ...edit.item, definition, geometry: circleGeometry(definition) }); return { ok: true }
    } catch (error) { return failure(error) }
  }
  const commitGeometryEdit = () => {
    const edit = state.current.editor.geometryEdit
    if (!edit) return { ok: true }
    const result = commit({ type: 'geometry', id: edit.itemId, geometry: edit.item.geometry, definition: edit.item.definition })
    if (result.ok) changeEditor({ geometryEdit: null })
    return result
  }
  const deleteGeometryVertex = () => {
    const edit = state.current.editor.geometryEdit
    if (!edit || edit.selectedVertex == null) return failure(new Error('삭제할 꼭짓점을 먼저 선택하세요.'))
    const { ring = 0, index } = edit.selectedVertex
    const item = copyJson(edit.item), geometry = item.geometry
    if (geometry.type === 'LineString') geometry.coordinates.splice(index, 1)
    else if (geometry.type === 'Polygon') {
      const points = geometry.coordinates[ring].slice(0, -1)
      points.splice(index, 1); geometry.coordinates[ring] = [...points, points[0]]
    } else return failure(new Error('이 도형의 꼭짓점은 삭제할 수 없습니다.'))
    const error = validateItem(item)
    if (error) return failure(new Error(error))
    updateGeometryPreview(item, null); return { ok: true }
  }
  const travelHistory = (direction) => {
    if (!state.current.active) return failure(new Error('편집 중에만 되돌릴 수 있습니다.'))
    if (unfinished()) return failure(new Error('진행 중인 그리기 또는 형태 수정을 먼저 마쳐주세요.'))
    const doc = state.current.document, history = histories.current.get(doc?.id)
    const target = history?.[direction].at(-1)
    if (!target) return { ok: true }
    history[direction] = history[direction].slice(0, -1)
    history[direction === 'undo' ? 'redo' : 'undo'].push(doc)
    coalescing.current = null
    publish({ ...target, revision: doc.revision, updatedAt: new Date().toISOString() })
    setHistoryRevision((value) => value + 1)
    if (!target.items.some((item) => item.id === state.current.selectedId)) state.current.onSelect(null)
    changeEditor({ selectionIds: new Set(), pane: 'list' })
    return { ok: true }
  }
  const updateItem = (id, patch, options) => {
    const result = commit({ type: 'updateItem', id, patch }, options)
    if (result.ok && patch.style) {
      const item = state.current.document.items.find((entry) => entry.id === id)
      recentStyles.current.set(item.kind, item.style)
    }
    return result
  }
  const history = histories.current.get(document?.id)
  void historyRevision
  return {
    editor: { ...editor, canUndo: Boolean(history?.undo.length), canRedo: Boolean(history?.redo.length) },
    requestNavigation, continueEditing, discardAndExit,
    restoreEditorDraft: (record) => {
      if (!state.current.active || record.id !== state.current.document?.id) return failure(new Error('복구할 지도를 먼저 여세요.'))
      const doc = state.current.document
      if (record.geometryEdit) {
        const current = doc.items.find((item) => item.id === record.geometryEdit.itemId)
        if (!current || JSON.stringify(current.geometry) !== JSON.stringify(record.baseGeometry) || JSON.stringify(current.definition) !== JSON.stringify(record.baseDefinition)) return failure(new Error('도형이 저장 당시와 달라 형태 수정 초안을 적용하지 않았습니다.'))
      }
      changeEditor({ ...emptyEditor(), draft: record.draft ?? null, geometryEdit: record.geometryEdit ?? null, activeTool: record.draft?.kind ?? null, pane: record.geometryEdit ? 'item' : 'list', targetGroupId: doc.groups.some((group) => group.id === record.targetGroupId) ? record.targetGroupId : null })
      if (record.geometryEdit) state.current.onSelect(record.geometryEdit.itemId)
      return { ok: true }
    },
    finishEditing: () => requestNavigation(() => { changeEditor(emptyEditor()); state.current.onExit() }),
    setEditorPane, selectEditorItem, clearEditorSelection: () => { state.current.onSelect(null); changeEditor({ selectionIds: new Set(), pane: 'list' }) },
    setSelectionMode: (on) => changeEditor({ selectionMode: on, selectionIds: new Set() }),
    toggleEditorSelection: (id) => changeEditor((e) => { const ids = new Set(e.selectionIds); if (ids.has(id)) ids.delete(id); else ids.add(id); return { ...e, selectionIds: ids } }),
    setActiveTool, setContinuousPoint: (on) => changeEditor({ continuousPoint: on }), setTargetGroup: (id) => changeEditor({ targetGroupId: id }),
    addDraftPoint, updateDraftPointer, undoDraftPoint, finishDraft, cancelDraft,
    updateItem, endPropertyEdit: () => { coalescing.current = null },
    beginGeometryEdit, updateGeometryPreview, updateGeometryDefinition, commitGeometryEdit, cancelGeometryEdit: () => changeEditor({ geometryEdit: null }), deleteGeometryVertex,
    updatePointCoordinate: (coordinate) => {
      const edit = state.current.editor.geometryEdit
      if (edit?.item.kind !== 'point') return failure(new Error('지점을 형태 수정 중일 때 사용할 수 있습니다.'))
      const item = { ...edit.item, geometry: { type: 'Point', coordinates: coordinate } }
      const error = validateItem(item)
      if (error) return failure(new Error(error))
      updateGeometryPreview(item); return { ok: true }
    },
    undoEdit: () => travelHistory('undo'), redoEdit: () => travelHistory('redo'),
    createGroup: (name) => { const id = newMapId(); const result = commit({ type: 'createGroup', id, name }); return { ...result, id } },
    groupSelectedItems: (ids, name) => { const id = newMapId(); const result = commit({ type: 'groupItems', id, ids, name }); return { ...result, id } },
    appendImportedDocument: (source) => {
      if (unfinished()) return failure(new Error('진행 중인 그리기 또는 형태 수정을 먼저 마쳐주세요.'))
      const previousIds = new Set(state.current.document.items.map((item) => item.id))
      const result = commit({ type: 'appendDocument', source })
      if (!result.ok) return result
      const document = state.current.document
      changeEditor({ pane: 'list', activeTool: null, draft: null, selectionMode: true, selectionIds: new Set(document.items.filter((item) => !previousIds.has(item.id)).map((item) => item.id)) })
      state.current.onSelect(null)
      return { ...result, document }
    },
    renameGroup: (id, name) => commit({ type: 'renameGroup', id, name }),
    ungroup: (id) => commit({ type: 'ungroup', id }), deleteGroup: (id) => commit({ type: 'deleteGroup', id }),
    moveItems: (ids, options) => commit({ type: 'moveItems', ids, ...options }), moveGroup: (id, options) => commit({ type: 'moveGroup', id, ...options }),
    setItemsStyle: (ids, patch) => commit({ type: 'styleItems', ids, patch }), setGroupLabels: (id, visible) => commit({ type: 'groupLabels', id, visible }),
    deleteItems: (ids) => { const result = commit({ type: 'deleteItems', ids }); if (result.ok) { state.current.onSelect(null); changeEditor({ selectionIds: new Set(), pane: 'list' }) }; return result },
    addBulkPoints: (rows, groupId) => { try { return commit({ type: 'addItems', items: bulkPointItems(rows, groupId, recentStyles.current.get('point')) }) } catch (error) { return failure(error) } },
    renameDocument: (name) => commit({ type: 'rename', name }),
  }
}
