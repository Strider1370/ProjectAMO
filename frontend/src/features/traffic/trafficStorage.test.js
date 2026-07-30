import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_FILTERS } from './trafficFilter.js'
import { parseStoredFilters, serializeFilters } from './trafficStorage.js'

test('정상 저장값을 그대로 복원한다', () => {
  const saved = serializeFilters({ ...DEFAULT_FILTERS, groups: ['agency'], codes: ['KFS'], classes: ['helicopter'], altitudeFt: [0, 5000] })
  assert.deepEqual(parseStoredFilters(saved), {
    groups: ['agency'], codes: ['KFS'], classes: ['helicopter'], altitudeFt: [0, 5000], search: '',
  })
})

test('검색어는 저장하지 않는다', () => {
  const saved = serializeFilters({ ...DEFAULT_FILTERS, search: 'KAL' })
  assert.equal(JSON.parse(saved).search, undefined)
  assert.equal(parseStoredFilters(saved).search, '')
})

test('깨진 값·없는 값은 기본값으로 떨어진다', () => {
  for (const raw of [null, '', 'not json', '[]', '{"groups":"agency"}']) {
    assert.deepEqual(parseStoredFilters(raw), DEFAULT_FILTERS)
  }
})

test('모르는 그룹·기종은 버린다', () => {
  const saved = JSON.stringify({ groups: ['agency', 'aliens'], classes: ['jet', 'ufo'] })
  const parsed = parseStoredFilters(saved)
  assert.deepEqual(parsed.groups, ['agency'])
  assert.deepEqual(parsed.classes, ['jet'])
})

test('고도 구간은 범위 안으로 자르고 순서를 바로잡는다', () => {
  assert.deepEqual(parseStoredFilters(JSON.stringify({ altitudeFt: [90000, -20] })).altitudeFt, [0, 45000])
  assert.deepEqual(parseStoredFilters(JSON.stringify({ altitudeFt: [12000, 3000] })).altitudeFt, [3000, 12000])
  assert.deepEqual(parseStoredFilters(JSON.stringify({ altitudeFt: ['a', 'b'] })).altitudeFt, [0, 45000])
})
