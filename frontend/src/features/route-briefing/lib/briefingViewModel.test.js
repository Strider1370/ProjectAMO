import test from 'node:test'
import assert from 'node:assert/strict'
import { catLevel, catColorOf, catDisplay, worstAirport, worstInterval, tafBarSegments } from './briefingViewModel.js'

test('catLevel: 심각도 매핑 (MVFR은 green, IFR amber, LIFR red, 미상 gray)', () => {
  assert.equal(catLevel('VFR'), 'green')
  assert.equal(catLevel('MVFR'), 'green')
  assert.equal(catLevel('IFR'), 'amber')
  assert.equal(catLevel('LIFR'), 'red')
  assert.equal(catLevel('UNKNOWN'), 'gray')
})

test('catColorOf: level 색 토큰', () => {
  assert.equal(catColorOf('IFR'), 'var(--level-amber)')
  assert.equal(catColorOf('LIFR'), 'var(--level-red)')
})

test('catDisplay: MVFR은 VFR로 fold', () => {
  assert.equal(catDisplay('MVFR'), 'VFR')
  assert.equal(catDisplay('IFR'), 'IFR')
})

test('worstAirport: 최악 카테고리 공항 선택', () => {
  const worst = worstAirport([{ category: 'VFR' }, { category: 'LIFR' }, { category: 'IFR' }])
  assert.equal(worst.category, 'LIFR')
  assert.equal(worstAirport([]), null)
  assert.equal(worstAirport(null), null)
})

test('worstInterval: 최악 강도 구간 선택 (심>중>약)', () => {
  const worst = worstInterval([{ level: '약' }, { level: '심' }, { level: '중' }])
  assert.equal(worst.level, '심')
  assert.equal(worstInterval([]), null)
})

test('tafBarSegments: 같은 색 연속 병합 + width 계산', () => {
  const validity = { start: '2026-06-26T00:00:00Z', end: '2026-06-26T10:00:00Z' } // span 10h
  const timeline = [
    { time: '2026-06-26T00:00:00Z', category: 'VFR' },  // green @ 0%
    { time: '2026-06-26T02:00:00Z', category: 'MVFR' }, // green(병합) — 새 세그먼트 안 생김
    { time: '2026-06-26T05:00:00Z', category: 'IFR' },  // amber @ 50%
  ]
  const segs = tafBarSegments(timeline, validity)
  assert.equal(segs.length, 2) // green 하나(VFR+MVFR 병합) + amber 하나
  assert.equal(segs[0].color, 'var(--level-green)')
  assert.equal(segs[0].left, 0)
  assert.equal(segs[0].width, 50) // 0 → 50%
  assert.equal(segs[1].color, 'var(--level-amber)')
  assert.equal(segs[1].left, 50)
  assert.equal(segs[1].width, 50) // 50 → 100%
})

test('tafBarSegments: 잘못된 유효시간이면 빈 배열', () => {
  assert.deepEqual(tafBarSegments([{ time: 'x', category: 'VFR' }], { start: 'bad', end: 'bad' }), [])
  assert.deepEqual(tafBarSegments([], { start: '2026-06-26T00:00:00Z', end: '2026-06-26T10:00:00Z' }), [])
})
