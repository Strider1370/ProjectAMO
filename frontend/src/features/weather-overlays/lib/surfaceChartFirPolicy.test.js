import assert from 'node:assert/strict'
import test from 'node:test'

import { firAfterSurfaceChartChange, firSuppressionAfterUserToggle } from './surfaceChartFirPolicy.js'

const GROUP = ['fir', 'overseas-fir']

test('turning precipitation on hides both domestic and overseas FIR and remembers them', () => {
  const next = firAfterSurfaceChartChange({ chartOn: true, visibility: { fir: true, 'overseas-fir': true, sector: true }, groupIds: GROUP, suppressedIds: [] })
  assert.deepEqual(next.visibility, { fir: false, 'overseas-fir': false, sector: true })
  assert.deepEqual(next.suppressedIds, GROUP)
})

test('turning precipitation off brings back only the FIR layers it hid', () => {
  const next = firAfterSurfaceChartChange({ chartOn: false, visibility: { fir: false, 'overseas-fir': false }, groupIds: GROUP, suppressedIds: ['fir'] })
  assert.deepEqual(next.visibility, { fir: true, 'overseas-fir': false })
  assert.deepEqual(next.suppressedIds, [])
})

test('FIR layers the user was not showing stay off', () => {
  const visibility = { fir: false, 'overseas-fir': false }
  const on = firAfterSurfaceChartChange({ chartOn: true, visibility, groupIds: GROUP, suppressedIds: [] })
  assert.equal(on.visibility, visibility)
  assert.deepEqual(firAfterSurfaceChartChange({ chartOn: false, visibility, groupIds: GROUP, suppressedIds: on.suppressedIds }).visibility, visibility)
})

test('FIR the user turns back on while precipitation is shown is kept afterwards', () => {
  const on = firAfterSurfaceChartChange({ chartOn: true, visibility: { fir: true, 'overseas-fir': true }, groupIds: GROUP, suppressedIds: [] })
  const userVisibility = { fir: true, 'overseas-fir': true }
  const off = firAfterSurfaceChartChange({ chartOn: false, visibility: userVisibility, groupIds: GROUP, suppressedIds: firSuppressionAfterUserToggle(on) })
  assert.equal(off.visibility, userVisibility)
})
