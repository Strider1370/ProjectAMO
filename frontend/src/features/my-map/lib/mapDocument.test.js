import test from 'node:test'
import assert from 'node:assert/strict'
import { createMapDocument, createMapItem, copyMapDocument, moveMapItems, initialMapVisibility, isGroupHidden, scopeId, validateItem } from './mapDocument.js'

test('copy remaps editable identities but retains provenance and duplicate raw fields', () => {
  const doc = createMapDocument('원본')
  doc.kind = 'imported'
  doc.groups = [{ id: 'g1', name: '상위', parentId: null, order: 0 }, { id: 'g2', name: '하위', parentId: 'g1', order: 1 }]
  doc.items = [createMapItem('point', { type: 'Point', coordinates: [126, 37] }, { groupId: 'g2', source: { sourceAssetId: 'asset', itemId: 'original', metadataEntries: [{ key: 'tag', value: 0 }, { key: 'tag', value: false }] } })]
  const copy = copyMapDocument(doc)
  assert.notEqual(copy.id, doc.id)
  assert.notEqual(copy.items[0].id, doc.items[0].id)
  assert.equal(copy.groups[1].name, '상위 / 하위')
  assert.equal(copy.groups[1].parentId, null)
  assert.equal(copy.items[0].groupId, copy.groups[1].id)
  assert.deepEqual(copy.items[0].source, doc.items[0].source)
  copy.items[0].source.metadataEntries[0].value = 12
  assert.equal(doc.items[0].source.metadataEntries[0].value, 0)
})

test('mixed multi-item move is one immutable operation and preserves relative order', () => {
  const doc = createMapDocument()
  doc.groups = [{ id: 'g', name: '대상', parentId: null }]
  doc.items = ['a', 'b', 'c'].map((id, order) => createMapItem('point', { type: 'Point', coordinates: [126 + order, 37] }, { id, order, groupId: id === 'c' ? 'g' : null }))
  const next = moveMapItems(doc, ['a', 'b'], 'g', 'c')
  assert.deepEqual(next.items.map((x) => x.id), ['a', 'b', 'c'])
  assert.deepEqual(next.items.map((x) => x.order), [0, 1, 2])
  assert.equal(doc.items[0].groupId, null)
  assert.equal(moveMapItems(doc, ['a'], null, 'a'), doc)
})

test('visibility is scoped by document and users can override original hidden state', () => {
  const doc = { id: 'd1', groups: [{ id: 'g', parentId: null, sourceVisibility: false }, { id: 'child', parentId: 'g' }], items: [] }
  const defaults = initialMapVisibility(doc)
  const hidden = new Set(defaults.groups)
  assert.equal(isGroupHidden(doc, 'child', hidden), true)
  assert.equal(isGroupHidden({ ...doc, id: 'd2' }, 'child', hidden), false)
  hidden.delete(scopeId(doc.id, 'g'))
  assert.equal(isGroupHidden(doc, 'child', hidden), false)
})

test('circle retains definition and closed generated geometry, invalid geometry is rejected', () => {
  const item = createMapItem('circle', null, { definition: { center: [126, 37], radiusNm: 5 } })
  assert.deepEqual(item.geometry.coordinates[0][0], item.geometry.coordinates[0].at(-1))
  assert.equal(item.definition.radiusNm, 5)
  assert.throws(() => createMapItem('circle', null, { definition: { center: [126, 37], radiusNm: 0 } }))
  assert.throws(() => createMapItem('line', { type: 'LineString', coordinates: [[126, 37], [126, 37]] }))
  assert.throws(() => createMapItem('polygon', { type: 'Polygon', coordinates: [[[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]]] }))
  assert.ok(validateItem({ ...item, altitude: { floorFt: 6000, ceilingFt: 5000 } }))
})

test('flattened copies use unique sibling order and retain original visibility', () => {
  const original = { ...createMapDocument(), kind: 'imported', groups: [{ id:'a', name:'A', parentId:null, order:0, sourceVisibility:false }, { id:'b', name:'B', parentId:'a', order:0 }] }
  const copied = copyMapDocument(original)
  assert.deepEqual(copied.groups.map((group) => group.order), [1,2])
  assert.deepEqual(copied.groups.map((group) => group.sourceVisibility), [false,null])
  assert.equal(copied.ungroupedOrder, 0)
})

test('flattening keeps display order and the ungrouped block position', () => {
  const original = { ...createMapDocument(), kind: 'imported', ungroupedOrder: 1, groups: [
    { id:'second', name:'2', parentId:null, order:1 },
    { id:'first-child', name:'1-1', parentId:'first', order:0 },
    { id:'first', name:'1', parentId:null, order:0 },
    { id:'second-child', name:'2-1', parentId:'second', order:0 },
  ] }
  const copied = copyMapDocument(original)
  const byName = new Map(copied.groups.map((group) => [group.name, group.order]))
  assert.deepEqual([...byName.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name), ['1', '1 / 1-1', '2', '2 / 2-1'])
  assert.equal(copied.ungroupedOrder, 2)
  assert.equal(copied.groups.every((group) => group.parentId === null), true)
})

test('multi selection moves in visible group order and invalid hole edits cannot finish', () => {
  const original = { ...createMapDocument(), groups: [{id:'a',order:1},{id:'b',order:0},{id:'c',order:2}], items: ['a','b'].map((id) => createMapItem('point',{type:'Point',coordinates:[126,37]}, {id,groupId:id,order:0})) }
  assert.deepEqual(moveMapItems(original,['a','b'],'c').items.map((item) => item.id), ['b','a'])
  const polygon = { kind:'polygon', geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]], [[1,1],[5,1],[2,2],[1,2],[1,1]]]} }
  assert.match(validateItem(polygon), /바깥 경계/)
})
