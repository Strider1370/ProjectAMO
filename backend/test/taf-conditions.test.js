import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tafConditionsAt } from '../src/alerts/taf-conditions.js'

const AT = '2026-08-20T02:00:00Z'

// 현상은 parse-utils.js가 낸 모양이다: { raw, intensity, descriptor, phenomena }.
const wx = (raw, { intensity = 'MODERATE', descriptor = null, phenomena = [] } = {}) =>
  ({ raw, intensity, descriptor, phenomena })

// 타임라인은 파서가 이미 병합해 둔 상태다 — 운고·시정과 현상이 같은 항목에 들어 있다.
const taf = ({ icao = 'RKTU', vis = 9999, ceil = 3000, weather = [] } = {}) => ({
  header: { icao },
  timeline: [{
    time: AT,
    visibility: { value: vis, cavok: false },
    clouds: [{ amount: 'BKN', base: ceil, raw: `BKN${ceil}` }],
    weather,
  }],
})

// RKTU 접근최저치는 550m / 200ft (flight-category.js의 표).

test('미니마를 설정하지 않으면 VFR 기본값(1500ft/5000m)으로 본다', () => {
  const c = tafConditionsAt(taf({ vis: 3000 }), AT, 'RKTU', null)
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'default', '옛 "IFR이면 울린다"와 같은 동작이다')
})

test('내 미니마가 더 엄격하면 내 기준으로 울린다', () => {
  // 내 기준 5000m, 공항 550m → 실효 5000m. 4000m면 걸린다.
  const c = tafConditionsAt(taf({ vis: 4000 }), AT, 'RKTU', { visibilityM: 5000, ceilingFt: 1500 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'personal')
})

test('공항 최저치가 더 엄격하면 공항 기준으로 울린다 — 못 가는 걸 갈 수 있다고 두면 안 된다', () => {
  // 내 기준 200m/100ft, 공항 550m/200ft → 실효 550m. 400m면 아무도 못 내린다.
  const c = tafConditionsAt(taf({ vis: 400 }), AT, 'RKTU', { visibilityM: 200, ceilingFt: 100 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'airport')
})

test('둘 다 넘으면 조용하다', () => {
  const c = tafConditionsAt(taf({ vis: 9999, ceil: 3000 }), AT, 'RKTU', { visibilityM: 5000, ceilingFt: 1500 })
  assert.equal(c.minima, false)
  assert.equal(c.minimaBound, null)
})

test('운고로도 걸린다', () => {
  const c = tafConditionsAt(taf({ ceil: 800 }), AT, 'RKTU', { visibilityM: 1600, ceilingFt: 1500 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'personal')
})

test('해외 공항은 접근최저치 자료가 없어 내 미니마만 적용된다', () => {
  const c = tafConditionsAt(taf({ icao: 'RJBB', vis: 4000 }), AT, 'RJBB', { visibilityM: 5000, ceilingFt: 1500 })
  assert.equal(c.minima, true)
  assert.equal(c.minimaBound, 'personal')
})

test('뇌전은 수식어로 읽는다 — TSRA도 뇌전이다', () => {
  const c = tafConditionsAt(taf({ weather: [wx('TSRA', { descriptor: 'TS', phenomena: ['RA'] })] }), AT, 'RKTU', null)
  assert.equal(c.ts, true)
  assert.equal(c.fg, false)
})

test('부근(VC)은 발화하지 않는다 — 공항이 아니라 그 주변이다', () => {
  const c = tafConditionsAt(taf({ weather: [wx('VCTS', { intensity: 'VICINITY', descriptor: 'TS' })] }), AT, 'RKTU', null)
  assert.equal(c.ts, false, 'VCTS를 "출발 RKTU 뇌전 예보"라고 알리면 사실과 다르다')
})

test('FZFG는 안개다 — 수식어가 붙어도 현상은 FG', () => {
  const c = tafConditionsAt(taf({ weather: [wx('FZFG', { descriptor: 'FZ', phenomena: ['FG'] })] }), AT, 'RKTU', null)
  assert.equal(c.fg, true)
})

test('약한 눈도 눈이다', () => {
  const c = tafConditionsAt(taf({ weather: [wx('-SN', { intensity: 'LIGHT', phenomena: ['SN'] })] }), AT, 'RKTU', null)
  assert.equal(c.sn, true)
  assert.equal(c.ts, false)
})

test('박무(BR)는 안개가 아니다 — 파서가 저시정에서 합성해 넣는 값이다', () => {
  const c = tafConditionsAt(taf({ vis: 3000, weather: [wx('BR', { phenomena: ['BR'] })] }), AT, 'RKTU', null)
  assert.equal(c.fg, false)
})

test('유효기간 밖 시각이면 아무것도 안 걸린다', () => {
  const c = tafConditionsAt(taf({ vis: 100 }), '2026-08-20T09:00:00Z', 'RKTU', null)
  assert.deepEqual(c, { minima: false, minimaBound: null, ts: false, fg: false, sn: false })
})

test('TAF가 없으면 아무것도 안 걸린다 — 없는 것을 위험으로 읽지 않는다', () => {
  const c = tafConditionsAt(null, AT, 'RKTU', null)
  assert.deepEqual(c, { minima: false, minimaBound: null, ts: false, fg: false, sn: false })
})
