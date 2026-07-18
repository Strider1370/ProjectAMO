import assert from 'node:assert/strict'
import test from 'node:test'
import { createRouteDesign } from './routeDesigns.js'
import { createRouteEditor, editorFromBase, emptyEditorForContext, replaceEditorEnroute, replaceEditorProcedures, updateEditorContext } from './routeEditor.js'

test('emptyEditorForContext keeps an airport baseline with an empty draft', () => {
  const editor = emptyEditorForContext({ flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPK' })

  assert.equal(editor.routeForm.departureAirport, 'RKSI')
  assert.equal(editor.routeForm.arrivalAirport, 'RKPK')
  assert.deepEqual(editor.enroute.terms, [])
  assert.equal(editor.rawText, '')
})

test('editorFromBase restores independent base inputs', () => {
  const base = createRouteDesign({
    routeForm: { flightRule: 'IFR', departureAirport: 'RKSI' },
    procedures: { sid: { id: 'SID1' }, star: { id: 'STAR1' }, iapKey: 'IAP1' },
    enroute: { terms: [{ kind: 'fix', id: 'OSPAT' }], userWaypoints: [] },
    routeString: 'OSPAT',
  })
  const editor = editorFromBase(base)
  editor.routeForm.departureAirport = 'RKPC'
  editor.enroute.terms.push({ kind: 'fix', id: 'GONAV' })

  assert.equal(base.routeForm.departureAirport, 'RKSI')
  assert.equal(base.enroute.terms.length, 1)
  assert.equal(editor.rawText, 'OSPAT')
})

test('procedure edits change only the editor, not its base', () => {
  const base = createRouteDesign({ routeForm: {}, procedures: { sid: { id: 'SID1' } } })
  const editor = replaceEditorProcedures(editorFromBase(base), { sid: { id: 'SID2' } })

  assert.equal(base.procedures.sid.id, 'SID1')
  assert.equal(editor.procedures.sid.id, 'SID2')
})

test('enroute tokens and raw text remain independent draft values', () => {
  const editor = createRouteEditor({ rawText: 'OSPAT', enroute: { terms: [{ kind: 'fix', id: 'OSPAT' }], userWaypoints: [{ id: 'wp-1', name: 'WP1' }] } })
  const updated = replaceEditorEnroute(editor, { terms: [{ kind: 'fix', id: 'GONAV' }], userWaypoints: [{ id: 'wp-2', name: 'WP2' }] }, { rawText: 'GONAV' })

  updated.enroute.userWaypoints[0].name = 'CUSTOM'
  assert.equal(editor.rawText, 'OSPAT')
  assert.equal(editor.enroute.userWaypoints[0].name, 'WP1')
  assert.equal(updated.rawText, 'GONAV')
})

test('context updates clear only the requested draft state', () => {
  const editor = createRouteEditor({
    routeForm: { departureAirport: 'RKSI', entryFix: 'OSPAT' },
    procedures: { sid: { id: 'SID1' }, star: { id: 'STAR1' } },
    rawText: 'OSPAT Y711 GONAV',
    enroute: { terms: [{ kind: 'fix', id: 'OSPAT' }], userWaypoints: [] },
  })
  const entryChanged = updateEditorContext(editor, { routeForm: { entryFix: 'GUKDO' }, procedures: { sid: null } })
  const airportChanged = updateEditorContext(editor, { routeForm: { departureAirport: 'RKPC' }, procedures: { sid: null, star: null, iapKey: null }, resetDraft: true })

  assert.equal(entryChanged.rawText, 'OSPAT Y711 GONAV')
  assert.equal(entryChanged.procedures.star.id, 'STAR1')
  assert.equal(airportChanged.rawText, '')
  assert.deepEqual(airportChanged.enroute.terms, [])
})
