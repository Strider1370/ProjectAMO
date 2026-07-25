import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseTyphoonText, parseTyphoonList, groupByTyphoonNumber } from '../src/parsers/typhoon-parser.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (name) => fs.readFileSync(path.join(dir, 'fixtures', name), 'utf8')

test('mode=1은 과거 분석 경로와 최신 예보를 모두 준다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  assert.equal(rows.length, 39)
  assert.equal(rows.filter((r) => !r.forecast).length, 32)
  assert.equal(rows.filter((r) => r.forecast).length, 7)
})

test('첫 분석 행은 경로의 시작이다', () => {
  const [row] = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  assert.equal(row.year, 2022)
  assert.equal(row.number, 11)
  assert.equal(row.seq, 1)
  assert.equal(row.forecast, false)
  assert.equal(row.analyzedAt, '2022-08-28T12:00:00.000Z')
  assert.equal(row.lat, 26.9)
  assert.equal(row.lon, 148.5)
  assert.equal(row.pressureHpa, 998)
  assert.equal(row.gale.radiusKm, 220)
  // RAD25 = -999 → 폭풍 링이 통째로 없다
  assert.equal(row.storm, null)
})

test('마지막 분석 행이 현재 위치다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  const current = rows.filter((r) => !r.forecast).at(-1)
  assert.equal(current.seq, 32)
  assert.equal(current.analyzedAt, '2022-09-05T00:00:00.000Z')
  assert.equal(current.lat, 29.8)
  assert.equal(current.lon, 124.9)
  assert.equal(current.dir, 'N')
  assert.equal(current.pressureHpa, 930)
  assert.equal(current.maxWindMs, 50)
  assert.equal(current.gale.radiusKm, 430)
  assert.equal(current.gale.exceptionDir, 'SW')
  assert.equal(current.gale.exceptionRadiusKm, 340)
  assert.equal(current.storm.radiusKm, 180)
  assert.equal(current.errorRadiusKm, 0)
  assert.equal(current.location, '서귀포 남남서쪽 약 410 km 부근 해상')
})

test('공백이 든 위치설명이 컬럼을 밀지 않는다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  for (const row of rows) {
    assert.ok(Number.isFinite(row.lat), '위도가 숫자여야 한다')
    assert.ok(!/^[A-Z-]+,/.test(row.location), '위치설명에 ED25 토큰이 섞이면 안 된다')
  }
})

test('-999와 -는 결측이므로 null이 된다', () => {
  const rows = parseTyphoonText(read('typhoon-hinnamnor.txt'))
  const last = rows.at(-1)
  assert.equal(last.forecast, true)
  assert.equal(last.leadHours, 42)
  assert.equal(last.validAt, '2022-09-06T18:00:00.000Z')
  assert.equal(last.gale, null)
  assert.equal(last.storm, null)
  assert.equal(last.errorRadiusKm, 160)
})

test('-9도 결측이다 — 음수는 전부 null', () => {
  const rows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  // 이 픽스처는 RAD가 -9인 행이 대부분이다. -999만 걸러내면 판정 반경이 9 km 줄어든다.
  assert.ok(rows.some((r) => r.errorRadiusKm === null), '-9인 오차반경이 null이어야 한다')
  for (const row of rows) {
    assert.ok(row.errorRadiusKm === null || row.errorRadiusKm >= 0, '음수가 남으면 안 된다')
    assert.ok(row.gale === null || row.gale.radiusKm >= 0)
    assert.ok(row.gale === null || row.gale.exceptionRadiusKm === null || row.gale.exceptionRadiusKm >= 0)
    assert.ok(row.storm === null || row.storm.radiusKm >= 0)
  }
})

test('복수 태풍을 번호로 나눈다', () => {
  const rows = parseTyphoonText(read('typhoon-multi-2018.txt'))
  const grouped = groupByTyphoonNumber(rows)
  assert.deepEqual([...grouped.keys()].sort((a, b) => a - b), [19, 20])
  assert.equal(grouped.get(19).length, 31)  // 분석 25 + 예보 6
  assert.equal(grouped.get(20).length, 19)  // 분석 15 + 예보 4
  for (const [number, group] of grouped) {
    assert.ok(group.some((r) => r.forecast), `${number}호에 예보가 있어야 한다`)
  }
})

test('태풍 목록에서 이름을 읽는다', () => {
  const list = parseTyphoonList(read('typhoon-list-2018.csv'))
  const soulik = list.find((t) => t.number === 19)
  assert.equal(soulik.name, '솔릭')
  assert.equal(soulik.nameEn, 'SOULIK')
  assert.equal(soulik.year, 2018)
  assert.equal(soulik.active, false)   // NOW=2(종료)
  const cimaron = list.find((t) => t.number === 20)
  assert.equal(cimaron.name, '시마론')
})

test('목록의 REM에 쉼표가 있어도 앞 8개 필드만 취해 안전하다', () => {
  const list = parseTyphoonList('2026,12,1,4,202607231800,210012310000,노을,NOUL,설명에,쉼표가,있다,=\n')
  assert.equal(list.length, 1)
  assert.equal(list[0].number, 12)
  assert.equal(list[0].name, '노을')
  assert.equal(list[0].nameEn, 'NOUL')
  assert.equal(list[0].active, true)   // NOW=1(진행중)
})

test('목록 머리글과 빈 줄은 무시한다', () => {
  assert.deepEqual(parseTyphoonList('#START7777\n# YY SEQ\n#7777END\n'), [])
  assert.deepEqual(parseTyphoonList(''), [])
})

test('머리글과 빈 줄은 무시한다', () => {
  assert.deepEqual(parseTyphoonText('#START7777\n# FT YY\n#7777END\n'), [])
  assert.deepEqual(parseTyphoonText(''), [])
})
