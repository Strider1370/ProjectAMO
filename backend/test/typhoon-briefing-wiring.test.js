import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { composeBriefing } from '../src/briefing/briefing-composer.js'

// 이 파일은 "판정이 맞는가"가 아니라 "태풍 자료가 브리핑까지 연결되어 있는가"를 지킨다.
// matchTyphoonHazards 단위 테스트는 태풍을 직접 넣어 부르므로 연결이 끊겨도 통과한다.
// 실제로 server.js가 data에 typhoon을 넣지 않아 브리핑에 태풍이 영구히 안 뜬 적이 있다.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readSource = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')

test('브리핑 요청 처리부가 태풍 스냅샷을 data에 넣는다', () => {
  const source = readSource('server.js')
  assert.match(source, /typhoon:\s*store\.getCached\('typhoon'\)/,
    "server.js의 브리핑 data 조립에 typhoon이 빠지면 브리핑에 태풍이 영구히 안 뜬다")
})

test('개발용 시나리오 진입점도 태풍 스냅샷을 넣는다', () => {
  const source = readSource('src/dev/scenario.js')
  assert.match(source, /typhoon:\s*getCached\('typhoon'\)/)
})

test('composeBriefing이 data.typhoon을 읽어 위험기상에 태풍을 낸다', () => {
  const center = { lat: 22.5, lon: 115.1 }
  const validAt = '2026-07-25T18:00:00.000Z'
  const row = {
    forecast: false, year: 2026, number: 12, seq: 9, leadHours: 0,
    analyzedAt: validAt, validAt, lat: center.lat, lon: center.lon,
    dir: 'NW', speedKmh: 18, pressureHpa: 960, maxWindMs: 39, errorRadiusKm: 0,
    gale: { radiusKm: 280, exceptionDir: null, exceptionRadiusKm: null },
    storm: { radiusKm: 60, exceptionDir: null, exceptionRadiusKm: null },
    location: '중국 홍콩 동북동쪽 약 120 km 부근 해상',
  }
  const request = {
    departureAirport: 'RKSI', arrivalAirport: 'RKPC',
    routeGeometry: { type: 'LineString', coordinates: [[center.lon - 2, center.lat - 2], [center.lon + 2, center.lat + 2]] },
    etd: validAt,
    eta: new Date(Date.parse(validAt) + 2 * 3600e3).toISOString(),
    plannedCruiseAltitudeFt: 35000,
  }
  const data = {
    typhoon: { status: 'ok', typhoons: [{ number: 12, year: 2026, seq: 9, name: '노을', analyzedAt: validAt, current: row, rows: [row] }] },
    now: Date.parse(validAt),
  }

  const briefing = composeBriefing(request, data)
  const typhoons = (briefing?.sections?.adverse?.hazards ?? []).filter((h) => h.source === 'TYPHOON')
  assert.equal(typhoons.length, 1, '경로가 태풍 영향권을 지나면 위험기상에 나와야 한다')
  assert.equal(typhoons[0].label, '12호 태풍 노을')
  // level이 없으면 정렬이 NaN이 되고 섹션 레벨이 green으로 남는다.
  assert.ok(typhoons[0].level, 'level이 붙어 있어야 한다')
  assert.notEqual(briefing.sections.adverse.level, 'green', '태풍이 걸렸는데 섹션이 green이면 안 된다')
  // 고도는 판정하지 않는다.
  assert.equal(typhoons[0].verticalKnown, false)
  assert.equal(typhoons[0].bandFt, null)
})

test('태풍 자료가 없어도 브리핑이 깨지지 않는다', () => {
  const request = {
    departureAirport: 'RKSI', arrivalAirport: 'RKPC',
    routeGeometry: { type: 'LineString', coordinates: [[126.5, 33.5], [129.0, 35.2]] },
    etd: '2026-07-25T18:00:00.000Z', eta: '2026-07-25T20:00:00.000Z',
    plannedCruiseAltitudeFt: 35000,
  }
  const briefing = composeBriefing(request, { now: Date.parse('2026-07-25T18:00:00.000Z') })
  const typhoons = (briefing?.sections?.adverse?.hazards ?? []).filter((h) => h.source === 'TYPHOON')
  assert.deepEqual(typhoons, [])
})

test('경로 비교(route-exposure)도 태풍 스냅샷을 받는다', () => {
  const source = readSource('server.js')
  // 두 진입점: 단건 조회와 배치 조회.
  const matches = source.match(/typhoon:\s*store\.getCached\('typhoon'\)/g) ?? []
  assert.ok(matches.length >= 3,
    `브리핑·경로노출·배치 세 곳에 typhoon이 들어가야 한다 (현재 ${matches.length}곳)`)
})

test('buildRouteExposure가 태풍을 노출 항목으로 낸다', async () => {
  const { buildRouteExposure } = await import('../src/briefing/route-exposure.js')
  const validAt = '2026-07-25T18:00:00.000Z'
  const center = { lat: 22.5, lon: 115.1 }
  const row = {
    forecast: false, seq: 9, leadHours: 0, analyzedAt: validAt, validAt,
    lat: center.lat, lon: center.lon, dir: 'NW', speedKmh: 18,
    pressureHpa: 960, maxWindMs: 39, errorRadiusKm: 0,
    gale: { radiusKm: 280, exceptionDir: null, exceptionRadiusKm: null },
    storm: null, location: '중국 홍콩 동북동쪽 약 120 km 부근 해상',
  }
  const out = buildRouteExposure({
    routeGeometry: { type: 'LineString', coordinates: [[center.lon - 2, center.lat - 2], [center.lon + 2, center.lat + 2]] },
    etd: validAt,
    eta: new Date(Date.parse(validAt) + 2 * 3600e3).toISOString(),
    typhoon: { typhoons: [{ number: 12, year: 2026, seq: 9, name: '노을', analyzedAt: validAt, current: row, rows: [row] }] },
  })
  const typhoons = out.hazards.filter((h) => h.source === 'TYPHOON')
  assert.equal(typhoons.length, 1, '경로 비교 화면의 위험기상 칩에도 태풍이 나와야 한다')
  assert.equal(typhoons[0].label, '12호 태풍 노을')
  // 고도는 판정하지 않는다.
  assert.equal(typhoons[0].bandFt, null)
})

test('해외공항도 좌표를 갖는다 — 없으면 태풍 판정이 "확인 불가"로만 나온다', async () => {
  const config = await import('../src/config.js')
  const byIcao = new Map([...config.airports, ...config.overseasAirports].map((a) => [a.icao, a]))
  // 국내와 해외가 같은 모양이어야 한다. 해외는 원본 파일에서 coordinates 안에 중첩돼 있다.
  for (const icao of ['RKSI', 'RKPC', 'VHHH', 'RJTT', 'ZGGG']) {
    const airport = byIcao.get(icao)
    assert.ok(airport, `${icao} 좌표를 찾을 수 있어야 한다`)
    assert.ok(Number.isFinite(airport.lat) && Number.isFinite(airport.lon), `${icao} 좌표가 숫자여야 한다`)
  }
  assert.ok(config.overseasAirports.length >= 40, '해외공항 목록이 비면 안 된다')
})

test('해외 도착지도 태풍 영향권으로 판정된다', async () => {
  const { matchTyphoonHazards } = await import('../src/briefing/typhoon-briefing.js')
  const { buildRouteAxis } = await import('../src/briefing/route-axis.js')
  const config = await import('../src/config.js')
  const vhhh = config.overseasAirports.find((a) => a.icao === 'VHHH')
  const validAt = '2026-07-25T18:00:00.000Z'
  // 홍콩 바로 위에 놓인 태풍.
  const row = {
    forecast: false, seq: 1, leadHours: 0, analyzedAt: validAt, validAt,
    lat: vhhh.lat, lon: vhhh.lon, dir: 'NW', speedKmh: 18,
    pressureHpa: 960, maxWindMs: 39, errorRadiusKm: 0,
    gale: { radiusKm: 280, exceptionDir: null, exceptionRadiusKm: null },
    storm: null, location: '중국 홍콩 부근',
  }
  const [hazard] = matchTyphoonHazards({
    typhoons: [{ number: 12, year: 2026, seq: 1, name: '노을', analyzedAt: validAt, current: row, rows: [row] }],
    axis: buildRouteAxis({ type: 'LineString', coordinates: [[vhhh.lon - 1, vhhh.lat - 1], [vhhh.lon + 1, vhhh.lat + 1]] }, 2000),
    etd: validAt,
    eta: new Date(Date.parse(validAt) + 2 * 3600e3).toISOString(),
    airports: [{ role: 'arrival', icao: 'VHHH', lat: vhhh.lat, lon: vhhh.lon }],
  })
  assert.deepEqual(hazard.airports, ['VHHH'])
  assert.deepEqual(hazard.airportsUnknown, [], '좌표가 있으므로 확인 불가가 아니어야 한다')
})
