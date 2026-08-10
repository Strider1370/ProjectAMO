import { test } from 'node:test'
import assert from 'node:assert/strict'

import { axisTicks, barSlots, heatLevel, labelStride, xPositions, yScale } from './chartAxis.js'

test('axisTicks는 0부터 max까지 고르게 나눈다', () => {
  assert.deepEqual(axisTicks(100, 5), [0, 25, 50, 75, 100])
  assert.deepEqual(axisTicks(50, 6), [0, 10, 20, 30, 40, 50])
})

test('axisTicks는 눈금을 최소 두 개 만든다 — 눈금 하나뿐인 축은 축이 아니다', () => {
  assert.equal(axisTicks(10, 1).length, 2)
  assert.equal(axisTicks(10, 0).length, 2)
})

test('yScale은 max를 위로, 0을 바닥으로 놓는다', () => {
  const y = yScale(190, 100)
  assert.ok(y(100) < y(50), '큰 값이 위에 있어야 한다')
  assert.ok(y(50) < y(0))
  assert.equal(Math.round(y(0)), Math.round(y(0)), '바닥값은 안정적이다')
})

test('yScale은 max가 0이어도 나눗셈이 무너지지 않는다', () => {
  const y = yScale(190, 0)
  assert.ok(Number.isFinite(y(0)), 'NaN이 나오면 SVG가 통째로 사라진다')
  assert.ok(Number.isFinite(y(10)))
})

test('xPositions는 점을 가로로 고르게 펴고, 점이 하나면 0으로 나누지 않는다', () => {
  const xs = xPositions(5)
  assert.equal(xs.length, 5)
  assert.ok(xs[0] < xs[4])
  const gaps = xs.slice(1).map((x, i) => x - xs[i])
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.001, '간격이 일정해야 한다')
  assert.equal(xPositions(1).length, 1)
  assert.deepEqual(xPositions(0), [])
})

test('barSlots는 계열이 늘어도 막대가 겹치지 않는다', () => {
  const { slot, barWidth, xOf } = barSlots(15, 3)
  assert.ok(barWidth * 3 < slot, '한 칸 안에 세 막대가 들어가야 한다')
  assert.ok(xOf(0, 1) > xOf(0, 0), '같은 칸에서 계열이 옆으로 밀린다')
  assert.ok(xOf(1, 0) > xOf(0, 2), '다음 칸은 앞 칸 뒤에 온다')
})

test('labelStride는 라벨이 많아지면 건너뛴다', () => {
  assert.equal(labelStride(6), 1, '적으면 전부 찍는다')
  assert.equal(labelStride(15), 2)
  assert.equal(labelStride(30), 4)
})

test('heatLevel은 0을 항상 가장 옅은 칸으로 두고 나머지를 최댓값 기준으로 나눈다', () => {
  assert.equal(heatLevel(0, 10, 6), 0)
  assert.equal(heatLevel(10, 10, 6), 5, '최댓값은 가장 진한 칸')
  assert.ok(heatLevel(5, 10, 6) > 0 && heatLevel(5, 10, 6) < 5)
  assert.equal(heatLevel(3, 0, 6), 0, '최댓값이 0이면 색을 칠하지 않는다')
})
