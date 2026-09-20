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
  return <Dialog open onOpenChange={(_, data) => { if (!data.open) onClose() }}><DialogSurface><DialogBody><DialogTitle>{group ? '그룹을 삭제할까요?' : '선택 항목을 삭제할까요?'}</DialogTitle><DialogContent><p>{group ? `${target.value.name} 그룹과 그 안의 항목이 함께 삭제됩니다.` : `${target.value.length}개 항목을 삭제합니다.`}</p></DialogContent><DialogActions><Button appearance="secondary" onClick={onClose}>취소</Button><Button appearance="primary" onClick={() => { onConfirm(target); onClose() }}>삭제</Button></DialogActions></DialogBody></DialogSurface></Dialog>
}

function DocumentNameField({ value, onRename }) {
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
  return <label className="my-map-editor-document-name"><span>지도 이름</span><input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur() } }} />{error && <small className="my-map-editor-error" role="alert">{error}</small>}</label>
}

export default function MyMapEditor({ myMap, document }) {
  const editor = myMap.editor ?? {}
  const [groupName, setGroupName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
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
    <div className="my-map-editor-heading"><div><h2>지도 편집</h2><DocumentNameField value={document.name} onRename={(name) => action('renameDocument', name)} />{myMap.saveStatus && <p>{myMap.saveStatus.message}</p>}</div><button type="button" className="my-map-primary-button" onClick={() => action('finishEditing')}>편집 마침</button></div>
    {editor.pane !== 'bulk' && <MapEditorToolbar editor={editor} groups={document.groups ?? []} onAction={action} />}
    {editor.pane === 'bulk' ? <MapBulkCoordinatePanel groups={document.groups ?? []} onBack={() => action('setEditorPane', 'list')} onAdd={(rows, groupId) => { const result = action('addBulkPoints', rows, groupId); if (result?.ok !== false) action('setEditorPane', 'list') }} /> : editor.pane === 'item' && item ? <MapItemEditor item={item} groups={document.groups ?? []} editor={editor} onAction={action} /> : <><div className="my-map-editor-list-actions"><form onSubmit={(event) => { event.preventDefault(); createGroup() }}><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="새 그룹 이름" aria-label="새 그룹 이름" /><button type="submit" className="my-map-secondary-button">그룹 추가</button></form><button type="button" className="my-map-secondary-button" onClick={() => action('setEditorPane', 'bulk')}>좌표 여러 줄 입력</button></div><MapEditorTree document={document} editor={editor} onAction={action} onDeleteGroup={(group) => setDeleteTarget({ type: 'group', value: group })} onDeleteItems={(ids) => setDeleteTarget({ type: 'items', value: ids })} /></>}
    <ConfirmDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteConfirm} />
  </section>
}
