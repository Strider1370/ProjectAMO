import test from 'node:test'
import assert from 'node:assert/strict'
import { isKimNotUploaded, kimHourUploaded } from '../src/processors/kim-run-availability.js'

test('an hour counts as uploaded only when KMA returns a grid; the "file is not exist" notice means not yet, other errors are thrown', async () => {
  const requests = []
  const reply = (text) => async (params) => { requests.push(params); if (text instanceof Error) throw text; return text }
  assert.equal(await kimHourUploaded({ tmfc: '2026101706', hf: 0, credential: 'bulk', fetchGrid: reply('1.0 2.0\n3.0 4.0\n') }), true)
  assert.deepEqual({ ...requests[0], sub: undefined }, { data: 'U', name: 'ps', level: 0, tmfc: '2026101706', hf: 0, sub: undefined, credential: 'bulk', signal: undefined })
  assert.equal(await kimHourUploaded({ tmfc: '2026101706', fetchGrid: reply('# KIMG_NE57.ft000.2026101706.nc file is not exist\n') }), false)
  await assert.rejects(kimHourUploaded({ tmfc: '2026101706', fetchGrid: reply(new Error('fetch failed')) }), /fetch failed/)
  assert.equal(isKimNotUploaded(Object.assign(new Error('x'), { code: 'KIM_FILE_NOT_AVAILABLE' })), true)
  assert.equal(isKimNotUploaded(new Error('HTTP 500')), false)
})
