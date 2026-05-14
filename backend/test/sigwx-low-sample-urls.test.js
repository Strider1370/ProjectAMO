import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSigwxLowTargetImageUrl,
  parseSigwxLowTmfc,
} from '../src/sigwx-low/sigwx-low-sample-urls.js'

test('parseSigwxLowTmfc extracts date parts from valid tmfc', () => {
  assert.deepEqual(parseSigwxLowTmfc('2026051411'), {
    tmfc: '2026051411',
    yyyy: '2026',
    mm: '05',
    dd: '14',
    hh: '11',
    yyyymm: '202605',
  })
})

test('buildSigwxLowTargetImageUrl uses the KMA static image pattern', () => {
  assert.equal(
    buildSigwxLowTargetImageUrl('2026051411'),
    'https://global.amo.go.kr/WEBDATA/JUN/ETC/IMG/202605/14/SIGWX_LOW_2026051411.png',
  )
})

test('parseSigwxLowTmfc rejects invalid tmfc values', () => {
  assert.throws(() => parseSigwxLowTmfc('20260514'), /Invalid SIGWX_LOW tmfc/)
  assert.throws(() => parseSigwxLowTmfc('2026051424'), /Invalid SIGWX_LOW tmfc/)
  assert.throws(() => parseSigwxLowTmfc('2026131411'), /Invalid SIGWX_LOW tmfc/)
})
