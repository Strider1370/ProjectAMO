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

test('터치로도 선이 그려지고 지도 이동이 잠긴다', () => {
  const { map, handlers, sourceUpdates } = createMap()
  const drawn = []
  let panDisabled = false
  map.dragPan.disable = () => { panDisabled = true }
  bindIfrClickInteraction(map, { current: 'draw' }, { current: (payload) => drawn.push(payload) }, { current: null })

  handlers.get('touchstart')[0]({ points: [{ x: 1, y: 1 }], lngLat: { lng: 126.98, lat: 37.57 }, preventDefault() {} })
  handlers.get('touchmove')[0]({ lngLat: { lng: 126.99, lat: 37.58 }, preventDefault() {} })
  handlers.get('touchend')[0]({ lngLat: { lng: 127.0, lat: 37.59 } })

  assert.equal(panDisabled, true)
  assert.equal(sourceUpdates.length, 2, 'touchstart·touchmove가 각각 선을 다시 그린다')
  assert.equal(drawn.at(-1).type, 'draw')
  assert.equal(drawn.at(-1).coordinates.length, 3)
})

test('두 손가락은 그리기가 아니라 확대·축소로 넘긴다', () => {
  const { map, handlers, sourceUpdates } = createMap()
  bindIfrClickInteraction(map, { current: 'draw' }, { current: null }, { current: null })

  handlers.get('touchstart')[0]({ points: [{ x: 1, y: 1 }, { x: 9, y: 9 }], lngLat: { lng: 126.98, lat: 37.57 }, preventDefault() {} })

  assert.equal(sourceUpdates.length, 0)
})
