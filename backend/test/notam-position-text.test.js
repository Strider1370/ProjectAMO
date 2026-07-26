import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePositionText, extractEBody, dmsToDecimal } from '../src/notam/notam-position-text.js'

test('extractEBody: E)부터 F)/G) 직전까지', () => {
  const raw = 'Q)RKRR/QWMLW/IV/BO/W/000/002/3736N12647E001\nA)RKSS B)2607251000 C)2608291200\nE)FIREWORKS WILL TAKE PLACE\nF)SFC G)200FT AMSL'
  assert.equal(extractEBody(raw).trim(), 'FIREWORKS WILL TAKE PLACE')
})

test('dmsToDecimal: 도분초 고정폭', () => {
  const p = dmsToDecimal('373547N1264720E')
  assert.ok(Math.abs(p.lat - 37.59639) < 1e-4)
  assert.ok(Math.abs(p.lon - 126.78889) < 1e-4)
})

test('dmsToDecimal: 소수 초', () => {
  const p = dmsToDecimal('364254.07N1273014.94E')
  assert.ok(Math.abs(p.lat - 36.71502) < 1e-4)
  assert.ok(Math.abs(p.lon - 127.50415) < 1e-4)
})

test('원: CIRCLE RADIUS ... CENTERED ON', () => {
  const r = parsePositionText('E)A CIRCLE RADIUS 100M CENTERED ON 373547N1264720E')
  assert.equal(r.kind, 'circle')
  assert.equal(r.coords.length, 1)
  assert.equal(r.radiusM, 100)
})

test('원: NM 단위와 소수 반경', () => {
  const r = parsePositionText('E)A CIRCLE RADIUS 1.07NM CENTERED ON 370905N1271906E')
  assert.equal(r.kind, 'circle')
  assert.ok(Math.abs(r.radiusM - 1981.6) < 1)
})

test('원: CIRCLE 단어 없이 PSN + RADIUS', () => {
  const r = parsePositionText('E)TEMPO OBST ERECTED\n1. PSN : 333013N1262923E\n2. RADIUS : 30M')
  assert.equal(r.kind, 'circle')
  assert.equal(r.radiusM, 30)
})

test('다각형: AREA BOUNDED BY', () => {
  const r = parsePositionText('E)AREA BOUNDED BY THE FOLLOWING 372333N1291339E-372500N1291500E-372600N1291200E')
  assert.equal(r.kind, 'polygon')
  assert.equal(r.coords.length, 3)
})

test('회랑: n NM EITHER SIDE OF LINE', () => {
  const r = parsePositionText('E)TEMPO RESTRICTED AREA ACT AS FLW: 1NM EITHER SIDE OF LINE 380836N1283554E-381033N1283630E')
  assert.equal(r.kind, 'corridor')
  assert.equal(r.bufferNm, 1)
  assert.equal(r.coords.length, 2)
})

test('줄바꿈으로 잘린 좌표를 되살린다', () => {
  const r = parsePositionText('E)AREA BOUNDED BY THE FOLLOWING 36242\n4N1262847E-370050N1261446E-365407N1261433E')
  assert.equal(r.kind, 'polygon')
  assert.equal(r.coords.length, 3)
  assert.ok(Math.abs(r.coords[0].lat - 36.40667) < 1e-4)
})

test('문형에 안 걸리면 좌표가 있어도 위치로 쓰지 않는다', () => {
  // Z0479/26: 좌표는 대체 웨이포인트지 이 NOTAM의 위치가 아니다
  const r = parsePositionText('E)SOT VORTAC U/S. USE 370500N1270100E INSTEAD OF SOT')
  assert.equal(r.kind, null)
})

test('꼭짓점이 중복된 다각형은 원본 결함으로 본다', () => {
  // E3296/26 실제 본문 그대로. 사각형이어야 하는데 3번째 꼭짓점이 연달아 두 번 나온다.
  // 지어낸 문자열을 쓰지 말 것 — 실제 데이터는 중복 제거 후에도 점이 3개다.
  const r = parsePositionText('E)TEMPO RESTRICTED AREA ACT AS FLW AREA BOUNDED BY THE FOLLOWING 355540N1292941E-355539N1293055E-355434N1292856E-355434N1292856E-355540N1292941E')
  assert.equal(r.kind, null)
  assert.equal(r.defective, true)
})

test('정당한 삼각형 구역은 그대로 쓴다', () => {
  // 개수가 아니라 중복이 신호다. 중복 없는 3점은 정상 다각형.
  const r = parsePositionText('E)AREA BOUNDED BY THE FOLLOWING 372333N1291339E-372500N1291500E-372600N1291200E')
  assert.equal(r.kind, 'polygon')
  assert.equal(r.defective, false)
})

test('중심이 여러 개면 전부 담는다', () => {
  // A0798/26: 크레인 2기. 첫 번째만 쓰면 나머지를 통째로 놓친다.
  const r = parsePositionText('E)TEMP OBST(CRANES) ERECTED AS FLW : 1.PSN:345817.12N1262254.71E RADIUS:40M HGT:22.60M 2.PSN:345817.31N1262254.76E RADIUS:40M HGT:23.35M')
  assert.equal(r.kind, 'circle')
  assert.equal(r.coords.length, 2)
  assert.equal(r.radiusM, 40)
})

test('호·반원·제외구역은 근사 표시', () => {
  const r = parsePositionText('E)A SEMICIRCLE, 360118N1281017E - A CLOCKWISE 3NM ARC CENTERED ON 360243N1281333E EXC A CIRCLE RADIUS 1.5NM CENTERED ON 360243N1281333E')
  assert.equal(r.approximated, true)
})
