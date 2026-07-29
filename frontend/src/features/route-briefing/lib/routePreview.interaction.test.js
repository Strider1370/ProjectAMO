import assert from 'node:assert/strict'
import test from 'node:test'
import { bindIfrClickInteraction } from './routePreview.js'

function createMap() {
  const handlers = new Map()
  const sourceUpdates = []
  const document = {
    createElement: () => ({
      style: {},
      classList: { toggle() {} },
      append() {},
      appendChild() {},
      replaceChildren() {},
      remove() {},
      addEventListener() {},
    }),
    body: { append() {} },
  }
  globalThis.document = document
  const map = {
    on(event, ...args) {
      handlers.set(event, [...(handlers.get(event) ?? []), args.at(-1)])
    },
    getContainer: () => ({ ownerDocument: document, append() {}, getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 500 }) }),
    getSource: () => ({ setData: (data) => sourceUpdates.push(data) }),
    dragPan: { disable() {}, enable() {} },
    getCanvas: () => ({ style: {} }),
  }
  return { map, handlers, sourceUpdates }
}

test('map-click mode delivers a clicked coordinate to the route action', () => {
  const { map, handlers } = createMap()
  const added = []
  bindIfrClickInteraction(map, { current: 'click-add' }, { current: (coordinate) => added.push(coordinate) }, { current: null })

  handlers.get('click')[0]({ lngLat: { lng: 126.98, lat: 37.57 } })

  assert.deepEqual(added, [[126.98, 37.57]])
})

test('draw mode prevents map panning and records the drawn line', () => {
  const { map, handlers, sourceUpdates } = createMap()
  let prevented = false
  bindIfrClickInteraction(map, { current: 'draw' }, { current: null }, { current: null })

  handlers.get('mousedown')[0]({
    lngLat: { lng: 126.98, lat: 37.57 },
    preventDefault: () => { prevented = true },
  })
  handlers.get('mousemove')[0]({ lngLat: { lng: 126.99, lat: 37.58 } })

  assert.equal(prevented, true)
  assert.deepEqual(sourceUpdates.at(-1).features[0].geometry.coordinates, [[126.98, 37.57], [126.99, 37.58]])
})
