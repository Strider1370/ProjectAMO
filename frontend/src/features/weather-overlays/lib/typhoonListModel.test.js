import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTyphoonListItems, buildTrackRows, intensityOf, windKmh, formatTrackTime, formatRadius } from './typhoonListModel.js'

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

test('강도는 최대풍속에서 유도한다 (통보문 범례 구간)', () => {
  assert.equal(intensityOf(16), 'TD')   // 17 미만은 열대저압부
  assert.equal(intensityOf(17), '1')
  assert.equal(intensityOf(24), '1')
  assert.equal(intensityOf(25), '2')
  assert.equal(intensityOf(33), '3')
  assert.equal(intensityOf(39), '3')    // 12호 노을 현재
  assert.equal(intensityOf(44), '4')
  assert.equal(intensityOf(54), '5')
  assert.equal(intensityOf(null), null)
})

test('풍속을 km/h로 바꾼다 (통보문과 같은 값)', () => {
  assert.equal(windKmh(39), 140)   // 통보문: 39 m/s = 140 km/h
  assert.equal(windKmh(24), 86)    // 통보문: 24 m/s = 86 km/h
  assert.equal(windKmh(15), 54)    // 통보문: 15 m/s = 54 km/h
})

test('반경을 통보문 표기로 만든다', () => {
  assert.equal(formatRadius({ radiusKm: 280, exceptionDir: 'SW', exceptionRadiusKm: 180 }), '280 km [남서 180]')
  assert.equal(formatRadius({ radiusKm: 220, exceptionDir: null, exceptionRadiusKm: null }), '220 km')
  assert.equal(formatRadius(null), null)
})

test('시각을 한국시각 일/시로 적는다', () => {
  // 2026-07-25T18:00Z = 26일 03시 KST — 통보문의 "26일 03시 현재"와 같다.
  assert.equal(formatTrackTime('2026-07-25T18:00:00.000Z'), '26일 03시')
  assert.equal(formatTrackTime(null), '')
})

test('시각별 행이 현재와 예보를 구분한다', () => {
  const current = { forecast: false, validAt: '2026-07-25T18:00:00.000Z', lat: 22.5, lon: 115.1, maxWindMs: 39, pressureHpa: 960, dir: 'NW', speedKmh: 18, gale: { radiusKm: 280, exceptionDir: 'SW', exceptionRadiusKm: 180 }, storm: null, errorRadiusKm: 0, location: '중국 홍콩 동북동쪽 약 120 km 부근 해상' }
  const later = { forecast: true, validAt: '2026-07-26T06:00:00.000Z', lat: 23.8, lon: 114, maxWindMs: 24, pressureHpa: 990, dir: 'NW', speedKmh: 16, gale: { radiusKm: 220, exceptionDir: 'SW', exceptionRadiusKm: 120 }, storm: null, errorRadiusKm: 40, location: '중국 홍콩 북쪽 약 180 km 부근 육상' }
  const rows = buildTrackRows({ number: 12, current, rows: [current, later] })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r) => r.kindLabel), ['현재', '예상'])
  assert.equal(rows[0].isCurrent, true)
  assert.equal(rows[1].isCurrent, false)
  assert.equal(rows[0].intensity, '3')
  assert.equal(rows[0].maxWindKmh, 140)
  assert.equal(rows[0].gale, '280 km [남서 180]')
  assert.equal(rows[1].errorRadiusKm, 40)
  assert.equal(rows[0].errorRadiusKm, null, '오차 0은 표시하지 않는다')
})
