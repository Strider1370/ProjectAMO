import test from 'node:test'
import assert from 'node:assert/strict'
import { altitudeBubbleNote, briefingAltitudeMarks, hazardAtAltitude } from './briefingAltitudeModel.js'

const ribbon = {
  rows: [
    { key: 'turbulence', label: '난류', model: [
      { level: 'MOD', altitudeFt: { from: 25000, to: 25000 }, phase: 'cruise' },
      { level: 'MOD', altitudeFt: { from: 2665, to: 1302 }, phase: 'descent' },
    ], frames: [{ source: 'SIGMET', code: 'SEV_TURB', bandFt: { lowFt: 16000, highFt: 30000 }, mine: true }] },
    { key: 'icing', label: '착빙', model: [], frames: [{ source: 'SIGMET', code: 'SEV_ICE', bandFt: { lowFt: 14000, highFt: 20000 }, mine: false }] },
    { key: 'convection', label: '대류', model: [{ level: 'SEV', altitudeFt: null, phase: null }], frames: [] },
    { key: 'typhoon', label: '태풍', model: [], frames: [{ source: 'TYPHOON', label: 'KONG-REY' }] },
  ],
}

test('고도 슬라이더 표시: 모델 = 칠함(순항이면 내 고도), 발표 = 테두리, 고도 없는 위험은 "전 고도", 비행 범위', () => {
  const marks = briefingAltitudeMarks(ribbon, { cruiseAltitudeFt: 25000 })
  assert.deepEqual(marks.bands.map((band) => [band.kind, band.lowFt, band.highFt, band.mine]), [
    ['model', 25000, 25000, true], ['model', 1302, 2665, false], ['frame', 16000, 30000, true], ['frame', 14000, 20000, false],
  ])
  assert.deepEqual(marks.allAltitude.map((chip) => chip.text), ['대류 · 전 고도', '태풍 · 전 고도'])
  assert.deepEqual(marks.flight, { lowFt: 0, highFt: 25000 })
})

test('그 고도의 가장 센 위험(SIGMET이 모델 MOD보다 앞), 말풍선은 순항 → 지도 기압면', () => {
  const marks = briefingAltitudeMarks(ribbon, { cruiseAltitudeFt: 25000 })
  assert.equal(hazardAtAltitude(marks, 24000).text, 'SIGMET 심한 난기류')
  assert.equal(hazardAtAltitude(marks, 2000).text, '난류 MOD')
  assert.equal(hazardAtAltitude(marks, 40000), null)
  assert.equal(altitudeBubbleNote(marks, { mapAltitudeFt: 23600, mapLabel: 'FL240' }).text, '순항 FL250 → 지도 FL240 · SIGMET 심한 난기류')
})
