import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyHistory, push, canUndo, canRedo, undo, redo } from './history.js'

const seq = (...items) => items.reduce((h, x) => push(h, x), emptyHistory())

test('아무것도 안 했으면 되돌릴 것이 없다', () => {
  assert.equal(canUndo(emptyHistory()), false)
  assert.equal(canRedo(emptyHistory()), false)
})

// 처음 쌓은 하나는 "지금"이지 되돌릴 대상이 아니다. 이걸 놓치면 첫 도형을
// 되돌렸을 때 빈 화면이 아니라 undefined가 들어가 화면이 죽는다.
test('한 번만 쌓았으면 아직 되돌릴 것이 없다', () => {
  assert.equal(canUndo(seq('a')), false)
})

test('둘 이상 쌓으면 되돌릴 수 있다', () => {
  assert.equal(canUndo(seq('a', 'b')), true)
})

test('되돌리면 직전 상태가 나온다', () => {
  const { snapshot } = undo(seq('a', 'b', 'c'))
  assert.equal(snapshot, 'b')
})

test('되돌린 뒤에는 다시할 수 있다', () => {
  const { history } = undo(seq('a', 'b'))
  assert.equal(canRedo(history), true)
  assert.equal(redo(history).snapshot, 'b')
})

test('되돌린 뒤 새로 그리면 다시하기가 사라진다', () => {
  const { history } = undo(seq('a', 'b'))
  assert.equal(canRedo(push(history, 'c')), false)
})

test('끝까지 되돌려도 무너지지 않는다', () => {
  let h = seq('a', 'b', 'c')
  for (let i = 0; i < 5; i += 1) h = undo(h).history
  assert.equal(canUndo(h), false)
  assert.equal(undo(h).snapshot, null)
})

test('되돌릴 것이 없으면 이력이 그대로다', () => {
  const h = seq('a')
  assert.equal(undo(h).history, h)
})

// 이름을 타이핑하면 글자마다 상태가 바뀐다. 그때마다 칸을 늘리면 되돌리기
// 50칸이 글자 50개로 차서 정작 도형을 되돌릴 수 없게 된다.
test('뭉치기는 맨 위를 갈아치운다', () => {
  let h = seq('a', 'b')
  h = push(h, 'b1', { coalesce: true })
  h = push(h, 'b12', { coalesce: true })
  assert.deepEqual(h.past, ['a', 'b12'])
  assert.equal(undo(h).snapshot, 'a')
})

test('첫 칸은 뭉치기로도 지워지지 않는다', () => {
  const h = push(emptyHistory(), 'a', { coalesce: true })
  assert.deepEqual(h.past, ['a'])
})

test('뭉치기도 다시하기 줄은 버린다', () => {
  const { history } = undo(seq('a', 'b'))
  assert.equal(canRedo(push(history, 'x', { coalesce: true })), false)
})

test('50걸음까지만 기억한다', () => {
  let h = emptyHistory()
  for (let i = 0; i < 80; i += 1) h = push(h, i)
  assert.equal(h.past.length, 50)
  assert.equal(h.past[h.past.length - 1], 79)
})
