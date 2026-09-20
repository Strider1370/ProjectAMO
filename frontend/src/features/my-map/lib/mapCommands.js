import { createMapItem, newMapId, validateItem, moveMapItems, circleGeometry } from './mapDocument.js'

const requireGroup = (doc, id) => {
  if (id != null && !doc.groups.some((group) => group.id === id)) throw new Error('그룹을 찾지 못했습니다.')
}
const requireName = (name) => {
  if (typeof name !== 'string' || !name.trim()) throw new Error('이름을 입력하세요.')
  if (name.length > 200) throw new Error('이름은 200자까지 입력할 수 있습니다.')
  return name.trim()
}
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const finiteRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max
const HEX = /^#[0-9a-f]{6}$/i

export function validateMapAppearance(item) {
  const s = item.style, label = item.label
  if (!s || !HEX.test(s.color) || !HEX.test(s.fillColor)) throw new Error('색상을 확인하세요.')
  if (!finiteRange(s.width, 0, 30) || !finiteRange(s.pointSize, 1, 50) || !finiteRange(s.opacity, 0, 1) || !finiteRange(s.fillOpacity, 0, 1)) throw new Error('굵기·크기·투명도 범위를 확인하세요.')
  if (!['solid', 'dashed', 'dotted'].includes(s.dash)) throw new Error('선 모양을 확인하세요.')
  if (!['dot', 'pin', 'triangle', 'square', 'star', 'cross'].includes(s.icon)) throw new Error('지점 모양을 확인하세요.')
  if (!label || typeof label.visible !== 'boolean' || typeof label.always !== 'boolean' || !finiteRange(label.size, 8, 32)) throw new Error('이름표 설정을 확인하세요.')
}

function patchItem(item, patch) {
  const allowed = new Set(['name', 'description', 'groupId', 'style', 'label', 'altitude'])
  if (Object.keys(patch).some((key) => !allowed.has(key))) throw new Error('이 속성은 직접 변경할 수 없습니다.')
  const next = { ...item, ...patch }
  for (const key of ['style', 'label', 'altitude']) if (patch[key]) next[key] = { ...item[key], ...patch[key] }
  if (own(patch, 'name')) requireName(next.name)
  if (own(patch, 'description') && (typeof next.description !== 'string' || next.description.length > 20000)) throw new Error('메모는 20,000자까지 입력할 수 있습니다.')
  validateMapAppearance(next)
  const { floorFt, ceilingFt, datum } = next.altitude
  if (![floorFt, ceilingFt].every((v) => v === null || finiteRange(v, -2000, 100000))) throw new Error('고도 범위를 확인하세요.')
  if (!['MSL', 'AGL', 'FL', 'unknown'].includes(datum)) throw new Error('고도 기준을 확인하세요.')
  if (floorFt !== null && ceilingFt !== null && floorFt >= ceilingFt) throw new Error('바닥 고도는 천장 고도보다 낮아야 합니다.')
  return next
}

/** One invocation is one completed user action; geometry previews never enter this function. */
export function applyMapCommand(document, command) {
  if (document.kind !== 'personal') throw new Error('개인 지도 사본에서 수정할 수 있습니다.')
  let next = document
  switch (command.type) {
    case 'rename': next = { ...document, name: requireName(command.name) }; break
    case 'addItems': {
      const ids = new Set(document.items.map((item) => item.id))
      const offsets = new Map()
      const items = command.items.map((item) => {
        requireGroup(document, item.groupId)
        if (ids.has(item.id)) throw new Error('항목 식별자가 중복됩니다.')
        ids.add(item.id)
        const error = validateItem(item)
        if (error) throw new Error(error)
        validateMapAppearance(item)
        const offset = offsets.get(item.groupId) ?? Math.max(-1, ...document.items.filter((entry) => entry.groupId === item.groupId).map((entry) => entry.order)) + 1
        offsets.set(item.groupId, offset + 1)
        return { ...item, order: offset }
      })
      if (!items.length) return document
      next = { ...document, items: [...document.items, ...items] }; break
    }
    case 'updateItem': {
      if (own(command.patch, 'groupId')) requireGroup(document, command.patch.groupId)
      if (!document.items.some((item) => item.id === command.id)) throw new Error('항목을 찾지 못했습니다.')
      const prior = document.items.find((item) => item.id === command.id)
      const base = own(command.patch, 'groupId') && prior.groupId !== command.patch.groupId
        ? moveMapItems(document, [command.id], command.patch.groupId) : document
      next = { ...base, items: base.items.map((item) => item.id === command.id ? patchItem(item, command.patch) : item) }; break
    }
    case 'geometry': {
      const current = document.items.find((item) => item.id === command.id)
      if (!current || current.kind === 'compound') throw new Error('이 항목은 형태 수정 대상이 아닙니다.')
      const item = { ...current, geometry: command.geometry, definition: command.definition ?? current.definition }
      if (item.kind === 'circle') item.geometry = circleGeometry(item.definition)
      const error = validateItem(item)
      if (error) throw new Error(error)
      next = { ...document, items: document.items.map((old) => old.id === current.id ? item : old) }; break
    }
    case 'deleteItems': {
      const ids = new Set(command.ids)
      next = { ...document, items: document.items.filter((item) => !ids.has(item.id)) }; break
    }
    case 'moveItems': next = moveMapItems(document, command.ids, command.targetGroupId, command.beforeItemId); break
    case 'styleItems': {
      const ids = new Set(command.ids)
      next = { ...document, items: document.items.map((item) => ids.has(item.id) ? patchItem(item, { style: command.patch }) : item) }; break
    }
    case 'createGroup': {
      const id = command.id ?? newMapId()
      if (document.groups.some((g) => g.id === id)) throw new Error('그룹 식별자가 중복됩니다.')
      next = { ...document, groups: [...document.groups, { id, name: requireName(command.name), parentId: null, sourceVisibility: null, order: Math.max(document.ungroupedOrder ?? 0, ...document.groups.map((g) => g.order)) + 1 }] }; break
    }
    case 'renameGroup': {
      requireGroup(document, command.id)
      const name = requireName(command.name)
      next = { ...document, groups: document.groups.map((group) => group.id === command.id ? { ...group, name } : group) }; break
    }
    case 'ungroup': {
      requireGroup(document, command.id)
      const moved = moveMapItems(document, document.items.filter((item) => item.groupId === command.id).map((item) => item.id), null)
      next = { ...moved, groups: moved.groups.filter((group) => group.id !== command.id) }; break
    }
    case 'deleteGroup': {
      requireGroup(document, command.id)
      next = { ...document, groups: document.groups.filter((group) => group.id !== command.id), items: document.items.filter((item) => item.groupId !== command.id) }; break
    }
    case 'moveGroup': {
      requireGroup(document, command.id)
      if (command.id === command.beforeGroupId) return document
      const groups = [...document.groups, { id: null, order: document.ungroupedOrder ?? document.groups.length }].sort((a, b) => a.order - b.order)
      const moved = groups.find((group) => group.id === command.id)
      const remaining = groups.filter((group) => group.id !== command.id)
      const before = command.beforeGroupId === '__ungrouped__' ? null : command.beforeGroupId
      const position = command.beforeGroupId == null ? remaining.length : remaining.findIndex((group) => group.id === before)
      remaining.splice(position < 0 ? remaining.length : position, 0, moved)
      next = { ...document, groups: remaining.filter((group) => group.id !== null).map((group) => ({ ...group, order: remaining.indexOf(group) })), ungroupedOrder: remaining.findIndex((group) => group.id === null) }; break
    }
    case 'groupLabels': {
      requireGroup(document, command.id)
      next = { ...document, items: document.items.map((item) => item.groupId === command.id ? { ...item, label: { ...item.label, visible: command.visible === true } } : item) }; break
    }
    default: throw new Error('지원하지 않는 지도 변경입니다.')
  }
  return next === document ? document : { ...next, updatedAt: new Date().toISOString() }
}

export function bulkPointItems(rows, groupId = null, style = undefined) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('추가할 좌표를 입력하세요.')
  return rows.map((row, index) => createMapItem('point', { type: 'Point', coordinates: row.coordinate }, { name: row.name?.trim() || `지점 ${index + 1}`, groupId, ...(style ? { style } : {}) }))
}
