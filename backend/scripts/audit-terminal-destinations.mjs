#!/usr/bin/env node
// 한국공항공사 실시간 운항정보의 목적지 표기를 훑어, 터미널 화면이 만들 이름을 보여준다.
//
// `arrivedKor`의 슬래시는 대개 도시와 공항을 가르지만(`오사카/간사이`), 같은 지명의
// 옛 표기와 현행 표기일 때도 있다(`청도/칭다오`). 둘을 문자열만으로 가르는 규칙은 없어서
// 후자를 목록으로 관리한다. 그래서 노선이 새로 열리면 사람이 한 번 봐야 한다.
//
//   node --env-file=.env backend/scripts/audit-terminal-destinations.mjs
//
// 종료 코드 1 = 아직 확인하지 않은 목적지가 있음.

import config from '../src/config.js'
import {
  REVIEWED_SLASH_DESTINATIONS,
  destinationNameFromKac,
} from '../../frontend/src/features/terminal/terminalFlightSimulation.js'

async function fetchDestinations() {
  const serviceKey = config.api.kac_flight_key
  if (!serviceKey) throw new Error('KAC_FLIGHT_API_KEY missing')
  const url = `${config.api.kac_flight_url}?serviceKey=${serviceKey}&numOfRows=5000&pageNo=1&_type=json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const items = (await response.json())?.response?.body?.items?.item || []

  const destinations = new Map()
  for (const item of items) {
    if (item.io === 'O' && item.city) destinations.set(item.city, item.arrivedKor)
  }
  return [...destinations.entries()].sort()
}

const destinations = await fetchDestinations()
const unreviewed = []

console.log(`목적지 ${destinations.length}곳\n`)
for (const [iata, raw] of destinations) {
  const { displayName } = destinationNameFromKac(raw, iata)
  const hasSlash = String(raw).includes('/')
  const isNew = hasSlash && !REVIEWED_SLASH_DESTINATIONS.has(iata)
  if (isNew) unreviewed.push({ iata, raw, displayName })
  console.log(`${iata}  ${String(raw).padEnd(22)} -> ${displayName}${isNew ? '   <-- 확인 필요' : ''}`)
}

if (unreviewed.length === 0) {
  console.log('\n확인이 필요한 새 목적지 없음.')
  process.exit(0)
}

console.log(`\n아직 확인하지 않은 목적지 ${unreviewed.length}곳:`)
for (const item of unreviewed) {
  console.log(`  ${item.iata}  ${item.raw}  ->  현재 표시: ${item.displayName}`)
}
console.log(`
슬래시 앞뒤가 도시와 공항이면 지금 표시가 맞다. REVIEWED_SLASH_DESTINATIONS에 IATA만 추가한다.
같은 곳의 두 표기라면 SAME_PLACE_ALTERNATE_SPELLING에도 추가한다.
둘 다 frontend/src/features/terminal/terminalFlightSimulation.js에 있다.`)
process.exit(1)
