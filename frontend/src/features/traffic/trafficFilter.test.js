import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_FILTERS, ALTITUDE_MAX_FT, FEET_PER_METER,
  operatorInfo, hasActiveFilters, matchesFilters, visibleIds, adsbIdFilter, countAircraft,
} from './trafficFilter.js'

// 지도에 올라가는 feature 모양 그대로(createAdsbGeoJSON) — 고도는 미터다.
function ac(over = {}) {
  return {
    properties: {
      icao24: 'aaa001', callsign: 'KAL123', registration: 'HL8123',
      aircraft_class: 'jet', baro_altitude: 10000 / FEET_PER_METER,
      ...over,
    },
  }
}
const KAL = ac()
const KFS = ac({ icao24: 'bbb002', callsign: 'HL9176', registration: 'HL9176', aircraft_class: 'helicopter', baro_altitude: 1500 / FEET_PER_METER })
const FOREIGN = ac({ icao24: 'ccc003', callsign: 'CPA411', registration: 'B-LAA', aircraft_class: 'heavy', baro_altitude: 35000 / FEET_PER_METER })
const NO_ALT = ac({ icao24: 'ddd004', callsign: 'JJA201', registration: 'HL8321', baro_altitude: null })

test('소속 그룹 판정 — 항공사 / 기관·훈련기 / 미분류', () => {
  assert.deepEqual(operatorInfo(KAL.properties), { group: 'airline', code: 'KAL', name: '대한항공' })
  assert.deepEqual(operatorInfo(KFS.properties), { group: 'agency', code: 'KFS', name: '산림청' }) // HL9176은 operators.js 산림청 명단
  assert.equal(operatorInfo(FOREIGN.properties).group, 'unclassified')
  assert.equal(operatorInfo(FOREIGN.properties).code, 'CPA')
})

test('아무것도 고르지 않으면 필터 없음 — 전부 통과', () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false)
  for (const a of [KAL, KFS, FOREIGN, NO_ALT]) {
    assert.equal(matchesFilters(a.properties, DEFAULT_FILTERS), true)
  }
})

test('그룹 체크는 그 그룹의 개별 체크와 같은 결과', () => {
  const byGroup = { ...DEFAULT_FILTERS, groups: ['agency'] }
  const byCode = { ...DEFAULT_FILTERS, codes: [operatorInfo(KFS.properties).code] }
  const all = [KAL, KFS, FOREIGN]
  assert.deepEqual(visibleIds(all, byGroup), visibleIds(all, byCode))
  assert.deepEqual(visibleIds(all, byGroup), ['bbb002'])
})

test('같은 필터 안에서는 OR, 다른 필터끼리는 AND', () => {
  const or = { ...DEFAULT_FILTERS, groups: ['agency', 'airline'] }
  assert.deepEqual(visibleIds([KAL, KFS, FOREIGN], or), ['aaa001', 'bbb002'])

  const and = { ...DEFAULT_FILTERS, groups: ['airline'], classes: ['helicopter'] }
  assert.deepEqual(visibleIds([KAL, KFS, FOREIGN], and), [])
})

test('고도 구간은 양끝을 포함한다', () => {
  const band = { ...DEFAULT_FILTERS, altitudeFt: [10000, 35000] }
  assert.equal(matchesFilters(KAL.properties, band), true)     // 정확히 10000ft
  assert.equal(matchesFilters(FOREIGN.properties, band), true)  // 정확히 35000ft
  assert.equal(matchesFilters(KFS.properties, band), false)     // 1500ft
})

test('고도 미보고 기체 — 전 구간이면 보이고, 구간을 좁히면 숨는다', () => {
  assert.equal(matchesFilters(NO_ALT.properties, DEFAULT_FILTERS), true)
  assert.equal(matchesFilters(NO_ALT.properties, { ...DEFAULT_FILTERS, altitudeFt: [0, ALTITUDE_MAX_FT - 500] }), false)
})

test('icao24 없는 기체는 필터가 걸린 동안 숨는다 — 식별 불가', () => {
  const ghost = ac({ icao24: null })
  assert.deepEqual(visibleIds([ghost], { ...DEFAULT_FILTERS, groups: ['airline'] }), [])
})

test('검색어가 있으면 다른 필터를 무시한다', () => {
  const filters = { ...DEFAULT_FILTERS, groups: ['agency'], altitudeFt: [0, 3000], search: 'kal' }
  assert.deepEqual(visibleIds([KAL, KFS, FOREIGN], filters), ['aaa001'])
})

test('검색은 편명·등록기호 부분일치, 대소문자 무시', () => {
  const byReg = { ...DEFAULT_FILTERS, search: 'hl91' }
  assert.deepEqual(visibleIds([KAL, KFS], byReg), ['bbb002'])
})

test('지도 규칙은 icao24 목록 하나로 만든다', () => {
  assert.deepEqual(adsbIdFilter(['aaa001', 'bbb002']), ['in', ['get', 'icao24'], ['literal', ['aaa001', 'bbb002']]])
})

test('소속별 대수 — 그룹 합계와 개별 항목', () => {
  const counts = countAircraft([KAL, KAL, KFS, FOREIGN])
  assert.equal(counts.total, 4)
  assert.deepEqual(counts.groups, { airline: 2, agency: 1, unclassified: 1 })
  const kal = counts.items.find((i) => i.code === 'KAL')
  assert.deepEqual(kal, { code: 'KAL', name: '대한항공', group: 'airline', count: 2 })
  assert.equal(counts.items.some((i) => i.group === 'unclassified'), false) // 미분류는 개별로 펼치지 않는다
})
