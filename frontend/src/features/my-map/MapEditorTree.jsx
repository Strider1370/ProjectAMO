import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Minus, Pencil, Trash2 } from 'lucide-react'

const ordered = (rows) => [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

function GroupRows({ group, groups, items, editor, expanded, query, onAction, onDeleteGroup, onDeleteItems }) {
  const [dragOver, setDragOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group?.name ?? '')
  const expandTimer = useRef(null)
  const renameCommitted = useRef(false)
  const open = expanded.has(group?.id ?? '__ungrouped__') || Boolean(query)
  const groupId = group?.id ?? null
  const id = groupId ?? '__ungrouped__'
  const selected = editor.selectionIds ?? new Set()
  const selectionMode = editor.selectionMode
  const labelsVisible = items.length > 0 && items.every((item) => item.label?.visible ?? true)
  useEffect(() => { setName(group?.name ?? ''); setRenaming(false) }, [group?.id, group?.name])
  useEffect(() => () => clearTimeout(expandTimer.current), [])
  const clearExpandTimer = () => { clearTimeout(expandTimer.current); expandTimer.current = null }
  const queueExpand = () => {
    if (query || open || expandTimer.current) return
    expandTimer.current = setTimeout(() => { onAction('toggleExpanded', id); expandTimer.current = null }, 600)
  }
  const commitRename = () => {
    if (renameCommitted.current) return
    renameCommitted.current = true
    const nextName = name.trim()
    if (nextName && nextName !== group.name) onAction('renameGroup', group.id, nextName)
    setRenaming(false)
  }
  const dropItems = (event, beforeItemId = null) => {
    event.preventDefault(); setDragOver(false)
    const draggedGroup = event.dataTransfer.getData('application/x-projectamo-map-group')
    if (draggedGroup) {
      if (draggedGroup !== String(groupId ?? '__ungrouped__')) onAction('moveGroup', draggedGroup === '__ungrouped__' ? null : draggedGroup, { beforeGroupId: groupId ?? '__ungrouped__' })
      return
    }
    const payload = event.dataTransfer.getData('application/x-projectamo-map-items')
    if (!payload) return
    const ids = JSON.parse(payload)
    onAction('moveItems', ids, { targetGroupId: groupId, beforeItemId })
  }
  return <li className={`my-map-editor-group${dragOver ? ' is-drag-over' : ''}`} onDragOver={(event) => { if (!query) { event.preventDefault(); setDragOver(true); queueExpand() } }} onDragLeave={() => { setDragOver(false); clearExpandTimer() }} onDrop={(event) => { clearExpandTimer(); dropItems(event) }}>
    <div className="my-map-editor-group-head" draggable={!query} onDragStart={(event) => { event.dataTransfer.setData('application/x-projectamo-map-group', group?.id ?? '__ungrouped__'); event.dataTransfer.effectAllowed = 'move' }}>
      {!query && <span className="my-map-editor-grip" aria-hidden="true"><GripVertical size={16} /></span>}
      <button type="button" className="my-map-tree-caret" onClick={() => onAction('toggleExpanded', id)} aria-expanded={open}>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
      {renaming ? <form className="my-map-editor-group-rename" onSubmit={(event) => { event.preventDefault(); commitRename() }}><input aria-label="그룹 이름" autoFocus value={name} onChange={(event) => setName(event.target.value)} onBlur={commitRename} /></form> : <button type="button" className="my-map-editor-group-name" onClick={() => onAction('setTargetGroup', groupId)}>{group?.name ?? '그룹 없는 항목'} <small>{items.length}</small></button>}
      {group && <><button type="button" className="my-map-icon-button" aria-label={`${group.name} 이름 변경`} onClick={() => { renameCommitted.current = false; setRenaming(true) }}><Pencil size={16} /></button><label className="my-map-editor-label-toggle"><input type="checkbox" aria-label={`${group.name} 항목 이름표 표시`} checked={labelsVisible} onChange={(event) => onAction('setGroupLabels', group.id, event.target.checked)} />이름표</label><select className="my-map-editor-order" aria-label={`${group.name} 그룹 순서`} defaultValue="" onChange={(event) => { const beforeGroupId = event.target.value; if (beforeGroupId) onAction('moveGroup', group.id, { beforeGroupId: beforeGroupId === '__last__' ? null : beforeGroupId }); event.target.value = '' }}><option value="">순서</option>{groups.filter((entry) => entry.id !== group.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} 앞</option>)}<option value="__ungrouped__">그룹 없는 항목 앞</option><option value="__last__">맨 끝</option></select><button type="button" className="my-map-icon-button" aria-label={`${group.name} 그룹 해제`} onClick={() => onAction('ungroup', group.id)}><Minus size={16} /></button><button type="button" className="my-map-icon-button my-map-delete-button" aria-label={`${group.name} 그룹 삭제`} onClick={() => onDeleteGroup(group)}><Trash2 size={16} /></button></>}
    </div>
    {open && <ul className="my-map-editor-items">{items.map((item) => {
      const isSelected = selected.has(item.id)
      return <li key={item.id} className={`my-map-editor-item${isSelected ? ' is-selected' : ''}`} draggable={!query} onDragStart={(event) => { const ids = isSelected ? [...selected] : [item.id]; event.dataTransfer.setData('application/x-projectamo-map-items', JSON.stringify(ids)); event.dataTransfer.effectAllowed = 'move' }} onDragOver={(event) => { if (!query) event.preventDefault() }} onDrop={(event) => dropItems(event, item.id)}>
        {!query && <span className="my-map-editor-grip" aria-hidden="true"><GripVertical size={16} /></span>}
        {selectionMode && <input type="checkbox" aria-label={`${item.name} 선택`} checked={isSelected} onChange={() => onAction('toggleEditorSelection', item.id)} />}
        <button type="button" className="my-map-editor-item-name" onClick={() => selectionMode ? onAction('toggleEditorSelection', item.id) : onAction('selectEditorItem', item.id)}><span aria-hidden="true">{item.kind === 'point' ? '●' : item.kind === 'line' ? '━' : item.kind === 'circle' ? '○' : '⬠'}</span>{item.name || '이름 없는 항목'}</button>
      </li>
    })}</ul>}
  </li>
}

export default function MapEditorTree({ document, editor, onAction, onDeleteGroup, onDeleteItems }) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set([...(document.groups ?? []).map((group) => group.id), '__ungrouped__']))
  const groups = ordered(document.groups ?? [])
  const itemsByGroup = useMemo(() => new Map([...groups.map((group) => [group.id, []]), ['__ungrouped__', []]]), [groups])
  for (const item of ordered(document.items ?? [])) (itemsByGroup.get(item.groupId) ?? itemsByGroup.get('__ungrouped__')).push(item)
  const normalized = query.trim().toLocaleLowerCase()
  const visible = (group, items) => !normalized || group?.name?.toLocaleLowerCase().includes(normalized) || items.some((item) => item.name?.toLocaleLowerCase().includes(normalized))
  const selected = editor.selectionIds ?? new Set()
  const moveTarget = (event) => onAction('moveItems', [...selected], { targetGroupId: event.target.value === '__ungrouped__' ? null : event.target.value })
  const localAction = (name, ...args) => name === 'toggleExpanded' ? setExpanded((previous) => { const next = new Set(previous); next.has(args[0]) ? next.delete(args[0]) : next.add(args[0]); return next }) : onAction(name, ...args)
  return <section className="my-map-editor-tree" aria-label="편집 항목 목록">
    <div className="my-map-editor-tree-actions"><input type="search" placeholder="항목 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className="my-map-secondary-button" onClick={() => onAction('setSelectionMode', !editor.selectionMode)}>{editor.selectionMode ? '선택 마침' : '선택'}</button></div>
    {query && <p className="my-map-editor-note">검색 중에는 순서를 바꿀 수 없습니다.</p>}
    <ul className="my-map-editor-groups">{groups.map((group) => { const items = itemsByGroup.get(group.id) ?? []; return visible(group, items) && <GroupRows key={group.id} {...{ group, groups, items, editor, expanded, query, onAction: localAction, onDeleteGroup, onDeleteItems }} /> })}<GroupRows group={null} groups={groups} items={itemsByGroup.get('__ungrouped__') ?? []} {...{ editor, expanded, query, onAction: localAction, onDeleteGroup, onDeleteItems }} /></ul>
    {editor.selectionMode && <div className="my-map-selection-actions"><strong>{selected.size}개 선택</strong><input type="color" aria-label="선택 항목 색" disabled={!selected.size} onChange={(event) => onAction('setItemsStyle', [...selected], { color: event.target.value })} /><select aria-label="선택 항목 이동할 그룹" defaultValue="" onChange={moveTarget} disabled={!selected.size}><option value="">그룹으로 이동</option><option value="__ungrouped__">그룹 없는 항목</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" className="my-map-secondary-button" disabled={!selected.size} onClick={() => onDeleteItems([...selected])}>삭제</button></div>}
  </section>
}
