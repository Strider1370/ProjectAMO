import FALLBACK_AIRPORTS from '../../../shared/airports.js'

export const AIRPORT_NAME_KO = {
  RKSI: 'Incheon International Airport',
  RKSS: 'Gimpo International Airport',
  RKPC: 'Jeju International Airport',
  RKPK: 'Gimhae International Airport',
  RKJB: 'Muan International Airport',
  RKNY: 'Yangyang International Airport',
  RKPU: 'Ulsan Airport',
  RKJY: 'Yeosu Airport',
}

async function fetchJson(url, { optional = false } = {}) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} ??HTTP ${res.status}`)
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

function buildHashEntry(payload) {
  const hash = payload?.content_hash
  return hash ? { hash } : null
}

export function buildSnapshotMetaFromData(data = {}) {
  return {
    metar: buildHashEntry(data.metar),
    taf: buildHashEntry(data.taf),
    warning: buildHashEntry(data.warning),
    sigmet: buildHashEntry(data.sigmet),
    airmet: buildHashEntry(data.airmet),
    sigwxLow: buildHashEntry(data.sigwxLow),
    amos: buildHashEntry(data.amos),
    lightning: buildHashEntry(data.lightning),
    adsb: buildHashEntry(data.adsb),
    groundForecast: buildHashEntry(data.groundForecast),
    ground_forecast: buildHashEntry(data.groundForecast),
    groundOverview: buildHashEntry(data.groundOverview),
    ground_overview: buildHashEntry(data.groundOverview),
    environment: buildHashEntry(data.environment),
    airportInfo: buildHashEntry(data.airportInfo),
    echoMeta: data.echoMeta?.tm ? { tm: data.echoMeta.tm } : null,
    satMeta: data.satMeta?.tm ? { tm: data.satMeta.tm } : null,
    sigwxFrontMeta: buildOverlayMetaEntry(data.sigwxFrontMeta),
    sigwxCloudMeta: buildOverlayMetaEntry(data.sigwxCloudMeta),
  }
}

function buildOverlayMetaEntry(meta) {
  if (!meta) return null
  return {
    tmfc: meta.tmfc || meta.latest?.tmfc || null,
    source_hash: meta.source_hash || null,
    updated_at: meta.updated_at || null,
    render_version: meta.render_version || null,
  }
}

export async function loadWeatherData() {
  const [
    airports, metar, taf, amos, warning,
    sigmet, airmet, lightning,
    echoMeta, satMeta, sigwxLow, sigwxLowHistory, sigwxFrontMeta, sigwxCloudMeta,
    adsb, groundForecast, groundOverview, environment, airportInfo,
  ] = await Promise.all([
    fetchJson('/api/airports', { optional: true }),
    fetchJson('/api/metar', { optional: true }),
    fetchJson('/api/taf', { optional: true }),
    fetchJson('/api/amos', { optional: true }),
    fetchJson('/api/warning', { optional: true }),
    fetchJson('/api/sigmet', { optional: true }),
    fetchJson('/api/airmet', { optional: true }),
    fetchJson('/api/lightning', { optional: true }),
    fetchJson('/data/radar/echo_meta.json', { optional: true }),
    fetchJson('/data/satellite/sat_meta.json', { optional: true }),
    fetchJson('/api/sigwx-low', { optional: true }),
    fetchJson('/api/sigwx-low-history', { optional: true }),
    fetchJson('/api/sigwx-front-meta', { optional: true }),
    fetchJson('/api/sigwx-cloud-meta', { optional: true }),
    fetchJson('/api/adsb', { optional: true }),
    fetchJson('/api/ground-forecast', { optional: true }),
    fetchJson('/api/ground-overview', { optional: true }),
    fetchJson('/api/environment', { optional: true }),
    fetchJson('/api/airport-info', { optional: true }),
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
    sigwxLowHistory,
    sigwxFrontMeta,
    sigwxCloudMeta,
    adsb,
    groundForecast,
    groundOverview,
    environment,
    airportInfo,
  }
}

export async function fetchSnapshotMeta() {
  return fetchJson('/api/snapshot-meta', { optional: true })
}

export async function fetchSigwxFrontMeta(tmfc) {
  if (!tmfc) return null
  return fetchJson(`/api/sigwx-front-meta?tmfc=${encodeURIComponent(tmfc)}`, { optional: true })
}

export async function fetchSigwxCloudMeta(tmfc) {
  if (!tmfc) return null
  return fetchJson(`/api/sigwx-cloud-meta?tmfc=${encodeURIComponent(tmfc)}`, { optional: true })
}

export async function loadChangedWeatherData(changes) {
  const fetches = []
  const keys = []

  if (changes.metar) { fetches.push(fetchJson('/api/metar', { optional: true })); keys.push('metar') }
  if (changes.taf) { fetches.push(fetchJson('/api/taf', { optional: true })); keys.push('taf') }
  if (changes.warning) { fetches.push(fetchJson('/api/warning', { optional: true })); keys.push('warning') }
  if (changes.sigmet) { fetches.push(fetchJson('/api/sigmet', { optional: true })); keys.push('sigmet') }
  if (changes.airmet) { fetches.push(fetchJson('/api/airmet', { optional: true })); keys.push('airmet') }
  if (changes.sigwxLow) {
    fetches.push(fetchJson('/api/sigwx-low', { optional: true }))
    keys.push('sigwxLow')
    fetches.push(fetchJson('/api/sigwx-low-history', { optional: true }))
    keys.push('sigwxLowHistory')
    fetches.push(fetchJson('/api/sigwx-front-meta', { optional: true }))
    keys.push('sigwxFrontMeta')
    fetches.push(fetchJson('/api/sigwx-cloud-meta', { optional: true }))
    keys.push('sigwxCloudMeta')
  }
  if (!changes.sigwxLow && changes.sigwxFrontMeta) {
    fetches.push(fetchJson('/api/sigwx-front-meta', { optional: true }))
    keys.push('sigwxFrontMeta')
  }
  if (!changes.sigwxLow && changes.sigwxCloudMeta) {
    fetches.push(fetchJson('/api/sigwx-cloud-meta', { optional: true }))
    keys.push('sigwxCloudMeta')
  }
  if (changes.amos) { fetches.push(fetchJson('/api/amos', { optional: true })); keys.push('amos') }
  if (changes.lightning) { fetches.push(fetchJson('/api/lightning', { optional: true })); keys.push('lightning') }
  if (changes.adsb) { fetches.push(fetchJson('/api/adsb', { optional: true })); keys.push('adsb') }
  if (changes.groundForecast) { fetches.push(fetchJson('/api/ground-forecast', { optional: true })); keys.push('groundForecast') }
  if (changes.groundOverview) { fetches.push(fetchJson('/api/ground-overview', { optional: true })); keys.push('groundOverview') }
  if (changes.environment) { fetches.push(fetchJson('/api/environment', { optional: true })); keys.push('environment') }
  if (changes.echoMeta) { fetches.push(fetchJson('/data/radar/echo_meta.json', { optional: true })); keys.push('echoMeta') }
  if (changes.satMeta) { fetches.push(fetchJson('/data/satellite/sat_meta.json', { optional: true })); keys.push('satMeta') }
  if (changes.airportInfo) { fetches.push(fetchJson('/api/airport-info', { optional: true })); keys.push('airportInfo') }

  const results = await Promise.all(fetches)
  const out = {}
  for (let i = 0; i < keys.length; i += 1) {
    out[keys[i]] = results[i]
  }
  return out
}
