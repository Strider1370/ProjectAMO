import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectChanges } from '../src/alerts/diff.js'

const airport = (over = {}) => ({ icao: 'RKPC', role: 'dest', minima: false, minimaBound: null, ts: false, fg: false, sn: false, ...over })
const snap = (airports = [airport()], sigmets = []) => ({ airports, sigmets })

test('없던 조건이 새로 생기면 발화한다', () => {
  const changes = detectChanges(snap(), snap([airport({ minima: true, minimaBound: 'personal' })]))
  assert.equal(changes.length, 1)
  assert.equal(changes[0].type, 'MINIMA')
  assert.equal(changes[0].target, 'RKPC')
  assert.equal(changes[0].role, 'dest')
  assert.equal(changes[0].bound, 'personal', '문구가 어느 미니마인지 말해야 한다')
})

test('이미 있던 조건은 다시 발화하지 않는다 — 정시 TAF마다 울리면 안 된다', () => {
  assert.deepEqual(detectChanges(snap([airport({ minima: true })]), snap([airport({ minima: true })])), [])
})

test('조건이 풀리면 아무 말도 하지 않는다 — 회복 알림은 만들지 않는다', () => {
  assert.deepEqual(detectChanges(snap([airport({ minima: true })]), snap()), [])
})

test('풀렸다가 다시 걸리면 그때 다시 발화한다', () => {
  assert.equal(detectChanges(snap(), snap([airport({ minima: true })])).length, 1)
})

test('네 조건을 각각 본다', () => {
  const changes = detectChanges(snap(), snap([airport({ ts: true, fg: true, sn: true })]))
  assert.deepEqual(changes.map((c) => c.type).sort(), ['FG', 'SN', 'TS'])
})

test('공항이 다르면 따로 발화한다', () => {
  const before = snap([airport({ icao: 'RKSI', role: 'dep' }), airport()])
  const after = snap([airport({ icao: 'RKSI', role: 'dep', fg: true }), airport({ fg: true })])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 2)
  assert.notEqual(changes[0].dedupKey, changes[1].dedupKey)
})

test('출발지와 교체공항이 같아도 각각 따로 본다', () => {
  // 같은 공항을 출발지이자 교체공항으로 쓰는 것은 흔하다. 공항 코드만으로 묶으면
  // 한쪽이 사라지고, 남은 쪽이 엉뚱한 기준과 비교된다.
  const before = snap([airport({ icao: 'RKSI', role: 'dep' }), airport({ icao: 'RKSI', role: 'altn' })])
  const after = snap([airport({ icao: 'RKSI', role: 'dep' }), airport({ icao: 'RKSI', role: 'altn', fg: true })])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].role, 'altn', '바뀐 것은 교체공항 쪽이다')
})

test('같은 공항의 두 역할은 중복 방지 키가 다르다', () => {
  const before = snap([airport({ icao: 'RKSI', role: 'dep' }), airport({ icao: 'RKSI', role: 'altn' })])
  const after = snap([airport({ icao: 'RKSI', role: 'dep', ts: true }), airport({ icao: 'RKSI', role: 'altn', ts: true })])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 2)
  assert.notEqual(changes[0].dedupKey, changes[1].dedupKey, '키가 겹치면 한쪽이 삼켜진다')
})

test('새 SIGMET만 발화한다', () => {
  const before = snap([airport()], [{ key: 'S:1', label: '기존' }])
  const after = snap([airport()], [{ key: 'S:1', label: '기존' }, { key: 'S:2', label: '새 것' }])
  const changes = detectChanges(before, after)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].type, 'SIGMET')
  assert.equal(changes[0].target, '새 것')
})

test('직전 상태가 없으면 아무것도 내지 않는다 — 첫 평가는 기준점이다', () => {
  assert.deepEqual(detectChanges(null, snap([airport({ minima: true })])), [])
})
