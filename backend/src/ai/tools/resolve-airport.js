import airports from '../../../../shared/airports.js'

const aliases = new Map([
  ['부산', ['RKPK']],
  ['포항', ['RKTH']],
  ['경주', ['RKTH']],
  ['서울', ['RKSI', 'RKSS']],
])

function normalize(value) {
  return String(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function stripKoreanAirportSuffix(value) {
  return value.replace(/(?:국제공항|공항)$/, '')
}

const airportsByIcao = new Map(
  airports.map((airport) => [airport.icao, airport]),
)

export function resolveAirport(query) {
  const key = stripKoreanAirportSuffix(normalize(query))
  const matches = aliases.get(key) ?? airports
    .filter((airport) => [
      airport.icao,
      airport.name,
      airport.nameKo,
      stripKoreanAirportSuffix(airport.nameKo),
    ].some((name) => stripKoreanAirportSuffix(normalize(name)) === key))
    .map((airport) => airport.icao)

  if (matches.length === 0) {
    return {
      ok: false,
      code: 'AIRPORT_NOT_FOUND',
      candidates: [],
    }
  }

  const candidates = [...new Set(matches)]
    .sort()
    .map((icao) => ({
      icao,
      nameKo: airportsByIcao.get(icao).nameKo,
    }))

  if (candidates.length === 1) {
    return {
      ok: true,
      airport: airportsByIcao.get(candidates[0].icao),
    }
  }

  return {
    ok: false,
    code: 'AMBIGUOUS_AIRPORT',
    candidates,
  }
}

export function airportForIcao(icao) {
  return airportsByIcao.get(icao) ?? null
}
