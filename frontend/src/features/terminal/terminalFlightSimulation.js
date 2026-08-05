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
  /** 창에 걸린 편이 이보다 적으면 다음 편들로 채운다. 화면이 3칸이라 3편이다. */
  minimumFlights: Object.freeze({
    RKSS: 3,
    RKPC: 3,
    RKPK: 3,
    RKPU: 3,
    RKNY: 3,
    RKJY: 3,
    RKJB: 3,
  }),
})

// 편명 앞 두 글자(IATA)로 찾는 항공사 표기와 로고.
// 72x78 자리에 들어가므로 정사각형 심볼이 가장 잘 읽힌다. 심볼을 구하지 못한 곳은
// 가로 워드마크로 두었다(7C·TW·BX·ZE·MM·RF·XU) - 작게 나오지만 식별은 된다.
// XU·WE는 반납된 IATA 코드를 물려받아 외부 로고 출처가 옛 주인 것을 준다
// (XU=African Express, WE=Thai Smile). 반드시 리포의 SVG를 쓴다.
// 상표는 각 소유자의 것이며 항공편 식별 목적으로만 표시한다.
// 명단 출처: 한국공항공사 운항스케줄 + 실시간 운항정보 (scripts/audit-terminal-airlines.mjs)
const AIRLINES = Object.freeze({
  '3U': { airline: '사천항공', logo: '/Symbols/airlines/3U.png' },
  '7C': { airline: '제주항공', logo: '/Symbols/airlines/JJA.svg' },
  '9C': { airline: '춘추항공', logo: '/Symbols/airlines/9C.png' },
  AF: { airline: '에어프랑스', logo: '/Symbols/airlines/AF.png' },
  AI: { airline: '에어인디아', logo: '/Symbols/airlines/AI.png' },
  BR: { airline: '에바항공', logo: '/Symbols/airlines/BR.png' },
  BX: { airline: '에어부산', logo: '/Symbols/airlines/ABL.svg' },
  CA: { airline: '중국국제항공', logo: '/Symbols/airlines/CA.png' },
  CI: { airline: '중화항공', logo: '/Symbols/airlines/CI.png' },
  CX: { airline: '캐세이퍼시픽항공', logo: '/Symbols/airlines/CX.png' },
  CZ: { airline: '중국남방항공', logo: '/Symbols/airlines/CZ.svg' },
  DL: { airline: '델타항공', logo: '/Symbols/airlines/DL.png' },
  DR: { airline: '루일리항공', logo: '/Symbols/airlines/DR.png' },
  FM: { airline: '상해항공', logo: '/Symbols/airlines/FM.png' },
  GA: { airline: '가루다인도네시아', logo: '/Symbols/airlines/GA.png' },
  GJ: { airline: '룽에어', logo: '/Symbols/airlines/GJ.png' },
  HO: { airline: '준야오항공', logo: '/Symbols/airlines/HO.png' },
  IT: { airline: '타이거에어 타이완', logo: '/Symbols/airlines/IT.png' },
  JD: { airline: '북경수도항공', logo: '/Symbols/airlines/JD.png' },
  JL: { airline: '일본항공', logo: '/Symbols/airlines/JL.png' },
  JX: { airline: '스타럭스항공', logo: '/Symbols/airlines/JX.png' },
  KE: { airline: '대한항공', logo: '/Symbols/airlines/KAL-symbol.svg' },
  KL: { airline: '네덜란드항공', logo: '/Symbols/airlines/KL.png' },
  KN: { airline: '중국연합항공', logo: '/Symbols/airlines/KN.png' },
  LJ: { airline: '진에어', logo: '/Symbols/airlines/LJ-symbol.png' },
  MF: { airline: '하문항공', logo: '/Symbols/airlines/MF.png' },
  MM: { airline: '피치항공', logo: '/Symbols/airlines/MM.svg' },
  MU: { airline: '중국동방항공', logo: '/Symbols/airlines/MU.png' },
  NH: { airline: '전일본공수', logo: '/Symbols/airlines/NH.png' },
  NZ: { airline: '에어뉴질랜드', logo: '/Symbols/airlines/NZ.png' },
  OZ: { airline: '아시아나항공', logo: '/Symbols/airlines/AAR-symbol.svg' },
  PN: { airline: '서부항공', logo: '/Symbols/airlines/PN.png' },
  PR: { airline: '필리핀항공', logo: '/Symbols/airlines/PR.png' },
  QW: { airline: '칭다오항공', logo: '/Symbols/airlines/QW.png' },
  RF: { airline: '에어로케이', logo: '/Symbols/airlines/EOK.svg' },
  RS: { airline: '에어서울', logo: '/Symbols/airlines/RS.png' },
  SQ: { airline: '싱가포르항공', logo: '/Symbols/airlines/SQ.png' },
  TR: { airline: '스쿠트 항공', logo: '/Symbols/airlines/TR.png' },
  TW: { airline: '티웨이항공', logo: '/Symbols/airlines/TWB.svg' },
  UO: { airline: '홍콩익스프레스', logo: '/Symbols/airlines/UO.png' },
  VA: { airline: '버진오스트레일리아항공', logo: '/Symbols/airlines/VA.png' },
  VJ: { airline: '비엣젯항공', logo: '/Symbols/airlines/VJ.png' },
  VN: { airline: '베트남항공', logo: '/Symbols/airlines/VN.png' },
  VS: { airline: '버진아틀랜틱항공', logo: '/Symbols/airlines/VS.png' },
  WE: { airline: '파라타항공', logo: '/Symbols/airlines/WE-symbol.png' },
  XU: { airline: '섬에어', logo: '/Symbols/airlines/XUM.svg' },
  ZE: { airline: '이스타항공', logo: '/Symbols/airlines/ESR.svg' },
  ZH: { airline: '심천항공', logo: '/Symbols/airlines/ZH.png' },
})

// 감사 스크립트가 "이 코드는 로고가 있나"를 묻는 통로. 표 자체는 내보내지 않는다.
export const TERMINAL_AIRLINE_CODES = new Set(Object.keys(AIRLINES))

// 국적기 IATA 코드. airlines.js의 KOREAN_AIRLINES와 같은 명단인데, 그쪽은 ADS-B용 ICAO 3글자라
// 편명(IATA 2글자)으로는 조회할 수 없다. 여기 편명 기준으로 따로 둔다.
const KOREAN_FLIGHT_PREFIXES = Object.freeze(new Set(['KE', 'OZ', '7C', 'LJ', 'TW', 'ZE', 'BX', 'RS', 'YP', 'RF', '4H', 'WE']))

function isKoreanFlightNumber(flightNumber) {
  return KOREAN_FLIGHT_PREFIXES.has(String(flightNumber || '').match(/^[A-Z0-9]{2}/)?.[0] || '')
}

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

function displayFlight(raw, kstClock) {
  const destinationData = raw.destinationData || DESTINATIONS[raw.code]
  return {
    ...destinationData,
    // 화면은 localClock을 공백 기준 "날짜 시각"으로 쪼개 읽는다. 빈 값도, 공백이 든 값도 넘기면 안 된다.
    // 그래서 시차를 모르는 목적지에는 '확인 중'이 아니라 공백 없는 '미정'을 쓴다.
    localClock: localClockFrom(kstClock, destinationData.localZone) || `${kstClock.split(' ')[0]} 미정`,
    ...raw,
    forecast: forecastForArrival(destinationData.forecast, raw.arrivalKst),
    kstClock,
    arrivalSlot: 0,
    flightKey: `${raw.departureIcao}-${raw.flight}-${raw.departure}`,
  }
}

function forecastForArrival(forecast, arrivalKst) {
  if (!/^\d{2}:\d{2}$/.test(arrivalKst)) return forecast
  // 예보는 도착 시각부터 이어진다. 이전의 14시 하한은 fixture가 13:00 기준일 때만 맞던 값이다.
  const startHour = Number(arrivalKst.slice(0, 2))
  return forecast.map(([, icon, temperature], index) => [`${(startHour + index) % 24}시`, icon, temperature])
}

function timeMinutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

const UNKNOWN = '확인 중'

// 한국 시각 기준 시차(분). fixture가 쓰는 세 시간대만 담는다.
const ZONE_OFFSET_MINUTES = Object.freeze({ KST: 0, JST: 0, CST: -60 })

/** 목적지 현지 시각은 기준 한국 시각에서 계산한다. 고정값을 두면 데이터가 바뀌어도 낡은 시각이 남는다. */
function localClockFrom(kstClock, localZone) {
  const offset = ZONE_OFFSET_MINUTES[localZone]
  const match = /^(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2})$/.exec(kstClock)
  if (offset == null || !match) return null
  const [, month, day, hour, minute] = match.map(Number)
  const shifted = new Date(Date.UTC(2000, month - 1, day, hour, minute + offset))
  const shiftedHour = String(shifted.getUTCHours()).padStart(2, '0')
  return `${shifted.getUTCMonth() + 1}/${shifted.getUTCDate()} ${shiftedHour}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * 한국공항공사의 `arrivedKor`은 대개 `도시/공항`이라, 슬래시를 띄어쓰기로 바꾸면
 * `오사카 간사이`, `베이징 서우두`가 그대로 나온다.
 *
 * 그런데 슬래시가 늘 도시와 공항을 가르지는 않는다. 아래 목적지들은 같은 지명의
 * 옛 표기와 현행 표기여서, 이으면 `청도 칭다오` 같은 말이 만들어진다.
 *
 * 문자열만 보고 두 경우를 가르는 규칙은 없다. 초성 유사도를 재봤더니
 * `상하이/홍차오`(0.67)가 `청도/칭다오`(0.67)와 같은 점수로 나왔다. 한글 초성은
 * 가짓수가 적고 `ㅇ`이 흔해서, 관계없는 낱말끼리도 우연히 겹친다.
 * 이건 표기 지식이지 파싱할 수 있는 구조가 아니므로 목록으로 둔다.
 *
 * 목록에 없는 목적지는 `도시 공항`으로 이어 붙인다. 잘못 이으면 겹쳐 보일 뿐이지만,
 * 잘못 줄이면 도시명이 사라져 승객이 목적지를 못 찾는다. 안전한 쪽을 기본값으로 둔다.
 *
 * 새 노선이 열려 목록에 없는 목적지가 생기면
 * `node --env-file=.env backend/scripts/audit-terminal-destinations.mjs`가 이름과 함께 보고한다.
 */
const SAME_PLACE_ALTERNATE_SPELLING = Object.freeze(new Set([
  'HGH', // 항조우/항저우
  'KMJ', // 구마모도/구마모토
  'NKG', // 난징(남경)/난징
  'PQC', // 푸꼭(푸국)/푸꾸옥
  'SGN', // 호치민/호찌민
  'SHE', // 심양/선양
  'SIN', // 싱가폴/싱가포르
  'SZX', // 심천/선전
  'TAO', // 청도/칭다오
  'YNJ', // 연길/옌지
]))

/** 2026-08-03 전국 출발편에서 확인한 `도시/공항` 목적지. 감사 스크립트가 새 목적지를 가려내는 기준. */
export const REVIEWED_SLASH_DESTINATIONS = Object.freeze(new Set([
  'BKK', 'GMP', 'HGH', 'HIN', 'HND', 'KIX', 'KMJ', 'KPO', 'NGO', 'NKG',
  'NRT', 'PEK', 'PKX', 'PQC', 'PUS', 'PVG', 'RMQ', 'SGN', 'SHA', 'SHE',
  'SIN', 'SZX', 'TAG', 'TAO', 'TPE', 'TSA', 'UBN', 'YNJ',
]))

/** `베이징(서우두)/서우두` → { city: '베이징', displayName: '베이징 서우두' } */
export function destinationNameFromKac(rawName, iata) {
  const cleaned = String(rawName || '').replace(/\([^)]*\)/g, '').trim()
  const [city, airport] = cleaned.split('/').map((part) => part.trim())
  if (!city) return { city: iata || UNKNOWN, displayName: iata || UNKNOWN }
  if (!airport) return { city, displayName: city }

  if (SAME_PLACE_ALTERNATE_SPELLING.has(iata)) {
    const name = airport.length >= city.length ? airport : city
    return { city: name, displayName: name }
  }
  // `포항/포항경주`, `팡라오/보홀팡라오`처럼 한쪽이 다른 쪽을 품고 있으면 도시명을 두 번 쓰지 않는다.
  if (airport.includes(city)) return { city, displayName: airport }
  return { city, displayName: `${city} ${airport}` }
}

/**
 * 이름은 언제나 피드에서 만든다. 일부만 우리 표를 쓰면 같은 도시가 화면마다 다르게 적힌다.
 * 날씨 fixture는 9개 공항만 담고 있어서, 없는 곳은 비워 둔 채 내보낸다.
 * 실제 관측이 있으면 mergeTerminalLiveWeather가 뒤에서 덮어쓴다.
 */
function destinationFromFeed(row) {
  const { city, displayName } = destinationNameFromKac(row.destinationKorean, row.destinationIata)
  const known = DESTINATIONS[row.destinationIata]
  return {
    ...(known || {
      // 도착 시각이 있다는 건 한국공항공사가 그 공항의 도착 기록을 가졌다는 뜻, 곧 국내 공항이다.
      // 김해-인천처럼 국제선으로 분류되지만 목적지가 한국인 편도 여기서 걸러진다.
      localZone: row.arrivalKst || !row.international ? 'KST' : null,
      current: { icon: null, temp: null, feels: UNKNOWN, humidity: UNKNOWN, wind: UNKNOWN },
      forecast: [],
    }),
    city,
    displayName,
    airport: known?.airport || displayName,
    localClock: null,
  }
}

/** `/api/terminal-flights` 한 줄을 fixture와 똑같은 모양의 원본 항공편으로 바꾼다. */
/** 편명에서 항공사 이름과 로고를 찾는다. 공동운항이면 편명마다 다르다. */
function airlineOf(flightNumber, fallbackName) {
  const code = String(flightNumber || '').match(/^[A-Z0-9]{2}/)?.[0] || ''
  return { airline: fallbackName || '', ...AIRLINES[code] }
}

export function terminalFlightsFromFeed(rows = []) {
  return rows.filter((row) => row?.scheduled && row?.flight).map((row) => {
    const airlineCode = row.flight.match(/^[A-Z0-9]{2}/)?.[0] || ''
    // 공동운항이면 편명·항공사·로고가 한 벌씩이다. 화면이 번갈아 보여준다.
    // 국적기 편명이 섞여 있으면 그걸 맨 앞에 세운다. 승객 대부분이 그 편명으로 표를 샀다.
    // sort는 안정 정렬이라 국적기끼리, 외항사끼리는 받은 순서가 그대로 남는다.
    const codeshares = (row.codeshares?.length ? row.codeshares : [{ flight: row.flight, airlineEnglish: row.airlineEnglish, airlineKorean: row.airlineKorean }])
      .map((share) => ({ flight: share.flight, ...airlineOf(share.flight, share.airlineKorean || share.airlineEnglish) }))
      .sort((a, b) => Number(isKoreanFlightNumber(b.flight)) - Number(isKoreanFlightNumber(a.flight)))
    // departure는 예정 시각, revised는 변경된 시각. 화면은 revised를 크게, 예정을 취소선으로 보여준다.
    const revised = row.delayed && row.estimated ? row.estimated : null
    // 늦은 만큼(분)과 이전 탑승구는 화면이 쓰지 않는다. 지금 유효한 값 하나만 보여주고,
    // 바뀌었다는 사실은 상태 단어(`지연`, `탑승구 변경`)가 알린다.
    // const delayMinutes = revised ? (timeMinutes(revised) - timeMinutes(row.scheduled) + 1440) % 1440 : null
    return {
      departureIcao: row.departureIcao,
      code: row.destinationIata || UNKNOWN,
      destinationIcao: row.destinationIcao || null,
      flight: row.flight,
      departure: row.scheduled,
      revised,
      arrivalKst: row.arrivalKst || UNKNOWN,
      // 도착 시각을 모르는 국제선도 예보 칸은 고를 수 있다. 시각으로는 절대 표시하지 않는다.
      forecastAnchorKst: row.forecastAnchorKst || row.arrivalKst || null,
      arrival: row.arrivalKst || UNKNOWN,
      duration: row.arrivalKst ? durationBetween(revised || row.scheduled, row.arrivalKst) : UNKNOWN,
      gate: row.gate || UNKNOWN,
      status: row.status || '운항 예정',
      statusTone: row.delayed ? 'delay' : 'ok',
      airline: row.airlineKorean || row.airlineEnglish || '',
      ...AIRLINES[airlineCode],
      codeshares,
      destinationData: destinationFromFeed(row),
    }
  })
}

function selectTerminalSourceFlights(departureIcao, sourceFlights, referenceTime) {
  const referenceMinutes = timeMinutes(referenceTime)
  const windowMinutes = TERMINAL_SIMULATION_REFERENCE.windowMinutes[departureIcao] ?? 0
  const minimumFlights = TERMINAL_SIMULATION_REFERENCE.minimumFlights[departureIcao]
  const candidates = sourceFlights
    .filter((candidate) => candidate.departureIcao === departureIcao)
    .filter((candidate) => timeMinutes(candidate.departure) >= referenceMinutes)
    .sort((left, right) => timeMinutes(left.departure) - timeMinutes(right.departure))
  /**
   * 그날 운항이 시작되기 전에는 지금이 아니라 첫 출발편 시각을 기준으로 삼는다.
   * 새벽 0시에 김포를 지금 기준으로 보면 30분 창이 텅 비어 `운항 종료`가 뜨는데,
   * 실제로는 그날 편이 그대로 남아 있어 거짓말이 된다. 첫 편이 창 밖에 있으면
   * 그 첫 편에 창을 걸어, 아침에 뜰 편들을 미리 보여준다. 창 폭은 그대로 쓴다.
   */
  const firstMinutes = candidates.length ? timeMinutes(candidates[0].departure) : referenceMinutes
  const anchorMinutes = firstMinutes - referenceMinutes > windowMinutes ? firstMinutes : referenceMinutes
  const selected = candidates.filter((candidate) => timeMinutes(candidate.departure) - anchorMinutes <= windowMinutes)

  if (!minimumFlights || selected.length >= minimumFlights) return selected
  for (const candidate of candidates) {
    if (selected.length >= minimumFlights) break
    if (!selected.includes(candidate)) selected.push(candidate)
  }
  return selected.sort((left, right) => timeMinutes(left.departure) - timeMinutes(right.departure))
}

/**
 * 실제 운항 데이터가 있으면 flights/referenceTime/kstClock을 넘기고, 없으면 검증된 fixture로 돈다.
 * 선택 규칙(공항별 시간창·최소 편수·같은 날 소진)은 두 경우 모두 동일하다.
 */
export function buildTerminalSimulation(departureIcao, options = {}) {
  const {
    flights = FLIGHTS,
    referenceTime = TERMINAL_SIMULATION_REFERENCE.time,
    kstClock = `8/2 ${TERMINAL_SIMULATION_REFERENCE.time}`,
  } = options
  const grouped = new Map()
  const sourceFlights = selectTerminalSourceFlights(departureIcao, flights, referenceTime)
  for (const raw of sourceFlights) {
    if (!grouped.has(raw.code)) grouped.set(raw.code, [])
    grouped.get(raw.code).push(displayFlight(raw, kstClock))
  }

  const destinations = [...grouped.entries()]
    .map(([code, flights], priority) => ({ code, flights, priority }))
    .sort((left, right) => right.flights.length - left.flights.length || left.priority - right.priority)
  const frames = buildCompactFrames(destinations)
  return {
    departureIcao,
    kstClock,
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

/** 2안·3안의 한 프레임에 들어가는 항공편 줄 수. 자리 고정을 위해 화면도 이 값만큼 줄을 잡는다. */
export const DESTINATION_FRAME_CAPACITY = 5

/**
 * 2안·3안용 프레임. 한 프레임에 도시 하나와 그 도시로 가는 편 최대 다섯 편이 들어간다.
 *
 * `destinations`는 1안을 위해 편 수 순으로 정렬되어 오지만, 그 배열의 `priority`는
 * 정렬 전에 매겨진 출발 시각순 번호다. 여기서 그 번호로 되돌려 쓴다. 공유 정렬을 바꾸면
 * 1안의 프레임 묶기가 달라지므로 건드리지 않는다.
 *
 * 편이 여섯 편 이상인 도시는 같은 도시를 연달아 두 프레임으로 나눈다. 다른 도시 뒤로 흩어지면
 * 승객이 읽던 목록을 잃는다. 날씨는 그대로 두고 목록만 넘어가므로 시선도 편하다.
 */
export function buildDestinationFrames(destinations, capacity = DESTINATION_FRAME_CAPACITY) {
  if (!Array.isArray(destinations) || destinations.length === 0) return []

  const frames = []
  const ordered = [...destinations].sort((left, right) => left.priority - right.priority)
  ordered.forEach((destination, destinationIndex) => {
    const flights = destination.flights || []
    const pageCount = Math.max(1, Math.ceil(flights.length / capacity))
    for (let page = 0; page < pageCount; page += 1) {
      frames.push({
        ...destination,
        destinationIndex,
        flights: flights.slice(page * capacity, (page + 1) * capacity),
        page: page + 1,
        pageCount,
      })
    }
  })
  return frames
}

export function destinationFrameAt(frames, cursor) {
  const safeCursor = Math.max(0, Number(cursor) || 0)
  const frameCount = Math.max(1, frames.length)
  const frameIndex = frames.length ? safeCursor % frames.length : 0
  return { frameIndex, frameCount, frame: frames[frameIndex] || null }
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

/**
 * 화면에 걸어둘 편성을 고른다. 새 데이터가 들어와도 순환 한 바퀴가 끝나기 전에는 바꾸지 않는다.
 * 승객이 2/4 페이지를 읽는 중에 세 편이 통째로 바뀌면 읽던 항공편을 잃는다.
 *
 * 대신 최대 한 바퀴만큼 낡은 값이 보인다. 한 바퀴는 프레임당 9초라 대개 1분 안쪽이고,
 * 수집 주기(1분)보다 길지 않아 지연·탑승구 변경이 눈에 띄게 늦지는 않는다.
 */
export function nextDisplayedSimulation(current, next, frameCursor) {
  if (!current) return next
  // 출발 공항 전환은 사용자의 조작이라 한 바퀴를 기다리지 않는다.
  if (current.departureIcao !== next.departureIcao) return next
  // 프레임이 하나뿐이면 기다릴 경계가 없다. 이때는 편성 순서가 아니라 값만 바뀐다.
  return frameCursor % Math.max(1, current.frameCount) === 0 ? next : current
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
