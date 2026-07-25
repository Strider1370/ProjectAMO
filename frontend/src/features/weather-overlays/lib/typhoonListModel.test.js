import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTyphoonListItems } from './typhoonListModel.js'

const typhoon = (number, name = '힌남노') => ({
  number, name, year: 2022, seq: 32, analyzedAt: '2022-09-05T00:00:00.000Z',
  current: { lat: 29.8, lon: 124.9, pressureHpa: 930, maxWindMs: 50, location: '서귀포 남남서쪽 약 410 km 부근 해상' },
  rows: [],
})

test('항목마다 번호와 이름이 붙은 제목과 색이 생긴다', () => {
  const items = buildTyphoonListItems([typhoon(11)])
  assert.equal(items.length, 1)
  assert.equal(items[0].title, '11호 태풍 힌남노')
  assert.match(items[0].color, /^#[0-9a-f]{6}$/i)
})

test('이름을 못 받았으면 번호만 쓰고 태풍을 빠뜨리지 않는다', () => {
  const [item] = buildTyphoonListItems([typhoon(11, null)])
  assert.equal(item.title, '11호 태풍')
  assert.equal(item.name, null)
})

test('강도와 위치를 그대로 전달한다', () => {
  const [item] = buildTyphoonListItems([typhoon(11)])
  assert.equal(item.pressureHpa, 930)
  assert.equal(item.maxWindMs, 50)
  assert.equal(item.location, '서귀포 남남서쪽 약 410 km 부근 해상')
  assert.deepEqual(item.center, { lat: 29.8, lon: 124.9 })
})

test('복수 태풍은 지도와 같은 색 배정을 쓴다', () => {
  const items = buildTyphoonListItems([typhoon(19), typhoon(20)])
  assert.equal(new Set(items.map((i) => i.color)).size, 2)
})

test('빈 목록은 빈 배열이다', () => {
  assert.deepEqual(buildTyphoonListItems([]), [])
})
