import test from 'node:test'
import assert from 'node:assert/strict'
import { advisoryBandState, advisoryIdAt } from './profileAdvisoryFocus.js'

const bands = [
  { advisoryId: 'RKSI-A03', x: 100, y: 50, w: 300, h: 200 }, // 큰 착빙 상자
  { advisoryId: 'RKSI-C01', x: 150, y: 80, w: 60, h: 60 }, // 그 안의 작은 난류 상자
  { advisoryId: 'RKSI-C01', x: 500, y: 80, w: 40, h: 60 }, // 같은 발표가 경로를 다시 지난 곳
]

test('겹친 상자에서는 가장 작은 상자의 발표를 고르고, 밖이면 null', () => {
  assert.equal(advisoryIdAt(bands, 170, 100), 'RKSI-C01')
  assert.equal(advisoryIdAt(bands, 300, 200), 'RKSI-A03')
  assert.equal(advisoryIdAt(bands, 520, 100), 'RKSI-C01')
  assert.equal(advisoryIdAt(bands, 20, 20), null)
})

test('가리킨 발표의 상자는 모두 강조, 다른 발표는 흐림, 가리킨 것이 없으면 그대로', () => {
  assert.deepEqual(bands.map((band) => advisoryBandState(band, 'RKSI-C01')), ['dim', 'focus', 'focus'])
  assert.deepEqual(bands.map((band) => advisoryBandState(band, null)), [null, null, null])
})
