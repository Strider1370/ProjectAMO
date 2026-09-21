import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Minus, Pencil, Trash2 } from 'lucide-react'
import { ungroupedRank } from './lib/mapDocument.js'
import useMapTreeAutoScroll from './useMapTreeAutoScroll.js'

const ordered = (rows) => [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
const GROUP_TYPE = 'application/x-projectamo-map-group'
const ITEMS_TYPE = 'application/x-projectamo-map-items'

function ItemOrder({ item, items, groupId, query, onAction }) {
  const index = items.findIndex((row) => row.id === item.id)
  return <select className="my-map-editor-order" aria-label={item.name + ' 항목 순서'} value="" disabled={Boolean(query) || items.length < 2} onChange={(event) => {
    const direction = event.target.value
    if (query || !direction) return
    const beforeItemId = direction === 'first' ? items[0].id : direction === 'up' ? items[index - 1]?.id : direction === 'down' ? items[index + 2]?.id ?? null : null
    onAction('moveItems', [item.id], { targetGroupId: groupId, beforeItemId })
  }}>
    <option value="">순서</option>
    <option value="first" disabled={index === 0}>맨 위로</option>
    <option value="up" disabled={index === 0}>위로</option>
    <option value="down" disabled={index === items.length - 1}>아래로</option>
    <option value="last" disabled={index === items.length - 1}>맨 아래로</option>
  </select>
}

function GroupRows({ group, groups, items, editor, expanded, query, onAction, onDeleteGroup }) {
  const [dragOver, setDragOver] = useState(false)
  const [insertBefore, setInsertBefore] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group?.name ?? '')
  const expandTimer = useRef(null), renameCommitted = useRef(false)
  const groupId = group?.id ?? null, id = groupId ?? '__ungrouped__'
  const groupName = group?.name ?? '그룹 없는 항목'
  const open = expanded.has(id) || Boolean(query)
  const selected = editor.selectionIds ?? new Set()
  const labelsVisible = items.length > 0 && items.every((item) => item.label?.visible ?? true)
  useEffect(() => { setName(group?.name ?? ''); setRenaming(false) }, [group?.id, group?.name])
  useEffect(() => () => clearTimeout(expandTimer.current), [])
  const clearExpandTimer = () => { clearTimeout(expandTimer.current); expandTimer.current = null }
  const clearDrop = () => { setDragOver(false); setInsertBefore(null); clearExpandTimer() }
  const queueExpand = () => {
    if (query || open || expandTimer.current) return
    expandTimer.current = setTimeout(() => { onAction('expand', id); expandTimer.current = null }, 600)
  }
  const commitRename = () => {
    if (renameCommitted.current) return
    renameCommitted.current = true
    const nextName = name.trim()
    if (nextName && nextName !== group.name) onAction('renameGroup', group.id, nextName)
    setRenaming(false)
  }
  const dragOverAt = (event, beforeItemId = null) => {
    if (query || ![...event.dataTransfer.types].some((type) => type === GROUP_TYPE || type === ITEMS_TYPE)) return
    event.preventDefault(); event.stopPropagation()
    setDragOver(true)
    setInsertBefore(event.dataTransfer.types.includes(ITEMS_TYPE) ? beforeItemId : null)
    queueExpand()
  }
  const dropItems = (event, beforeItemId = null) => {
    event.preventDefault(); event.stopPropagation(); clearDrop()
    if (query) return
    const draggedGroup = event.dataTransfer.getData(GROUP_TYPE)
    if (draggedGroup) {
      if (draggedGroup !== id) onAction('moveGroup', draggedGroup === '__ungrouped__' ? null : draggedGroup, { beforeGroupId: id })
      return
    }
    const payload = event.dataTransfer.getData(ITEMS_TYPE)
    if (!payload) return
    let ids
    try { ids = JSON.parse(payload) } catch { return }
    if (!Array.isArray(ids) || !ids.length || !ids.every((entry) => typeof entry === 'string') || ids.includes(beforeItemId)) return
    onAction('moveItems', ids, { targetGroupId: groupId, beforeItemId })
  }
  return <li className={'my-map-editor-group' + (dragOver ? ' is-drag-over' : '')}
    onDragOver={(event) => dragOverAt(event)}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) clearDrop() }}
    onDragEnd={clearDrop} onDrop={(event) => dropItems(event)}>
    <div className="my-map-editor-group-head" draggable={!query} onDragStart={(event) => {
      event.dataTransfer.setData(GROUP_TYPE, id); event.dataTransfer.effectAllowed = 'move'
    }}>
      {!query && <span className="my-map-editor-grip" aria-hidden="true"><GripVertical size={16} /></span>}
      <button type="button" className="my-map-tree-caret" aria-label={groupName + (open ? ' 접기' : ' 펼치기')} onClick={() => onAction('toggleExpanded', id)} aria-expanded={open}>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
      {renaming ? <form className="my-map-editor-group-rename" onSubmit={(event) => { event.preventDefault(); commitRename() }}><input aria-label="그룹 이름" autoFocus value={name} onChange={(event) => setName(event.target.value)} onBlur={commitRename} /></form>
        : <button type="button" className="my-map-editor-group-name" onClick={() => onAction('setTargetGroup', groupId)}>{groupName} <small>{items.length}</small></button>}
      {group && <button type="button" className="my-map-icon-button" aria-label={groupName + ' 이름 변경'} onClick={() => { renameCommitted.current = false; setRenaming(true) }}><Pencil size={16} /></button>}
      <div className="my-map-editor-group-tools">
        {group && <label className="my-map-editor-label-toggle"><input type="checkbox" aria-label={groupName + ' 항목 이름표 표시'} checked={labelsVisible} onChange={(event) => onAction('setGroupLabels', group.id, event.target.checked)} />이름표</label>}
        <select className="my-map-editor-order" aria-label={groupName + ' 그룹 순서'} value="" disabled={Boolean(query)} onChange={(event) => {
          const beforeGroupId = event.target.value
          if (!query && beforeGroupId) onAction('moveGroup', groupId, { beforeGroupId: beforeGroupId === '__last__' ? null : beforeGroupId })
        }}>
          <option value="">순서</option>
          {groups.filter((entry) => entry.id !== groupId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} 앞</option>)}
          {group && <option value="__ungrouped__">그룹 없는 항목 앞</option>}
          <option value="__last__">맨 끝</option>
        </select>
        {group && <><button type="button" className="my-map-icon-button" aria-label={groupName + ' 그룹 해제'} onClick={() => onAction('ungroup', group.id)}><Minus size={16} /></button><button type="button" className="my-map-icon-button my-map-delete-button" aria-label={groupName + ' 그룹 삭제'} onClick={() => onDeleteGroup(group)}><Trash2 size={16} /></button></>}
      </div>
    </div>
    {open && <ul className="my-map-editor-items">
      {!items.length && <li className="my-map-editor-empty-group">여기에 항목을 놓을 수 있습니다.</li>}
      {items.map((item) => {
        const isSelected = selected.has(item.id)
        return <li key={item.id} className={'my-map-editor-item' + (isSelected ? ' is-selected' : '') + (insertBefore === item.id ? ' is-insert-before' : '')}
          draggable={!query} onDragStart={(event) => {
            event.dataTransfer.setData(ITEMS_TYPE, JSON.stringify(isSelected ? [...selected] : [item.id])); event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => dragOverAt(event, item.id)} onDrop={(event) => dropItems(event, item.id)}>
          {!query && <span className="my-map-editor-grip" aria-hidden="true"><GripVertical size={16} /></span>}
          {editor.selectionMode && <input type="checkbox" aria-label={item.name + ' 선택'} checked={isSelected} onChange={() => onAction('toggleEditorSelection', item.id)} />}
          <button type="button" className="my-map-editor-item-name" onClick={() => editor.selectionMode ? onAction('toggleEditorSelection', item.id) : onAction('selectEditorItem', item.id)}><span aria-hidden="true">{item.kind === 'point' ? '●' : item.kind === 'line' ? '━' : item.kind === 'circle' ? '○' : '⬠'}</span>{item.name || '이름 없는 항목'}</button>
          <ItemOrder {...{ item, items, groupId, query, onAction }} />
        </li>
      })}
    </ul>}
  </li>
}

export default function MapEditorTree({ document, editor, onAction, onDeleteGroup, onDeleteItems }) {
  const [query, setQuery] = useState('')
  const [newGroup, setNewGroup] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set([...(document.groups ?? []).map((group) => group.id), '__ungrouped__']))
  const [endOver, setEndOver] = useState(false)
  useEffect(() => {
    if (!editor.selectionIds?.size) return
    setExpanded((previous) => {
      const next = new Set(previous)
      for (const item of document.items) if (editor.selectionIds.has(item.id)) next.add(item.groupId ?? '__ungrouped__')
      return next
    })
  }, [editor.selectionIds, document.items])
  const dragScroll = useMapTreeAutoScroll(Boolean(query))
  const groups = ordered(document.groups ?? [])
  const blocks = [...groups]
  blocks.splice(ungroupedRank(document, groups.length), 0, null)
  const itemsByGroup = useMemo(() => {
    const result = new Map([...(document.groups ?? []).map((group) => [group.id, []]), ['__ungrouped__', []]])
    for (const item of ordered(document.items ?? [])) (result.get(item.groupId) ?? result.get('__ungrouped__')).push(item)
    return result
  }, [document.groups, document.items])
  const normalized = query.trim().toLocaleLowerCase()
  const visible = (group, items) => !normalized || group?.name?.toLocaleLowerCase().includes(normalized) || items.some((item) => item.name?.toLocaleLowerCase().includes(normalized))
  const selected = editor.selectionIds ?? new Set()
  const localAction = (action, ...args) => {
    if (action === 'toggleExpanded' || action === 'expand') {
      setExpanded((previous) => { const next = new Set(previous); if (action === 'toggleExpanded' && next.has(args[0])) next.delete(args[0]); else next.add(args[0]); return next })
      return
    }
    return onAction(action, ...args)
  }
  const moveTarget = (event) => {
    const target = event.target.value
    if (!target) return
    if (target === '__new__') { setNewGroup(''); return }
    const groupId = target === '__ungrouped__' ? null : target
    const result = onAction('moveItems', [...selected], { targetGroupId: groupId })
    if (result?.ok !== false) localAction('expand', groupId ?? '__ungrouped__')
  }
  const createSelectedGroup = (event) => {
    event.preventDefault()
    if (!newGroup?.trim() || !selected.size) return
    const result = onAction('groupSelectedItems', [...selected], newGroup.trim())
    if (result?.ok !== false && result?.id) { localAction('expand', result.id); setNewGroup(null) }
  }
  return <section className="my-map-editor-tree" aria-label="편집 항목 목록" {...dragScroll}>
    <div className="my-map-editor-tree-actions"><input type="search" aria-label="항목 이름 검색" placeholder="항목 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className="my-map-secondary-button" onClick={() => { setNewGroup(null); onAction('setSelectionMode', !editor.selectionMode) }}>{editor.selectionMode ? '선택 마침' : '선택'}</button></div>
    {query && <p className="my-map-editor-note">검색 중에는 순서를 바꿀 수 없습니다.</p>}
    <ul className="my-map-editor-groups">{blocks.map((group) => {
      const id = group?.id ?? '__ungrouped__', items = itemsByGroup.get(id) ?? []
      return visible(group, items) && <GroupRows key={id} {...{ group, groups, items, editor, expanded, query, onAction: localAction, onDeleteGroup }} />
    })}</ul>
    {!query && <div className={'my-map-editor-group-end' + (endOver ? ' is-drag-over' : '')}
      onDragOver={(event) => { if (event.dataTransfer.types.includes(GROUP_TYPE)) { event.preventDefault(); setEndOver(true) } }}
      onDragLeave={() => setEndOver(false)} onDragEnd={() => setEndOver(false)}
      onDrop={(event) => {
        event.preventDefault(); setEndOver(false)
        const id = event.dataTransfer.getData(GROUP_TYPE)
        if (id) onAction('moveGroup', id === '__ungrouped__' ? null : id, { beforeGroupId: null })
      }}>그룹을 마지막으로 이동</div>}
    {editor.selectionMode && <div className="my-map-selection-actions">
      <strong>{selected.size}개 선택</strong>
      <input type="color" aria-label="선택 항목 색" disabled={!selected.size} onChange={(event) => onAction('setItemsStyle', [...selected], { color: event.target.value })} />
      <select aria-label="선택 항목 이동할 그룹" value="" onChange={moveTarget} disabled={!selected.size}><option value="">그룹으로 이동</option><option value="__new__">새 그룹으로 묶기…</option><option value="__ungrouped__">그룹 없는 항목</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
      <button type="button" className="my-map-secondary-button" disabled={!selected.size} onClick={() => onDeleteItems([...selected])}>삭제</button>
      {newGroup !== null && <form className="my-map-selection-new-group" onSubmit={createSelectedGroup}><label>새 그룹 이름<input autoFocus aria-label="선택 항목의 새 그룹 이름" value={newGroup} onChange={(event) => setNewGroup(event.target.value)} /></label><button type="submit" className="my-map-primary-button" disabled={!newGroup.trim() || !selected.size}>그룹으로 묶기</button><button type="button" className="my-map-secondary-button" onClick={() => setNewGroup(null)}>취소</button></form>}
    </div>}
  </section>
}
