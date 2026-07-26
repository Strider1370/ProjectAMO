import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moaMatchKey, geometryBbox, matchMoaActivation } from './moaActivation.js'

// 실측 데이터 기준(2026-07-25 라이브 NOTAM 376건 + frontend/public/data/moa.geojson 75개):
//  - CATA 7L과 CATA 7H는 경계 좌표가 완전히 같고 고도층만 다르다 → 좌표만으로는 층을 못 고른다.
//  - "TEMPO RESTRICTED AREA ACT" NOTAM은 본문에 구역명이 없다 → 코드 매칭만으로는 못 잡는다.
//  - MOA 5처럼 코드까지 같고 고도만 다른 쌍이 있다 → 키는 코드+상한+하한 세 값이어야 유일하다.

const cata7L = {
  properties: { moa_lbl_1: 'CATA 7L', moa_lbl_2: '2 500 AGL', moa_lbl_3: 'SFC' },
  geometry: { type: 'Polygon', coordinates: [[[129.4353, 36.5], [129.8478, 36.5], [129.8478, 36.8333], [129.4353, 36.8333], [129.4353, 36.5]]] },
}
const cata7H = {
  properties: { moa_lbl_1: 'CATA 7H', moa_lbl_2: '5 000 AMSL', moa_lbl_3: '2 500 AGL' },
  geometry: cata7L.geometry,
}
// 코드가 같고 고도만 다른 쌍(AIP ENR 5.2에 2층으로 실려 있음).
const moa5Low = {
  properties: { moa_lbl_1: 'MOA 5', moa_lbl_2: '9 000 AMSL', moa_lbl_3: '3 000 AGL' },
  geometry: { type: 'Polygon', coordinates: [[[127.0, 37.0], [127.5, 37.0], [127.5, 37.5], [127.0, 37.5], [127.0, 37.0]]] },
}
const moa5High = {
  properties: { moa_lbl_1: 'MOA 5', moa_lbl_2: 'FL 400', moa_lbl_3: '12 000 AMSL' },
  geometry: moa5Low.geometry,
}
const FEATURES = [cata7L, cata7H, moa5Low, moa5High]

const notam = (over) => ({
  id: 'D0001/26', qcode: 'QRACA', summary: '', rawText: '',
  valid_from: '2026-07-24T06:00:00Z', valid_to: '2026-08-01T09:00:00Z',
  altitude: null, geometry: null, ...over,
})

test('moaMatchKey: code + ceiling + floor identifies one polygon', () => {
  assert.equal(moaMatchKey(cata7H.properties), 'CATA 7H|5 000 AMSL|2 500 AGL')
  assert.notEqual(moaMatchKey(moa5Low.properties), moaMatchKey(moa5High.properties))
})

test('geometryBbox: handles Polygon and LineString alike', () => {
  assert.deepEqual(geometryBbox(cata7L.geometry).map((n) => Number(n.toFixed(4))), [129.4353, 36.5, 129.8478, 36.8333])
  const line = { type: 'LineString', coordinates: [[129.4353, 36.5], [129.8478, 36.8333]] }
  assert.deepEqual(geometryBbox(line).map((n) => Number(n.toFixed(4))), [129.4353, 36.5, 129.8478, 36.8333])
})

test('code in the NOTAM text picks the named tier, not its twin', () => {
  const items = [notam({ summary: 'CATA 7H ACT', altitude: { lower: 2500, upper: 5000, unit: 'FT', ref: 'AMSL' } })]
  const matches = matchMoaActivation(items, FEATURES)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].key, moaMatchKey(cata7H.properties))
  assert.equal(matches[0].via, 'code')
})

// 좌표만 보면 7L/7H 둘 다 걸린다 — 고도가 층을 갈라준다.
test('geometry-only NOTAM is narrowed to the right tier by altitude', () => {
  const items = [notam({
    summary: 'TEMPO RESTRICTED AREA ACT AS FLW',
    geometry: cata7L.geometry,
    altitude: { lower: 2500, upper: 5000, unit: 'FT', ref: 'AMSL' },
  })]
  const matches = matchMoaActivation(items, FEATURES)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].key, moaMatchKey(cata7H.properties))
  assert.equal(matches[0].via, 'geometry')
})

// 고도 정보가 없으면 층을 고를 근거가 없다 — 임의로 하나 찍지 말고 겹치는 층을 모두 반환한다
// (미상=저촉 간주, notam-briefing.js와 같은 보수적 안전 규칙).
test('geometry match without altitude returns every overlapping tier', () => {
  const items = [notam({ summary: 'TEMPO RESTRICTED AREA ACT AS FLW', geometry: cata7L.geometry, altitude: null })]
  const keys = matchMoaActivation(items, FEATURES).map((m) => m.key).sort()
  assert.deepEqual(keys, [moaMatchKey(cata7H.properties), moaMatchKey(cata7L.properties)].sort())
})

test('a NOTAM somewhere else matches nothing', () => {
  const far = { type: 'Polygon', coordinates: [[[120, 30], [120.2, 30], [120.2, 30.2], [120, 30.2], [120, 30]]] }
  assert.deepEqual(matchMoaActivation([notam({ geometry: far })], FEATURES), [])
})

test('altitude that misses the band does not match', () => {
  const items = [notam({ summary: 'CATA 7H ACT', altitude: { lower: 30000, upper: 40000, unit: 'FT', ref: null } })]
  assert.deepEqual(matchMoaActivation(items, FEATURES), [])
})

// 코드 문자열이 다른 코드의 일부로 들어가는 오탐 방지: "MOA 5"가 "MOA 50"에 걸리면 안 된다.
test('code matching respects word boundaries', () => {
  const items = [notam({ summary: 'MOA 50 ACT' })]
  assert.deepEqual(matchMoaActivation(items, FEATURES), [])
})

test('each matched entry carries the source NOTAM so the caller can decide the time state', () => {
  const items = [notam({ id: 'D2117/26', summary: 'CATA 7H ACT' })]
  const [m] = matchMoaActivation(items, FEATURES)
  assert.equal(m.notam.id, 'D2117/26')
})
