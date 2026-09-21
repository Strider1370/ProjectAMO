import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceNm, pathLengthNm, areaKm2, trueBearing, magneticBearing, declinationAt } from './geo.js'
import { formatCoordinate, parseCoordinate } from '../custom-area/coordFormat.js'

const SEOUL = [126.978, 37.5665]
const BUSAN = [129.075, 35.1796]

test('distanceNm: 서울-부산 ≈ 173nm (±3)', () => {
  const d = distanceNm(SEOUL, BUSAN)
  assert.ok(Math.abs(d - 173) < 3, `got ${d}`)
})

test('pathLengthNm: 2점 미만이면 0, 왕복은 편도의 2배', () => {
  assert.equal(pathLengthNm([SEOUL]), 0)
  const one = distanceNm(SEOUL, BUSAN)
  const round = pathLengthNm([SEOUL, BUSAN, SEOUL])
  assert.ok(Math.abs(round - one * 2) < 0.01)
})

test('areaKm2: 1° 정사각형(적도 근처가 아닌 중위도)은 양수, 3점 미만은 0', () => {
  assert.equal(areaKm2([SEOUL, BUSAN]), 0)
  const sq = areaKm2([[126, 37], [127, 37], [127, 38], [126, 38]])
  assert.ok(sq > 8000 && sq < 12000, `got ${sq}`)
})

test('trueBearing: 정동쪽은 약 90°', () => {
  const b = trueBearing([126, 37], [127, 37])
  assert.ok(Math.abs(b - 90) < 2, `got ${b}`)
})

test('magneticBearing: 한국은 서편차(약 -9°) → 자북 = 진북 + 9° 근처', () => {
  const tn = trueBearing(SEOUL, BUSAN)
  const mn = magneticBearing(SEOUL, BUSAN)
  const decl = declinationAt(SEOUL)
  assert.ok(decl < 0, `서편차 음수여야 함, got ${decl}`)
  // mn - tn ≈ -decl (약 +9)
  const diff = ((mn - tn) % 360 + 540) % 360 - 180
  assert.ok(Math.abs(diff - (-decl)) < 0.01, `mn-tn=${diff}, -decl=${-decl}`)
})

test('formatCoordinate: 형식별 반구·자리수', () => {
  assert.equal(formatCoordinate(37.5665, 'dd', 'lat'), 'N37.56650°')
  assert.equal(formatCoordinate(-37.5, 'dd', 'lat'), 'S37.50000°')
  assert.equal(formatCoordinate(126.978, 'dd', 'lng'), 'E126.97800°')
  assert.equal(formatCoordinate(-126.978, 'dd', 'lng'), 'W126.97800°')
  assert.equal(formatCoordinate(37.5, 'ddm', 'lat'), "N37°30.000'")
  assert.equal(formatCoordinate(37.5, 'dms', 'lat'), 'N37°30\'00.0"')
})

test('parseCoordinate: DD는 숫자 전체를 요구하고 DMS·DDM 방향과 범위를 확인한다', () => {
  assert.equal(parseCoordinate('37.5665', 'dd', 'lat'), 37.5665)
  assert.throws(() => parseCoordinate('37north', 'dd', 'lat'), /숫자/)
  assert.equal(parseCoordinate("N37°34'00\"", 'dms', 'lat'), 37 + 34 / 60)
  assert.equal(parseCoordinate("E126°58.680'", 'ddm', 'lng'), 126 + 58.68 / 60)
  assert.throws(() => parseCoordinate("W126°58.680'", 'ddm', 'lat'), /N\/S/)
})
