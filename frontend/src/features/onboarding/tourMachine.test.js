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

test('shouldAutoStart: 데스크톱 첫 방문자만 자동 시작(업데이트 내역 대신)', () => {
  assert.equal(shouldAutoStart({ done: false, isMobile: false, isFirstVisit: true }), true)
  assert.equal(shouldAutoStart({ done: true, isMobile: false, isFirstVisit: true }), false)
  assert.equal(shouldAutoStart({ done: false, isMobile: true, isFirstVisit: true }), false)
  // 기존 사용자(재방문)는 자동발동 안 함 — 업데이트 내역 유지, 투어는 도움말로.
  assert.equal(shouldAutoStart({ done: false, isMobile: false, isFirstVisit: false }), false)
})

test('TOUR_STEPS: 첫 화면은 소개·주의 카드, 진행은 전부 수동, 위험 요약은 없을 때 예시로', () => {
  for (const s of TOUR_STEPS) assert.equal('advance' in s, false, `${s.id} should have no advance`)
  const [welcome] = TOUR_STEPS
  assert.equal(welcome.center, true)
  assert.match(welcome.cautionEmphasis, /운항 판단에는 반드시 항공기상청 공식 자료/)
  assert.equal(TOUR_STEPS.find((s) => s.id === 'airport').mapAirport, 'RKSI')
  const advisory = TOUR_STEPS.find((s) => s.id === 'advisory')
  assert.equal(advisory.demo, 'advisory')
  assert.equal(advisory.optional, undefined, '없다고 건너뛰지 않는다')
  // 레이어 패널은 패널 전체(머리 포함)를 강조한다 — 안쪽 목록이 아니라.
  for (const id of ['met', 'aviation']) assert.match(TOUR_STEPS.find((s) => s.id === id).revealSelector, /^\.layer-drawer\[aria-label=/)
})
