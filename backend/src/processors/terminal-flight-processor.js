import config from '../config.js'
import store from '../store.js'

// 터미널 사이니지가 다루는 출발공항. 한국공항공사 API는 IATA로 답하므로 ICAO로 바꿔 저장한다.
const DEPARTURE_ICAO_BY_IATA = Object.freeze({
  GMP: 'RKSS',
  CJU: 'RKPC',
  USN: 'RKPU',
  YNY: 'RKNY',
  RSU: 'RKJY',
  MWX: 'RKJB',
  PUS: 'RKPK',
})

/**
 * 목적지 IATA -> ICAO. 화면이 목적지 날씨를 찾을 때 쓰는 유일한 연결고리다.
 * 예전에는 공항 이름을 맞춰봤는데, 한국공항공사는 `베이징 서우두`라 하고 공항 목록은
 * `베이징 수도`라고 해서 조용히 어긋났다. 코드로 이으면 표기가 달라도 안 깨진다.
 * 2026-08-03 실제 목적지 전수에서 만든 표이며, 새 노선이 생기면 감사 스크립트가 알려준다.
 */
const DESTINATION_ICAO_BY_IATA = Object.freeze({
  // 국내
  GMP: 'RKSS', CJU: 'RKPC', PUS: 'RKPK', ICN: 'RKSI', KWJ: 'RKJJ', USN: 'RKPU',
  HIN: 'RKPS', TAE: 'RKTN', CJJ: 'RKTU', KUV: 'RKJK', WJU: 'RKNW', RSU: 'RKJY',
  YNY: 'RKNY', MWX: 'RKJB', KPO: 'RKTH',
  // 일본
  HND: 'RJTT', NRT: 'RJAA', KIX: 'RJBB', FUK: 'RJFF', CTS: 'RJCC', NGO: 'RJGG',
  OKA: 'ROAH', KMJ: 'RJFT', MYJ: 'RJOM', FSZ: 'RJNS', KKJ: 'RJFR', HIJ: 'RJOA',
  // 중화권
  TPE: 'RCTP', TSA: 'RCSS', KHH: 'RCKH', RMQ: 'RCMQ', HKG: 'VHHH', MFM: 'VMMC',
  PVG: 'ZSPD', SHA: 'ZSSS', PEK: 'ZBAA', PKX: 'ZBAD', TAO: 'ZSQD', HGH: 'ZSHC',
  NKG: 'ZSNJ', SZX: 'ZGSZ', SHE: 'ZYTX', YNJ: 'ZYYJ', NGB: 'ZSNB',
  // 동남아·기타
  BKK: 'VTBS', SIN: 'WSSS', HAN: 'VVNB', SGN: 'VVTS', DAD: 'VVDN', CXR: 'VVCR',
  PQC: 'VVPQ', MNL: 'RPLL', CEB: 'RPVM', TAG: 'RPSP', DPS: 'WADD', UBN: 'ZMCK',
  ALA: 'UAAA', GUM: 'PGUM',
})

// rmkKor 실측값: 출발, 수속중, 탑승장 입장, 탑승중, 지연, 마감예정, 사전결항, (빈 값)
const DELAYED_STATUS = /지연|결항|취소/
// rmkKor의 '지연'은 실측 871편 중 4편뿐이라 신뢰하기 어렵다. 변경 시각(etd) 차이를 함께 본다.
// 몇 분 차이까지 지연으로 부를지는 현장에서 조정할 값이다.
const DELAY_THRESHOLD_MINUTES = 10

function clockMinutes(clock) {
  const [hour, minute] = clock.split(':').map(Number)
  return hour * 60 + minute
}

function addMinutes(clock, minutes) {
  const total = clockMinutes(clock) + minutes
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/**
 * 국제선 도착 무렵 예보를 고르기 위한 기준 시각. 노선 비행시간표가 있을 때만 만든다.
 * 표시용 도착 시각이 아니다 — 화면에 시각으로 적으면 안 된다.
 */
export function forecastAnchor(departureIcao, destinationIata, departureClock, durations = {}) {
  const minutes = durations[`${departureIcao}-${destinationIata}`]
  if (!Number.isFinite(minutes) || !departureClock) return null
  return addMinutes(departureClock, minutes)
}

function isDelayed(status, scheduled, estimated) {
  if (DELAYED_STATUS.test(status)) return true
  if (!estimated) return false
  return clockMinutes(estimated) - clockMinutes(scheduled) >= DELAY_THRESHOLD_MINUTES
}

function toClock(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return /^\d{4}$/.test(digits) ? `${digits.slice(0, 2)}:${digits.slice(2)}` : null
}

function parseItems(payload) {
  const items = payload?.response?.body?.items?.item
  if (Array.isArray(items)) return items
  if (items && typeof items === 'object') return [items]
  return []
}

async function fetchFlightRows(signal) {
  const serviceKey = config.api.kac_flight_key
  if (!serviceKey) throw new Error('KAC_FLIGHT_API_KEY missing')

  // serviceKey는 포털이 내려준 인코딩 형태 그대로 붙인다. URLSearchParams로 감싸면 이중 인코딩된다.
  const params = new URLSearchParams({ numOfRows: '5000', pageNo: '1', _type: 'json' })
  const url = `${config.api.kac_flight_url}?serviceKey=${serviceKey}&${params}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.api.timeout_ms)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(url, { signal: controller.signal })
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
    const payload = JSON.parse(text)
    const resultCode = payload?.response?.header?.resultCode
    if (resultCode && resultCode !== '00') {
      throw new Error(`KAC ${resultCode}: ${payload?.response?.header?.resultMsg || 'unknown'}`)
    }
    return parseItems(payload)
  } finally {
    clearTimeout(timer)
  }
}

function kstDateStamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`
}

/** `202608031710` -> `17:10` */
export function iiacClock(datetime) {
  const digits = String(datetime || '').replace(/\D/g, '')
  return digits.length >= 12 ? `${digits.slice(8, 10)}:${digits.slice(10, 12)}` : null
}

/**
 * 인천 도착 시각. 한국공항공사는 인천을 운영하지 않아 인천행 도착 기록이 거의 없다.
 * 편명으로 찾을 수 있게 표를 만들어 둔다. 변경 시각이 있으면 그쪽을 쓴다.
 */
export function incheonArrivalLookup(items = []) {
  const byFlight = new Map()
  for (const item of items) {
    const clock = iiacClock(item?.estimatedDatetime) || iiacClock(item?.scheduleDatetime)
    const flightId = String(item?.flightId || '').trim()
    if (clock && flightId) byFlight.set(flightId, clock)
  }
  return byFlight
}

/**
 * 인천 도착 정보를 지금 받아야 하는가. 인천행이 뜨지 않는 시간대에는 부르지 않는다.
 * 운항정보는 5분마다 돌지만 이 API는 그중 일부 시점에서만 함께 부른다.
 */
export function shouldFetchIncheonArrivals(now = new Date(), window = config.api.iiac_arrival_window) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const hour = kst.getUTCHours()
  if (hour < window.from_hour || hour > window.to_hour) return false
  return kst.getUTCMinutes() % window.every_minutes === 0
}

async function fetchIncheonArrivals(signal) {
  const serviceKey = config.api.kac_flight_key
  if (!serviceKey) return new Map()

  const params = new URLSearchParams({
    numOfRows: '2000', pageNo: '1', type: 'json', searchDate: kstDateStamp(),
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.api.timeout_ms)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(`${config.api.iiac_arrivals_url}?serviceKey=${serviceKey}&${params}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    return incheonArrivalLookup([].concat(payload?.response?.body?.items || []))
  } catch {
    // 인천만 못 채울 뿐 나머지 공항은 그대로 나가야 한다.
    return new Map()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 이 API는 출발편에 도착 시각을 주지 않는다. 전국을 한 번에 받으면 같은 편명이
 * 목적지 공항의 도착편(io=I)으로도 들어오므로, 편명+공항으로 이어 붙여 도착 시각을 얻는다.
 * 국제선은 도착지가 해외라 국내 데이터에 없고, 그때 도착 시각은 null로 남는다.
 */
function arrivalClockLookup(rows) {
  const arrivals = new Map()
  for (const row of rows) {
    if (row.io !== 'I') continue
    arrivals.set(`${row.airFln}@${row.airport}`, row)
  }
  return (departure) => {
    const arrival = arrivals.get(`${departure.airFln}@${departure.city}`)
    return arrival ? toClock(arrival.etd) || toClock(arrival.std) : null
  }
}

function normalizeDeparture(row, arrivalClockFor, previousGateFor = () => null) {
  const scheduled = toClock(row.std)
  if (!scheduled) return null

  const estimated = toClock(row.etd)
  const status = String(row.rmkKor || '').trim()
  const destinationIata = String(row.city || '').trim()
  const destinationIcao = DESTINATION_ICAO_BY_IATA[destinationIata] || null
  // 한국공항공사는 김해-인천을 국제선으로 분류한다. 목적지가 한국이면 국내선으로 본다.
  // 이 값이 현지 시각 표기와 예보 출처를 가르기 때문에 여기서 바로잡는다.
  const international = row.line === '국제' && !/^RK/.test(destinationIcao || '')
  return {
    departureIcao: DEPARTURE_ICAO_BY_IATA[row.airport],
    flight: String(row.airFln || '').trim(),
    airlineKorean: String(row.airlineKorean || '').trim() || null,
    airlineEnglish: String(row.airlineEnglish || '').trim() || null,
    destinationIata: destinationIata || null,
    destinationIcao,
    destinationKorean: String(row.arrivedKor || '').trim() || null,
    destinationEnglish: String(row.arrivedEng || '').trim() || null,
    scheduled,
    estimated: estimated && estimated !== scheduled ? estimated : null,
    arrivalKst: arrivalClockFor(row),
    forecastAnchorKst: arrivalClockFor(row)
      || forecastAnchor(DEPARTURE_ICAO_BY_IATA[row.airport], destinationIata, estimated || scheduled, config.terminal_route_durations),
    gate: String(row.gate || '').trim() || null,
    status: status || null,
    delayed: isDelayed(status, scheduled, estimated && estimated > scheduled ? estimated : null),
    international,
  }
}

const GATE_CHANGED_STATUS = '탑승구 변경'

function flightKey(departureIcao, flight, scheduled) {
  return `${departureIcao}|${flight}|${scheduled}`
}

/**
 * 바뀌기 전 탑승구를 찾아준다.
 *
 * 이 API는 현재 탑승구 하나만 준다. 이전 값은 우리가 직전 회차와 비교해서 알아내야 한다.
 * 상태가 `탑승구 변경`인 동안에만 들고 있다가, 그 상태가 풀리면 같이 내린다.
 *
 * 두 번 이상 바뀌어도(10 -> 14 -> 16) 맨 처음 탑승구를 유지한다. 승객이 처음 안내받은 것이
 * 그 값이고, 표를 들고 게이트를 찾는 사람에게 필요한 것은 직전 값이 아니라 처음 값이다.
 */
export function previousGateLookup(previousSnapshot) {
  const before = new Map()
  for (const flights of Object.values(previousSnapshot?.airports || {})) {
    for (const flight of flights) {
      before.set(flightKey(flight.departureIcao, flight.flight, flight.scheduled), flight)
    }
  }

  return (row) => {
    if (row.status !== GATE_CHANGED_STATUS) return null
    const past = before.get(flightKey(row.departureIcao, row.flight, row.scheduled))
    if (!past) return null
    // 이미 잡아둔 최초 탑승구가 있으면 그대로 이어간다.
    if (past.previousGate) return past.previousGate
    if (past.gate && row.gate && past.gate !== row.gate) return past.gate
    return null
  }
}

/** 직전 스냅샷에서 인천 도착 시각을 되살린다. 인천을 건너뛴 회차에서 쓴다. */
function previousIncheonArrivals(previous) {
  const byFlight = new Map()
  for (const flights of Object.values(previous?.airports || {})) {
    for (const flight of flights) {
      if (flight?.destinationIata === 'ICN' && flight.arrivalKst) byFlight.set(flight.flight, flight.arrivalKst)
    }
  }
  return byFlight
}

/**
 * 공동운항편을 한 편으로 묶는다.
 *
 * 한 탑승구에는 한 대만 댈 수 있으므로, 같은 공항에서 같은 시각에 같은 탑승구로 같은 곳에 가는
 * 편들은 같은 비행기다. 2026-08-03 전국 실측에서 이 규칙으로 110개 묶음이 나왔고,
 * 한 묶음에 같은 항공사가 두 번 들어간 경우는 0건이었다(오탐 신호).
 *
 * 탑승구가 비어 있으면 묶지 않는다. 빈칸끼리 묶으면 상관없는 편이 한 덩어리가 된다.
 *
 * 한국공항공사 자료에는 어느 편이 실제 운항사인지 표시가 없다. 그래서 대표를 고르지 않고
 * 편명 순으로 정렬해 모두 `codeshares`에 담는다. 화면이 번갈아 보여준다.
 */
export function groupCodeshares(flights) {
  const groups = new Map()
  const order = []
  for (const flight of flights) {
    const gate = String(flight.gate || '').trim()
    const key = gate ? `${flight.destinationIata}|${flight.scheduled}|${gate}` : null
    if (!key) { order.push({ key: null, flights: [flight] }); continue }
    if (!groups.has(key)) {
      const entry = { key, flights: [] }
      groups.set(key, entry)
      order.push(entry)
    }
    groups.get(key).flights.push(flight)
  }

  return order.map(({ flights: members }) => {
    const sorted = [...members].sort((left, right) => left.flight.localeCompare(right.flight))
    return {
      ...sorted[0],
      codeshares: sorted.map((member) => ({
        flight: member.flight,
        airlineKorean: member.airlineKorean,
        airlineEnglish: member.airlineEnglish,
      })),
    }
  })
}

async function process({ signal } = {}) {
  const [rows, incheonArrivals] = await Promise.all([
    fetchFlightRows(signal),
    shouldFetchIncheonArrivals() ? fetchIncheonArrivals(signal) : Promise.resolve(null),
  ])
  const kacArrivalClockFor = arrivalClockLookup(rows)
  // 인천행은 인천공항공사 값을 먼저 쓴다. 그 공항을 운영하는 쪽이 정확하다.
  // 이번 회차에 인천을 안 불렀으면 직전 값을 그대로 쓴다. 인천행만 잠깐 비는 것보다 낫다.
  const previousSnapshot = store.getCached('terminal_flights')
  // 이전 탑승구는 더 이상 화면에 쓰지 않는다. 공항공사 API도 값 하나에 `탑승구 변경`이라는
  // 상태 단어를 따로 주는 구조이고, 화면은 그 단어로 바뀐 사실을 알린다.
  // 필요해지면 아래 두 줄을 되살리면 된다. previousGateLookup은 그대로 두고 테스트도 유지한다.
  // const previousGateFor = previousGateLookup(previousSnapshot)
  const previousIncheon = incheonArrivals || previousIncheonArrivals(previousSnapshot)
  const arrivalClockFor = (row) => (row.city === 'ICN' && previousIncheon.get(String(row.airFln || '').trim()))
    || kacArrivalClockFor(row)

  const airports = Object.fromEntries(Object.values(DEPARTURE_ICAO_BY_IATA).map((icao) => [icao, []]))
  for (const row of rows) {
    if (row.io !== 'O' || !DEPARTURE_ICAO_BY_IATA[row.airport]) continue
    const flight = normalizeDeparture(row, arrivalClockFor)
    if (!flight?.flight) continue
    // flight.previousGate = previousGateFor(flight)
    airports[flight.departureIcao].push(flight)
  }
  for (const [icao, flights] of Object.entries(airports)) {
    flights.sort((left, right) => left.scheduled.localeCompare(right.scheduled))
    airports[icao] = groupCodeshares(flights)
  }

  const result = {
    type: 'terminal_flights',
    fetched_at: new Date().toISOString(),
    source: '한국공항공사_실시간 항공기 운항정보 조회',
    airports,
  }
  const saveResult = store.save('terminal_flights', result)
  return {
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    counts: Object.fromEntries(Object.entries(airports).map(([icao, flights]) => [icao, flights.length])),
    incheonArrivals: incheonArrivals ? incheonArrivals.size : `직전값 ${previousIncheon.size}`,
  }
}

export { process, DEPARTURE_ICAO_BY_IATA, DESTINATION_ICAO_BY_IATA, normalizeDeparture, arrivalClockLookup, toClock, isDelayed }
export default { process }
