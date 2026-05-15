import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bindLayerEvent,
  flattenLayerIds,
  hasStyleRevision,
} from './mapStyleSync.js'

function createMapMock() {
  const calls = []
  return {
    calls,
    on(type, layerId, handler) {
      calls.push(['on', type, layerId, handler])
    },
    off(type, layerId, handler) {
      calls.push(['off', type, layerId, handler])
    },
  }
}

test('hasStyleRevision returns true only for positive style revisions', () => {
  assert.equal(hasStyleRevision(0), false)
  assert.equal(hasStyleRevision(null), false)
  assert.equal(hasStyleRevision(1), true)
  assert.equal(hasStyleRevision(3), true)
})

test('flattenLayerIds removes empty values and duplicates while preserving order', () => {
  assert.deepEqual(
    flattenLayerIds(['a', null, ['b', 'a'], undefined, ['c', ['b']]]),
    ['a', 'b', 'c'],
  )
})

test('bindLayerEvent returns cleanup that unregisters the exact handler', () => {
  const map = createMapMock()
  const handler = () => {}
  const cleanup = bindLayerEvent(map, 'click', 'layer-a', handler)
  cleanup()
  assert.equal(map.calls.length, 2)
  assert.equal(map.calls[0][0], 'on')
  assert.equal(map.calls[1][0], 'off')
  assert.equal(map.calls[0][3], handler)
  assert.equal(map.calls[1][3], handler)
})

test('bindLayerEvent ignores missing maps or layer ids', () => {
  assert.equal(bindLayerEvent(null, 'click', 'layer-a', () => {}), null)
  assert.equal(bindLayerEvent(createMapMock(), 'click', '', () => {}), null)
})
