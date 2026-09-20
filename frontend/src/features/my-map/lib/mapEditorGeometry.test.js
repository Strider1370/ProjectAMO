import test from 'node:test'
import assert from 'node:assert/strict'
import { createMapItem } from './mapDocument.js'
import { dragEditorHandle, editorPreview, translateEditorItem } from './mapEditorGeometry.js'

test('hole vertices and midpoints edit their own closed ring without changing source geometry', () => {
  const item = createMapItem('polygon', { type: 'Polygon', coordinates: [[[0,0],[4,0],[4,4],[0,4],[0,0]], [[1,1],[2,1],[2,2],[1,2],[1,1]]] })
  const moved = dragEditorHandle(item, { role: 'vertex', ring: 1, index: 0 }, [1.1, 1.1])
  assert.deepEqual(moved.geometry.coordinates[1].at(-1), [1.1,1.1])
  assert.deepEqual(item.geometry.coordinates[1][0], [1,1])
  const added = dragEditorHandle(item, { role: 'midpoint', ring: 1, index: 1 }, [1.5,1])
  assert.equal(added.geometry.coordinates[1].length, 6)
  assert.equal(editorPreview({ geometryEdit: { item } }).features.filter((f) => f.properties.role === 'vertex').length, 8)
})

test('circle move and radius handle preserve the defining center/radius and cancellation baseline', () => {
  const item = createMapItem('circle', null, { definition: { center: [126,37], radiusNm: 5 } })
  const moved = translateEditorItem(item, [126,37], [127,38])
  assert.deepEqual(moved.definition, { center: [127,38], radiusNm: 5 })
  const resized = dragEditorHandle(item, { role: 'radius' }, [126.2,37])
  assert.ok(resized.definition.radiusNm > 5)
  assert.equal(item.definition.radiusNm, 5)
  assert.deepEqual(resized.geometry.coordinates[0][0], resized.geometry.coordinates[0].at(-1))
})
