import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Button } from '../../shared/ui/fluent.js'
import MapEditorToolbar from './MapEditorToolbar.jsx'
import MapEditorTree from './MapEditorTree.jsx'
import MapItemEditor from './MapItemEditor.jsx'
import MapBulkCoordinatePanel from './MapBulkCoordinatePanel.jsx'
import './MyMapEditor.css'

function ConfirmDialog({ target, onClose, onConfirm }) {
  if (!target) return null
  const group = target.type === 'group'
  return <Dialog open onOpenChange={(_, data) => { if (!data.open) onClose() }}><DialogSurface><DialogBody><DialogTitle>{group ? '그룹을 삭제할까요?' : '선택 항목을 삭제할까요?'}</DialogTitle><DialogContent><p>{group ? `${target.value.name} 그룹과 그 안의 ${target.count}개 항목이 함께 삭제됩니다.` : `${target.value.length}개 항목을 삭제합니다.`}</p></DialogContent><DialogActions><Button appearance="secondary" onClick={onClose}>취소</Button><Button appearance="primary" onClick={() => { onConfirm(target); onClose() }}>삭제</Button></DialogActions></DialogBody></DialogSurface></Dialog>
}

export function DocumentNameField({ value, onRename }) {
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState('')
  const lastSent = useRef(value ?? '')
  useEffect(() => { setDraft(value ?? ''); lastSent.current = value ?? '' }, [value])
  const commit = () => {
    const name = draft.trim()
    if (!name) { setError('지도 이름을 입력하세요.'); return }
    if (name === lastSent.current) { setError(''); return }
    const result = onRename(name)
    if (result?.ok === false) { setError(result.error); return }
    lastSent.current = name
    setError('')
  }
  return <label className="my-map-editor-document-name"><span className="sr-only">지도 이름</span><input maxLength={200} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); commit(); event.currentTarget.blur() } }} />{error && <small className="my-map-editor-error" role="alert">{error}</small>}</label>
}

export default function MyMapEditor({ myMap, document, onImport }) {
  const editor = myMap.editor ?? {}
  const [groupName, setGroupName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const item = document.items?.find((candidate) => candidate.id === myMap.selectedId) ?? null
  const action = (name, ...args) => myMap[name]?.(...args)
  const createGroup = () => {
    const name = groupName.trim()
    if (!name) return
    action('createGroup', name)
    setGroupName('')
  }
  const deleteConfirm = (target) => target.type === 'group' ? action('deleteGroup', target.value.id) : action('deleteItems', target.value)
  return <section className="my-map-editor" aria-label="내 지도 편집">
    {editor.pane !== 'bulk' && <MapEditorToolbar editor={editor} groups={document.groups ?? []} onAction={action} />}
    <details className="my-map-extra-tools"><summary>추가 도구</summary><div>{onImport && <button type="button" className="my-map-header-button" onClick={onImport}>KML/KMZ 추가</button>}<button type="button" className="my-map-header-button" onClick={() => action('setEditorPane', 'bulk')}>좌표 여러 줄 입력</button></div></details>
    {editor.pane === 'bulk' ? <MapBulkCoordinatePanel groups={document.groups ?? []} onBack={() => action('setEditorPane', 'list')} onAdd={(rows, groupId) => { const result = action('addBulkPoints', rows, groupId); if (result?.ok !== false) action('setEditorPane', 'list') }} /> : editor.pane === 'item' && item ? <MapItemEditor item={item} groups={document.groups ?? []} editor={editor} onAction={action} /> : <><div className="my-map-editor-list-actions"><button type="button" className="my-map-header-button" aria-expanded={groupOpen} onClick={() => setGroupOpen(!groupOpen)}>+ 그룹</button>{groupOpen && <form onSubmit={(event) => { event.preventDefault(); createGroup() }}><input autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="새 그룹 이름" aria-label="새 그룹 이름" /><button type="submit" className="my-map-secondary-button">그룹 추가</button></form>}</div>{!document.items.length && !document.groups.length ? <p className="my-map-editor-empty">아직 표시한 항목이 없습니다.<br />위에서 도구를 골라 시작하세요.</p> : <MapEditorTree document={document} editor={editor} onAction={action} onDeleteGroup={(group) => setDeleteTarget({ type: 'group', value: group, count: document.items.filter((item) => item.groupId === group.id).length })} onDeleteItems={(ids) => setDeleteTarget({ type: 'items', value: ids })} />}</>}
    <ConfirmDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteConfirm} />
  </section>
}
