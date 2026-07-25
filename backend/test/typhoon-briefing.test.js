import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRouteAxis } from '../src/briefing/route-axis.js'
import { matchTyphoonHazards, stepHoursOf } from '../src/briefing/typhoon-briefing.js'

// 제주(126.5E, 33.5N) → 부산(129.0E, 35.2N) 근처를 지나는 단순 항로.
const ROUTE = { type: 'LineString', coordinates: [[126.5, 33.5], [129.0, 35.2]] }
const axis = buildRouteAxis(ROUTE, 2000)

function typhoonAt({ lat, lon, validAt, radiusKm = 400, errorKm = 100 }) {
  const row = {
    forecast: true, year: 2022, number: 11, seq: 32, leadHours: 0,
    analyzedAt: '2022-09-05T00:00:00.000Z', validAt,
    lat, lon, dir: 'N', speedKmh: 24, pressureHpa: 930, maxWindMs: 50,
    errorRadiusKm: errorKm,
    gale: { radiusKm, exceptionDir: null, exceptionRadiusKm: null },
    storm: { radiusKm: 150, exceptionDir: null, exceptionRadiusKm: null },
    location: '서귀포 남남서쪽 약 410 km 부근 해상',
  }
  return { number: 11, year: 2022, seq: 32, name: '힌남노', analyzedAt: row.analyzedAt, current: row, rows: [row] }
}

test('예보 간격을 데이터에서 계산한다', () => {
  const rows6 = [0, 6, 12, 18].map((leadHours) => ({ forecast: true, leadHours }))
  const rows12 = [0, 12, 24, 36].map((leadHours) => ({ forecast: true, leadHours }))
  assert.equal(stepHoursOf(rows6), 6)
  assert.equal(stepHoursOf(rows12), 12)
  // 예보가 하나뿐이면 간격을 알 수 없다 — 6시간으로 둔다.
  assert.equal(stepHoursOf([{ forecast: true, leadHours: 0 }]), 6)
  assert.equal(stepHoursOf([]), 6)
})

test('12시간 간격 태풍은 유효구간도 12시간 폭이다', () => {
  const base = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T00:00:00.000Z' })
  base.rows = [0, 12, 24].map((leadHours) => ({
    ...base.rows[0], leadHours,
    validAt: new Date(Date.parse('2022-09-05T00:00:00.000Z') + leadHours * 3600e3).toISOString(),
  }))
  // 6시간으로 고정했다면 00:00 시점의 창은 21:00~03:00이라 04:00 출발이 안 걸린다.
  const hazards = matchTyphoonHazards({
    typhoons: [base], axis, etd: '2022-09-05T04:00:00.000Z', eta: '2022-09-05T05:00:00.000Z', airports: [],
  })
  assert.equal(hazards.length, 1)
  assert.equal(hazards[0].validFrom, '2022-09-04T18:00:00.000Z')
})

test('이름이 있으면 라벨에 붙고 없으면 번호만 쓴다', () => {
  const named = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  const call = (typhoon) => matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })[0]
  assert.equal(call(named).label, '11호 태풍 힌남노')
  assert.equal(call({ ...named, name: null }).label, '11호 태풍')
})

test('항로 위에 있으면 걸린다', () => {
  const typhoon = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  const hazards = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.equal(hazards.length, 1)
  assert.equal(hazards[0].source, 'TYPHOON')
  assert.equal(hazards[0].typhoonNumber, 11)
  assert.equal(hazards[0].onRoute, true)
  assert.ok(hazards[0].routeIntervalNm.endNm > hazards[0].routeIntervalNm.startNm)
})

test('고도는 판정하지 않는다', () => {
  const typhoon = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  const [hazard] = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.equal(hazard.verticalKnown, false)
  assert.equal(hazard.bandFt, null)
})

test('비행 시간과 겹치지 않으면 제외한다', () => {
  const typhoon = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-06T12:00:00.000Z' })
  const hazards = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.deepEqual(hazards, [])
})

test('멀리 있으면 걸리지 않는다', () => {
  const typhoon = typhoonAt({ lat: 20.0, lon: 140.0, validAt: '2022-09-05T03:00:00.000Z' })
  const hazards = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [],
  })
  assert.deepEqual(hazards, [])
})

test('한 태풍의 여러 예보 시점이 하나로 묶인다', () => {
  const base = typhoonAt({ lat: 34.3, lon: 127.7, validAt: '2022-09-05T03:00:00.000Z' })
  base.rows = [
    { ...base.rows[0], validAt: '2022-09-05T03:00:00.000Z', leadHours: 6 },
    { ...base.rows[0], validAt: '2022-09-05T09:00:00.000Z', leadHours: 12 },
  ]
  const hazards = matchTyphoonHazards({
    typhoons: [base], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T10:00:00.000Z', airports: [],
  })
  assert.equal(hazards.length, 1, '태풍당 한 항목이어야 한다')
  assert.equal(hazards[0].validFrom, '2022-09-05T00:00:00.000Z')
  assert.equal(hazards[0].validTo, '2022-09-05T12:00:00.000Z')
})

test('공항이 영향권에 들면 공항 코드가 담긴다', () => {
  const typhoon = typhoonAt({ lat: 33.5, lon: 126.5, validAt: '2022-09-05T03:00:00.000Z' })
  const [hazard] = matchTyphoonHazards({
    typhoons: [typhoon], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z',
    airports: [{ icao: 'RKPC', lat: 33.51, lon: 126.49, role: 'destination' }],
  })
  assert.deepEqual(hazard.airports, ['RKPC'])
})

test('활성 태풍이 없으면 빈 배열이다', () => {
  assert.deepEqual(matchTyphoonHazards({ typhoons: [], axis, etd: '2022-09-05T02:00:00.000Z', eta: '2022-09-05T03:30:00.000Z', airports: [] }), [])
})
