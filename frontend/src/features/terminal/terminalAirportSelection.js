export const TERMINAL_DEPARTURE_ICAOS = Object.freeze([
  'RKSS', // 김포
  'RKPC', // 제주
  'RKPU', // 울산
  'RKNY', // 양양
  'RKJY', // 여수
  'RKJB', // 무안
  'RKPK', // 김해
])

export function departureAirportFromPathname(pathname = '') {
  const match = /^\/terminal\/([a-z0-9]{4})\/?$/i.exec(pathname)
  return match ? match[1].toUpperCase() : null
}

export function selectTerminalDepartureAirport(airports = [], requestedIcao) {
  const byIcao = new Map((Array.isArray(airports) ? airports : []).map((airport) => [airport.icao, airport]))
  const options = TERMINAL_DEPARTURE_ICAOS.map((icao) => byIcao.get(icao)).filter(Boolean)
  const selected = options.find((airport) => airport.icao === requestedIcao) || options[0] || null
  return { options, selected }
}
