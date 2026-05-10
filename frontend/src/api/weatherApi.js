import FALLBACK_AIRPORTS from '../../../shared/airports.js'

export const AIRPORT_NAME_KO = {
  RKSI: '인천국제공항',
  RKSS: '김포국제공항',
  RKPC: '제주국제공항',
  RKPK: '김해국제공항',
  RKJB: '무안국제공항',
  RKNY: '양양국제공항',
  RKPU: '울산공항',
  RKJY: '여수공항',
}

async function fetchJson(url, { optional = false } = {}) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
    return res.json()
  } catch (error) {
    if (optional) return null
    throw error
  }
}

function normalizeAirports(airports) {
  const source = Array.isArray(airports) && airports.length > 0 ? airports : FALLBACK_AIRPORTS
  return source
    .filter((a) => a.icao !== 'TST1')
    .map((a) => ({ ...a, nameKo: AIRPORT_NAME_KO[a.icao] || a.name || a.icao }))
}

export async function loadWeatherData() {
  const [
    airports, metar, taf, amos, warning,
    sigmet, airmet, lightning,
    echoMeta, satMeta, sigwxLow, sigwxFrontMeta, sigwxCloudMeta, airportInfo,
  ] = await Promise.all([
    fetchJson('/api/airports',        { optional: true }),
    fetchJson('/api/metar',           { optional: true }),
    fetchJson('/api/taf',             { optional: true }),
    fetchJson('/api/amos',            { optional: true }),
    fetchJson('/api/warning',         { optional: true }),
    fetchJson('/api/sigmet',          { optional: true }),
    fetchJson('/api/airmet',          { optional: true }),
    fetchJson('/api/lightning',       { optional: true }),
    fetchJson('/data/radar/echo_meta.json',     { optional: true }),
    fetchJson('/data/satellite/sat_meta.json',  { optional: true }),
    fetchJson('/api/sigwx-low',                 { optional: true }),
    fetchJson('/api/sigwx-front-meta',          { optional: true }),
    fetchJson('/api/sigwx-cloud-meta',          { optional: true }),
    fetchJson('/api/airport-info',              { optional: true }),
  ])

  return {
    airports: normalizeAirports(airports),
    metar,
    taf,
    amos,
    warning,
    sigmet,
    airmet,
    lightning,
    echoMeta,
    satMeta,
    sigwxLow,
    sigwxFrontMeta,
    sigwxCloudMeta,
    airportInfo,
  }
}
