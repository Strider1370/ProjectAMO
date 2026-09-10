import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeLinkedSelection,
  linkedItemKey,
  nextPinnedSelection,
  shouldResetLinkedSelection,
} from './linkedSelection.js'

test('stable keys include the source kind', () => {
  assert.equal(linkedItemKey({ sourceKind: 'weather', id: 7 }), 'weather:7')
  assert.equal(linkedItemKey({ source: 'user', id: 'note' }), 'user:note')
  assert.equal(linkedItemKey({ sourceKind: 'organization_annotation', itemId: 8 }), 'organization_annotation:8')
})

test('preview temporarily wins and repeated pin clears selection', () => {
  assert.equal(activeLinkedSelection('weather:a', 'annotation:b'), 'weather:a')
  assert.equal(activeLinkedSelection(null, 'annotation:b'), 'annotation:b')
  assert.equal(nextPinnedSelection('annotation:b', 'annotation:b'), null)
  assert.equal(nextPinnedSelection('annotation:b', 'annotation:c'), 'annotation:c')
})

test('layout changes preserve selection while flight changes reset it', () => {
  assert.equal(shouldResetLinkedSelection('flight-a', 'flight-a'), false)
  assert.equal(shouldResetLinkedSelection('flight-a', 'flight-b'), true)
  assert.equal(shouldResetLinkedSelection(null, 'flight-a'), false)
})
