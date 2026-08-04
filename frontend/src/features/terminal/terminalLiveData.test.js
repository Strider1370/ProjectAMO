import assert from 'node:assert/strict'
import test from 'node:test'
import {
  destinationForecast,
  destinationForecastFromGround,
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

test('국내 목적지는 AMOS 습도를 쓰고 바람·체감은 METAR에서 계산한다', () => {
  // 필드 이름은 실제 응답 그대로다. 예전 테스트는 direction_degrees/speed_kt를 썼는데
  // 그런 필드가 없어서 바람이 한 번도 붙지 않았고, 그 버그를 테스트가 덮고 있었다.
  const flight = {
    city: '서울', airport: '김포국제공항',
    current: { icon: 'cloud', temp: 25, feels: '26℃', humidity: '72%', wind: '북서 3m/s' },
  }
  const result = mergeTerminalLiveWeather(flight, {
    airportCatalog,
    metar: {
      fetched_at: '2026-08-02T00:00:00.000Z',
      airports: {
        RKSS: {
          header: { observation_time: '2026-08-02T00:00:00.000Z' },
          observation: {
            temperature: { air: 29, dewpoint: 25 },
            wind: { direction: 180, speed: 10, raw: '18010KT' },
            display: { weather_icon: 'RA' },
          },
        },
      },
    },
    amos: { airports: { RKSS: { weather: { humidity_pct: 81, dewpoint_c: 25 } } } },
  })

  assert.deepEqual(result.current, {
    icon: 'rain', temp: 29, feels: '31℃', humidity: '81%', wind: '남 5m/s',
  })
  assert.equal(result.liveWeather.updatedAt, '2026-08-02T00:00:00.000Z')
})

test('해외 목적지는 AMOS가 없으니 이슬점으로 습도를 계산한다', () => {
  // 2026-08-03 나트랑(VVCR) 실제 METAR: 20014KT 29/23
  const flight = { city: '나트랑', airport: 'NHA TRANG', current: { icon: null, temp: null, feels: '확인 중', humidity: '확인 중', wind: '확인 중' } }
  const result = mergeTerminalLiveWeather(flight, {
    airportCatalog: [{ icao: 'VVCR', name: 'NHA TRANG', nameKo: '나트랑' }],
    metarOverseas: {
      fetched_at: '2026-08-03T10:30:00.000Z',
      airports: {
        VVCR: {
          header: { observation_time: '2026-08-03T10:30:00.000Z' },
          observation: {
            temperature: { air: 29, dewpoint: 23 },
            wind: { direction: 200, speed: 14, raw: '20014KT' },
            display: { weather_icon: 'NSW' },
          },
        },
      },
    },
  })

  assert.deepEqual(result.current, {
    icon: 'sun', temp: 29, feels: '30℃', humidity: '70%', wind: '남남서 7m/s',
  })
})

test('바람이 고요하면 방향 대신 그렇게 적는다', () => {
  const result = mergeTerminalLiveWeather(
    { airport: '김포국제공항', current: {} },
    {
      airportCatalog,
      metar: { airports: { RKSS: { observation: { temperature: { air: 20 }, wind: { calm: true } } } } },
    },
  )
  assert.equal(result.current.wind, '고요')
})

test('기상 원본이 없거나 공항을 찾지 못하면 fixture를 그대로 둔다', () => {
  const flight = { city: '파리', current: { icon: 'cloudy', temp: 20 } }
  assert.equal(mergeTerminalLiveWeather(flight, { airportCatalog, metar: null }), flight)
})

// --- 도착 시각대 기상청 예보 ---

const GROUND_FORECAST = {
  airports: {
    RKPC: {
      hourly: [
        { date: '20260803', time: '1300', temp: 33, rainProb: 0, icon: 'sunny' },
        { date: '20260803', time: '1400', temp: 33, rainProb: 0, icon: 'sunny' },
        { date: '20260803', time: '1500', temp: 32, rainProb: 10, icon: 'mostly_cloudy' },
        { date: '20260803', time: '1600', temp: 32, rainProb: 30, icon: 'rain' },
        { date: '20260803', time: '1700', temp: 31, rainProb: 60, icon: 'thunder' },
        { date: '20260803', time: '1800', temp: 30, rainProb: 20, icon: 'cloudy' },
        { date: '20260803', time: '1900', temp: 29, rainProb: 0, icon: 'sunny' },
      ],
    },
    RKSS: { hourly: [] },
  },
}

test('도착 시각부터 다섯 칸을 기상청 예보로 채운다', () => {
  assert.deepEqual(destinationForecastFromGround(GROUND_FORECAST, 'RKPC', '15:10'), [
    ['15시', 'cloud', '32℃'],
    ['16시', 'rain', '32℃'],
    ['17시', 'storm', '31℃'],
    ['18시', 'cloudy', '30℃'],
    ['19시', 'sun', '29℃'],
  ])
})

test('도착 시각을 모르면 예보를 만들지 않는다', () => {
  // 국제선은 도착 시각이 없다. 아무 시각이나 골라 붙이면 틀린 예보가 된다.
  assert.equal(destinationForecastFromGround(GROUND_FORECAST, 'RKPC', '확인 중'), null)
  assert.equal(destinationForecastFromGround(GROUND_FORECAST, 'RKPC', null), null)
})

test('목적지 예보가 없으면 null을 돌려준다', () => {
  assert.equal(destinationForecastFromGround(GROUND_FORECAST, 'RKSS', '15:10'), null)
  assert.equal(destinationForecastFromGround(GROUND_FORECAST, 'RKPK', '15:10'), null)
  assert.equal(destinationForecastFromGround(null, 'RKPC', '15:10'), null)
})

test('예보가 다섯 칸에 못 미치면 있는 만큼만 준다', () => {
  const forecast = destinationForecastFromGround(GROUND_FORECAST, 'RKPC', '18:30')
  assert.deepEqual(forecast, [['18시', 'cloudy', '30℃'], ['19시', 'sun', '29℃']])
})

test('hourly가 3일치라도 24시간 밖의 같은 시각을 잘못 골라 붙이지 않는다', () => {
  // hourly가 72칸(3일치)로 늘어나면서 같은 시각(예: 05시)이 날짜를 바꿔가며 여러 번 나올 수 있다.
  // arrivalKst는 시각만 있고 날짜가 없으므로, 다음 24시간 안에 그 시각이 없으면 더 뒤쪽(다른 날)의
  // 같은 시각을 집어서는 안 된다 — 예전처럼 null을 돌려줘야 화면이 기존 값을 유지한다.
  // 이 함수는 date/time 문자열을 그대로 시각 숫자로만 쓰고 KST 변환은 하지 않으므로,
  // 시작 시각의 UTC 시(hour) 숫자가 곧 '13시'로 취급된다.
  const hourly = []
  const start = new Date('2026-08-03T13:00:00Z') // '13시'부터 한 시간씩
  const skipHour = 16 // 이 오프셋(다음날 05시)만 빼서 앞 24칸에 05시가 없게 만든다
  for (let h = 0; h <= 24; h += 1) {
    if (h === skipHour) continue
    const at = new Date(start.getTime() + h * 3600 * 1000)
    const pad = (v) => String(v).padStart(2, '0')
    const date = `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`
    const time = `${pad(at.getUTCHours())}00`
    hourly.push({ date, time, temp: 20, rainProb: 0, icon: 'sunny' })
  }
  // 앞 24칸(index 0-23) 밖에 같은 05시가 다시 나온다. 값을 다르게 줘서 잘못 골랐는지 바로 드러나게 한다.
  hourly.push({ date: '20260805', time: '0500', temp: 99, rainProb: 0, icon: 'snow' })

  assert.equal(hourly.length, 25) // 24개(스킵분 제외) + 뒤쪽(index 24) 05시 1개
  assert.ok(!hourly.slice(0, 24).some((slot) => slot.time === '0500'), '앞 24칸엔 05시가 없어야 진짜 테스트가 된다')

  const forecast = { airports: { RKPC: { hourly } } }
  assert.equal(destinationForecastFromGround(forecast, 'RKPC', '05:10'), null)
})

test('관측이 없어도 도착 예보는 붙는다', () => {
  // 예보와 현재 관측은 출처가 다르다. METAR가 없다고 예보까지 버리면 안 된다.
  const flight = { airport: '제주국제공항', arrivalKst: '15:10', forecast: [['14시', 'sun', '30℃']] }
  const merged = mergeTerminalLiveWeather(flight, {
    airportCatalog: [{ icao: 'RKPC', nameKo: '제주국제공항' }],
    metar: null,
    groundForecast: GROUND_FORECAST,
  })
  assert.equal(merged.forecastSource, 'kma')
  assert.equal(merged.forecast[0][0], '15시')
})

// --- 해외 목적지 예보 (MET Norway) ---

const OVERSEAS_FORECAST = {
  source: 'MET Norway (CC BY 4.0)',
  airports: {
    RJTT: {
      hourly: [
        { date: '20260803', time: '1500', temp: 28.3, icon: 'cloudy' },
        { date: '20260803', time: '1600', temp: 27.9, icon: 'cloudy' },
        { date: '20260803', time: '1700', temp: 27.1, icon: 'partly' },
        { date: '20260803', time: '1800', temp: 26.1, icon: 'rain' },
        { date: '20260803', time: '1900', temp: 25.05, icon: 'sun' },
      ],
    },
  },
}

test('해외 목적지는 MET Norway 예보를 쓰고 기온을 정수로 보여준다', () => {
  assert.deepEqual(destinationForecast({ overseasForecast: OVERSEAS_FORECAST }, 'RJTT', '15:10'), [
    ['15시', 'cloudy', '28℃'],
    ['16시', 'cloudy', '28℃'],
    ['17시', 'partly', '27℃'],
    ['18시', 'rain', '26℃'],
    ['19시', 'sun', '25℃'],
  ])
})

test('국내 예보가 있으면 국내 것을 먼저 쓴다', () => {
  const both = { groundForecast: GROUND_FORECAST, overseasForecast: OVERSEAS_FORECAST }
  assert.equal(destinationForecast(both, 'RKPC', '15:10')[0][2], '32℃', '제주는 기상청 값')
  assert.equal(destinationForecast(both, 'RJTT', '15:10')[0][2], '28℃', '하네다는 MET Norway 값')
})

test('해외 예보도 도착 시각을 모르면 만들지 않는다', () => {
  assert.equal(destinationForecast({ overseasForecast: OVERSEAS_FORECAST }, 'RJTT', '확인 중'), null)
})

test('해외 목적지도 관측 없이 예보만으로 붙는다', () => {
  const flight = { airport: 'Tokyo Haneda', arrivalKst: '15:10', forecast: [] }
  const merged = mergeTerminalLiveWeather(flight, {
    airportCatalog: [{ icao: 'RJTT', name: 'Tokyo Haneda', nameKo: '도쿄 하네다' }],
    metar: null,
    overseasForecast: OVERSEAS_FORECAST,
  })
  assert.equal(merged.forecastSource, 'met.no')
  assert.deepEqual(merged.forecast[0], ['15시', 'cloudy', '28℃'])
})

import { airportTemperature, temperatureGap, destinationHourly, destinationDailyDays } from './terminalLiveData.js'

const liveData = {
  amos: { airports: { RKSS: { weather: { temperature_c: 28 } } } },
  metar: { airports: { RKPC: { observation: { temperature: { air: 32 } } } } },
  groundForecast: { airports: { RKPC: { hourly: [{ date: '20260804', time: '1500', temp: 34 }], forecast: [{ date: '20260805' }] } } },
  overseasForecast: { airports: { RJBB: { hourly: [{ date: '20260804', time: '1500', temp: 31 }], daily: [{ date: '20260805' }] } } },
}

test('출발 공항 기온은 AMOS를 먼저 쓴다', () => {
  assert.equal(airportTemperature(liveData, 'RKSS'), 28)
})

test('AMOS가 없으면 METAR 기온을 쓴다', () => {
  assert.equal(airportTemperature(liveData, 'RKPC'), 32)
})

test('관측이 없으면 null이다', () => {
  assert.equal(airportTemperature(liveData, 'RKPU'), null)
})

test('기온차가 2도 미만이면 표시하지 않는다', () => {
  // 자리는 유지하고 내용만 비운다. +0°는 공간만 먹고 읽을 게 없다.
  assert.equal(temperatureGap(28, 29), null)
  assert.equal(temperatureGap(28, 26.5), null)
})

test('기온차가 2도 이상이면 부호와 함께 준다', () => {
  assert.deepEqual(temperatureGap(28, 32), { value: 4, sign: '+' })
  assert.deepEqual(temperatureGap(32, 28), { value: 4, sign: '-' })
})

test('한쪽 관측이 없으면 기온차도 없다', () => {
  assert.equal(temperatureGap(null, 32), null)
  assert.equal(temperatureGap(28, null), null)
})

test('국내 목적지는 기상청 시간별을, 해외는 met.no를 쓴다', () => {
  assert.equal(destinationHourly(liveData, 'RKPC')[0].temp, 34)
  assert.equal(destinationHourly(liveData, 'RJBB')[0].temp, 31)
  assert.deepEqual(destinationHourly(liveData, 'RKPU'), [])
})

test('주간 자료는 국내 forecast와 해외 daily에서 온다', () => {
  assert.equal(destinationDailyDays(liveData, 'RKPC')[0].date, '20260805')
  assert.equal(destinationDailyDays(liveData, 'RJBB')[0].date, '20260805')
  assert.deepEqual(destinationDailyDays(liveData, 'RKPU'), [])
})

// 국내 수집기(ground-forecast-processor.js)는 기상청 자기 어휘(sunny·mostly_cloudy·partly_cloudy…)를
// 그대로 저장한다. 화면 아이콘은 sun·cloud·partly 같은 다른 어휘를 쓰므로 여기서 바꿔야 한다 -
// 안 바꾸면 화면 쪽 아이콘 매핑에 없는 값이라 전부 기본 구름 아이콘으로 떨어진다.
const iconLiveData = {
  groundForecast: {
    airports: {
      RKPC: {
        hourly: [{ date: '20260804', time: '1500', temp: 34, icon: 'sunny' }],
        forecast: [{ date: '20260805', am: { icon: 'partly_cloudy', rainProb: 10 }, pm: { icon: 'mostly_cloudy', rainProb: 20 }, tempMin: 24, tempMax: 30 }],
      },
    },
  },
  overseasForecast: {
    airports: { RJBB: { hourly: [{ date: '20260804', time: '1500', temp: 31, icon: 'sun' }], daily: [{ date: '20260805', am: { icon: 'sun' }, pm: { icon: 'cloud' } }] } },
  },
}

test('국내 시간별 아이콘은 기상청 어휘를 화면 어휘로 바꾼다', () => {
  assert.equal(destinationHourly(iconLiveData, 'RKPC')[0].icon, 'sun')
})

test('해외 시간별 아이콘은 이미 화면 어휘라 그대로 둔다', () => {
  assert.equal(destinationHourly(iconLiveData, 'RJBB')[0].icon, 'sun')
})

test('국내 주간 am/pm 아이콘도 화면 어휘로 바꾼다', () => {
  const [day] = destinationDailyDays(iconLiveData, 'RKPC')
  assert.equal(day.am.icon, 'partly')
  assert.equal(day.pm.icon, 'cloud')
})

test('해외 주간 am/pm 아이콘은 그대로 둔다', () => {
  const [day] = destinationDailyDays(iconLiveData, 'RJBB')
  assert.equal(day.am.icon, 'sun')
  assert.equal(day.pm.icon, 'cloud')
})
