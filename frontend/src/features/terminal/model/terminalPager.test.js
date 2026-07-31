import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createTerminalPagerState,
  nextPageIndex,
  parseTerminalFixtureState,
  parseTerminalMotionMode,
  parseTerminalView,
  terminalPagerReducer,
} from './terminalPager.js'

test('view=rail만 3안으로 해석한다', () => {
  assert.equal(parseTerminalView('?view=rail'), 'rail')
  assert.equal(parseTerminalView('?view=unknown'), 'board')
  assert.equal(parseTerminalView(''), 'board')
})

test('검증용 상태 override는 명시적으로 허용된 개발 환경에서만 해석한다', () => {
  assert.equal(parseTerminalFixtureState('?fixtureState=loading', { allowOverride: true }), 'loading')
  assert.equal(parseTerminalFixtureState('?fixtureState=partial', { allowOverride: true }), 'partial')
  assert.equal(parseTerminalFixtureState('?fixtureState=error', { allowOverride: true }), 'error')
  assert.equal(parseTerminalFixtureState('?fixtureState=error', { allowOverride: false }), 'ready')
})

test('motion URL은 선택된 화면의 allowlist만 해석한다', () => {
  assert.equal(parseTerminalMotionMode('?motion=roll', 'board'), 'roll')
  assert.equal(parseTerminalMotionMode('?motion=cascade', 'board'), 'split')
  assert.equal(parseTerminalMotionMode('?motion=unknown', 'board'), 'split')
  assert.equal(parseTerminalMotionMode('?railMotion=cascade', 'rail'), 'cascade')
  assert.equal(parseTerminalMotionMode('?railMotion=split', 'rail'), 'cascade')
  assert.equal(parseTerminalMotionMode('?motion=roll&railMotion=fade', 'rail'), 'fade')
})

test('다음 페이지는 마지막에서 처음으로 순환하고 페이지 수를 검증한다', () => {
  assert.equal(nextPageIndex(0, 2), 1)
  assert.equal(nextPageIndex(1, 2), 0)
  assert.throws(() => nextPageIndex(0, 0), RangeError)
})

test('자동과 수동 진행은 같은 ADVANCE 전이를 사용한다', () => {
  const initial = createTerminalPagerState(2)
  const manual = terminalPagerReducer(initial, { type: 'ADVANCE', source: 'manual' })
  const automatic = terminalPagerReducer(initial, { type: 'ADVANCE', source: 'automatic' })
  assert.deepEqual(manual, automatic)
  assert.deepEqual(manual, { currentPage: 0, pendingPage: 1, transitioning: true, pageCount: 2 })
})

test('전환 중 반복 입력은 무시하고 완료 시 한 번만 확정한다', () => {
  const initial = createTerminalPagerState(2)
  const entering = terminalPagerReducer(initial, { type: 'ADVANCE', source: 'manual' })
  assert.equal(terminalPagerReducer(entering, { type: 'ADVANCE', source: 'manual' }), entering)
  assert.deepEqual(terminalPagerReducer(entering, { type: 'COMPLETE' }), {
    currentPage: 1, pendingPage: 0, transitioning: false, pageCount: 2,
  })
})

test('화면 전환 취소는 중간 페이지를 남기지 않는다', () => {
  const entering = terminalPagerReducer(createTerminalPagerState(2), { type: 'ADVANCE' })
  const cancelled = terminalPagerReducer(entering, { type: 'CANCEL' })
  assert.deepEqual(cancelled, createTerminalPagerState(2))
  assert.equal(terminalPagerReducer(cancelled, { type: 'COMPLETE' }), cancelled)
})

test('페이지 수 변경은 현재와 대기 페이지를 원자적으로 재설정한다', () => {
  const onSecondPage = terminalPagerReducer(
    terminalPagerReducer(createTerminalPagerState(2), { type: 'ADVANCE' }),
    { type: 'COMPLETE' },
  )
  assert.deepEqual(terminalPagerReducer(onSecondPage, { type: 'SET_PAGE_COUNT', pageCount: 1 }), createTerminalPagerState(1))
  assert.deepEqual(terminalPagerReducer(createTerminalPagerState(1), { type: 'SET_PAGE_COUNT', pageCount: 2 }), createTerminalPagerState(2))
})
