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

// 태블릿에서 경유점을 손가락으로 잡을 수 있어야 한다. 잡는 순간을 mousedown으로만
// 듣던 동안에는 터치가 그대로 지도로 흘러가 지도만 움직였다.
function createTouchMap() {
  const bound = new Map()
  const layers = new Map()
  const map = {
    on(event, layerOrHandler, maybeHandler) {
      const layer = maybeHandler ? layerOrHandler : null
      bound.set(`${event}:${layer ?? '*'}`, maybeHandler ?? layerOrHandler)
    },
    addLayer(spec) { layers.set(spec.id, spec) },
    getLayer: (id) => layers.get(id),
    getSource: () => ({ setData() {} }),
    queryRenderedFeatures: () => [],
    dragPan: { disabled: false, disable() { this.disabled = true }, enable() { this.disabled = false } },
    getCanvas: () => ({ style: {} }),
  }
  return { map, bound, layers }
}

test('addVfrWaypointLayers: 그려진 동그라미보다 큰 투명 잡기 원을 깐다', async () => {
  const { addVfrWaypointLayers, VFR_WP_HIT, VFR_WP_CIRCLE } = await import('./routePreview.js')
  const { map, layers } = createTouchMap()
  addVfrWaypointLayers(map)

  const hit = layers.get(VFR_WP_HIT)
  const circle = layers.get(VFR_WP_CIRCLE)
  assert.ok(hit, '잡기 레이어가 있어야 한다')
  assert.equal(hit.paint['circle-opacity'], 0, '보이면 안 된다')
  assert.ok(hit.paint['circle-radius'] > circle.paint['circle-radius'], '그려진 동그라미보다 커야 한다')
  assert.deepEqual([...layers.keys()].indexOf(VFR_WP_HIT), 0, '보이는 동그라미보다 먼저(아래) 깔려야 한다')
})

test('bindVfrInteractions: 경유점과 경로선 모두 touchstart를 듣는다', async () => {
  const { bindVfrInteractions, VFR_WP_HIT, ROUTE_PREVIEW_LINE_HIT } = await import('./routePreview.js')
  const { map, bound } = createTouchMap()
  bindVfrInteractions(map, { current: [] }, { current: null })

  assert.ok(bound.has(`touchstart:${VFR_WP_HIT}`), '경유점이 터치를 들어야 한다')
  assert.ok(bound.has(`mousedown:${VFR_WP_HIT}`), '마우스도 그대로 동작해야 한다')
  assert.ok(bound.has(`touchstart:${ROUTE_PREVIEW_LINE_HIT}`), '경로선도 터치를 들어야 한다')
})

test('bindVfrInteractions: 손가락으로 경유점을 잡으면 지도 움직이기가 멈춘다', async () => {
  const { bindVfrInteractions, VFR_WP_HIT } = await import('./routePreview.js')
  const { map, bound } = createTouchMap()
  const waypoints = [{ id: 'RKSS', fixed: true }, { id: 'WP1', fixed: false }]
  bindVfrInteractions(map, { current: waypoints }, { current: null })

  let prevented = false
  bound.get(`touchstart:${VFR_WP_HIT}`)({
    preventDefault: () => { prevented = true },
    features: [{ properties: { wpIndex: 1 } }],
  })

  assert.equal(prevented, true, '지도로 터치가 새지 않아야 한다')
  assert.equal(map.dragPan.disabled, true, '끄는 동안 지도가 따라 움직이면 안 된다')
})

test('bindVfrInteractions: 고정된 끝점은 손가락으로도 안 끌린다', async () => {
  const { bindVfrInteractions, VFR_WP_HIT } = await import('./routePreview.js')
  const { map, bound } = createTouchMap()
  bindVfrInteractions(map, { current: [{ id: 'RKSS', fixed: true }] }, { current: null })

  let prevented = false
  bound.get(`touchstart:${VFR_WP_HIT}`)({
    preventDefault: () => { prevented = true },
    features: [{ properties: { wpIndex: 0 } }],
  })

  assert.equal(map.dragPan.disabled, false, '출발·도착 공항은 끌 수 없다')
  assert.equal(prevented, false, '끌 수 없는 점은 터치를 삼키지 말고 지도로 넘겨야 한다')
})
