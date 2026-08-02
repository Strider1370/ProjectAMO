import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

import {
  TERMINAL_SIMULATION_REFERENCE,
  buildTerminalSimulation,
  classifyTerminalSlotTransition,
  terminalFrameAt,
} from './terminalFlightSimulation.js'

test('시뮬레이션 기준 시각과 공항별 조회 창을 명시한다', () => {
  assert.equal(TERMINAL_SIMULATION_REFERENCE.date, '2026-08-02')
  assert.equal(TERMINAL_SIMULATION_REFERENCE.time, '13:00')
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKSS, 30)
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKPC, 30)
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKPK, 30)
  assert.equal(TERMINAL_SIMULATION_REFERENCE.windowMinutes.RKPU, 120)
  assert.deepEqual(TERMINAL_SIMULATION_REFERENCE.minimumFlights, {
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
  assert.equal(flight.airline, 'PARATA AIR')
  assert.equal(flight.logo, '/Symbols/airlines/WE.svg')
  assert.equal(existsSync(new URL('../../../public/Symbols/airlines/WE.svg', import.meta.url)), true)
})

test('당일 13시 이후 운항편이 실제로 없는 공항은 빈 상태를 유지한다', () => {
  assert.deepEqual(terminalFrameAt(buildTerminalSimulation('RKJB'), 0).flights, [])
})
