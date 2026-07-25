import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseTyphoonText, parseTyphoonList } from '../src/parsers/typhoon-parser.js'
import { buildSnapshot, currentTm } from '../src/processors/typhoon-processor.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (name) => fs.readFileSync(path.join(dir, 'fixtures', name), 'utf8')
const FETCHED = '2022-09-05T00:30:00.000Z'

test('활성 태풍이 없으면 빈 목록이지만 상태는 정상이다', () => {
  const snapshot = buildSnapshot({ activeRows: [], names: [], fetched_at: FETCHED })
  assert.equal(snapshot.status, 'ok')
  assert.deepEqual(snapshot.typhoons, [])
  assert.equal(snapshot.fetched_at, FETCHED)
})

test('한 응답의 복수 태풍을 번호별로 나눠 담는다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetched_at: FETCHED })
  assert.deepEqual(snapshot.typhoons.map((t) => t.number), [19, 20])
  // mode=1이므로 태풍마다 과거 경로와 예보가 함께 들어 있어야 한다.
  for (const typhoon of snapshot.typhoons) {
    assert.ok(typhoon.rows.some((r) => !r.forecast), '과거 경로가 있어야 한다')
    assert.ok(typhoon.rows.some((r) => r.forecast), '예보가 있어야 한다')
  }
})

test('현재 위치는 분석 행 중 가장 최근이다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetched_at: FETCHED })
  const soulik = snapshot.typhoons.find((t) => t.number === 19)
  assert.equal(soulik.current.analyzedAt, '2018-08-22T00:00:00.000Z')
  assert.equal(soulik.current.forecast, false)
})

test('이름을 태풍번호로 이어 붙인다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const names = parseTyphoonList(read('typhoon-list-2018.csv'))
  const snapshot = buildSnapshot({ activeRows, names, fetched_at: FETCHED })
  assert.equal(snapshot.typhoons.find((t) => t.number === 19).name, '솔릭')
  assert.equal(snapshot.typhoons.find((t) => t.number === 20).name, '시마론')
})

test('이름을 못 받아도 태풍을 빠뜨리지 않는다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetched_at: FETCHED })
  assert.equal(snapshot.typhoons.length, 2)
  assert.equal(snapshot.typhoons[0].name, null)
})

test('발표번호는 그 태풍의 최대 SEQ다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetched_at: FETCHED })
  const soulik = snapshot.typhoons.find((t) => t.number === 19)
  assert.equal(soulik.seq, Math.max(...activeRows.filter((r) => r.number === 19).map((r) => r.seq)))
})

test('스냅샷에 현재 시점 도형과 부채꼴이 담긴다', () => {
  const activeRows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const snapshot = buildSnapshot({ activeRows, names: [], fetched_at: FETCHED })
  const soulik = snapshot.typhoons.find((t) => t.number === 19)
  assert.equal(soulik.geometry.gale.type, 'Polygon')
  assert.ok(soulik.geometry.cone, '예보 오차원 합집합이 있어야 한다')
})

test('tm은 현재 UTC 정시 12자리다', () => {
  assert.equal(currentTm(new Date('2026-07-25T18:42:13.000Z')), '202607251800')
})
