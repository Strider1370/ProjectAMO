import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { activeCollectionTypes, abortActiveCollections, runWithLock } from '../src/index.js'
import { extractOverseasSlots, process, symbolToIcon } from '../src/processors/overseas-forecast-processor.js'

// 2026-08-03 도쿄 하네다(RJTT) 좌표로 받은 MET Norway 실제 응답.
const HANEDA = JSON.parse(readFileSync(new URL('./fixtures/met-no-rjtt.json', import.meta.url), 'utf8'))

test('symbolToIcon: 낮/밤 접미사를 떼고 표시 어휘로 바꾼다', () => {
  assert.equal(symbolToIcon('clearsky_day'), 'sun')
  assert.equal(symbolToIcon('clearsky_night'), 'sun')
  assert.equal(symbolToIcon('fair_day'), 'sun')
  assert.equal(symbolToIcon('partlycloudy_night'), 'partly')
  assert.equal(symbolToIcon('cloudy'), 'cloudy')
  assert.equal(symbolToIcon('lightrain'), 'rain')
  assert.equal(symbolToIcon('lightrainshowers_night'), 'shower')
  assert.equal(symbolToIcon('heavysnow'), 'snow')
  assert.equal(symbolToIcon('rainandthunder'), 'storm')
  assert.equal(symbolToIcon('알수없는값'), null, '모르는 부호를 아무 날씨로 지어내지 않는다')
  assert.equal(symbolToIcon(undefined), null)
})

test('실제 응답에서 한국 시각 기준 시간별 예보를 뽑는다', () => {
  const slots = extractOverseasSlots(HANEDA)
  // 픽스처는 88칸을 담고 있지만 기본 상한이 72칸(3일치)이라 그만큼만 나온다.
  assert.equal(slots.length, 72)

  // 응답 첫 항목은 2026-08-03T06:00:00Z = 한국 15시.
  assert.equal(slots[0].date, '20260803')
  assert.equal(slots[0].time, '1500')
  assert.ok(Number.isFinite(slots[0].temp))

  // MET Norway는 첫 이틀 남짓만 1시간 간격이고 그 뒤로는 6시간 간격으로 성기어진다(픽스처도 그렇다).
  // 도착 시각 매칭은 앞 24칸만 보므로(forecastFromHourly), 그 구간만 빠짐없이 이어지면 된다.
  const hours = slots.slice(0, 24).map((slot) => Number(slot.time.slice(0, 2)))
  for (let index = 1; index < hours.length; index += 1) {
    assert.equal(hours[index], (hours[index - 1] + 1) % 24, `${index}번째가 1시간 간격이 아니다`)
  }
})

test('모든 칸이 표시에 필요한 값을 갖춘다', () => {
  for (const slot of extractOverseasSlots(HANEDA)) {
    assert.ok(Number.isFinite(slot.temp), `${slot.time} 기온 없음`)
    assert.ok(slot.icon, `${slot.time} 날씨 아이콘 없음`)
    assert.match(slot.date, /^\d{8}$/)
    assert.match(slot.time, /^\d{4}$/)
  }
})

test('기온이 없는 칸은 버린다', () => {
  const broken = { properties: { timeseries: [
    { time: '2026-08-03T06:00:00Z', data: { instant: { details: {} }, next_1_hours: { summary: { symbol_code: 'cloudy' } } } },
    { time: '2026-08-03T07:00:00Z', data: { instant: { details: { air_temperature: 27.5 } }, next_1_hours: { summary: { symbol_code: 'cloudy' } } } },
  ] } }
  const slots = extractOverseasSlots(broken)
  assert.equal(slots.length, 1)
  assert.equal(slots[0].temp, 27.5)
})

test('빈 응답은 빈 배열', () => {
  assert.deepEqual(extractOverseasSlots(null), [])
  assert.deepEqual(extractOverseasSlots({}), [])
  assert.deepEqual(extractOverseasSlots({ properties: { timeseries: [] } }), [])
})

test('강수량을 mm로 꺼낸다', () => {
  const payload = {
    properties: {
      timeseries: [{
        time: '2026-08-04T06:00:00Z',
        data: {
          instant: { details: { air_temperature: 24.4, wind_speed: 3.2, wind_from_direction: 180 } },
          next_1_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 1.4 } },
        },
      }],
    },
  }
  const [slot] = extractOverseasSlots(payload)
  assert.equal(slot.precipitation, 1.4)
})

test('강수량이 없으면 null로 둔다', () => {
  const payload = {
    properties: {
      timeseries: [{
        time: '2026-08-04T06:00:00Z',
        data: {
          instant: { details: { air_temperature: 24.4 } },
          next_1_hours: { summary: { symbol_code: 'clearsky_day' } },
        },
      }],
    },
  }
  const [slot] = extractOverseasSlots(payload)
  assert.equal(slot.precipitation, null)
})

test('기본으로 3일치(72칸)까지 담는다', () => {
  const timeseries = Array.from({ length: 90 }, (unused, index) => ({
    time: new Date(Date.UTC(2026, 7, 4, index)).toISOString(),
    data: { instant: { details: { air_temperature: 20 } } },
  }))
  assert.equal(extractOverseasSlots({ properties: { timeseries } }).length, 72)
})

const airport = (icao) => ({ icao, lat: 35, lon: 129 })
const hourly = [{ date: '20260912', time: '1200', temp: 22, icon: 'sun' }]

test('취소된 수집은 빈 자료나 부분 자료를 게시하지 않는다', async () => {
  for (const abortAt of ['before', 'after-first']) {
    const controller = new AbortController()
    let saves = 0
    if (abortAt === 'before') controller.abort(new Error('transition'))
    await assert.rejects(process({
      signal: controller.signal,
      airportsToCollect: [airport('RJAA'), airport('RJBB')],
      fetchAirportForecast: async () => hourly,
      wait: async () => {
        if (abortAt === 'after-first') controller.abort(new Error('transition'))
      },
      dataStore: {
        getLiveCached: () => ({ airports: { RJAA: { icao: 'RJAA', hourly } } }),
        save: () => { saves += 1; return { saved: true } },
      },
    }), /transition/)
    assert.equal(saves, 0)
  }
})

test('기본 MET Norway 전송도 진행 중 취소 신호를 받고 게시하지 않는다', async () => {
  const originalFetch = globalThis.fetch
  const controller = new AbortController()
  let requestSignal
  let saves = 0
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    requestSignal = signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

  try {
    const collecting = process({
      signal: controller.signal,
      airportsToCollect: [airport('RJAA')],
      wait: async () => {},
      dataStore: {
        getLiveCached: () => ({ airports: { RJAA: { icao: 'RJAA', hourly } } }),
        save: () => { saves += 1; return { saved: true } },
      },
    })
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(requestSignal, 'MET Norway 전송에 취소 신호가 전달되어야 한다')

    controller.abort(new Error('transport cancelled'))
    await assert.rejects(collecting, /transport cancelled/)
    assert.equal(saves, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('정상 부분 성공은 실패 공항의 마지막 live 자료를 stale로 보존해 게시한다', async () => {
  let saved
  const previous = { icao: 'RJBB', hourly, daily: [] }
  const result = await process({
    airportsToCollect: [airport('RJAA'), airport('RJBB')],
    fetchAirportForecast: async ({ icao }) => {
      if (icao === 'RJBB') throw new Error('provider failed')
      return hourly
    },
    wait: async () => {},
    dataStore: {
      getLiveCached: () => ({ airports: { RJBB: previous } }),
      save: (_type, payload) => { saved = payload; return { saved: true } },
    },
  })
  assert.equal(result.saved, true)
  assert.deepEqual(result.failed, ['RJBB'])
  assert.equal(saved.airports.RJAA.icao, 'RJAA')
  assert.deepEqual(saved.airports.RJBB, { ...previous, _stale: true })
})

test('상위 실행 경계는 해외 예보 취소를 skip 통계로 남기고 lock을 해제한다', async () => {
  const events = []
  const recorder = {
    recordStart: () => ({ started: true }),
    recordSkip: (_type, reason) => events.push(['skip', reason]),
    recordSuccess: () => events.push(['success']),
    recordFailure: () => events.push(['failure']),
  }
  let started
  const ready = new Promise((resolve) => { started = resolve })
  const running = runWithLock('overseas_forecast', ({ signal }) => process({
    signal,
    airportsToCollect: [airport('RJAA')],
    fetchAirportForecast: (_airport, { signal: requestSignal }) => new Promise((_resolve, reject) => {
      started()
      requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
    }),
    wait: async () => {},
    dataStore: { getLiveCached: () => null, save: () => ({ saved: true }) },
  }), { stats: recorder, logger: { info() {}, warn() {}, error() {} } })
  await ready
  assert.deepEqual(activeCollectionTypes(), ['overseas_forecast'])
  await abortActiveCollections()
  await running
  assert.deepEqual(events, [['skip', 'collection_cancelled_for_data_transition']])
  assert.deepEqual(activeCollectionTypes(), [])
})
