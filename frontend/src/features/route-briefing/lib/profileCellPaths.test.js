import test from 'node:test'
import assert from 'node:assert/strict'
import { profileCellPaths } from './profileCellPaths.js'

test('cell batches preserve missing gaps and narrow severe cells without resampling', () => {
  const cell = (key, x, w, fill = 'light') => ({ key, x, y: -20000, w, h: 1000, fill })
  const paths = profileCellPaths([cell('a', 0, 1), cell('b', 2, 1), cell('c', 3, .001, 'severe'), cell('d', 3.001, 1)])
  assert.equal(paths.length, 3)
  assert.equal(paths[0].d, 'M0,-20000h1v1000h-1ZM2,-20000h1v1000h-1Z')
  assert.equal(paths[1].fill, 'severe')
  assert.match(paths[1].d, /h0.001v/)
})

test('overlapping cells retain separate paths and original alpha paint order', () => {
  const a = { key: 'a', x: 0, y: 0, w: 2, h: 2, fill: 'rgba(0,0,0,.3)' }
  const paths = profileCellPaths([a, { ...a, key: 'b', x: 1 }, { ...a, key: 'c', y: 1 }])
  assert.deepEqual(paths.map(p => p.key), ['a', 'b', 'c'])
})
