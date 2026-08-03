#!/usr/bin/env node
// 국내공항(인천 제외)에서 출발하는 항공사를 전수로 훑어, 터미널 화면에 로고가 빠진 곳을 알려준다.
//
// 두 곳을 합쳐야 전수가 된다.
//   - 운항스케줄: 시즌 단위 계획이라 주 1~2회짜리 노선까지 잡힌다. 2009년부터 쌓인 이력이라
//     오늘이 운항기간에 걸리는 것만 걸러 쓴다.
//   - 실시간 운항정보: 스케줄에 없는 코드셰어 편명이 여기에만 나온다. 델타·에어프랑스처럼
//     실제로는 국적사가 띄우는 편에 파트너가 자기 편명을 붙인 것들이다.
//
// 한국공항공사는 인천을 운영하지 않아 인천발 장거리 노선은 어느 쪽에도 거의 없다.
// 터미널 화면이 인천을 다루게 되면 인천국제공항공사 API를 따로 붙여야 한다.
//
//   node --env-file=.env backend/scripts/audit-terminal-airlines.mjs
//
// 종료 코드 1 = 로고가 없는 항공사가 있음.

import config from '../src/config.js'
import { TERMINAL_AIRLINE_CODES } from '../../frontend/src/features/terminal/terminalFlightSimulation.js'

const REST = 'http://openapi.airport.co.kr/service/rest'
const iataOf = (flightNumber) => String(flightNumber || '').slice(0, 2)

function serviceKey() {
  const key = config.api.kac_flight_key
  if (!key) throw new Error('KAC_FLIGHT_API_KEY missing')
  return key
}

/** 페이지를 끝까지 넘겨 스케줄 전량을 받는다. 국제 7만여 건, 국내 6만여 건. */
async function fetchSchedule(path) {
  const rows = []
  for (let page = 1; ; page += 1) {
    const url = `${REST}/FlightScheduleList/${path}?serviceKey=${serviceKey()}&numOfRows=5000&pageNo=${page}&_type=json`
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json())?.response?.body
    const items = [].concat(body?.items?.item || [])
    rows.push(...items)
    if (!items.length || rows.length >= (body?.totalCount || 0)) return rows
  }
}

async function fetchLive() {
  const url = `${REST}/FlightStatusList/getFlightStatusList?serviceKey=${serviceKey()}&numOfRows=5000&pageNo=1&_type=json`
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return [].concat((await response.json())?.response?.body?.items?.item || [])
}

const runsToday = (start, end, today) => new Date(start) <= today && today <= new Date(end)

/** IATA -> { 한글명, 어디서 나왔는지 } */
export function buildRoster({ international, domestic, live }, today = new Date()) {
  const roster = new Map()
  const note = (code, korean, source) => {
    if (!code) return
    const entry = roster.get(code) || { korean, sources: new Set() }
    entry.sources.add(source)
    roster.set(code, entry)
  }
  for (const row of international) {
    if (row.internationalIoType !== 'OUT') continue
    if (!runsToday(row.internationalStdate, row.internationalEddate, today)) continue
    note(iataOf(row.internationalNum), row.airlineKorean, '스케줄')
  }
  for (const row of domestic) {
    if (!runsToday(row.domesticStdate, row.domesticEddate, today)) continue
    note(iataOf(row.domesticNum), row.airlineKorean, '스케줄')
  }
  for (const row of live) {
    if (row.io !== 'O') continue
    note(iataOf(row.airFln), row.airlineKorean, '실시간')
  }
  return roster
}

const [international, domestic, live] = await Promise.all([
  fetchSchedule('getIflightScheduleList'),
  fetchSchedule('getDflightScheduleList'),
  fetchLive(),
])

const roster = buildRoster({ international, domestic, live })
const missing = []

console.log(`항공사 ${roster.size}곳\n`)
for (const [code, entry] of [...roster].sort()) {
  const known = TERMINAL_AIRLINE_CODES.has(code)
  if (!known) missing.push({ code, korean: entry.korean })
  console.log(`${code.padEnd(3)} ${String(entry.korean).padEnd(16)} ${[...entry.sources].join('+').padEnd(9)} ${known ? '' : '<-- 로고 없음'}`)
}

if (missing.length === 0) {
  console.log('\n로고가 빠진 항공사 없음.')
  process.exit(0)
}

console.log(`\n로고가 없는 항공사 ${missing.length}곳:`)
for (const item of missing) console.log(`  ${item.code}  ${item.korean}`)
console.log(`
로고를 구해 frontend/public/Symbols/airlines/에 넣고, 같은 파일의 AIRLINES 표에 줄을 추가한다.
정사각형 심볼만 쓴다 - 가로로 긴 글자 로고는 화면에서 읽히지 않는다.
표에 없는 항공사는 편명 두 글자가 동그라미로 나가므로, 당장 못 구해도 화면은 깨지지 않는다.`)
process.exit(1)
