import assert from 'node:assert/strict'
import test from 'node:test'
import { departureAirportFromPathname, selectTerminalDepartureAirport, TERMINAL_DEPARTURE_ICAOS } from './terminalAirportSelection.js'

const airports = [
  { icao: 'RKSI', nameKo: '인천국제공항' },
  { icao: 'RKSS', nameKo: '김포국제공항' },
  { icao: 'RKPC', nameKo: '제주국제공항' },
  { icao: 'RKPU', nameKo: '울산공항' },
  { icao: 'RKNY', nameKo: '양양국제공항' },
  { icao: 'RKJY', nameKo: '여수공항' },
  { icao: 'RKJB', nameKo: '무안국제공항' },
  { icao: 'RKPK', nameKo: '김해국제공항' },
]

test('터미널 출발 공항은 승인된 7개 공항만 순서대로 제공한다', () => {
  assert.deepEqual(TERMINAL_DEPARTURE_ICAOS, ['RKSS', 'RKPC', 'RKPU', 'RKNY', 'RKJY', 'RKJB', 'RKPK'])
  assert.deepEqual(selectTerminalDepartureAirport(airports, 'RKSI').options.map((airport) => airport.icao), TERMINAL_DEPARTURE_ICAOS)
})

test('허용된 URL 선택값은 유지하고 그 외 값은 첫 허용 공항으로 되돌린다', () => {
  assert.equal(selectTerminalDepartureAirport(airports, 'RKPU').selected.icao, 'RKPU')
  assert.equal(selectTerminalDepartureAirport(airports, 'RKSI').selected.icao, 'RKSS')
})

test('터미널 출발 공항 주소는 소문자 ICAO 경로를 읽는다', () => {
  assert.equal(departureAirportFromPathname('/terminal/rkpu'), 'RKPU')
  assert.equal(departureAirportFromPathname('/terminal/RKPU/'), 'RKPU')
  assert.equal(departureAirportFromPathname('/terminal'), null)
  assert.equal(departureAirportFromPathname('/monitoring/rkpu'), null)
})
