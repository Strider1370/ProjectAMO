import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categorize, classifyOperationalNotam, deriveScope } from '../src/processors/notam-processor.js'

test('categorize: subject-code → category enum', () => {
  assert.equal(categorize('QRPCA'), 'prohibited')
  assert.equal(categorize('QWMLW'), 'firing')
  assert.equal(categorize('QRDCA'), 'danger')
  assert.equal(categorize('QRTCA'), 'restricted')
  assert.equal(categorize('QRRCA'), 'restricted')
  assert.equal(categorize('QRACA'), 'restricted')
  assert.equal(categorize('QOBCE'), 'obstacle')
  assert.equal(categorize('QPOCH'), 'obstacle')
  assert.equal(categorize('QGAXX'), 'facility') // GNSS facility
  assert.equal(categorize('QMRLC'), 'facility') // runway
  assert.equal(categorize('QZZZZ'), 'other')    // unmapped
  assert.equal(categorize(null), 'other')
})

test('deriveScope: FIR code vs airport', () => {
  assert.equal(deriveScope('RKRR'), 'fir')
  assert.equal(deriveScope('RKSI'), 'airport')
})

test('classifyOperationalNotam: only direct operational evidence becomes a priority hint', () => {
  assert.deepEqual(classifyOperationalNotam('QMRLC', 'RWY 14L/32R CLSD DUE TO WIP'), { target: 'runway', action: 'closure', priority: 'critical', confidence: 'high', reason: 'runway:closure' })
  assert.deepEqual(classifyOperationalNotam('QMXLC', 'TWY F1 AND F2 CLSD DUE TO WIP'), { target: 'taxiway', action: 'closure', priority: 'warning', confidence: 'high', reason: 'taxiway:closure' })
  assert.deepEqual(classifyOperationalNotam('QFATT', 'TRIGGER NOTAM - PERM AIRAC AIP AMDT 6/26'), { target: 'information', action: 'information', priority: 'info', confidence: 'high', reason: 'information:information' })
  assert.deepEqual(classifyOperationalNotam('QCPAS', 'PAR RWY 03/21 U/S DUE TO MAINT'), { target: 'navigation', action: 'unavailable', priority: 'critical', confidence: 'high', reason: 'navigation:unavailable' })
})
