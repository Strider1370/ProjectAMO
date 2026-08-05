import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

import {
  TERMINAL_SIMULATION_REFERENCE,
  buildTerminalSimulation,
  REVIEWED_SLASH_DESTINATIONS,
  destinationNameFromKac,
  nextDisplayedSimulation,
  terminalFlightsFromFeed,
  classifyTerminalSlotTransition,
  terminalFrameAt,
  buildDestinationFrames,
} from './terminalFlightSimulation.js'

test('시뮬레이션 기준 시각과 공항별 조회 창을 명시한다', () => {
  assert.equal(TERMINAL_SIMULATION_REFERENCE.date, '2026-08-02')
  assert.equal(TERMINAL_SIMULATION_REFERENCE.time, '13:00')
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKSS, 30)
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKPC, 30)
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKPK, 30)
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKPU, 120)
  // 창이 비어도 최소 3편은 채운다. 큰 공항도 한산한 시간대에는 창에 한두 편밖에 안 걸린다.
  assert.deepEqual(TERMINAL_SIMULATION_REFERENCE.minimumFlights, {
    RKSS: 3,
    RKPC: 3,
    RKPK: 3,
    RKPU: 3,
    RKNY: 3,
    RKJY: 3,
    RKJB: 3,
  })
})

test('김포의 제주행 실제 편명 6개를 목적지 하나로 묶는다', () => {
  const simulation = buildTerminalSimulation('RKSS')
  const jeju = simulation.destinations.find((destination) => destination.code === 'CJU')

  assert.deepEqual(
    jeju.flights.map((flight) => flight.flight),
    ['TW715', '7C121', 'KE1113', '7C123', 'OZ8953', 'KE1121'],
  )
  assert.deepEqual(simulation.destinations.map((destination) => destination.code), ['CJU', 'KIX', 'PKX'])
})

test('같은 목적지의 다음 편은 슬롯을 유지한 새 프레임으로 준비한다', () => {
  const simulation = buildTerminalSimulation('RKSS')
  const active = terminalFrameAt(simulation, 0)
  const pending = terminalFrameAt(simulation, 1)

  assert.equal(active.flights[0].code, 'CJU')
  assert.equal(pending.flights[0].code, 'CJU')
  assert.equal(active.flights[0].flight, 'TW715')
  assert.equal(pending.flights[0].flight, '7C121')
  assert.equal(classifyTerminalSlotTransition(active.flights[0], pending.flights[0]), 'flight')
})

test('제주 출발 17편은 목적지 큐를 소진하며 중복 없이 6프레임에 배치한다', () => {
  const simulation = buildTerminalSimulation('RKPC')

  assert.equal(simulation.totalFlights, 17)
  assert.equal(simulation.totalDestinations, 5)
  assert.equal(simulation.frameCount, 6)
  assert.deepEqual(
    simulation.frames.map((frame) => frame.map((flight) => flight.flight)),
    [
      ['ZE214', '7C506', 'KE1612'],
      ['KE1214', 'LJ562', 'KE1614'],
      ['BX8028', 'BX8182', 'OZ8144'],
      ['LJ508', 'BX8108', 'KE1596'],
      ['TW720', '7C120', 'KE1586'],
      ['ZE274', 'ZE216'],
    ],
  )

  const visibleFlightKeys = simulation.frames.flat().map((flight) => flight.flightKey)
  assert.equal(new Set(visibleFlightKeys).size, 17)
  assert.deepEqual(
    Array.from({ length: simulation.frameCount }, (_, cursor) => terminalFrameAt(simulation, cursor).frameIndex),
    [0, 1, 2, 3, 4, 5],
  )
})

test('모든 출발 공항은 같은 3슬롯 규칙으로 실제 편명을 한 번씩만 표시한다', () => {
  for (const icao of ['RKSS', 'RKPC', 'RKPK', 'RKPU', 'RKNY', 'RKJY', 'RKJB']) {
    const simulation = buildTerminalSimulation(icao)
    const visibleFlightKeys = simulation.frames.flat().map((flight) => flight.flightKey)

    assert.equal(visibleFlightKeys.length, simulation.totalFlights, icao)
    assert.equal(new Set(visibleFlightKeys).size, simulation.totalFlights, icao)
    assert.equal(simulation.frameCount, Math.ceil(simulation.totalFlights / 3), icao)
    assert.equal(simulation.frames.every((frame) => frame.length <= 3), true, icao)
  }
})

test('혼합 프레임은 슬롯별로 편명·목적지·퇴장을 구분한다', () => {
  const simulation = buildTerminalSimulation('RKPC')
  const frame4 = terminalFrameAt(simulation, 3).flights
  const frame5 = terminalFrameAt(simulation, 4).flights
  const frame6 = terminalFrameAt(simulation, 5).flights

  assert.deepEqual(
    Array.from({ length: 3 }, (_, index) => classifyTerminalSlotTransition(frame4[index], frame5[index])),
    ['flight', 'destination', 'destination'],
  )
  assert.deepEqual(
    Array.from({ length: 3 }, (_, index) => classifyTerminalSlotTransition(frame5[index], frame6[index])),
    ['flight', 'flight', 'exit'],
  )
})

test('김포 국제선도 문자 대체물이 아닌 실제 로고 자산을 사용한다', () => {
  const flights = terminalFrameAt(buildTerminalSimulation('RKSS'), 0).flights
  const peach = flights.find((flight) => flight.flight === 'MM738')
  const chinaSouthern = flights.find((flight) => flight.flight === 'CZ318')

  assert.equal(peach.logo, '/Symbols/airlines/MM.svg')
  assert.equal(chinaSouthern.logo, '/Symbols/airlines/CZ.svg')
  assert.equal(existsSync(new URL('../../../public/Symbols/airlines/MM.svg', import.meta.url)), true)
  assert.equal(existsSync(new URL('../../../public/Symbols/airlines/CZ.svg', import.meta.url)), true)
})

test('저빈도 공항은 2시간 뒤의 당일 실제 출발편으로 최대 3편까지 채운다', () => {
  const selectedFlights = (icao) => buildTerminalSimulation(icao).destinations
    .flatMap((destination) => destination.flights)
    .sort((left, right) => left.departure.localeCompare(right.departure))

  assert.deepEqual(selectedFlights('RKPU').map((flight) => flight.flight), ['KE1595', 'LJ656', 'BX8305'])
  assert.deepEqual(selectedFlights('RKJY').map((flight) => flight.flight), ['KE1635', 'OZ8199', 'LJ672'])
  assert.deepEqual(selectedFlights('RKNY').map((flight) => flight.flight), ['WE6703'])
  assert.deepEqual(selectedFlights('RKJB'), [])
})

test('늦은 실제 출발편은 도착 시각부터 다섯 시간의 예보를 표시한다', () => {
  const ulsanFlights = buildTerminalSimulation('RKPU').destinations.flatMap((destination) => destination.flights)
  const yeosuFlights = buildTerminalSimulation('RKJY').destinations.flatMap((destination) => destination.flights)

  assert.deepEqual(ulsanFlights.find((flight) => flight.flight === 'BX8305').forecast.map(([time]) => time), ['19시', '20시', '21시', '22시', '23시'])
  assert.deepEqual(yeosuFlights.find((flight) => flight.flight === 'LJ672').forecast.map(([time]) => time), ['18시', '19시', '20시', '21시', '22시'])
})

test('양양의 파라타항공 실제 편명은 항공사명과 로고 자산을 사용한다', () => {
  const flight = terminalFrameAt(buildTerminalSimulation('RKNY'), 0).flights[0]

  assert.equal(flight.flight, 'WE6703')
  assert.equal(flight.airline, '파라타항공')
  assert.equal(flight.logo, '/Symbols/airlines/WE-symbol.png')
  assert.equal(existsSync(new URL('../../../public/Symbols/airlines/WE-symbol.png', import.meta.url)), true)
})

test('당일 13시 이후 운항편이 실제로 없는 공항은 빈 상태를 유지한다', () => {
  assert.deepEqual(terminalFrameAt(buildTerminalSimulation('RKJB'), 0).flights, [])
})

// --- 실제 운항 데이터 연동 ---

const FEED_ROW = {
  departureIcao: 'RKSS', flight: 'KE1113', airlineKorean: '대한항공', airlineEnglish: 'KOREAN AIR',
  destinationIata: 'CJU', destinationKorean: '제주', destinationEnglish: 'JEJU',
  scheduled: '13:15', estimated: null, arrivalKst: '14:30', gate: '7', status: '수속중',
  delayed: false, international: false,
}

test('피드 한 줄이 fixture와 같은 모양의 항공편이 된다', () => {
  const [flight] = terminalFlightsFromFeed([FEED_ROW])
  assert.equal(flight.code, 'CJU')
  assert.equal(flight.departure, '13:15')
  assert.equal(flight.revised, null)
  assert.equal(flight.arrivalKst, '14:30')
  assert.equal(flight.duration, '01:15')
  assert.equal(flight.gate, '7')
  assert.equal(flight.statusTone, 'ok')
  assert.equal(flight.logo, '/Symbols/airlines/KAL-symbol.svg')
})

test('지연편은 변경 시각을 revised로 올리고 예정 시각을 그대로 남긴다', () => {
  const [flight] = terminalFlightsFromFeed([{ ...FEED_ROW, estimated: '13:45', delayed: true }])
  assert.equal(flight.departure, '13:15', '예정 시각은 취소선으로 남아야 한다')
  assert.equal(flight.revised, '13:45')
  assert.equal(flight.statusTone, 'delay')
  assert.equal(flight.duration, '00:45', '비행시간은 변경된 출발 시각 기준')
})

test('도착 시각을 모르는 국제선은 빈칸이 아니라 확인 중으로 나온다', () => {
  const [flight] = terminalFlightsFromFeed([{
    ...FEED_ROW, destinationIata: 'KIX', destinationKorean: '오사카', arrivalKst: null, international: true,
  }])
  assert.equal(flight.arrival, '확인 중')
  assert.equal(flight.duration, '확인 중')
})

test('날씨 fixture에 없는 목적지도 도시명을 잃지 않는다', () => {
  const [flight] = terminalFlightsFromFeed([{
    ...FEED_ROW, destinationIata: 'YNJ', destinationKorean: '연길/옌지', destinationEnglish: 'YANJI',
  }])
  assert.equal(flight.destinationData.city, '옌지', '현행 표기를 쓴다')
  assert.equal(flight.destinationData.airport, '옌지', '화면 노선명도 영문 피드 대신 한글 표기를 쓴다')
  assert.equal(flight.destinationData.current.temp, null, '없는 날씨를 지어내지 않는다')
})

test('실제 데이터로 시뮬레이션을 돌리면 기준 시각 이후 편만 남는다', () => {
  const rows = [
    { ...FEED_ROW, flight: 'KE1101', scheduled: '09:00' },
    { ...FEED_ROW, flight: 'KE1113', scheduled: '13:15' },
    { ...FEED_ROW, flight: 'KE1121', scheduled: '13:25' },
  ]
  const simulation = buildTerminalSimulation('RKSS', {
    flights: terminalFlightsFromFeed(rows),
    referenceTime: '13:00',
    kstClock: '8/3 13:00',
  })
  const flights = simulation.destinations.flatMap((destination) => destination.flights)
  assert.deepEqual(flights.map((flight) => flight.flight), ['KE1113', 'KE1121'])
  assert.equal(flights[0].kstClock, '8/3 13:00')
})

test('현지 시각을 모르는 목적지도 날짜/시각 분리에서 깨지지 않는다', () => {
  const simulation = buildTerminalSimulation('RKSS', {
    flights: terminalFlightsFromFeed([{ ...FEED_ROW, destinationIata: 'YNJ', destinationKorean: '연길/옌지', arrivalKst: null, international: true }]),
    referenceTime: '13:00',
    kstClock: '8/3 13:00',
  })
  const [flight] = simulation.destinations[0].flights
  const [localDate, localTime] = flight.localClock.split(' ')
  assert.equal(localDate, '8/3')
  assert.equal(localTime, '미정', '공백이 든 값을 넣으면 화면에서 잘린다')
})

test('도시/공항 표기는 도시명과 공항명을 함께 보여준다', () => {
  const cases = [
    ['KIX', '오사카/간사이', '오사카', '오사카 간사이'],
    ['PEK', '베이징(서우두)/서우두', '베이징', '베이징 서우두'],
    ['PKX', '베이징(다싱)/다싱', '베이징', '베이징 다싱'],
    ['PUS', '부산/김해', '부산', '부산 김해'],
    ['TSA', '타이페이/쑹산', '타이페이', '타이페이 쑹산'],
    ['KPO', '포항/포항경주', '포항', '포항경주'],
    ['SHA', '상하이/홍차오', '상하이', '상하이 홍차오'],
    ['TPE', '타이페이/타오위안', '타이페이', '타이페이 타오위안'],
    ['TAG', '팡라오/보홀팡라오', '팡라오', '보홀팡라오'],
    ['CJU', '제주', '제주', '제주'],
    ['HKG', '홍콩', '홍콩', '홍콩'],
  ]
  for (const [iata, raw, city, displayName] of cases) {
    assert.deepEqual(destinationNameFromKac(raw, iata), { city, displayName }, raw)
  }
})

test('같은 지명의 옛 표기와 현행 표기는 잇지 않고 현행 표기만 쓴다', () => {
  const cases = [
    ['TAO', '청도/칭다오', '칭다오'],
    ['HGH', '항조우/항저우', '항저우'],
    ['SIN', '싱가폴/싱가포르', '싱가포르'],
    ['SZX', '심천/선전', '선전'],
    ['YNJ', '연길/옌지', '옌지'],
    ['SGN', '호치민/호찌민', '호찌민'],
  ]
  for (const [iata, raw, expected] of cases) {
    assert.deepEqual(destinationNameFromKac(raw, iata), { city: expected, displayName: expected }, raw)
  }
})

test('목적지 이름은 날씨 fixture가 있든 없든 같은 규칙으로 만든다', () => {
  const [known] = terminalFlightsFromFeed([{ ...FEED_ROW, destinationIata: 'KIX', destinationKorean: '오사카/간사이' }])
  const [unknown] = terminalFlightsFromFeed([{ ...FEED_ROW, destinationIata: 'HND', destinationKorean: '도쿄/하네다' }])
  assert.equal(known.destinationData.displayName, '오사카 간사이')
  assert.equal(unknown.destinationData.displayName, '도쿄 하네다')
  assert.equal(known.destinationData.current.temp, 33, '날씨 fixture가 있으면 그대로 쓴다')
  assert.equal(unknown.destinationData.current.temp, null, '없는 날씨를 지어내지 않는다')
})

test('확인하지 않은 새 목적지는 도시명을 잃지 않는 쪽으로 표시한다', () => {
  // KAC가 새 노선을 열면 목록에 없는 IATA가 들어온다. 잘못 이으면 겹쳐 보일 뿐이지만
  // 잘못 줄이면 도시명이 사라져 승객이 목적지를 못 찾는다.
  assert.equal(REVIEWED_SLASH_DESTINATIONS.has('ZZZ'), false)
  assert.deepEqual(destinationNameFromKac('신도시/새공항', 'ZZZ'), { city: '신도시', displayName: '신도시 새공항' })
})

test('감사 스크립트가 확인한 목적지는 모두 슬래시 표기다', () => {
  // 목록에 슬래시 없는 목적지가 섞이면 감사가 새 목적지를 놓친다.
  assert.equal(REVIEWED_SLASH_DESTINATIONS.has('CJU'), false, '제주는 슬래시가 없다')
  assert.equal(REVIEWED_SLASH_DESTINATIONS.has('SHA'), true)
  assert.equal(REVIEWED_SLASH_DESTINATIONS.size, 28)
})

test('날씨 fixture에 없는 국내선 목적지도 한국 시간대를 안다', () => {
  const [domestic] = terminalFlightsFromFeed([{ ...FEED_ROW, destinationIata: 'CJJ', destinationKorean: '청주', international: false }])
  const [international] = terminalFlightsFromFeed([{ ...FEED_ROW, destinationIata: 'HKG', destinationKorean: '홍콩', arrivalKst: null, international: true }])
  assert.equal(domestic.destinationData.localZone, 'KST')
  assert.equal(international.destinationData.localZone, null, '시차를 모르는 곳에 KST를 붙이면 안 된다')

  // 김해-인천처럼 국제선으로 분류되지만 목적지가 한국인 편. 도착 기록이 있다는 것이 국내 공항이라는 신호다.
  const [toIncheon] = terminalFlightsFromFeed([{ ...FEED_ROW, destinationIata: 'ICN', destinationKorean: '인천', arrivalKst: '17:40', international: true }])
  assert.equal(toIncheon.destinationData.localZone, 'KST')

  const simulation = buildTerminalSimulation('RKSS', {
    flights: terminalFlightsFromFeed([{ ...FEED_ROW, destinationIata: 'CJJ', destinationKorean: '청주', international: false }]),
    referenceTime: '13:00',
    kstClock: '8/3 13:00',
  })
  assert.equal(simulation.destinations[0].flights[0].localClock, '8/3 13:00', '국내선 현지 시각은 한국 시각과 같다')
})

test('새 편성은 순환 한 바퀴가 끝나는 지점에서만 갈아탄다', () => {
  const current = { departureIcao: 'RKSS', frameCount: 4, tag: '이전' }
  const next = { departureIcao: 'RKSS', frameCount: 4, tag: '새것' }

  // 읽는 중(2/4, 3/4)에는 바꾸지 않는다.
  assert.equal(nextDisplayedSimulation(current, next, 1).tag, '이전')
  assert.equal(nextDisplayedSimulation(current, next, 2).tag, '이전')
  assert.equal(nextDisplayedSimulation(current, next, 3).tag, '이전')
  // 한 바퀴가 끝나 처음으로 돌아오면 갈아탄다.
  assert.equal(nextDisplayedSimulation(current, next, 4).tag, '새것')
  assert.equal(nextDisplayedSimulation(current, next, 8).tag, '새것')
})

test('출발 공항을 바꾸면 기다리지 않는다', () => {
  const current = { departureIcao: 'RKSS', frameCount: 4, tag: '김포' }
  const next = { departureIcao: 'RKPK', frameCount: 3, tag: '김해' }
  assert.equal(nextDisplayedSimulation(current, next, 2).tag, '김해', '사용자 조작은 즉시 반영')
})

test('첫 편성과 프레임이 하나뿐인 편성은 곧바로 반영한다', () => {
  const next = { departureIcao: 'RKSS', frameCount: 4, tag: '첫것' }
  assert.equal(nextDisplayedSimulation(null, next, 3).tag, '첫것')

  const single = { departureIcao: 'RKSS', frameCount: 1, tag: '이전' }
  assert.equal(nextDisplayedSimulation(single, next, 7).tag, '첫것', '기다릴 경계가 없다')
})

test('공동운항편은 편명마다 항공사와 로고를 함께 담는다', () => {
  const [flight] = terminalFlightsFromFeed([{
    ...FEED_ROW, flight: 'BX8827', airlineEnglish: 'AIR BUSAN',
    codeshares: [
      { flight: 'BX8827', airlineEnglish: 'AIR BUSAN', airlineKorean: '에어부산' },
      { flight: 'OZ8827', airlineEnglish: 'ASIANA AIRLINES', airlineKorean: '아시아나항공' },
    ],
  }])
  assert.deepEqual(flight.codeshares, [
    { flight: 'BX8827', airline: '에어부산', logo: '/Symbols/airlines/ABL.svg' },
    { flight: 'OZ8827', airline: '아시아나항공', logo: '/Symbols/airlines/AAR-symbol.svg' },
  ])
})

test('공동운항이 아니면 자기 편명 하나만 담는다', () => {
  const [flight] = terminalFlightsFromFeed([FEED_ROW])
  assert.equal(flight.codeshares.length, 1)
  assert.equal(flight.codeshares[0].flight, 'KE1113')
})

test('공동운항편은 국적기를 맨 앞에 세우고 나머지 순서는 그대로 둔다', () => {
  const [flight] = terminalFlightsFromFeed([{
    ...FEED_ROW, flight: 'FM824', airlineEnglish: 'SHANGHAI AIRLINES',
    codeshares: [
      { flight: 'FM824', airlineEnglish: 'SHANGHAI AIRLINES' },
      { flight: 'MU5041', airlineEnglish: 'CHINA EASTERN' },
      { flight: 'KE5899', airlineEnglish: 'KOREAN AIR' },
    ],
  }])
  assert.deepEqual(flight.codeshares.map((share) => share.flight), ['KE5899', 'FM824', 'MU5041'])
})

test('국적기끼리는 순서를 바꾸지 않는다', () => {
  const [flight] = terminalFlightsFromFeed([{
    ...FEED_ROW, flight: 'BX8827', airlineEnglish: 'AIR BUSAN',
    codeshares: [
      { flight: 'BX8827', airlineEnglish: 'AIR BUSAN' },
      { flight: 'OZ8827', airlineEnglish: 'ASIANA AIRLINES' },
    ],
  }])
  assert.deepEqual(flight.codeshares.map((share) => share.flight), ['BX8827', 'OZ8827'])
})

function destination(code, flightCount, priority) {
  return {
    code,
    priority,
    flights: Array.from({ length: flightCount }, (unused, index) => ({ flight: `${code}${index}` })),
  }
}

test('도시 하나가 프레임 하나가 된다', () => {
  const frames = buildDestinationFrames([destination('CJU', 3, 0), destination('KIX', 1, 1)])
  assert.equal(frames.length, 2)
  assert.deepEqual(frames.map((frame) => frame.code), ['CJU', 'KIX'])
})

test('출발 시각순으로 돈다', () => {
  // buildTerminalSimulation은 편 수 순으로 정렬해 넘긴다(1안이 세 칸을 채워야 해서).
  // 2안·3안은 priority(등장 순서 = 출발 시각순)로 되돌려 쓴다.
  const frames = buildDestinationFrames([destination('CJU', 5, 0), destination('KIX', 1, 1), destination('PKX', 1, 2)])
  assert.deepEqual(frames.map((frame) => frame.code), ['CJU', 'KIX', 'PKX'])
})

test('편이 여섯 편 이상이면 같은 도시를 나눠 넘긴다', () => {
  const frames = buildDestinationFrames([destination('CJU', 8, 0)])
  assert.equal(frames.length, 2)
  assert.equal(frames[0].flights.length, 5)
  assert.equal(frames[1].flights.length, 3)
  assert.deepEqual(frames.map((frame) => frame.page), [1, 2])
  assert.equal(frames[0].pageCount, 2)
})

test('나뉜 도시는 연달아 나온다', () => {
  // 제주(1/2) → 오사카 → 제주(2/2)로 흩어지면 승객이 읽던 목록을 잃는다.
  const frames = buildDestinationFrames([destination('CJU', 7, 0), destination('KIX', 1, 1)])
  assert.deepEqual(frames.map((frame) => frame.code), ['CJU', 'CJU', 'KIX'])
})

test('목적지가 없으면 빈 배열을 준다', () => {
  assert.deepEqual(buildDestinationFrames([]), [])
})
