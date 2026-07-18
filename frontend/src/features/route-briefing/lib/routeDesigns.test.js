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

  assert.equal(renameRouteDesign([base], base.id, '  새 경로  ')[0].name, '새 경로')
  assert.equal(renameRouteDesign([base], base.id, '   ')[0].name, '기본 경로')
})

test('removeRouteDesign retains one design and selects the preceding design', () => {
  const base = createRouteDesign({ routeForm: {}, procedures: {} })
  const { designs } = duplicateRouteDesign([base], base.id)
  const removed = removeRouteDesign(designs, designs[1].id, designs[1].id)
  const retained = removeRouteDesign([base], base.id, base.id)

  assert.deepEqual(removed, { designs: [base], selectedId: base.id })
  assert.deepEqual(retained, { designs: [base], selectedId: base.id })
})
