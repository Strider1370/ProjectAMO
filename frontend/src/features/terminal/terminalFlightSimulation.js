const SOURCE_URL = 'https://www.airport.co.kr/ulsan/cms/frCon/index.do?MENU_ID=110'

export const TERMINAL_SIMULATION_REFERENCE = Object.freeze({
  date: '2026-08-02',
  time: '13:00',
  timeZone: 'Asia/Seoul',
  source: '한국공항공사 운항스케줄',
  sourceUrl: SOURCE_URL,
  retrievedAt: '2026-08-02 14:56 KST',
  windowMinutes: Object.freeze({
    RKSS: 30,
    RKPC: 30,
    RKPK: 30,
    RKPU: 120,
    RKNY: 120,
    RKJY: 120,
    RKJB: 120,
  }),
  minimumFlights: Object.freeze({
    RKPU: 3,
    RKNY: 3,
    RKJY: 3,
    RKJB: 3,
  }),
})

const AIRLINES = Object.freeze({
  KE: { airline: 'KOREAN AIR', logo: '/Symbols/airlines/KAL-symbol.svg' },
  OZ: { airline: 'ASIANA AIRLINES', logo: '/Symbols/airlines/AAR-symbol.svg' },
  '7C': { airline: 'JEJU AIR', logo: '/Symbols/airlines/JJA.svg' },
  LJ: { airline: 'JIN AIR', logo: '/Symbols/airlines/JNA.svg' },
  TW: { airline: 'T\'WAY AIR', logo: '/Symbols/airlines/TWB.svg' },
  ZE: { airline: 'EASTAR JET', logo: '/Symbols/airlines/ESR.svg' },
  BX: { airline: 'AIR BUSAN', logo: '/Symbols/airlines/ABL.svg' },
  MM: { airline: 'PEACH AVIATION', logo: '/Symbols/airlines/MM.svg' },
  CZ: { airline: 'CHINA SOUTHERN', logo: '/Symbols/airlines/CZ.svg' },
  WE: { airline: 'PARATA AIR', logo: '/Symbols/airlines/WE.svg' },
})

const DESTINATIONS = Object.freeze({
  CJU: destination('제주', '제주', '제주국제공항', 'KST', '8/2 13:00', current('partly', 30, 32, 70, '남동 4m/s')),
  KIX: destination('오사카', '오사카 간사이', '오사카 간사이', 'JST', '8/2 13:00', current('partly', 33, 36, 64, '남서 3m/s')),
  PKX: destination('베이징', '베이징 다싱', '베이징 다싱', 'CST', '8/2 12:00', current('cloudy', 31, 34, 68, '남동 2m/s')),
  PUS: destination('부산', '부산 김해', '김해국제공항', 'KST', '8/2 13:00', current('cloud', 29, 31, 73, '남 4m/s')),
  GMP: destination('서울', '서울 김포', '김포국제공항', 'KST', '8/2 13:00', current('partly', 31, 33, 65, '서 3m/s')),
  KWJ: destination('광주', '광주', '광주공항', 'KST', '8/2 13:00', current('partly', 31, 34, 69, '남서 3m/s')),
  USN: destination('울산', '울산', '울산공항', 'KST', '8/2 13:00', current('cloud', 30, 33, 72, '남동 4m/s')),
  HIN: destination('진주', '진주 사천', '사천공항', 'KST', '8/2 13:00', current('partly', 30, 33, 70, '남 3m/s')),
  FUK: destination('후쿠오카', '후쿠오카', '후쿠오카', 'JST', '8/2 13:00', current('partly', 32, 35, 66, '서남서 3m/s')),
})

function current(icon, temp, feels, humidity, wind) {
  return { icon, temp, feels: `${feels}℃`, humidity: `${humidity}%`, wind }
}

function destination(city, displayName, airport, localZone, localClock, currentWeather) {
  const forecast = [
    ['14시', currentWeather.icon, `${currentWeather.temp}℃`],
    ['15시', currentWeather.icon, `${currentWeather.temp}℃`],
    ['16시', 'cloud', `${currentWeather.temp - 1}℃`],
    ['17시', 'cloud', `${currentWeather.temp - 1}℃`],
    ['18시', 'partly', `${currentWeather.temp - 2}℃`],
  ]
  return { city, displayName, airport, localZone, localClock, current: currentWeather, forecast }
}

function flight(departureIcao, code, flightNumber, departure, arrivalKst, duration = null) {
  const airlineCode = flightNumber.match(/^[A-Z0-9]{2}/)?.[0] || ''
  return {
    departureIcao,
    code,
    flight: flightNumber,
    departure,
    arrivalKst,
    arrival: code === 'PKX' ? '확인 중' : arrivalKst,
    duration: duration || durationBetween(departure, arrivalKst),
    gate: '확인',
    status: '운항 예정',
    statusTone: 'ok',
    ...AIRLINES[airlineCode],
  }
}

function durationBetween(start, end) {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return '확인 중'
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  const minutes = (endHour * 60 + endMinute - startHour * 60 - startMinute + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

const FLIGHTS = Object.freeze([
  flight('RKSS', 'CJU', 'TW715', '13:00', '14:15'),
  flight('RKSS', 'CJU', '7C121', '13:05', '14:20'),
  flight('RKSS', 'KIX', 'MM738', '13:10', '14:27', '01:17'),
  flight('RKSS', 'CJU', 'KE1113', '13:15', '14:30'),
  flight('RKSS', 'CJU', '7C123', '13:20', '14:35'),
  flight('RKSS', 'CJU', 'OZ8953', '13:20', '14:35'),
  flight('RKSS', 'CJU', 'KE1121', '13:25', '14:40'),
  flight('RKSS', 'PKX', 'CZ318', '13:30', '확인 중', '확인 중'),

  flight('RKPC', 'PUS', '7C506', '13:00', '14:05'),
  flight('RKPC', 'PUS', 'LJ562', '13:00', '14:00'),
  flight('RKPC', 'GMP', 'ZE214', '13:00', '14:15'),
  flight('RKPC', 'GMP', 'KE1214', '13:05', '14:20'),
  flight('RKPC', 'KWJ', 'KE1612', '13:05', '14:00'),
  flight('RKPC', 'KWJ', 'KE1614', '13:05', '14:00'),
  flight('RKPC', 'USN', 'KE1596', '13:10', '14:15'),
  flight('RKPC', 'KWJ', 'OZ8144', '13:10', '14:05'),
  flight('RKPC', 'GMP', 'BX8028', '13:15', '14:35'),
  flight('RKPC', 'PUS', 'BX8182', '13:15', '14:20'),
  flight('RKPC', 'GMP', 'LJ508', '13:15', '14:30'),
  flight('RKPC', 'PUS', 'BX8108', '13:20', '14:25'),
  flight('RKPC', 'HIN', 'KE1586', '13:20', '14:25'),
  flight('RKPC', 'GMP', 'TW720', '13:20', '14:35'),
  flight('RKPC', 'GMP', '7C120', '13:25', '14:40'),
  flight('RKPC', 'GMP', 'ZE274', '13:25', '14:40'),
  flight('RKPC', 'GMP', 'ZE216', '13:30', '14:45'),

  flight('RKPK', 'KIX', 'TW321', '13:00', '13:58', '00:58'),
  flight('RKPK', 'FUK', '7C1453', '13:05', '13:36', '00:31'),
  flight('RKPK', 'CJU', 'BX8111', '13:25', '14:25'),
  flight('RKPK', 'KIX', 'ZE915', '13:30', '14:28', '00:58'),

  flight('RKPU', 'CJU', 'KE1595', '15:00', '16:10'),
  flight('RKPU', 'GMP', 'LJ656', '15:05', '16:05'),
  flight('RKPU', 'CJU', 'BX8305', '17:50', '19:00'),
  flight('RKPU', 'GMP', 'KE1848', '20:35', '21:35'),

  flight('RKNY', 'CJU', 'WE6703', '15:15', '16:35'),

  flight('RKJY', 'CJU', 'KE1635', '13:15', '14:10'),
  flight('RKJY', 'CJU', 'OZ8199', '15:55', '16:50'),
  flight('RKJY', 'GMP', 'LJ672', '17:00', '18:00'),
  flight('RKJY', 'GMP', 'OZ8736', '18:20', '19:20'),
])

function displayFlight(raw) {
  const destinationData = DESTINATIONS[raw.code]
  return {
    ...destinationData,
    ...raw,
    forecast: forecastForArrival(destinationData.forecast, raw.arrivalKst),
    kstClock: '8/2 13:00',
    arrivalSlot: 0,
    flightKey: `${raw.departureIcao}-${raw.flight}-${raw.departure}`,
  }
}

function forecastForArrival(forecast, arrivalKst) {
  if (!/^\d{2}:\d{2}$/.test(arrivalKst)) return forecast
  const startHour = Math.max(14, Number(arrivalKst.slice(0, 2)))
  return forecast.map(([, icon, temperature], index) => [`${(startHour + index) % 24}시`, icon, temperature])
}

function timeMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function selectTerminalSourceFlights(departureIcao) {
  const referenceMinutes = timeMinutes(TERMINAL_SIMULATION_REFERENCE.time)
  const windowMinutes = TERMINAL_SIMULATION_REFERENCE.windowMinutes[departureIcao] ?? 0
  const minimumFlights = TERMINAL_SIMULATION_REFERENCE.minimumFlights[departureIcao]
  const candidates = FLIGHTS
    .filter((candidate) => candidate.departureIcao === departureIcao)
    .filter((candidate) => timeMinutes(candidate.departure) >= referenceMinutes)
    .sort((left, right) => timeMinutes(left.departure) - timeMinutes(right.departure))
  const selected = candidates.filter((candidate) => timeMinutes(candidate.departure) - referenceMinutes <= windowMinutes)

  if (!minimumFlights || selected.length >= minimumFlights) return selected
  for (const candidate of candidates) {
    if (selected.length >= minimumFlights) break
    if (!selected.includes(candidate)) selected.push(candidate)
  }
  return selected.sort((left, right) => timeMinutes(left.departure) - timeMinutes(right.departure))
}

export function buildTerminalSimulation(departureIcao) {
  const grouped = new Map()
  const sourceFlights = selectTerminalSourceFlights(departureIcao)
  for (const raw of sourceFlights) {
    if (!grouped.has(raw.code)) grouped.set(raw.code, [])
    grouped.get(raw.code).push(displayFlight(raw))
  }

  const destinations = [...grouped.entries()]
    .map(([code, flights], priority) => ({ code, flights, priority }))
    .sort((left, right) => right.flights.length - left.flights.length || left.priority - right.priority)
  const frames = buildCompactFrames(destinations)
  return {
    departureIcao,
    destinations,
    frames,
    frameCount: frames.length,
    totalFlights: sourceFlights.length,
    totalDestinations: destinations.length,
  }
}

function buildCompactFrames(destinations, capacity = 3) {
  const queues = destinations.map((destinationData, priority) => ({
    ...destinationData,
    priority,
    cursor: 0,
  }))
  const frames = []
  let remainingFlights = queues.reduce((total, queue) => total + queue.flights.length, 0)

  while (remainingFlights > 0) {
    const liveQueues = queues.filter((queue) => queue.cursor < queue.flights.length)
    const allocations = liveQueues.slice(0, capacity)
    const allocatedCounts = new Map(allocations.map((queue) => [queue, 1]))
    const frameSize = Math.min(capacity, remainingFlights)

    while (allocations.length < frameSize) {
      const candidate = liveQueues
        .filter((queue) => queue.flights.length - queue.cursor - (allocatedCounts.get(queue) || 0) > 0)
        .sort((left, right) => {
          const leftRemaining = left.flights.length - left.cursor - (allocatedCounts.get(left) || 0)
          const rightRemaining = right.flights.length - right.cursor - (allocatedCounts.get(right) || 0)
          return rightRemaining - leftRemaining || left.priority - right.priority
        })[0]
      if (!candidate) break
      allocations.push(candidate)
      allocatedCounts.set(candidate, (allocatedCounts.get(candidate) || 0) + 1)
    }

    allocations.sort((left, right) => left.priority - right.priority)
    frames.push(allocations.map((queue) => queue.flights[queue.cursor++]))
    remainingFlights -= allocations.length
  }

  return frames
}

export function terminalFrameAt(simulation, cursor) {
  const safeCursor = Math.max(0, Number(cursor) || 0)
  const frameIndex = simulation.frames.length ? safeCursor % simulation.frames.length : 0
  return {
    cursor: safeCursor,
    frameIndex,
    frameCount: Math.max(1, simulation.frameCount),
    flights: simulation.frames[frameIndex] || [],
  }
}

export function hasTerminalNextFrame(simulation) {
  return simulation.frameCount > 1
}

export function classifyTerminalSlotTransition(activeFlight, pendingFlight) {
  if (!activeFlight && !pendingFlight) return 'stable'
  if (!activeFlight) return 'enter'
  if (!pendingFlight) return 'exit'
  if (activeFlight.code !== pendingFlight.code) return 'destination'
  if (activeFlight.flightKey !== pendingFlight.flightKey) return 'flight'
  return 'stable'
}
