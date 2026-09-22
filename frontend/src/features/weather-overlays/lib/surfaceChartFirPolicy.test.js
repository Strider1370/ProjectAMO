import assert from 'node:assert/strict'
import test from 'node:test'

import { firAfterSurfaceChartChange, firSuppressionAfterUserToggle } from './surfaceChartFirPolicy.js'

test('turning precipitation on hides a visible FIR and remembers it', () => {
  assert.deepEqual(firAfterSurfaceChartChange({ chartOn: true, firVisible: true, suppressed: false }), { firVisible: false, suppressed: true })
})

test('turning precipitation off brings back only the FIR it hid', () => {
  assert.deepEqual(firAfterSurfaceChartChange({ chartOn: false, firVisible: false, suppressed: true }), { firVisible: true, suppressed: false })
  assert.deepEqual(firAfterSurfaceChartChange({ chartOn: false, firVisible: false, suppressed: false }), { firVisible: false, suppressed: false })
})

test('a FIR the user was not showing stays off', () => {
  assert.deepEqual(firAfterSurfaceChartChange({ chartOn: true, firVisible: false, suppressed: false }), { firVisible: false, suppressed: false })
})

test('a FIR the user turns back on while precipitation is shown is kept afterwards', () => {
  let state = firAfterSurfaceChartChange({ chartOn: true, firVisible: true, suppressed: false })
  state = { firVisible: true, suppressed: firSuppressionAfterUserToggle() }
  assert.deepEqual(firAfterSurfaceChartChange({ chartOn: false, ...state }), { firVisible: true, suppressed: false })
})
