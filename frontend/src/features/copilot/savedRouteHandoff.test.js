import test from 'node:test'
import assert from 'node:assert/strict'
import { createSavedRouteHandoff } from './savedRouteHandoff.js'

const ref = 'saved_route_00000000-0000-4000-8000-000000000000'
const bundle = { status: 'ok', reference: { savedRouteRef: ref }, entry: { id: 1 }, routeHash: 'hash' }
function setup() {
  let revision = 'initial', owner = '1:1', reads = 0, writes = 0, mapEditing = false
  let onRead = () => structuredClone(bundle)
  const checkRevision = (expected) => { if (revision !== expected) throw new Error('ROUTE_SETTINGS_CHANGED') }
  const current = () => ({ owner, mapEditing, actions: {
    getCopilotEditorRevision: () => revision,
    previewCopilotSavedRoute: async (value, expected) => { checkRevision(expected); return { bundle: value, revision: expected } },
    applyCopilotSavedRoute: (prepared) => { checkRevision(prepared.revision); writes++; revision = 'imported'; return { status: 'imported' } },
  } })
  return { handoff: createSavedRouteHandoff({ current, read: async () => { reads++; return onRead() } }),
    edit: () => { revision = 'edited' }, auth: (next) => { owner = next }, mapEdit: () => { mapEditing = true },
    onRead: (fn) => { onRead = fn }, counts: () => ({ reads, writes }) }
}
test('preparation is read-only, explicit apply rereads original and commits only once', async () => {
  const x = setup(), prepared = await x.handoff.prepare(ref)
  assert.deepEqual(x.counts(), { reads: 1, writes: 0 })
  assert.equal((await x.handoff.apply(prepared)).status, 'imported')
  assert.deepEqual(x.counts(), { reads: 2, writes: 1 })
  await assert.rejects(x.handoff.apply(prepared), /ROUTE_SETTINGS_CHANGED/)
  assert.equal(x.counts().writes, 1)
})
test('edits during initial read or confirmation cannot be implicitly acknowledged', async () => {
  const initial = setup()
  initial.onRead(() => { initial.edit(); return bundle })
  await assert.rejects(initial.handoff.prepare(ref), /ROUTE_SETTINGS_CHANGED/)
  const confirm = setup(), prepared = await confirm.handoff.prepare(ref)
  confirm.onRead(() => { confirm.edit(); return bundle })
  await assert.rejects(confirm.handoff.apply(prepared), /ROUTE_SETTINGS_CHANGED/)
  assert.equal(confirm.counts().writes, 0)
})
test('owner changes (including logout/login), map edit, original change/deletion prevent commit', async () => {
  for (const mode of ['owner', 'relogin', 'map', 'changed', 'deleted']) {
    const x = setup(), prepared = await x.handoff.prepare(ref)
    x.onRead(() => {
      if (mode === 'owner') x.auth('2:2')
      if (mode === 'relogin') x.auth('1:3')
      if (mode === 'map') x.mapEdit()
      if (mode === 'deleted') throw new Error('SAVED_ROUTE_NOT_FOUND')
      return mode === 'changed' ? { ...bundle, routeHash: 'changed' } : bundle
    })
    await assert.rejects(x.handoff.apply(prepared), /AUTH_CHANGED|MAP_EDIT_ACTIVE|SAVED_ROUTE_CHANGED|SAVED_ROUTE_NOT_FOUND/)
    assert.equal(x.counts().writes, 0)
  }
})
