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

test('new group and selected items move together without losing display order or source', () => {
  const before = doc()
  before.items.push(createMapItem('point', { type: 'Point', coordinates: [127, 38] }, { id: 'second', groupId: 'g', order: 1, source: { metadataEntries: [{ key: '값', value: 0 }] } }))
  const after = applyMapCommand(before, { type: 'groupItems', id: 'new', ids: ['second', 'i'], name: '새 그룹' })
  assert.deepEqual(after.items.map((item) => item.id), ['i', 'second'])
  assert.deepEqual(after.items.map((item) => item.groupId), ['new', 'new'])
  assert.deepEqual(after.items[1].source, before.items[1].source)
  assert.equal(before.groups.length, 1)
  assert.equal(before.items[0].groupId, 'g')
  assert.throws(() => applyMapCommand(before, { type: 'groupItems', id: 'new', ids: ['missing'], name: '실패' }))
})

test('ungrouped block can move to the end and self drops do not create history', () => {
  const before = { ...doc(), ungroupedOrder: 0, groups: [{ ...doc().groups[0], order: 1 }] }
  const after = applyMapCommand(before, { type: 'moveGroup', id: null, beforeGroupId: null })
  assert.equal(after.ungroupedOrder, 1)
  assert.equal(after.groups[0].order, 0)
  assert.equal(applyMapCommand(after, { type: 'moveGroup', id: null, beforeGroupId: null }), after)
  assert.equal(applyMapCommand(after, { type: 'moveGroup', id: null, beforeGroupId: '__ungrouped__' }), after)
})

test('appending a map keeps existing IDs and order while flattening independent new groups', () => {
  const before = { ...doc(), ungroupedOrder: 2, source: { fileName: 'existing.kml' } }
  before.items.push(createMapItem('point', { type: 'Point', coordinates: [128, 38] }, { id: 'loose', name: '기존 단독', groupId: null, order: 4 }))
  const source = { ...doc(), kind: 'imported', source: { fileName: 'original.kmz' }, groups: [
    { id: 'parent', name: '그룹', parentId: null, order: 0, sourceVisibility: null },
    { id: 'child', name: '하위', parentId: 'parent', order: 0, sourceVisibility: false },
  ], items: [
    createMapItem('circle', null, { id: 'i', groupId: 'child', name: '반경 있는 원', definition: { center: [127, 37], radiusNm: 2 }, source: { metadataEntries: [{ key: '같은 키', value: 0 }, { key: '같은 키', value: false }] } }),
    createMapItem('point', { type: 'Point', coordinates: [127, 37] }, { id: 'loose', name: '가져온 단독', groupId: null, order: 0 }),
  ] }
  const after = applyMapCommand(before, { type: 'appendDocument', source })
  assert.equal(after.id, before.id)
  assert.equal(after.ungroupedOrder, before.ungroupedOrder)
  assert.equal(after.groups[0], before.groups[0])
  assert.deepEqual(after.items.slice(0, 2), before.items)
  assert.deepEqual(after.groups.slice(1).map((group) => group.name), ['그룹', '그룹 / 하위'])
  assert.ok(after.groups.slice(1).every((group) => group.parentId === null && group.order > before.ungroupedOrder))
  assert.equal(new Set(after.items.map((item) => item.id)).size, 4)
  const circle = after.items.find((item) => item.kind === 'circle')
  assert.deepEqual(circle.definition, source.items[0].definition)
  assert.deepEqual(circle.source, source.items[0].source)
  assert.equal(after.items.find((item) => item.name === '가져온 단독').order, 5)
  assert.deepEqual(after.source, { fileName: 'existing.kml', imports: [{ sourceAssetId: source.id, documentName: source.name, source: source.source }] })
  circle.source.metadataEntries[0].value = 999
  assert.equal(source.items[0].source.metadataEntries[0].value, 0)
  const again = applyMapCommand(after, { type: 'appendDocument', source })
  assert.equal(again.groups.length, 5)
  assert.equal(new Set(again.items.map((item) => item.id)).size, 6)
  assert.equal(before.items.length, 2)
})
