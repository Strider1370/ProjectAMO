import assert from 'node:assert/strict'
import test from 'node:test'
import config from '../src/config.js'
import { arrivalClockLookup, forecastAnchor, iiacClock, incheonArrivalLookup, groupCodeshares, isDelayed, normalizeDeparture, previousGateLookup, shouldFetchIncheonArrivals, toClock } from '../src/processors/terminal-flight-processor.js'

// 2026-08-03 한국공항공사 실시간 운항정보 실제 응답 형태를 그대로 줄인 것.
const DEPARTURE = {
  airFln: 'WE6501', airlineKorean: '파라타항공', airlineEnglish: 'PARATA AIR',
  airport: 'GMP', city: 'CJU', arrivedKor: '제주', arrivedEng: 'JEJU',
  io: 'O', line: '국내', std: '0600', etd: '0636', gate: '13', rmkKor: '출발',
}
const ARRIVAL_AT_DESTINATION = { airFln: 'WE6501', airport: 'CJU', io: 'I', std: '0715', etd: '0727' }

test('toClock turns KAC HHMM into HH:MM and rejects junk', () => {
  assert.equal(toClock('0600'), '06:00')
  assert.equal(toClock('1835'), '18:35')
  assert.equal(toClock(''), null)
  assert.equal(toClock('60'), null)
})

test('arrival time comes from the same flight number arriving at the destination airport', () => {
  const lookup = arrivalClockLookup([DEPARTURE, ARRIVAL_AT_DESTINATION])
  assert.equal(lookup(DEPARTURE), '07:27')
})

test('a destination outside the domestic feed leaves the arrival time unknown', () => {
  // 국제선은 도착지가 해외라 국내 응답에 도착편이 없다. 지어내지 않고 null로 남긴다.
  const international = { ...DEPARTURE, city: 'KIX', arrivedKor: '오사카', line: '국제' }
  const lookup = arrivalClockLookup([international, ARRIVAL_AT_DESTINATION])
  assert.equal(lookup(international), null)
})

test('normalizeDeparture maps the KAC row onto the terminal flight shape', () => {
  const lookup = arrivalClockLookup([DEPARTURE, ARRIVAL_AT_DESTINATION])
  assert.deepEqual(normalizeDeparture(DEPARTURE, lookup), {
    departureIcao: 'RKSS',
    flight: 'WE6501',
    airlineKorean: '파라타항공',
    airlineEnglish: 'PARATA AIR',
    destinationIata: 'CJU',
    destinationIcao: 'RKPC',
    destinationKorean: '제주',
    destinationEnglish: 'JEJU',
    scheduled: '06:00',
    estimated: '06:36',
    arrivalKst: '07:27',
    forecastAnchorKst: '07:27',
    gate: '13',
    status: '출발',
    delayed: true,
    international: false,
  })
})

test('a row without a scheduled time is dropped rather than shown blank', () => {
  assert.equal(normalizeDeparture({ ...DEPARTURE, std: '' }, () => null), null)
})

test('delay needs an explicit status or a meaningful time change', () => {
  assert.equal(isDelayed('지연', '06:00', null), true)
  assert.equal(isDelayed('사전결항', '06:00', null), true)
  assert.equal(isDelayed('수속중', '06:00', null), false)
  assert.equal(isDelayed('수속중', '06:00', '06:03'), false, '3분 차이는 지연이 아니다')
  assert.equal(isDelayed('수속중', '06:00', '06:10'), true)
  assert.equal(isDelayed('출발', '23:55', '00:05'), false, '자정을 넘기는 값은 지연으로 오판하지 않는다')
})

test('국제선 도착 무렵 기준 시각은 노선 비행시간표가 있을 때만 만든다', () => {
  const durations = { 'RKSS-HND': 125, 'RKPK-KIX': 90 }
  assert.equal(forecastAnchor('RKSS', 'HND', '14:00', durations), '16:05')
  assert.equal(forecastAnchor('RKPK', 'KIX', '23:40', durations), '01:10', '자정을 넘겨도 시각이 이어진다')

  // 표에 없는 노선은 지어내지 않는다. 그 편은 예보 없이 나간다.
  assert.equal(forecastAnchor('RKSS', 'ZZZ', '14:00', durations), null)
  assert.equal(forecastAnchor('RKSS', 'HND', '14:00', {}), null)
  assert.equal(forecastAnchor('RKSS', 'HND', null, durations), null)
})

test('비행시간표에 없는 노선은 예보 기준 시각을 만들지 않는다', () => {
  // 표에 있는 노선은 켜지고,
  const known = normalizeDeparture({ ...DEPARTURE, city: 'KIX', arrivedKor: '오사카', line: '국제' }, () => null)
  assert.equal(known.arrivalKst, null, '국제선은 도착 시각을 모른다')
  // 변경 시각(06:36)이 있으면 그쪽을 기준으로 삼는다. 지연되면 도착도 밀리기 때문이다.
  assert.equal(known.forecastAnchorKst, '08:00', '변경 출발 06:36 + 김포-간사이 84분')

  // 없는 노선은 예보 없이 나간다. 지어낸 값이 화면에 오르지 않는다.
  const unknown = normalizeDeparture({ ...DEPARTURE, city: 'ZZZ', arrivedKor: '어딘가', line: '국제' }, () => null)
  assert.equal(unknown.forecastAnchorKst, null)
})

// --- 인천 도착 시각 (인천국제공항공사) ---

test('iiacClock: 12자리 일시에서 시각만 뽑는다', () => {
  assert.equal(iiacClock('202608031710'), '17:10')
  assert.equal(iiacClock('202607310042'), '00:42')
  assert.equal(iiacClock(''), null)
  assert.equal(iiacClock('20260803'), null, '날짜만 있으면 시각을 지어내지 않는다')
})

test('인천 도착표는 변경 시각을 먼저 쓴다', () => {
  // 2026-08-03 인천공항공사 실제 응답 형태. 지연되면 estimatedDatetime이 실제 도착에 가깝다.
  const lookup = incheonArrivalLookup([
    { flightId: 'KE1402', scheduleDatetime: '202608030810', estimatedDatetime: '202608030800' },
    { flightId: 'OZ9784', scheduleDatetime: '202608030910', estimatedDatetime: null },
    { flightId: '', scheduleDatetime: '202608030910', estimatedDatetime: '202608030858' },
  ])
  assert.equal(lookup.get('KE1402'), '08:00', '변경 시각 우선')
  assert.equal(lookup.get('OZ9784'), '09:10', '변경이 없으면 예정 시각')
  assert.equal(lookup.size, 2, '편명 없는 줄은 버린다')
})

test('수집 주기는 운항시간대만 돌고 한국공항공사 일일 한도 안에 든다', () => {
  const { schedule } = config
  assert.equal(schedule.terminal_flight_interval, '*/1 4-23 * * *')
  assert.equal(schedule.overseas_forecast_interval, '25 4-23 * * *')

  // 1분 x 20시간 = 1,200회. 한국공항공사 개발계정은 일 5,000회다.
  const [minute, hours] = schedule.terminal_flight_interval.split(' ')
  const [from, to] = hours.split('-').map(Number)
  const runsPerDay = (to - from + 1) * (60 / Number(minute.slice(2)))
  assert.equal(runsPerDay, 1200)
  assert.ok(runsPerDay < 5000, `일 ${runsPerDay}회는 한국공항공사 5,000회 한도를 넘는다`)
})

test('운항정보 주기를 당겨도 인천 호출 수는 그대로다', () => {
  // 인천은 별도 창으로 막혀 있다. 이 분리가 깨지면 500회 한도를 바로 넘긴다.
  const window = config.api.iiac_arrival_window
  let calls = 0
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 1) {
      if (shouldFetchIncheonArrivals(new Date(Date.UTC(2026, 7, 3, hour - 9, minute)), window)) calls += 1
    }
  }
  assert.equal(calls, 84, '1분마다 물어봐도 인천은 하루 84회만 열린다')
  assert.ok(calls < 500)
})

test('인천 도착 조회는 인천행이 뜨는 시간대에만, 그중에서도 10분 간격으로 부른다', () => {
  const kst = (hour, minute) => new Date(Date.UTC(2026, 7, 3, hour - 9, minute))
  const window = { from_hour: 6, to_hour: 19, every_minutes: 10 }

  assert.equal(shouldFetchIncheonArrivals(kst(7, 0), window), true)
  assert.equal(shouldFetchIncheonArrivals(kst(7, 10), window), true)
  assert.equal(shouldFetchIncheonArrivals(kst(7, 5), window), false, '5분 회차는 건너뛴다')
  assert.equal(shouldFetchIncheonArrivals(kst(5, 0), window), false, '인천행 첫 편(07:00) 전')
  assert.equal(shouldFetchIncheonArrivals(kst(20, 0), window), false, '인천행 막 도착(17:40) 후')
  assert.equal(shouldFetchIncheonArrivals(kst(19, 50), window), true, '경계 안쪽은 부른다')

  // 하루 84회. 인천공항공사 일 500회 한도 안에 넉넉히 든다.
  const runsPerDay = (window.to_hour - window.from_hour + 1) * (60 / window.every_minutes)
  assert.equal(runsPerDay, 84)
  assert.ok(runsPerDay < 500)
})

// --- 탑승구 변경 추적 ---

const snapshotOf = (flight) => ({ airports: { RKSS: [flight] } })
const GATE_FLIGHT = { departureIcao: 'RKSS', flight: 'OZ8981', scheduled: '17:25' }

test('탑승구가 바뀌면 직전 회차의 번호를 찾아낸다', () => {
  // 이 API는 현재 탑승구만 준다. 이전 값은 우리가 직전 스냅샷과 비교해야 안다.
  const lookup = previousGateLookup(snapshotOf({ ...GATE_FLIGHT, gate: '10', status: '수속중', previousGate: null }))
  assert.equal(lookup({ ...GATE_FLIGHT, gate: '16', status: '탑승구 변경' }), '10')
})

test('탑승구 변경 상태가 아니면 이전 번호를 붙이지 않는다', () => {
  const lookup = previousGateLookup(snapshotOf({ ...GATE_FLIGHT, gate: '10', status: '탑승구 변경', previousGate: '10' }))
  assert.equal(lookup({ ...GATE_FLIGHT, gate: '16', status: '탑승중' }), null, '상태가 풀리면 같이 내린다')
  assert.equal(lookup({ ...GATE_FLIGHT, gate: '16', status: null }), null)
})

test('두 번 이상 바뀌어도 맨 처음 탑승구를 유지한다', () => {
  // 10 -> 14 -> 16. 승객이 처음 안내받은 것은 10이라 그 값을 들고 있어야 한다.
  const afterFirst = previousGateLookup(snapshotOf({ ...GATE_FLIGHT, gate: '14', status: '탑승구 변경', previousGate: '10' }))
  assert.equal(afterFirst({ ...GATE_FLIGHT, gate: '16', status: '탑승구 변경' }), '10')

  // 다시 또 바뀌어도 마찬가지다.
  const afterSecond = previousGateLookup(snapshotOf({ ...GATE_FLIGHT, gate: '16', status: '탑승구 변경', previousGate: '10' }))
  assert.equal(afterSecond({ ...GATE_FLIGHT, gate: '18', status: '탑승구 변경' }), '10')
})

test('비교할 직전 회차가 없으면 지어내지 않는다', () => {
  // 서버를 막 켠 직후. 이전 번호를 모르면서 아무 값이나 보여주면 승객이 헛걸음한다.
  assert.equal(previousGateLookup(null)({ ...GATE_FLIGHT, gate: '16', status: '탑승구 변경' }), null)
  assert.equal(previousGateLookup({ airports: {} })({ ...GATE_FLIGHT, gate: '16', status: '탑승구 변경' }), null)
})

test('상태만 바뀌고 번호가 그대로면 표시하지 않는다', () => {
  const lookup = previousGateLookup(snapshotOf({ ...GATE_FLIGHT, gate: '16', status: '수속중', previousGate: null }))
  assert.equal(lookup({ ...GATE_FLIGHT, gate: '16', status: '탑승구 변경' }), null)
})

test('편이 달라지면 남의 탑승구를 물려받지 않는다', () => {
  const lookup = previousGateLookup(snapshotOf({ ...GATE_FLIGHT, gate: '10', status: '수속중', previousGate: null }))
  assert.equal(lookup({ ...GATE_FLIGHT, flight: 'KE1177', gate: '16', status: '탑승구 변경' }), null, '다른 편명')
  assert.equal(lookup({ ...GATE_FLIGHT, scheduled: '19:25', gate: '16', status: '탑승구 변경' }), null, '다음 날 같은 편명')
})

// --- 공동운항 묶기 ---

const gateFlight = (flight, over = {}) => ({
  departureIcao: 'RKPK', flight, destinationIata: 'CJU', scheduled: '20:00', gate: '6',
  airlineKorean: '항공사', airlineEnglish: 'AIRLINE', ...over,
})

test('같은 시각·같은 탑승구·같은 목적지면 한 편으로 묶는다', () => {
  // 한 탑승구에 한 대만 댈 수 있으니 같은 비행기다.
  const grouped = groupCodeshares([gateFlight('BX8827'), gateFlight('OZ8827')])
  assert.equal(grouped.length, 1)
  assert.deepEqual(grouped[0].codeshares.map((c) => c.flight), ['BX8827', 'OZ8827'])
})

test('탑승구가 다르면 묶지 않는다', () => {
  // 김포-제주처럼 편수가 많은 노선은 같은 분에 두 대가 뜬다. 탑승구가 그걸 가른다.
  const grouped = groupCodeshares([gateFlight('WE6501', { gate: '13' }), gateFlight('RS901', { gate: '4' })])
  assert.equal(grouped.length, 2)
})

test('목적지나 시각이 다르면 묶지 않는다', () => {
  assert.equal(groupCodeshares([gateFlight('A1'), gateFlight('B1', { destinationIata: 'GMP' })]).length, 2)
  assert.equal(groupCodeshares([gateFlight('A1'), gateFlight('B1', { scheduled: '20:05' })]).length, 2)
})

test('탑승구가 비어 있으면 묶지 않는다', () => {
  // 빈칸끼리 묶으면 상관없는 편이 한 덩어리가 된다.
  const grouped = groupCodeshares([gateFlight('A1', { gate: null }), gateFlight('B1', { gate: '' })])
  assert.equal(grouped.length, 2)
  assert.deepEqual(grouped.map((f) => f.codeshares.length), [1, 1])
})

test('묶은 편은 편명 순으로 정렬하고 첫 편의 정보를 유지한다', () => {
  // 운항사 표시가 자료에 없어서 대표를 고를 수 없다. 순서를 고정해 화면이 흔들리지 않게 한다.
  const grouped = groupCodeshares([gateFlight('OZ9782'), gateFlight('KE1402'), gateFlight('AF7900')])
  assert.deepEqual(grouped[0].codeshares.map((c) => c.flight), ['AF7900', 'KE1402', 'OZ9782'])
  assert.equal(grouped[0].flight, 'AF7900')
  assert.equal(grouped[0].scheduled, '20:00')
})

test('공동운항이 아닌 편도 자기 편명 하나를 담는다', () => {
  const grouped = groupCodeshares([gateFlight('KE1113')])
  assert.deepEqual(grouped[0].codeshares.map((c) => c.flight), ['KE1113'])
})
