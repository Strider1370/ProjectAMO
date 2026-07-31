import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TERMINAL_WEATHER_LABELS,
  formatArrivalKorea,
  normalizeTerminalFlight,
  normalizeTerminalDataState,
  normalizeWeatherPoint,
} from './terminalDisplayModel.js'
import { TERMINAL_FLIGHT_GROUPS } from '../data/terminalFixtures.js'

test('승객용 날씨 문구는 승인된 어휘로 정규화한다', () => {
  assert.deepEqual(Object.values(TERMINAL_WEATHER_LABELS), [
    '맑음', '구름 조금', '구름 많음', '흐림', '비', '소나기', '눈', '뇌우',
  ])
})

test('한국 도착 시각은 날짜가 바뀔 때만 다음 날을 붙인다', () => {
  assert.equal(formatArrivalKorea({ time: '17:05', dayOffset: 0 }), '17:05')
  assert.equal(formatArrivalKorea({ time: '01:50', dayOffset: 1 }), '다음 날 01:50')
})

test('모든 화면은 같은 정규화 항공편 그룹을 소비한다', () => {
  const flight = TERMINAL_FLIGHT_GROUPS[0][0]
  assert.equal(flight.destination.code, 'HND')
  assert.equal(flight.weather.afterArrival.length, 4)
  assert.equal(flight.airline.flightNumber, 'JL92')
})

test('필수 승객 필드가 없으면 fixture 오류를 조기에 드러낸다', () => {
  assert.throws(
    () => normalizeTerminalFlight({ destination: { city: '도쿄' } }),
    /destination\.code/,
  )
})

test('부분 누락은 undefined나 -- 대신 승객용 문구로 정규화한다', () => {
  const flight = normalizeTerminalFlight({
    ...TERMINAL_FLIGHT_GROUPS[0][0],
    operation: { ...TERMINAL_FLIGHT_GROUPS[0][0].operation, gate: null, status: undefined },
    weather: { ...TERMINAL_FLIGHT_GROUPS[0][0].weather, current: null },
    dataState: { phase: 'partial', updatedAtKorea: null, hasNextPage: true },
  })
  assert.equal(flight.operation.gate, '정보 확인 중')
  assert.equal(flight.operation.status, '정보 확인 중')
  assert.equal(flight.weather.current.available, false)
  assert.equal(flight.weather.current.fallback, '예보 확인 중')
  assert.equal(flight.dataState.phase, 'partial')
  assert.doesNotMatch(JSON.stringify(flight), /undefined|"--"/)
})

test('로딩·오류·완료 상태를 명시적으로 정규화한다', () => {
  assert.deepEqual(normalizeTerminalDataState({ phase: 'loading' }), {
    phase: 'loading', updatedAtKorea: null, hasNextPage: false,
  })
  assert.equal(normalizeTerminalDataState({ phase: 'error' }).phase, 'error')
  assert.equal(normalizeTerminalDataState({ phase: 'ready', hasNextPage: true }).hasNextPage, true)
})

test('눈과 누락 예보는 렌더러에 승인 문구 또는 fallback을 제공한다', () => {
  assert.equal(normalizeWeatherPoint({ time: '12:00', type: 'snow', temperature: -1 }).label, '눈')
  assert.deepEqual(normalizeWeatherPoint(null), { available: false, fallback: '예보 확인 중' })
})

test('부분 current weather는 핵심 관측을 유지하고 보조 값만 passenger fallback으로 채운다', () => {
  const flight = normalizeTerminalFlight({
    ...TERMINAL_FLIGHT_GROUPS[0][0],
    weather: {
      ...TERMINAL_FLIGHT_GROUPS[0][0].weather,
      current: { time: '09:15', type: 'rain', temperature: 27, feelsLike: null, humidity: undefined, wind: '' },
    },
  })
  assert.equal(flight.weather.current.available, true)
  assert.equal(flight.weather.current.temperature, 27)
  assert.equal(flight.weather.current.feelsLike, '정보 확인 중')
  assert.equal(flight.weather.current.humidity, '정보 확인 중')
  assert.equal(flight.weather.current.wind, '정보 확인 중')
})
