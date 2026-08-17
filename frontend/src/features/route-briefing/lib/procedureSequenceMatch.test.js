import test from 'node:test'
import assert from 'node:assert/strict'
import { buildImportedProcedureCoordinates, matchImportedProcedures } from './procedureSequenceMatch.js'

const term = (id) => ({ kind: 'fix', id })

const sid = {
  id: 'RKSS-SID-BULTI2Q',
  name: 'BULTI2Q',
  fixes: ['RWY32L', 'QD040', 'QD050', 'QD080', 'QD090', 'QD110', 'QD150', 'QD160', 'BULTI'].map((id, index) => ({ id, coordinates: { lon: 100 + index, lat: 10 } })),
}

const star = {
  id: 'RKPC-STAR-DOTOL2P',
  name: 'DOTOL2P',
  fixes: ['DOTOL', 'CHUJA', 'PC726', 'BIROM', 'MANBA', 'PC621', 'PC622', 'PC623', 'PC624', 'PC625', 'PC626', 'DAKPI', 'PC628', 'PIMIK', 'YUMIN'].map((id, index) => ({ id, coordinates: { lon: 200 + index, lat: 20 } })),
}

test('FPL의 공항 인접 전체 fix 시퀀스를 SID와 STAR로 대체한다', () => {
  const result = matchImportedProcedures({
    terms: [
      'QD040', 'QD050', 'QD080', 'QD090', 'QD110', 'QD150', 'QD160', 'BULTI',
      'MEKIL', 'GONAX', 'BEDES', 'ELPOS', 'MANGI', 'DALSU', 'NULDI',
      'DOTOL', 'CHUJA', 'PC726', 'BIROM', 'MANBA', 'PC621', 'PC622', 'PC623', 'PC624', 'PC625', 'PC626', 'DAKPI', 'PC628', 'PIMIK', 'YUMIN',
    ].map(term),
    sidOptions: [sid],
    starOptions: [star],
  })

  assert.equal(result.sid, sid)
  assert.equal(result.star, star)
  assert.deepEqual(result.terms.map((item) => item.id), ['MEKIL', 'GONAX', 'BEDES', 'ELPOS', 'MANGI', 'DALSU', 'NULDI', 'DOTOL'])
  assert.equal(result.starInsertionIndex, 7)
})

test('일부만 겹치는 절차는 자동 선택하지 않는다', () => {
  const result = matchImportedProcedures({
    terms: ['QD040', 'QD050', 'BULTI', 'MEKIL', 'DOTOL', 'CHUJA', 'PC726', 'YUMIN'].map(term),
    sidOptions: [sid],
    starOptions: [star],
  })

  assert.equal(result.sid, null)
  assert.equal(result.star, null)
  assert.deepEqual(result.terms.map((item) => item.id), ['QD040', 'QD050', 'BULTI', 'MEKIL', 'DOTOL', 'CHUJA', 'PC726', 'YUMIN'])
})

test('항법 데이터에 없는 FPL fix도 보존된 waypoint 이름으로 절차를 매칭한다', () => {
  const imported = (name, index) => ({ kind: 'user-waypoint', id: `imported-wp-${index}`, name })
  const result = matchImportedProcedures({
    terms: ['QD040', 'QD050', 'QD080', 'QD090', 'QD110', 'QD150', 'QD160', 'BULTI', 'MEKIL'].map(imported),
    sidOptions: [sid],
  })

  assert.equal(result.sid, sid)
  assert.deepEqual(result.terms.map((item) => item.name), ['MEKIL'])
})

test('STAR 뒤 접근 fix는 남기면서 STAR 전체 시퀀스를 대체한다', () => {
  const result = matchImportedProcedures({
    terms: ['MEKIL', ...star.fixes.map((fix) => fix.id), 'VTF:', 'FF07', 'RW07'].map(term),
    starOptions: [star],
  })

  assert.equal(result.star, star)
  assert.deepEqual(result.terms.map((item) => item.id), ['MEKIL', 'DOTOL', 'VTF:', 'FF07', 'RW07'])
  assert.equal(result.starInsertionIndex, 1)
})

test('일치한 절차 범위만 원본 FPL 좌표열에서 대체하고 뒤 접근 지점은 순서대로 남긴다', () => {
  const matched = matchImportedProcedures({
    terms: ['QD040', 'QD050', 'QD080', 'QD090', 'QD110', 'QD150', 'QD160', 'BULTI', 'MEKIL', 'NULDI', 'DOTOL', 'CHUJA', 'PC726', 'BIROM', 'MANBA', 'PC621', 'PC622', 'PC623', 'PC624', 'PC625', 'PC626', 'DAKPI', 'PC628', 'PIMIK', 'YUMIN', 'VTF:', 'FF07', 'RW07'].map(term),
    sidOptions: [sid], starOptions: [star],
  })
  const sourceCoordinates = Array.from({ length: 30 }, (_, index) => [index, 0])
  const coordinates = buildImportedProcedureCoordinates({
    sourceCoordinates,
    termCoordinateStart: 1,
    procedureSpans: matched.procedureSpans,
  })

  assert.deepEqual(matched.procedureSpans.map(({ type, start, count }) => [type, start, count]), [['SID', 0, 8], ['STAR', 10, 15]])
  assert.deepEqual(coordinates.slice(-3), [[27, 0], [28, 0], [29, 0]])
  assert.equal(coordinates.includes(sourceCoordinates[11]), false, '원본 DOTOL 다음의 직선 좌표는 남으면 안 된다')
})
