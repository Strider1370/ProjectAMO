import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from './noaa-sigmet-parser.js'

const future = Math.floor(Date.now() / 1000) + 3 * 3600
const past = Math.floor(Date.now() / 1000) - 3600
const start = Math.floor(Date.now() / 1000) - 600

const entries = [
  { icaoId: 'RJAA', firId: 'RJJJ', firName: 'FUKUOKA FIR', validTimeFrom: start, validTimeTo: future,
    seriesId: 'A01', hazard: 'TURB', qualifier: 'SEV', base: 10000, top: 24000, geom: 'AREA', dir: 'NE', spd: '15',
    coords: [{ lon: 139, lat: 35 }, { lon: 141, lat: 35 }, { lon: 141, lat: 37 }, { lon: 139, lat: 37 }],
    rawSigmet: 'RJJJ SIGMET A01 ...' },
  { icaoId: 'FAOR', firId: 'FAJO', firName: 'JOHANNESBURG', validTimeFrom: start, validTimeTo: future,
    seriesId: 'C01', hazard: 'TURB', qualifier: 'SEV', base: 10000, top: 24000, geom: 'AREA',
    coords: [{ lon: 9, lat: -43 }, { lon: 13, lat: -44 }, { lon: 18, lat: -47 }] },
  { icaoId: 'RKSI', firId: 'RKRR', firName: 'INCHEON', validTimeFrom: start, validTimeTo: future,
    seriesId: 'B01', hazard: 'TS', qualifier: 'EMBD', base: 0, top: 40000, geom: 'AREA',
    coords: [{ lon: 126, lat: 37 }, { lon: 128, lat: 37 }, { lon: 128, lat: 38 }] },
  { icaoId: 'RCTP', firId: 'RCAA', firName: 'TAIPEI', validTimeFrom: past - 3600, validTimeTo: past,
    seriesId: 'D01', hazard: 'ICE', qualifier: 'MOD', base: 5000, top: 15000, geom: 'AREA',
    coords: [{ lon: 121, lat: 25 }, { lon: 122, lat: 25 }, { lon: 122, lat: 26 }] },
]

const firs = ['RJJJ', 'RCAA', 'VHHK'] // RKRR·FAJO 제외

describe('noaa-sigmet parse', () => {
  it('asia_firs만 남기고 나머지 FIR 제외(RKRR·FAJO 드롭)', () => {
    const items = parse(entries, firs)
    const firsOut = items.map((i) => i.fir)
    assert.ok(firsOut.includes('RJJJ'))
    assert.ok(!firsOut.includes('FAJO'))
    assert.ok(!firsOut.includes('RKRR')) // 국내는 KMA가 담당 → 중복 방지
  })

  it('유효기간 지난 항목 제외(RCAA D01)', () => {
    const items = parse(entries, firs)
    assert.ok(!items.some((i) => i.sequence_number === 'D01'))
  })

  it('base/top(ft) → FL 변환, phenomenon 매핑', () => {
    const items = parse(entries, firs)
    const it0 = items.find((i) => i.fir === 'RJJJ')
    assert.equal(it0.altitude.lower_fl, 100) // 10000ft → FL100
    assert.equal(it0.altitude.upper_fl, 240)
    assert.equal(it0.phenomenon_code, 'SEV_TURB')
    assert.equal(it0.motion.direction_deg, 45)
    assert.equal(it0.motion.direction_text, 'NE')
    assert.equal(it0.motion.speed_kt, 15)
  })

  it('geometry: 닫힌 Polygon + bbox', () => {
    const items = parse(entries, firs)
    const it0 = items.find((i) => i.fir === 'RJJJ')
    assert.equal(it0.geometry.type, 'Polygon')
    const ring = it0.geometry.coordinates[0]
    assert.deepEqual(ring[0], ring[ring.length - 1]) // 닫힘
    assert.deepEqual(it0.bbox, { min_lon: 139, min_lat: 35, max_lon: 141, max_lat: 37 })
  })

  // 닫힌 링(첫==끝)의 자기교차 여부
  function ringSelfIntersects(ring) {
    const pts = ring.slice(0, -1)
    const n = pts.length
    const seg = (a1, a2, b1, b2) => {
      const c = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
      const d1 = c(b1, b2, a1), d2 = c(b1, b2, a2), d3 = c(a1, a2, b1), d4 = c(a1, a2, b2)
      return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    }
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1) continue
      if (i === 0 && j === n - 1) continue
      if (seg(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true
    }
    return false
  }
  const areaEntry = (coords) => ([{ icaoId: 'X', firId: 'RJJJ', firName: 'F', validTimeFrom: start, validTimeTo: future, seriesId: 'Z', hazard: 'TURB', qualifier: 'SEV', base: 0, top: 100, geom: 'AREA', coords }])

  it('정상 오목(L자) 폴리곤은 원래 좌표순서 보존', () => {
    const coords = [{ lon: 0, lat: 0 }, { lon: 4, lat: 0 }, { lon: 4, lat: 4 }, { lon: 2, lat: 4 }, { lon: 2, lat: 2 }, { lon: 0, lat: 2 }]
    const ring = parse(areaEntry(coords), ['RJJJ'])[0].geometry.coordinates[0]
    assert.equal(ringSelfIntersects(ring), false)
    assert.deepEqual(ring.slice(0, -1), coords.map((c) => [c.lon, c.lat])) // 순서 그대로
  })

  it('자기교차(bowtie) 폴리곤은 단순 폴리곤으로 복구', () => {
    const coords = [{ lon: 0, lat: 0 }, { lon: 2, lat: 2 }, { lon: 2, lat: 0 }, { lon: 0, lat: 2 }]
    const ring = parse(areaEntry(coords), ['RJJJ'])[0].geometry.coordinates[0]
    assert.equal(ringSelfIntersects(ring), false)
  })

  it('id 결정적(fir+seq+validFrom)', () => {
    const a = parse(entries, firs)
    const b = parse(entries, firs)
    assert.equal(a.find((i) => i.fir === 'RJJJ').id, b.find((i) => i.fir === 'RJJJ').id)
  })
})
