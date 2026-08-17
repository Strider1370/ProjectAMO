import test from 'node:test'
import assert from 'node:assert/strict'
import { saveDraw, loadDraw, clearDraw } from './drawStore.js'

// node --test에는 localStorage가 없다. 가짜를 심어 저장 경로를 시험한다.
function fakeStorage(failOnSet = false) {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (failOnSet) throw new Error('QuotaExceeded'); map.set(k, v) },
    removeItem: (k) => map.delete(k),
  }
}

test('저장한 것이 그대로 읽힌다', () => {
  globalThis.localStorage = fakeStorage()
  const state = { features: [{ id: 'a', name: '공역' }], folders: ['VFR'] }
  assert.equal(saveDraw(state), true)
  assert.deepEqual(loadDraw(), state)
})

test('저장한 적 없으면 null', () => {
  globalThis.localStorage = fakeStorage()
  assert.equal(loadDraw(), null)
})

test('지우면 사라진다', () => {
  globalThis.localStorage = fakeStorage()
  saveDraw({ features: [{ id: 'a' }], folders: [] })
  clearDraw()
  assert.equal(loadDraw(), null)
})

// 보관 실패가 그리기 실패가 되면 안 된다. 자리가 없어도 지금 그린 것은 보여야 한다.
test('저장 공간이 꽉 차도 예외를 던지지 않는다', () => {
  globalThis.localStorage = fakeStorage(true)
  assert.equal(saveDraw({ features: [], folders: [] }), false)
})

test('보관소가 아예 없어도 무너지지 않는다', () => {
  globalThis.localStorage = undefined
  assert.equal(saveDraw({ features: [], folders: [] }), false)
  assert.equal(loadDraw(), null)
  clearDraw()   // 예외가 나지 않아야 한다
})

test('깨진 값이 들어 있으면 null로 떨어진다', () => {
  const s = fakeStorage()
  globalThis.localStorage = s
  s.setItem('projectamo.draw-spike.v1', '{망가진 json')
  assert.equal(loadDraw(), null)
})

// 모양이 어긋난 값이 화면을 죽이지 않아야 한다.
test('features가 배열이 아니면 null로 떨어진다', () => {
  const s = fakeStorage()
  globalThis.localStorage = s
  s.setItem('projectamo.draw-spike.v1', JSON.stringify({ features: '아님' }))
  assert.equal(loadDraw(), null)
})

test('folders가 빠져 있으면 빈 배열로 채운다', () => {
  const s = fakeStorage()
  globalThis.localStorage = s
  s.setItem('projectamo.draw-spike.v1', JSON.stringify({ features: [] }))
  assert.deepEqual(loadDraw(), { features: [], folders: [] })
})
