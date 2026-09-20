import { EDIT_LAYERS } from './mapEditorOverlay.js'
import { MY_MAP_LAYER_IDS } from './mapDocumentOverlay.js'
import { dragEditorHandle, translateEditorItem } from './mapEditorGeometry.js'

export function bindEditorInteraction(map, read) {
  let drag = null, suppressClick = false, suppressTimer = null
  const doubleClick = map.doubleClickZoom.isEnabled()
  map.doubleClickZoom.disable()
  const query = (point, ids) => {
    const layers = ids.filter((id) => map.getLayer(id))
    return layers.length ? map.queryRenderedFeatures([[point.x - 5, point.y - 5], [point.x + 5, point.y + 5]], { layers }) : []
  }
  const coordinate = (event) => [event.lngLat.lng, event.lngLat.lat]
  const release = () => {
    if (!drag) return
    if (drag.panEnabled) map.dragPan.enable()
    drag = null
    map.getCanvas().style.cursor = ''
  }
  const down = (event) => {
    if (event.originalEvent?.button !== 0) return
    const actions = read(), edit = actions.editor.geometryEdit
    if (!edit) return
    const hits = query(event.point, EDIT_LAYERS)
    const hit = hits.find((f) => f.properties.role !== 'shape') ?? hits[0]
    if (!hit) return
    event.preventDefault()
    const handle = hit.properties, panEnabled = map.dragPan.isEnabled()
    map.dragPan.disable()
    drag = { item: edit.item, itemId: edit.itemId, handle, from: coordinate(event), screen: event.point, panEnabled, moved: false }
    if (['vertex', 'midpoint'].includes(handle.role)) {
      const item = handle.role === 'midpoint' ? dragEditorHandle(edit.item, handle, coordinate(event)) : edit.item
      actions.updateGeometryPreview(item, { ring: Number(handle.ring ?? 0), index: Number(handle.index) })
      if (handle.role === 'midpoint') { drag.item = item; drag.handle = { ...handle, role: 'vertex' } }
    }
    map.getCanvas().style.cursor = 'grabbing'
  }
  const move = (event) => {
    const actions = read(), point = coordinate(event)
    if (drag) {
      if (actions.editor.geometryEdit?.itemId !== drag.itemId) { release(); return }
      if (Math.hypot(event.point.x - drag.screen.x, event.point.y - drag.screen.y) > 2) drag.moved = true
      try {
        const item = drag.handle.role === 'shape' ? translateEditorItem(drag.item, drag.from, point) : dragEditorHandle(drag.item, drag.handle, point)
        actions.updateGeometryPreview(item)
      } catch { /* Keep the last valid preview when a drag leaves the coordinate range. */ }
      return
    }
    if (actions.editor.activeTool) { actions.updateDraftPointer(point); map.getCanvas().style.cursor = 'crosshair' }
  }
  const up = () => {
    if (!drag) return
    suppressClick = drag.moved
    release()
    clearTimeout(suppressTimer)
    suppressTimer = setTimeout(() => { suppressClick = false }, 0)
  }
  const click = (event) => {
    if (suppressClick) return
    const actions = read()
    if (actions.editor.activeTool) { actions.addDraftPoint(coordinate(event)); return }
    if (actions.editor.geometryEdit) return
    const hit = query(event.point, MY_MAP_LAYER_IDS).find((f) => f.properties.__file === actions.documentId)
    if (hit) {
      if (actions.editor.selectionMode) actions.toggleEditorSelection(hit.properties.itemId)
      else actions.selectEditorItem(hit.properties.itemId)
    }
  }
  const dblclick = (event) => {
    const actions = read()
    if (['line', 'polygon'].includes(actions.editor.activeTool)) { event.preventDefault(); actions.finishDraft() }
  }
  const keydown = (event) => {
    if (event.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return
    const actions = read(), mod = event.ctrlKey || event.metaKey
    let handle = null
    if (mod && event.key.toLowerCase() === 'z') handle = event.shiftKey ? actions.redoEdit : actions.editor.draft?.coordinates.length ? actions.undoDraftPoint : actions.undoEdit
    else if (mod && event.key.toLowerCase() === 'y') handle = actions.redoEdit
    else if (event.key === 'Enter') handle = actions.editor.geometryEdit ? actions.commitGeometryEdit : actions.editor.activeTool ? actions.finishDraft : null
    else if (event.key === 'Escape') handle = actions.editor.geometryEdit ? actions.cancelGeometryEdit : actions.editor.activeTool ? actions.cancelDraft : null
    else if (['Delete', 'Backspace'].includes(event.key) && actions.editor.geometryEdit) handle = actions.deleteGeometryVertex
    if (handle) { event.preventDefault(); event.stopImmediatePropagation(); handle() }
  }
  map.on('mousedown', down); map.on('mousemove', move); map.on('mouseup', up); map.on('click', click); map.on('dblclick', dblclick)
  window.addEventListener('mouseup', up)
  window.addEventListener('keydown', keydown, true)
  return () => {
    release(); clearTimeout(suppressTimer)
    map.off('mousedown', down); map.off('mousemove', move); map.off('mouseup', up); map.off('click', click); map.off('dblclick', dblclick)
    window.removeEventListener('mouseup', up); window.removeEventListener('keydown', keydown, true)
    if (doubleClick) map.doubleClickZoom.enable()
    map.getCanvas().style.cursor = ''
  }
}
