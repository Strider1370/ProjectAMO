import test from 'node:test'
import assert from 'node:assert/strict'
import { TYPHOON_PALETTE, assignTyphoonColors } from './typhoonColors.js'

test('같은 태풍번호는 항상 같은 색이다', () => {
  assert.equal(assignTyphoonColors([11])[11], assignTyphoonColors([11])[11])
})

test('다른 태풍이 사라져도 남은 태풍 색이 바뀌지 않는다', () => {
  const both = assignTyphoonColors([19, 20])
  const only = assignTyphoonColors([20])
  assert.equal(both[20], only[20])
})

test('동시 활성 태풍은 서로 다른 색을 받는다', () => {
  const numbers = [1, 7, 13, 19]
  const colors = assignTyphoonColors(numbers)
  assert.equal(new Set(Object.values(colors)).size, numbers.length)
})

test('팔레트 길이만큼 차이 나 충돌해도 색이 겹치지 않는다', () => {
  const n = TYPHOON_PALETTE.length
  const colors = assignTyphoonColors([1, 1 + n])
  assert.notEqual(colors[1], colors[1 + n])
})

test('활성 태풍이 팔레트보다 많으면 색을 재사용한다', () => {
  const numbers = Array.from({ length: TYPHOON_PALETTE.length + 2 }, (_, i) => i + 1)
  const colors = assignTyphoonColors(numbers)
  assert.equal(Object.keys(colors).length, numbers.length)
  for (const color of Object.values(colors)) assert.ok(TYPHOON_PALETTE.includes(color))
})

test('빈 목록은 빈 객체다', () => {
  assert.deepEqual(assignTyphoonColors([]), {})
})

test('태풍 팔레트는 청록이나 파랑을 쓰지 않는다', () => {
  assert.deepEqual(TYPHOON_PALETTE, ['#c0291f', '#92400e', '#7c2d12', '#7c3aed', '#a21caf', '#4d7c0f'])
})
