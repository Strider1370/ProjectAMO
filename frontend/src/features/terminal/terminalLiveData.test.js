import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeTerminalLiveWeather,
  resolveTerminalAirport,
} from './terminalLiveData.js'

const airportCatalog = [
  { icao: 'RKSS', nameKo: '김포국제공항' },
  { icao: 'RJTT', nameKo: '도쿄 하네다' },
]

test('기존 공항 카탈로그의 이름으로 터미널 목적지 공항을 찾는다', () => {
  assert.equal(resolveTerminalAirport({ airport: '김포국제공항' }, airportCatalog)?.icao, 'RKSS')
  assert.equal(resolveTerminalAirport({ city: '도쿄 하네다' }, airportCatalog)?.icao, 'RJTT')
})

test('기존 METAR·AMOS 데이터로 현재 날씨만 fixture에 안전하게 합친다', () => {
  const flight = {
    city: '서울', airport: '김포국제공항',
    current: { icon: 'cloud', temp: 25, feels: '26°C', humidity: '72%', wind: '북서 3m/s' },
  }
  const result = mergeTerminalLiveWeather(flight, {
    airportCatalog,
    metar: {
      fetched_at: '2026-08-02T00:00:00.000Z',
      airports: {
        RKSS: {
          header: { observation_time: '2026-08-02T00:00:00.000Z' },
          observation: {
            temperature: { air: 29 },
            wind: { direction_degrees: 180, speed_kt: 10, raw: '18010KT' },
            display: { weather_icon: 'RA' },
          },
        },
      },
    },
    amos: { airports: { RKSS: { weather: { humidity_pct: 81 } } } },
  })

  assert.deepEqual(result.current, {
    icon: 'rain', temp: 29, feels: '26°C', humidity: '81%', wind: '남 5m/s',
  })
  assert.equal(result.liveWeather.updatedAt, '2026-08-02T00:00:00.000Z')
})

test('기상 원본이 없거나 공항을 찾지 못하면 fixture를 그대로 둔다', () => {
  const flight = { city: '파리', current: { icon: 'cloudy', temp: 20 } }
  assert.equal(mergeTerminalLiveWeather(flight, { airportCatalog, metar: null }), flight)
})
