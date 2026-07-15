import test from 'node:test'
import assert from 'node:assert/strict'
import { firstVisibleFrom, shouldAutoStart } from './tourMachine.js'
import { TOUR_STEPS } from './tourSteps.js'

const S = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const all = () => true
const none = () => false

test('firstVisibleFrom: 전부 존재하면 from 그대로', () => {
  assert.equal(firstVisibleFrom(S, all, 0), 0)
  assert.equal(firstVisibleFrom(S, all, 1), 1)
})

test('firstVisibleFrom: 부재 스텝은 건너뜀', () => {
  const isPresent = (s) => s.id !== 'b'
  assert.equal(firstVisibleFrom(S, isPresent, 1), 2) // b 스킵 → c
})

test('firstVisibleFrom: 정방향 아무것도 없으면 length(=종료)', () => {
  assert.equal(firstVisibleFrom(S, none, 0), S.length)
})

test('firstVisibleFrom: 역방향은 이전 존재 스텝, 없으면 -1', () => {
  assert.equal(firstVisibleFrom(S, all, 1, -1), 1)
  assert.equal(firstVisibleFrom(S, none, 2, -1), -1)
})

test('shouldAutoStart: 첫 방문에도 자동으로 시작하지 않음', () => {
  assert.equal(shouldAutoStart({ done: false, isMobile: false, isFirstVisit: true }), false)
  assert.equal(shouldAutoStart({ done: true, isMobile: false, isFirstVisit: true }), false)
  assert.equal(shouldAutoStart({ done: false, isMobile: true, isFirstVisit: true }), false)
  // 기존 사용자(재방문)는 자동발동 안 함 — 업데이트 내역 유지, 투어는 도움말로.
  assert.equal(shouldAutoStart({ done: false, isMobile: false, isFirstVisit: false }), false)
})

test('TOUR_STEPS: 진행은 전부 수동 — advance 필드 없음(자동진행 없이 [다음])', () => {
  for (const s of TOUR_STEPS) assert.equal('advance' in s, false, `${s.id} should have no advance`)
  // airport 스텝은 지도 마커(클릭형), advisory는 optional(부재 시 skip)
  assert.equal(TOUR_STEPS.find((s) => s.id === 'airport').mapAirport, 'RKSI')
  assert.equal(TOUR_STEPS.find((s) => s.id === 'advisory').optional, true)
})
