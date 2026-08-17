import FALLBACK_AIRPORTS from '../../../shared/airports.js'
import { ADSB_FETCH_DISABLED } from './adsbApi.js'

export const AIRPORT_NAME_KO = {
  RKSI: '인천국제공항',
  RKSS: '김포국제공항',
  RKPC: '제주국제공항',
  RKPK: '김해국제공항',
  RKTU: '청주국제공항',
  RKTN: '대구국제공항',
  RKTH: '포항경주공항',
  RKJB: '무안국제공항',
  RKJJ: '광주공항',
  RKJK: '군산공항',
  RKJY: '여수공항',
  RKNW: '원주공항',
  RKPS: '사천공항',
  RKPU: '울산공항',
  RKNY: '양양국제공항',
}

async function fetchJson(url, { optional = false, signal } = {}) {
  try {
    const res = typeof fetch === 'function'
      ? await fetch(url, { signal })
      : await fetchJsonWithXhr(url)
    if (!res.ok) throw new Error(`${url} ??HTTP ${res.status}`)
    return res.json()
  } catch (error) {
    if (optional === 'preserve') return undefined
    if (optional) return null
    throw error
  }
}

function fetchJsonWithXhr(url) {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest !== 'function') {
      reject(new Error('fetch is unavailable'))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.onload = () => resolve({
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      json: () => Promise.resolve(JSON.parse(xhr.responseText || 'null')),
    })
    xhr.onerror = () => reject(new Error(`${url} network error`))
    xhr.send()
  })
}

function normalizeAirports(airports) {
  const source = Array.isArray(airports) && airports.length > 0 ? airports : FALLBACK_AIRPORTS
  const fallbackByIcao = new Map(FALLBACK_AIRPORTS.map((airport) => [airport.icao, airport]))
  return source
    .filter((a) => a.icao !== 'TST1')
    .map((a) => ({
      ...(fallbackByIcao.get(a.icao) || {}),
      ...a,
      nameKo: AIRPORT_NAME_KO[a.icao] || a.name || a.icao,
    }))
}

// Overseas airport navdata is used only for map/search metadata.
// Weather payloads remain separate as metarOverseas/tafOverseas/sigmetOverseas.
async function loadOverseasAirportList() {
  const data = await fetchJson('/data/navdata/airports-overseas.json', { optional: true })
  if (!data || typeof data !== 'object') return []
  return Object.values(data)
    .filter((a) => a && Number.isFinite(a.coordinates?.lat) && Number.isFinite(a.coordinates?.lon))
    .map((a) => ({
      icao: a.id,
      name: a.name || a.id,
      nameKo: a.nameKo || a.name || a.id,
      lat: a.coordinates.lat,
      lon: a.coordinates.lon,
      overseas: true,
    }))
}

// Display-only merge. Domestic/overseas payloads stay separate in app state.
export function mergeAirportPayloads(domestic, overseas) {
  if (!domestic && !overseas) return null
  return {
    ...(domestic || overseas),
    airports: { ...(domestic?.airports || {}), ...(overseas?.airports || {}) },
  }
}

// Display-only merge. NOAA items keep source:'NOAA' for the overseas map layer.
export function mergeAdvisoryPayloads(domestic, overseas) {
  if (!domestic && !overseas) return null
  return {
    ...(domestic || overseas),
    items: [...(domestic?.items || []), ...(overseas?.items || [])],
  }
}

function buildHashEntry(payload) {
  const hash = payload?.content_hash
  return hash ? { hash } : null
}

export function buildSnapshotMetaFromData(data = {}) {
  return {
    metar: buildHashEntry(data.metar),
    metarOverseas: buildHashEntry(data.metarOverseas),
    metar_overseas: buildHashEntry(data.metarOverseas),
    taf: buildHashEntry(data.taf),
    tafOverseas: buildHashEntry(data.tafOverseas),
    taf_overseas: buildHashEntry(data.tafOverseas),
    warning: buildHashEntry(data.warning),
    kmaSpecialWarning: buildHashEntry(data.kmaSpecialWarning),
    sigmet: buildHashEntry(data.sigmet),
    sigmetOverseas: buildHashEntry(data.sigmetOverseas),
    sigmet_overseas: buildHashEntry(data.sigmetOverseas),
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
    hsrMeta: buildGraphicsMetaEntry(data.hsrMeta),
    hciMeta: buildGraphicsMetaEntry(data.hciMeta),
    wissdomMeta: buildGraphicsMetaEntry(data.wissdomMeta),
    qpfMeta: buildGraphicsMetaEntry(data.qpfMeta),
    echoTopMeta: data.echoTopMeta?.tm ? { tm: data.echoTopMeta.tm } : null,
    rainviewerMeta: data.rainviewerMeta?.tm ? { tm: data.rainviewerMeta.tm } : null,
    satMeta: data.satMeta?.tm ? { tm: data.satMeta.tm } : null,
    satVisibleMeta: data.satVisibleMeta?.tm ? { tm: data.satVisibleMeta.tm } : null,
    sigwxFrontMeta: buildOverlayMetaEntry(data.sigwxFrontMeta),
    sigwxCloudMeta: buildOverlayMetaEntry(data.sigwxCloudMeta),
  }
}

function buildGraphicsMetaEntry(meta) {
  const frames = meta?.frames || Object.values(meta?.framesByHeight || {}).flat()
  const latest = [...frames].sort((a, b) => (a.validTimeMs || a.timeMs || 0) - (b.validTimeMs || b.timeMs || 0)).at(-1)
  const tm = meta?.tm || latest?.tm
  const hash = meta?.content_hash || meta?.hash
  const updatedAt = meta?.updated_at || meta?.updatedAt
  if (!tm && !hash) return null
  return { ...(tm ? { tm } : {}), ...(hash ? { hash } : {}), ...(updatedAt ? { updated_at: updatedAt } : {}) }
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
    airports, metar, taf, amos, warning, kmaSpecialWarning,
    sigmet, airmet, lightning,
    wissdomMeta, qpfMeta, hsrMeta, hciMeta, echoTopMeta, rainviewerMeta, satMeta, satVisibleMeta, convectiveMeta, sigwxLow, sigwxFrontMeta, sigwxCloudMeta,
    groundForecast, notam, overseasAirports,
    metarOverseas, tafOverseas, sigmetOverseas,
  ] = await Promise.all([
    fetchJson('/api/airports', { optional: true }),
    fetchJson('/api/metar', { optional: true }),
    fetchJson('/api/taf', { optional: true }),
    fetchJson('/api/amos', { optional: true }),
    fetchJson('/api/warning', { optional: true }),
    fetchJson('/api/kma-special-warning', { optional: true }),
    fetchJson('/api/sigmet', { optional: true }),
    fetchJson('/api/airmet', { optional: true }),
    fetchJson('/api/lightning', { optional: true }),
    fetchJson('/data/radar/wissdom/wissdom_meta.json', { optional: true }),
    fetchJson('/data/radar/qpf/qpf_meta.json', { optional: true }),
    fetchJson('/data/radar/hsr/hsr_meta.json', { optional: true }),
    fetchJson('/data/radar/hci/hci_meta.json', { optional: true }),
    fetchJson('/data/radar/echotop/echotop_meta.json', { optional: true }),
    fetchJson('/data/radar/rainviewer_meta.json', { optional: true }),
    fetchJson('/data/satellite/sat_meta.json', { optional: true }),
    fetchJson('/data/satellite/visible/visible_meta.json', { optional: true }),
    fetchJson('/data/satellite/convective/convective_meta.json', { optional: true }),
    fetchJson('/api/sigwx-low', { optional: true }),
    fetchJson('/api/sigwx-front-meta', { optional: true }),
    fetchJson('/api/sigwx-cloud-meta', { optional: true }),
    fetchJson('/api/ground-forecast', { optional: true }),
    fetchJson('/api/notam', { optional: true }),
    loadOverseasAirportList(),
    fetchJson('/api/metar-overseas', { optional: true }),
    fetchJson('/api/taf-overseas', { optional: true }),
    fetchJson('/api/sigmet-overseas', { optional: true }),
  ])

  return {
    airports: [...normalizeAirports(airports), ...(overseasAirports || [])],
    metar,
    metarOverseas,
    taf,
    tafOverseas,
    amos,
    warning,
    kmaSpecialWarning,
    sigmet,
    sigmetOverseas,
    airmet,
    lightning,
    wissdomMeta,
    qpfMeta,
    hsrMeta,
    hciMeta,
    echoTopMeta,
    rainviewerMeta,
    satMeta,
    satVisibleMeta,
    convectiveMeta,
    sigwxLow,
    sigwxLowHistory: null,
    sigwxFrontMeta,
    sigwxCloudMeta,
    adsb: null,
    groundForecast,
    notam,
    groundOverview: null,
    environment: null,
    airportInfo: null,
  }
}

const DEFERRED_WEATHER_FETCHERS = {
  sigwxLowHistory: () => fetchJson('/api/sigwx-low-history', { optional: true }),
  groundOverview: () => fetchJson('/api/ground-overview', { optional: true }),
  environment: () => fetchJson('/api/environment', { optional: true }),
  airportInfo: () => fetchJson('/api/airport-info', { optional: true }),
  adsb: () => (ADSB_FETCH_DISABLED ? Promise.resolve(null) : fetchJson('/api/adsb', { optional: true })),
}

export async function loadDeferredWeatherData(keys = []) {
  const uniqueKeys = [...new Set(keys)].filter((key) => DEFERRED_WEATHER_FETCHERS[key])
  const values = await Promise.all(uniqueKeys.map((key) => DEFERRED_WEATHER_FETCHERS[key]()))
  return Object.fromEntries(uniqueKeys.map((key, index) => [key, values[index]]))
}

export async function fetchNotam() {
  return fetchJson('/api/notam', { optional: true })
}

export async function fetchConvectiveCtpsPoint({ tm, lat, lon, minFl }, { signal } = {}) {
  const params = new URLSearchParams({ tm, lat: String(lat), lon: String(lon), minFl: String(minFl) })
  return fetchJson(`/api/satellite/convective/ctps-point?${params.toString()}`, { signal })
}

export async function fetchEchoTopPoint({ tm, lat, lon }, { signal } = {}) {
  const params = new URLSearchParams({ tm, lat: String(lat), lon: String(lon) })
  return fetchJson(`/api/radar/echo-top-point?${params.toString()}`, { signal })
}

export async function fetchSnapshotMeta() {
  return fetchJson('/api/snapshot-meta', { optional: true })
}

export async function fetchKimSurfaceWind() {
  return fetchJson('/api/kim/surface-wind')
}

export async function fetchKimNwpIndex(options = {}) {
  return fetchJson('/api/kim/wind/index', options)
}

export async function fetchKimNwpField({ tmfc, hf, level }, options = {}) {
  const params = new URLSearchParams({ tmfc, hf: String(hf), level })
  return fetchJson(`/api/kim/wind/field?${params.toString()}`, options)
}

export async function fetchKimTemperatureIndex(options = {}) {
  return fetchJson('/api/kim/temp/index', options)
}

export async function fetchKimTemperatureField({ tmfc, hf, level }, options = {}) {
  const params = new URLSearchParams({ tmfc, hf: String(hf), level })
  return fetchJson(`/api/kim/temp/field?${params.toString()}`, options)
}

export async function fetchKimCloudPotentialIndex(options = {}) {
  return fetchJson('/api/kim/cloud/index', options)
}

export async function fetchKimCloudPotentialField({ tmfc, hf, level }, options = {}) {
  const params = new URLSearchParams({ tmfc, hf: String(hf), level })
  return fetchJson(`/api/kim/cloud/field?${params.toString()}`, options)
}

export async function fetchKimIcingIndex(options = {}) {
  return fetchJson('/api/kim/icing/index', options)
}

export async function fetchKimIcingField({ tmfc, hf, level }, options = {}) {
  const params = new URLSearchParams({ tmfc, hf: String(hf), level })
  return fetchJson(`/api/kim/icing/field?${params.toString()}`, options)
}

export async function fetchKtgIndex(options = {}) {
  return fetchJson('/api/ktg/index', options)
}

export async function fetchKtgGrid({ altFt, hf }, options = {}) {
  const hfParam = Number.isFinite(Number(hf)) ? `&hf=${Number(hf)}` : ''
  return fetchJson(`/api/ktg/grid?altFt=${altFt}${hfParam}`, options)
}

export async function fetchSigwxFrontMeta(tmfc) {
  if (!tmfc) return null
  return fetchJson(`/api/sigwx-front-meta?tmfc=${encodeURIComponent(tmfc)}`, { optional: true })
}

export async function fetchSigwxCloudMeta(tmfc) {
  if (!tmfc) return null
  return fetchJson(`/api/sigwx-cloud-meta?tmfc=${encodeURIComponent(tmfc)}`, { optional: true })
}

function includesDeferredKey(deferredKeys, key) {
  if (!deferredKeys) return true
  if (deferredKeys === 'all') return true
  return deferredKeys.has?.(key) || false
}

export async function loadChangedWeatherData(changes, { deferredKeys = 'all' } = {}) {
  const fetches = []
  const keys = []

  if (changes.metar) { fetches.push(fetchJson('/api/metar', { optional: 'preserve' })); keys.push('metar') }
  if (changes.metarOverseas) { fetches.push(fetchJson('/api/metar-overseas', { optional: 'preserve' })); keys.push('metarOverseas') }
  if (changes.taf) { fetches.push(fetchJson('/api/taf', { optional: 'preserve' })); keys.push('taf') }
  if (changes.tafOverseas) { fetches.push(fetchJson('/api/taf-overseas', { optional: 'preserve' })); keys.push('tafOverseas') }
  if (changes.warning) { fetches.push(fetchJson('/api/warning', { optional: 'preserve' })); keys.push('warning') }
  if (changes.kmaSpecialWarning) { fetches.push(fetchJson('/api/kma-special-warning', { optional: 'preserve' })); keys.push('kmaSpecialWarning') }
  if (changes.sigmet) { fetches.push(fetchJson('/api/sigmet', { optional: 'preserve' })); keys.push('sigmet') }
  if (changes.sigmetOverseas) { fetches.push(fetchJson('/api/sigmet-overseas', { optional: 'preserve' })); keys.push('sigmetOverseas') }
  if (changes.airmet) { fetches.push(fetchJson('/api/airmet', { optional: 'preserve' })); keys.push('airmet') }
  if (changes.sigwxLow) {
    fetches.push(fetchJson('/api/sigwx-low', { optional: 'preserve' }))
    keys.push('sigwxLow')
    if (includesDeferredKey(deferredKeys, 'sigwxLowHistory')) {
      fetches.push(fetchJson('/api/sigwx-low-history', { optional: 'preserve' }))
      keys.push('sigwxLowHistory')
    }
    fetches.push(fetchJson('/api/sigwx-front-meta', { optional: 'preserve' }))
    keys.push('sigwxFrontMeta')
    fetches.push(fetchJson('/api/sigwx-cloud-meta', { optional: 'preserve' }))
    keys.push('sigwxCloudMeta')
  }
  if (!changes.sigwxLow && changes.sigwxFrontMeta) {
    fetches.push(fetchJson('/api/sigwx-front-meta', { optional: 'preserve' }))
    keys.push('sigwxFrontMeta')
  }
  if (!changes.sigwxLow && changes.sigwxCloudMeta) {
    fetches.push(fetchJson('/api/sigwx-cloud-meta', { optional: 'preserve' }))
    keys.push('sigwxCloudMeta')
  }
  if (changes.amos) { fetches.push(fetchJson('/api/amos', { optional: 'preserve' })); keys.push('amos') }
  if (changes.notam) { fetches.push(fetchJson('/api/notam', { optional: 'preserve' })); keys.push('notam') }
  if (changes.lightning) { fetches.push(fetchJson('/api/lightning', { optional: 'preserve' })); keys.push('lightning') }
  if (!ADSB_FETCH_DISABLED && changes.adsb && includesDeferredKey(deferredKeys, 'adsb')) { fetches.push(fetchJson('/api/adsb', { optional: 'preserve' })); keys.push('adsb') }
  if (changes.groundForecast) { fetches.push(fetchJson('/api/ground-forecast', { optional: 'preserve' })); keys.push('groundForecast') }
  if (changes.groundOverview && includesDeferredKey(deferredKeys, 'groundOverview')) { fetches.push(fetchJson('/api/ground-overview', { optional: 'preserve' })); keys.push('groundOverview') }
  if (changes.environment && includesDeferredKey(deferredKeys, 'environment')) { fetches.push(fetchJson('/api/environment', { optional: 'preserve' })); keys.push('environment') }
  if (changes.wissdomMeta) { fetches.push(fetchJson('/data/radar/wissdom/wissdom_meta.json', { optional: 'preserve' })); keys.push('wissdomMeta') }
  if (changes.qpfMeta) { fetches.push(fetchJson('/data/radar/qpf/qpf_meta.json', { optional: 'preserve' })); keys.push('qpfMeta') }
  if (changes.hsrMeta) { fetches.push(fetchJson('/data/radar/hsr/hsr_meta.json', { optional: 'preserve' })); keys.push('hsrMeta') }
  if (changes.hciMeta) { fetches.push(fetchJson('/data/radar/hci/hci_meta.json', { optional: 'preserve' })); keys.push('hciMeta') }
  if (changes.echoTopMeta) { fetches.push(fetchJson('/data/radar/echotop/echotop_meta.json', { optional: 'preserve' })); keys.push('echoTopMeta') }
  if (changes.rainviewerMeta) { fetches.push(fetchJson('/data/radar/rainviewer_meta.json', { optional: 'preserve' })); keys.push('rainviewerMeta') }
  if (changes.satMeta) { fetches.push(fetchJson('/data/satellite/sat_meta.json', { optional: 'preserve' })); keys.push('satMeta') }
  if (changes.satVisibleMeta) { fetches.push(fetchJson('/data/satellite/visible/visible_meta.json', { optional: 'preserve' })); keys.push('satVisibleMeta') }
  if (changes.convectiveMeta) { fetches.push(fetchJson('/data/satellite/convective/convective_meta.json', { optional: 'preserve' })); keys.push('convectiveMeta') }
  if (changes.airportInfo && includesDeferredKey(deferredKeys, 'airportInfo')) { fetches.push(fetchJson('/api/airport-info', { optional: 'preserve' })); keys.push('airportInfo') }

  const results = await Promise.all(fetches)
  const out = {}
  for (let i = 0; i < keys.length; i += 1) {
    out[keys[i]] = results[i]
  }
  return out
}
