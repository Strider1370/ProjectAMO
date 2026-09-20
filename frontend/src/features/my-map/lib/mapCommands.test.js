import test from 'node:test'
import assert from 'node:assert/strict'
import { createMapDocument, createMapItem } from './mapDocument.js'
import { applyMapCommand, bulkPointItems } from './mapCommands.js'
const doc = () => ({ ...createMapDocument(), groups: [{ id: 'g', name: '그룹', parentId: null, order: 0 }], items: [createMapItem('point', { type: 'Point', coordinates: [126, 37] }, { id: 'i', groupId: 'g', name: '기존' })] })

test('ungroup keeps items, deletion removes items; neither mutates original', () => {
  const before = doc()
  const ungrouped = applyMapCommand(before, { type: 'ungroup', id: 'g' })
  assert.equal(ungrouped.groups.length, 0)
  assert.equal(ungrouped.items[0].groupId, null)
  assert.equal(applyMapCommand(before, { type: 'deleteGroup', id: 'g' }).items.length, 0)
  assert.equal(before.items[0].groupId, 'g')
})

test('invalid batch refuses the entire action and property updates cannot replace provenance', () => {
  const before = doc()
  assert.throws(() => bulkPointItems([{ coordinate: [126, 37] }, { coordinate: [999, 37] }]))
  const items = bulkPointItems([{ coordinate: [126, 37] }, { coordinate: [127, 38] }], 'g')
  assert.equal(applyMapCommand(before, { type: 'addItems', items }).items.length, 3)
  assert.equal(before.items.length, 1)
  assert.throws(() => applyMapCommand(before, { type: 'updateItem', id: 'i', patch: { source: null } }))
  assert.throws(() => applyMapCommand(before, { type: 'updateItem', id: 'i', patch: { altitude: { floorFt: 5000, ceilingFt: 5000 } } }))
  const changed = applyMapCommand(before, { type: 'updateItem', id: 'i', patch: { altitude: { floorFt: 0, ceilingFt: null }, style: { color: '#112233' } } })
  assert.equal(changed.items[0].altitude.floorFt, 0)
  assert.equal(changed.items[0].style.width, before.items[0].style.width)
})

test('failed shape finish preserves completed item, group ordering includes ungrouped block', () => {
  const before = doc()
  assert.throws(() => applyMapCommand(before, { type: 'geometry', id: 'i', geometry: { type: 'Point', coordinates: [999, 37] } }))
  const reordered = applyMapCommand({ ...before, ungroupedOrder: 1 }, { type: 'moveGroup', id: null, beforeGroupId: 'g' })
  assert.equal(reordered.ungroupedOrder, 0)
  assert.equal(reordered.groups[0].order, 1)
})
