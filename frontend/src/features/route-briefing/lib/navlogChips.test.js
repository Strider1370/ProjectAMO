import assert from 'node:assert/strict'
import test from 'node:test'

import { legHazardChips, navlogSummary, procedureHazardChips } from './navlogChips.js'

test('legHazardChips shows no badge for a leg without turbulence or icing', () => {
  // 서버는 난류가 없으면 'none', 착빙이 없으면 0을 보낸다 — 둘 다 칩이 아니다.
  assert.deepEqual(legHazardChips({ icing: { peakLevel: 0 }, turbulence: { peakLevel: 'none' }, hazards: [] }), [])
})

test('legHazardChips keeps only MOD and above, like the hazard ribbon', () => {
  assert.deepEqual(legHazardChips({ icing: { peakLevel: 1 }, turbulence: { peakLevel: 'light' } }), [])
  assert.deepEqual(legHazardChips({ icing: { peakLevel: 2 }, turbulence: { peakLevel: 'severe' } }).map((chip) => [chip.label, chip.level]), [
    ['착빙 MOD', 'amber'],
    ['난류 SEV', 'red'],
  ])
})

test('legHazardChips keeps an advisory whose altitude cannot be judged as a gray chip', () => {
  const chips = legHazardChips({ hazards: [{ code: 'SEV_TURB', verticalStatus: 'unknown' }, { code: 'MOD_ICE', verticalStatus: 'overlap' }] })
  assert.deepEqual(chips.map((chip) => [chip.level, chip.note]), [['gray', '고도 판정 불가'], ['red', null]])
})

test('procedureHazardChips takes the peak MOD+ level across the procedure legs', () => {
  const chips = procedureHazardChips({ legs: [
    { icing: { peakLevel: 0 }, turbulence: { peakLevel: 'none' } },
    { icing: { peakLevel: 2 }, turbulence: { peakLevel: 'light' } },
  ] })
  assert.deepEqual(chips.map((chip) => chip.label), ['착빙 MOD'])
  assert.deepEqual(procedureHazardChips({ legs: [{ turbulence: { peakLevel: 'none' } }] }), [])
})

test('navlogSummary weights the mean wind by leg distance and finds the strongest headwind', () => {
  const summary = navlogSummary([
    { from: 'A', to: 'B', distanceNm: 10, wind: { meanComponentKt: -10 }, temp: { isaDevC: 2 } },
    { from: 'B', to: 'C', distanceNm: 30, wind: { meanComponentKt: -30 }, temp: { isaDevC: 5 } },
    { from: 'C', to: 'D', distanceNm: 0, wind: { meanComponentKt: 40 }, temp: null },
  ])
  assert.equal(summary.meanComponentKt, -25)
  assert.deepEqual(summary.maxHeadwind, { kt: 30, from: 'B', to: 'C' })
  assert.deepEqual(summary.isaRange, { min: 2, max: 5 })
})

test('navlogSummary reports nothing it has no data for', () => {
  assert.deepEqual(navlogSummary([{ distanceNm: 10, wind: { meanComponentKt: 12 } }]), { meanComponentKt: 12, maxHeadwind: null, isaRange: null })
})
