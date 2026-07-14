import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTargetRect } from './targetRect.js'

test('mapAirport: getAirportPoint 좌표를 반경 28 rect로 중앙정렬', () => {
  const r = resolveTargetRect({ mapAirport: 'RKSI' }, () => ({ x: 100, y: 200 }))
  assert.deepEqual(r, { left: 72, top: 172, width: 56, height: 56, right: 128, bottom: 228 })
})

test('mapAirport: getAirportPoint가 null이면(데이터/지도 미준비) null', () => {
  assert.equal(resolveTargetRect({ mapAirport: 'RKSI' }, () => null), null)
  assert.equal(resolveTargetRect({ mapAirport: 'RKSI' }, undefined), null)
})

test('DOM 셀렉터 스텝: node 환경(document 없음)에선 null', () => {
  // 브라우저에선 querySelector로 rect를 잡지만, 여기선 document가 없어 null 반환(크래시 안 함).
  assert.equal(resolveTargetRect({ target: '.map-shell' }), null)
})
