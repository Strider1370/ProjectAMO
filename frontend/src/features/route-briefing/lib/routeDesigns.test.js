import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_ROUTE_DESIGNS,
  createRouteDesign,
  duplicateRouteDesign,
  removeRouteDesign,
  renameRouteDesign,
} from './routeDesigns.js'

test('duplicateRouteDesign gives the copy independent editable inputs', () => {
  const base = createRouteDesign({
    routeForm: { flightRule: 'IFR' },
    procedures: { sid: { id: 'SID1' } },
    viaFixes: ['SEL'],
    enroute: { tokens: [{ kind: 'fix', id: 'SEL' }], userWaypoints: [] },
  })
  const { designs, selectedId } = duplicateRouteDesign([base], base.id)
  designs[1].viaFixes.push('KALOD')
  designs[1].enroute.tokens.push({ kind: 'fix', id: 'KALOD' })

  assert.equal(selectedId, designs[1].id)
  assert.deepEqual(designs[0].viaFixes, ['SEL'])
  assert.equal(designs[0].enroute.tokens.length, 1)
  assert.equal(designs[1].name, '경로 A')
  assert.equal(designs[0].kind, 'base')
  assert.equal(designs[1].kind, 'alternative')
})

test('duplicateRouteDesign does not copy draft, pending edit, or undo history', () => {
  const base = createRouteDesign({ routeForm: {}, procedures: {}, undoStack: [{ routeString: 'OLD' }], draftEditor: { rawText: 'DRAFT' }, pendingEdit: { kind: 'drag' } })
  const { designs } = duplicateRouteDesign([base], base.id)

  assert.equal(designs[1].undoStack.length, 0)
  assert.equal(designs[1].draftEditor, null)
  assert.equal(designs[1].pendingEdit, null)
})

test('duplicateRouteDesign stops at four designs', () => {
  const base = createRouteDesign({ routeForm: {}, procedures: {} })
  const first = duplicateRouteDesign([base], base.id)
  const second = duplicateRouteDesign(first.designs, first.selectedId)
  const third = duplicateRouteDesign(second.designs, second.selectedId)
  const capped = duplicateRouteDesign(third.designs, third.selectedId)

  assert.equal(third.designs.length, MAX_ROUTE_DESIGNS)
  assert.equal(capped.designs, third.designs)
  assert.equal(capped.selectedId, third.selectedId)
})

test('renameRouteDesign trims names and keeps the old name when empty', () => {
  const base = createRouteDesign({ routeForm: {}, procedures: {} })
  const { designs, selectedId } = duplicateRouteDesign([base], base.id)

  assert.equal(renameRouteDesign(designs, selectedId, '  새 경로  ')[1].name, '새 경로')
  assert.equal(renameRouteDesign(designs, selectedId, '   ')[1].name, '경로 A')
  assert.equal(renameRouteDesign([base], base.id, '바꾸면 안 됨')[0].name, '기본 경로')
})

test('removeRouteDesign retains one design and selects the preceding design', () => {
  const base = createRouteDesign({ routeForm: {}, procedures: {} })
  const { designs } = duplicateRouteDesign([base], base.id)
  const removed = removeRouteDesign(designs, designs[1].id, designs[1].id)
  const retained = removeRouteDesign([base], base.id, base.id)

  assert.deepEqual(removed, { designs: [base], selectedId: base.id })
  assert.deepEqual(retained, { designs: [base], selectedId: base.id })
})

test('removeRouteDesign selects the preceding alternative after confirmation', () => {
  const base = createRouteDesign({ routeForm: {}, procedures: {} })
  const first = duplicateRouteDesign([base], base.id)
  const second = duplicateRouteDesign(first.designs, first.selectedId)
  const removed = removeRouteDesign(second.designs, second.selectedId, second.selectedId)

  assert.equal(removed.selectedId, first.selectedId)
})
