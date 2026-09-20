import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentOverlay, effectiveHiddenGroups, syncDocumentOverlay } from './mapDocumentOverlay.js'

test('render fragments share one logical item and never duplicate source metadata in tiles', () => {
  const geometry = { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [126, 37] }, { type: 'LineString', coordinates: [[126, 37], [127, 38]] }] }
  const doc = { id: 'd', groups: [], items: [{ id: 'i', name: 'SEL', geometry, source: { descriptionRaw: 'large raw metadata' } }] }
  const data = buildDocumentOverlay([doc])
  assert.equal(data.shapes.features.length, 2)
  assert.equal(data.labels.features.length, 1)
  assert.equal(new Set(data.shapes.features.map((f) => f.properties.__item)).size, 1)
  assert.ok(!JSON.stringify(data).includes('large raw metadata'))
})

test('hidden groups cascade only inside their source document', () => {
  const groups = [{ id: 'g', parentId: null }, { id: 'child', parentId: 'g' }]
  assert.deepEqual(effectiveHiddenGroups([{ id: 'a', groups }, { id: 'b', groups }], new Set(['a:g'])), ['a:g', 'a:child'])
})

test('selection and visibility updates do not upload geometry again; replacement style restores sources', () => {
  const sources = new Map(), layers = new Map(); let writes = 0
  const map = { getSource: (id) => sources.get(id), addSource: (id) => sources.set(id, { setData: () => { writes += 1 } }), getLayer: (id) => layers.get(id), addLayer: (layer) => layers.set(layer.id, layer), setFilter: (id, filter) => { layers.get(id).filter = filter } }
  const model = { data: buildDocumentOverlay([]), visibleIds: new Set(), hiddenGroups: [], hiddenItems: new Set() }
  syncDocumentOverlay(map, model)
  syncDocumentOverlay(map, { ...model, selectedKey: 'a:b' })
  assert.equal(writes, 0)
  assert.equal(sources.size, 2)
  sources.clear(); layers.clear()
  syncDocumentOverlay(map, model)
  assert.equal(sources.size, 2)
  assert.equal(layers.size, 11)
})

// 레이어 필터가 실제로 어느 도형을 받는지 보려면 표현식을 풀어봐야 한다.
// 계약 시험과 같은 방식으로 쓰이는 연산자만 해석한다.
function evaluate(expr, feature) {
  if (!Array.isArray(expr)) return expr
  const [op, ...args] = expr
  const value = (arg) => evaluate(arg, feature)
  if (op === 'literal') return args[0]
  if (op === 'get') return feature.properties[args[0]]
  if (op === 'geometry-type') return feature.geometry.type
  if (op === 'coalesce') return args.map(value).find((entry) => entry != null)
  if (op === 'all') return args.every(value)
  if (op === 'any') return args.some(value)
  if (op === '!') return !value(args[0])
  if (op === '==') return value(args[0]) === value(args[1])
  if (op === '!=') return value(args[0]) !== value(args[1])
  if (op === 'in') return value(args[1]).includes(value(args[0]))
  throw new Error(`Unexpected operator ${op}`)
}

function installed(documents, { selectedKey = null } = {}) {
  const layers = new Map()
  const map = {
    getSource: () => null, addSource: () => {}, getLayer: (id) => layers.get(id),
    addLayer: (layer) => layers.set(layer.id, layer), setFilter: () => {},
  }
  const data = buildDocumentOverlay(documents)
  syncDocumentOverlay(map, { data, visibleIds: new Set(documents.map((doc) => doc.id)), hiddenGroups: [], hiddenItems: new Set(), selectedKey })
  return { layers, data }
}

const drawnBy = (layers, data, key) => [...layers.values()]
  .filter((layer) => (data[layer.source === 'my-map-item-labels' ? 'labels' : 'shapes'].features).some((feature) => feature.properties.__item === key && evaluate(layer.filter, feature)))
  .map((layer) => layer.id)

function styled(id, style, geometry, label) {
  return { id, name: id, geometry, style, label, groupId: null }
}

test('선 모양마다 다른 dasharray 레이어가 정확히 하나씩 도형을 받는다', () => {
  const line = { type: 'LineString', coordinates: [[126, 37], [127, 38]] }
  const doc = { id: 'd', kind: 'personal', groups: [], items: [
    styled('solid', { dash: 'solid' }, line), styled('dashed', { dash: 'dashed' }, line), styled('dotted', { dash: 'dotted' }, line),
  ] }
  const { layers, data } = installed([doc])

  assert.deepEqual(drawnBy(layers, data, 'd:solid').filter((id) => id.startsWith('my-map-line')), ['my-map-line'])
  assert.deepEqual(drawnBy(layers, data, 'd:dashed').filter((id) => id.startsWith('my-map-line')), ['my-map-line-dashed'])
  assert.deepEqual(drawnBy(layers, data, 'd:dotted').filter((id) => id.startsWith('my-map-line')), ['my-map-line-dotted'])

  // 실선에는 dasharray가 없고, 점선은 둥근 끝으로 점처럼 찍는다.
  assert.equal(layers.get('my-map-line').paint['line-dasharray'], undefined)
  assert.deepEqual(layers.get('my-map-line-dashed').paint['line-dasharray'], [2, 1.5])
  assert.equal(layers.get('my-map-line-dotted').layout['line-cap'], 'round')
  // 굵기·색·투명도는 세 레이어가 같은 자료를 읽는다.
  for (const id of ['my-map-line', 'my-map-line-dashed', 'my-map-line-dotted']) {
    assert.deepEqual(layers.get(id).paint['line-width'], ['coalesce', ['get', 'width'], 2])
    assert.deepEqual(layers.get(id).paint['line-opacity'], ['coalesce', ['get', 'opacity'], 1])
  }
})

test('점은 아이콘 선택에 따라 원 레이어와 기호 레이어로 갈라지고 투명도를 따른다', () => {
  const point = { type: 'Point', coordinates: [126, 37] }
  const doc = { id: 'd', kind: 'personal', groups: [], items: [
    styled('dot', { icon: 'dot', opacity: 0.4 }, point), styled('star', { icon: 'star' }, point), styled('triangle', { icon: 'triangle' }, point),
  ] }
  const { layers, data } = installed([doc])

  assert.ok(drawnBy(layers, data, 'd:dot').includes('my-map-circle'))
  assert.ok(!drawnBy(layers, data, 'd:dot').includes('my-map-icon'))
  assert.ok(drawnBy(layers, data, 'd:star').includes('my-map-icon'))
  assert.ok(!drawnBy(layers, data, 'd:star').includes('my-map-circle'))

  // 기호는 항목별 색을 따르고, 고른 아이콘마다 다른 글리프를 쓴다.
  const glyphs = new Map(data.shapes.features.map((feature) => [feature.properties.__item, feature.properties.iconGlyph]))
  assert.equal(glyphs.get('d:dot'), '')
  assert.notEqual(glyphs.get('d:star'), '')
  assert.notEqual(glyphs.get('d:star'), glyphs.get('d:triangle'))
  assert.deepEqual(layers.get('my-map-icon').paint['text-color'], ['coalesce', ['get', 'color'], '#475569'])

  // 투명도가 점에도 반영된다.
  assert.deepEqual(layers.get('my-map-circle').paint['circle-opacity'], ['coalesce', ['get', 'opacity'], 1])
  assert.deepEqual(layers.get('my-map-icon').paint['text-opacity'], ['coalesce', ['get', 'opacity'], 1])
})

test('이름 항상 표시와 선택 항목은 겹쳐도 자리를 양보하지 않는다', () => {
  const point = { type: 'Point', coordinates: [126, 37] }
  const doc = { id: 'd', kind: 'personal', groups: [], items: [
    styled('normal', {}, point, { visible: true, always: false }),
    styled('always', {}, point, { visible: true, always: true }),
    styled('off', {}, point, { visible: false, always: true }),
    styled('picked', {}, point, { visible: true, always: false }),
  ] }
  const { layers, data } = installed([doc], { selectedKey: 'd:picked' })

  const labelsFor = (key) => drawnBy(layers, data, key).filter((id) => id.startsWith('my-map-label'))
  // 한 항목이 두 이름표 레이어에 겹쳐 그려지지 않는다.
  assert.deepEqual(labelsFor('d:normal'), ['my-map-label'])
  assert.deepEqual(labelsFor('d:always'), ['my-map-label-always'])
  assert.deepEqual(labelsFor('d:picked'), ['my-map-label-always'])
  // 이름표를 끈 항목은 '항상 표시'를 켜도 나오지 않는다.
  assert.deepEqual(labelsFor('d:off'), [])

  assert.equal(layers.get('my-map-label').layout['text-allow-overlap'], false)
  assert.equal(layers.get('my-map-label-always').layout['text-allow-overlap'], true)
  // 자리는 계속 차지해야 일반 이름표가 피해 간다. 둘 다 켜면 글자가 겹쳐 찍힌다.
  assert.equal(layers.get('my-map-label-always').layout['text-ignore-placement'], false)
  // Mapbox는 위에 있는 레이어부터 자리를 잡으므로 '항상 표시'가 나중에(=위에) 와야 한다.
  const order = [...layers.keys()]
  assert.ok(order.indexOf('my-map-label-always') > order.indexOf('my-map-label'))
})

test('가져온 원본은 기존처럼 실선·원으로 그려 회귀하지 않는다', () => {
  const doc = { id: 'k', kind: 'imported', groups: [], items: [
    { id: 'i', name: '원본', groupId: null, geometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] }, source: { properties: { stroke: '#ff0000' } } },
    { id: 'p', name: '원본 점', groupId: null, geometry: { type: 'Point', coordinates: [126, 37] }, source: { properties: {} } },
  ] }
  const { layers, data } = installed([doc])
  assert.deepEqual(drawnBy(layers, data, 'k:i').filter((id) => id.startsWith('my-map-line')), ['my-map-line'])
  assert.ok(drawnBy(layers, data, 'k:p').includes('my-map-circle'))
  assert.equal(data.shapes.features.find((feature) => feature.properties.__item === 'k:i').properties.color, '#ff0000')
})
