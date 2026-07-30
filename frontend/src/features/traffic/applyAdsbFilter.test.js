import test from 'node:test'
import assert from 'node:assert/strict'

import { applyAdsbFilter } from './applyAdsbFilter.js'

// 지도 대역 — setFilter 호출만 기록한다.
function fakeMap() {
  const calls = []
  return {
    calls,
    getLayer: () => true,
    setFilter: (id, filter) => calls.push([id, filter]),
  }
}

test('필터가 걸리면 아이콘·로고·궤적 세 겹에 모두 적용한다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: ['aaa001'], filtered: true })
  const ids = map.calls.map(([id]) => id)
  assert.deepEqual(ids, ['adsb-layer', 'adsb-logo-layer', 'adsb-trail-layer'])
})

test('로고 레이어는 자체 조건을 유지한 채 AND로 묶는다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: ['aaa001'], filtered: true })
  const [, logoFilter] = map.calls.find(([id]) => id === 'adsb-logo-layer')
  assert.deepEqual(logoFilter, [
    'all',
    ['!=', ['get', 'operator'], ''],
    ['in', ['get', 'icao24'], ['literal', ['aaa001']]],
  ])
})

test('필터가 없으면 원래 상태로 되돌린다 — 긴 목록을 매번 넘기지 않는다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: [], filtered: false })
  assert.deepEqual(map.calls, [
    ['adsb-layer', null],
    ['adsb-logo-layer', ['!=', ['get', 'operator'], '']],
    ['adsb-trail-layer', null],
  ])
})

test('수신 범위 원에는 손대지 않는다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: ['aaa001'], filtered: true })
  assert.equal(map.calls.some(([id]) => id === 'adsb-range-layer'), false)
})

test('레이어가 아직 없으면 아무 일도 하지 않는다', () => {
  const map = { ...fakeMap(), getLayer: () => false }
  const calls = []
  applyAdsbFilter({ getLayer: () => false, setFilter: (...a) => calls.push(a) }, { ids: [], filtered: true })
  assert.deepEqual(calls, [])
})
