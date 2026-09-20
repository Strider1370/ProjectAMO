import test from 'node:test'
import assert from 'node:assert/strict'
import { convertDrawSpike, readDrawSpikeState, readMigratedIds, writeMigratedIds, DRAW_SPIKE_KEY } from './importDrawSpike.js'

const fakeStorage = () => {
  const map = new Map()
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map }
}

function feature(id, properties, geometry = { type: 'Point', coordinates: [126, 37] }) {
  return { id, type: 'Feature', geometry, properties }
}

function state() {
  return { folders: [], features: [
    feature('p1', { name: '지점', folder: '훈련', color: '#ff0000', width: 4, icon: 'pushpin/ylw-pushpin' }),
    feature('l1', { name: '참고선', folder: '훈련' }, { type: 'LineString', coordinates: [[126, 37], [127, 38]] }),
    feature('c1', { name: '원', folder: '(폴더 없음)', gen: { type: 'circle', center: [127, 38], radiusNm: 5 } }, null),
    feature('s1', { name: '섹터', folder: '공역', gen: { type: 'sector', center: [127, 38], radiusNm: 5, fromDeg: 0, toDeg: 90 } }, null),
    feature('t1', { name: '글자', folder: '공역', textOnly: true }),
    feature('a1', { name: '고도', folder: '공역', floorFt: 8000, ceilFt: 2000 }, { type: 'Polygon', coordinates: [[[126, 37], [127, 37], [127, 38], [126, 37]]] }),
  ] }
}

test('/draw 자료는 한 단계 그룹과 개인 지도 항목으로 이전된다', () => {
  const result = convertDrawSpike(state(), { name: '이전본' })
  assert.equal(result.document.kind, 'personal')
  assert.equal(result.document.name, '이전본')
  assert.deepEqual(result.document.groups.map((group) => group.name), ['공역', '훈련'])
  assert.equal(result.document.groups.every((group) => group.parentId === null), true)
  assert.equal(result.counts.converted, 6)
  assert.equal(result.counts.excluded, 0)

  const byName = new Map(result.document.items.map((item) => [item.name, item]))
  // 그룹 없는 항목은 가상 그룹을 만들지 않는다.
  assert.equal(byName.get('원').groupId, null)
  assert.equal(byName.get('지점').groupId, result.document.groups.find((group) => group.name === '훈련').id)
})

test('원은 편집 가능한 정의로, 고급 도형과 글자는 보존용 복합 항목으로 옮긴다', () => {
  const result = convertDrawSpike(state())
  const byName = new Map(result.document.items.map((item) => [item.name, item]))

  assert.equal(byName.get('원').kind, 'circle')
  assert.deepEqual(byName.get('원').definition, { center: [127, 38], radiusNm: 5 })
  assert.equal(byName.get('원').geometry.type, 'Polygon')

  // 기하가 null로 저장된 고급 도형도 형태를 되살려 보존한다.
  assert.equal(byName.get('섹터').kind, 'compound')
  assert.ok(byName.get('섹터').geometry.coordinates[0][0].length > 3)
  assert.equal(byName.get('글자').kind, 'compound')
  assert.match(result.warnings.join(' '), /섹터/)
  assert.match(result.warnings.join(' '), /글자 도형/)
  assert.equal(byName.get('지점').kind, 'point')
  assert.equal(byName.get('참고선').kind, 'line')
})

test('/draw 기본값 0 고도와 뒤집힌 범위를 내 지도 계약에 맞춘다', () => {
  const result = convertDrawSpike(state())
  const byName = new Map(result.document.items.map((item) => [item.name, item]))
  // 둘 다 0은 /draw의 기본값이므로 미지정으로 본다. 0과 null을 구분하는 계약.
  assert.deepEqual(byName.get('지점').altitude, { floorFt: null, ceilingFt: null, datum: 'MSL' })
  // 바닥 >= 천장은 저장할 수 없으므로 천장을 비우고 경고한다. 원본 값은 남는다.
  assert.deepEqual(byName.get('고도').altitude, { floorFt: 8000, ceilingFt: null, datum: 'MSL' })
  assert.equal(byName.get('고도').source.properties.ceilFt, 2000)
  assert.match(result.warnings.join(' '), /천장을 비웠습니다/)
})

test('원본 속성과 스타일을 보존하고 아이콘 차이를 알린다', () => {
  const result = convertDrawSpike(state())
  const point = result.document.items.find((item) => item.name === '지점')
  assert.equal(point.style.color, '#ff0000')
  assert.equal(point.style.fillColor, '#ff0000')
  assert.equal(point.style.width, 4)
  assert.equal(point.source.sourceAssetId, 'draw-spike')
  assert.equal(point.source.itemId, 'p1')
  assert.deepEqual(point.source.folderPath, ['훈련'])
  assert.equal(point.source.properties.icon, 'pushpin/ylw-pushpin')
  assert.match(result.warnings.join(' '), /기본 기호로 표시/)
})

test('이미 이전한 도형은 다시 옮기지 않는다', () => {
  const first = convertDrawSpike(state())
  assert.equal(first.migratedIds.length, 6)
  const second = convertDrawSpike(state(), { skipIds: new Set(first.migratedIds) })
  assert.equal(second.counts.total, 0)
  assert.equal(second.document.items.length, 0)
  assert.equal(second.document.groups.length, 0)
})

test('형태를 되살리지 못한 도형은 이전하지 않고 원본을 남긴다', () => {
  const broken = { features: [feature('b1', { name: '깨진 원', gen: { type: 'circle', center: [127, 38], radiusNm: 0 } }, null)] }
  const result = convertDrawSpike(broken)
  assert.equal(result.counts.excluded, 1)
  assert.equal(result.document.items.length, 0)
  assert.equal(result.migratedIds.length, 0)
  assert.match(result.warnings.join(' '), /원본은 그대로 남습니다/)
})

test('보관소 읽기·이전 기록은 저장소가 없거나 깨져도 조용히 넘어간다', () => {
  assert.equal(readDrawSpikeState(null), null)
  const store = fakeStorage()
  store.setItem(DRAW_SPIKE_KEY, '{망가진')
  assert.equal(readDrawSpikeState(store), null)
  store.setItem(DRAW_SPIKE_KEY, JSON.stringify({ features: '아님' }))
  assert.equal(readDrawSpikeState(store), null)
  store.setItem(DRAW_SPIKE_KEY, JSON.stringify({ features: [feature('p1', { name: 'x' })] }))
  assert.equal(readDrawSpikeState(store).features.length, 1)

  assert.deepEqual([...readMigratedIds('account:1', store)], [])
  writeMigratedIds('account:1', ['p1'], store)
  assert.deepEqual([...readMigratedIds('account:1', store)], ['p1'])
  // 계정별로 기록을 분리한다.
  assert.deepEqual([...readMigratedIds('guest:browser', store)], [])
})

test('compound 항목의 기하는 서버가 받는 Multi* 형식이어야 한다', () => {
  // backend/src/maps/schema.js는 compound에 Multi*/GeometryCollection만 허용한다.
  // 단일 Polygon/LineString으로 넣으면 개인 저장이 kind_mismatch로 거부된다.
  const ALLOWED = ['MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection']
  const result = convertDrawSpike(state())
  const compounds = result.document.items.filter((item) => item.kind === 'compound')
  assert.ok(compounds.length >= 2)
  for (const item of compounds) assert.ok(ALLOWED.includes(item.geometry.type), `${item.name}: ${item.geometry.type}`)

  // 감싸도 좌표는 그대로다. 화면에 보이는 모양이 달라지면 안 된다.
  const sector = result.document.items.find((item) => item.name === '섹터')
  assert.equal(sector.geometry.type, 'MultiPolygon')
  assert.equal(sector.geometry.coordinates.length, 1)
  assert.ok(sector.geometry.coordinates[0][0].length > 3)
  const text = result.document.items.find((item) => item.name === '글자')
  assert.equal(text.geometry.type, 'MultiPoint')
  assert.deepEqual(text.geometry.coordinates, [[126, 37]])

  // 원과 일반 도형은 감싸지 않는다.
  assert.equal(result.document.items.find((item) => item.name === '원').geometry.type, 'Polygon')
  assert.equal(result.document.items.find((item) => item.name === '참고선').geometry.type, 'LineString')
})
