import FALLBACK_AIRPORTS from '../../../shared/airports.js'
import { ADSB_FETCH_DISABLED } from './adsbApi.js'
import { versionedAsset } from '../shared/versionedAsset.js'
import { fetchKimMapBinary, kimMapBinaryName, kimMapBinarySupported, kimMapBinaryUrl } from './kimMapBinary.js'

const KMA_RADAR_GRAPHICS_META = /^\/data\/radar\/(?:hsr\/hsr_meta|hci\/hci_meta|wissdom\/wissdom_meta|qpf\/qpf_meta)\.json$/

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
  RKJY: '여수공항',
  RKNW: '원주공항',
  RKPS: '사천공항',
  RKPU: '울산공항',
  RKNY: '양양국제공항',
}

async function fetchJson(url, { optional = false, signal } = {}) {
  try {
    const res = typeof fetch === 'function'
      // nginx now revalidates these files too.  no-store additionally replaces any
      // old heuristic cache entry that predates that header, so a live page switches
      // away from a stale radar timeline as soon as snapshot metadata changes.
      ? await fetch(url, { signal, ...(KMA_RADAR_GRAPHICS_META.test(url) ? { cache: 'no-store' } : {}) })
      : await fetchJsonWithXhr(url)
    if (!res.ok) throw new Error(`${url} ??HTTP ${res.status}`)
    return await res.json()
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
async function loadOverseasAirportList({ signal } = {}) {
  const data = await fetchJson(versionedAsset('/data/navdata/airports-overseas.json'), { optional: true, signal })
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
    convectiveMeta: buildFrameHashEntry(data.convectiveMeta),
    sigwxFrontMeta: buildOverlayMetaEntry(data.sigwxFrontMeta),
    sigwxCloudMeta: buildOverlayMetaEntry(data.sigwxCloudMeta),
  }
}

function buildFrameHashEntry(meta) {
  const tm = meta?.tm
  const hash = meta?.content_hash || meta?.hash
  if (!tm && !hash) return null
  return { ...(tm ? { tm } : {}), ...(hash ? { hash } : {}) }
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

export async function loadWeatherData({ signal } = {}) {
  const optionalJson = (url) => fetchJson(url, { optional: true, signal })
  const [
    airports, metar, taf, amos, warning, kmaSpecialWarning,
    sigmet, airmet, lightning,
    wissdomMeta, qpfMeta, hsrMeta, hciMeta, echoTopMeta, rainviewerMeta, satMeta, satVisibleMeta, convectiveMeta, sigwxLow, sigwxFrontMeta, sigwxCloudMeta,
    groundForecast, notam, overseasAirports,
    metarOverseas, tafOverseas, sigmetOverseas,
  ] = await Promise.all([
    optionalJson('/api/airports'),
    optionalJson('/api/metar'),
    optionalJson('/api/taf'),
    optionalJson('/api/amos'),
    optionalJson('/api/warning'),
    optionalJson('/api/kma-special-warning'),
    optionalJson('/api/sigmet'),
    optionalJson('/api/airmet'),
    optionalJson('/api/lightning'),
    optionalJson('/data/radar/wissdom/wissdom_meta.json'),
    optionalJson('/data/radar/qpf/qpf_meta.json'),
    optionalJson('/data/radar/hsr/hsr_meta.json'),
    optionalJson('/data/radar/hci/hci_meta.json'),
    optionalJson('/data/radar/echotop/echotop_meta.json'),
    optionalJson('/data/radar/rainviewer_meta.json'),
    optionalJson('/data/satellite/sat_meta.json'),
    optionalJson('/data/satellite/visible/visible_meta.json'),
    optionalJson('/data/satellite/convective/convective_meta.json'),
    optionalJson('/api/sigwx-low'),
    optionalJson('/api/sigwx-front-meta'),
    optionalJson('/api/sigwx-cloud-meta'),
    optionalJson('/api/ground-forecast'),
    optionalJson('/api/notam'),
    loadOverseasAirportList({ signal }),
    optionalJson('/api/metar-overseas'),
    optionalJson('/api/taf-overseas'),
    optionalJson('/api/sigmet-overseas'),
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
  sigwxLowHistory: (options) => fetchJson('/api/sigwx-low-history', { optional: true, ...options }),
  groundOverview: (options) => fetchJson('/api/ground-overview', { optional: true, ...options }),
  environment: (options) => fetchJson('/api/environment', { optional: true, ...options }),
  airportInfo: (options) => fetchJson('/api/airport-info', { optional: true, ...options }),
  adsb: (options) => (ADSB_FETCH_DISABLED ? Promise.resolve(null) : fetchJson('/api/adsb', { optional: true, ...options })),
}

export async function loadDeferredWeatherData(keys = [], { signal } = {}) {
  const uniqueKeys = [...new Set(keys)].filter((key) => DEFERRED_WEATHER_FETCHERS[key])
  const values = await Promise.all(uniqueKeys.map((key) => DEFERRED_WEATHER_FETCHERS[key]({ signal })))
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

export async function fetchSnapshotMeta({ signal } = {}) {
  return fetchJson('/api/snapshot-meta', { optional: true, signal })
}

export async function fetchKimSurfaceWind() {
  return fetchJson('/api/kim/surface-wind')
}

// 지도 KIM 레이어의 영역: 서버가 확대 영역(ea) 회차가 있으면 그것을, 없으면 한반도(kr)를 고르고 목록에 domain을 싣는다.
// 필드 요청은 선택값의 domain(목록에서 온 값)을 그대로 보낸다. 한반도는 인자를 붙이지 않아 주소·캐시가 그대로다.
export const KIM_MAP_DOMAIN = 'auto'

function kimFieldParams({ tmfc, hf, level, revision, domain }) {
  const params = new URLSearchParams({ tmfc, hf: String(hf) })
  if (level !== undefined) {
    params.set('level', level)
    // 기압면 필드는 지면 아래 칸을 비운 새 응답이다. 이전 응답의 브라우저 캐시를 쓰지 않게 한다(KIM_FIELD_VIEW).
    params.set('view', KIM_FIELD_VIEW)
  }
  if (revision) params.set('revision', revision)
  if (domain && domain !== 'kr') params.set('domain', domain)
  return params
}

// 라이브 지도 한 장은 이진 파일로 받는다(kimMapBinary.js). 특정 판(revision)을 고정한 요청(기관 브리핑)과
// 이진 파일을 받지 못한 경우는 JSON API를 쓴다.
async function fetchKimMapField(type, selection, jsonUrl, options) {
  if (!selection?.revision && selection?.level && kimMapBinarySupported()) {
    try {
      return await fetchKimMapBinary(kimMapBinaryUrl({ ...selection, name: kimMapBinaryName(type) }), options)
    } catch (error) {
      if (options?.signal?.aborted) throw error
    }
  }
  return fetchJson(jsonUrl, options)
}

export async function fetchKimNwpIndex(options = {}) {
  return fetchJson(`/api/kim/wind/index?domain=${KIM_MAP_DOMAIN}`, options)
}

export async function fetchKimNwpField(selection, options = {}) {
  return fetchKimMapField('wind', selection, `/api/kim/wind/field?${kimFieldParams(selection).toString()}`, options)
}

export async function fetchKimTemperatureIndex(options = {}) {
  return fetchJson(`/api/kim/temp/index?domain=${KIM_MAP_DOMAIN}`, options)
}

export async function fetchKimTemperatureField(selection, options = {}) {
  return fetchKimMapField('temp', selection, `/api/kim/temp/field?${kimFieldParams(selection).toString()}`, options)
}

export async function fetchKimCloudPotentialIndex(options = {}) {
  return fetchJson(`/api/kim/cloud/index?domain=${KIM_MAP_DOMAIN}`, options)
}

export async function fetchKimCloudPotentialField(selection, options = {}) {
  return fetchKimMapField('cloud', selection, `/api/kim/cloud/field?${kimFieldParams(selection).toString()}`, options)
}

export async function fetchKimIcingIndex(options = {}) {
  return fetchJson(`/api/kim/icing/index?domain=${KIM_MAP_DOMAIN}`, options)
}

export async function fetchKimIcingField(selection, options = {}) {
  return fetchKimMapField('icing', selection, `/api/kim/icing/field?${kimFieldParams(selection).toString()}`, options)
}

export async function fetchKimGktgIndex(options = {}) {
  return fetchJson(`/api/kim/gktg/index?domain=${KIM_MAP_DOMAIN}`, options)
}

export async function fetchKimTropopauseIndex(options = {}) {
  return fetchJson(`/api/kim/tropopause/index?domain=${KIM_MAP_DOMAIN}`, options)
}

export async function fetchKimTropopauseRuns(options = {}) {
  return fetchJson(`/api/kim/tropopause/runs?domain=${KIM_MAP_DOMAIN}`, options)
}

export async function fetchKimTropopauseField({ tmfc, hf, revision, domain }, options = {}) {
  return fetchJson(`/api/kim/tropopause/field?${kimFieldParams({ tmfc, hf, revision, domain }).toString()}`, options)
}

// 필드 응답은 브라우저에 immutable로 캐시된다. 서버가 응답 모양을 바꾸면(예: 지면 아래 표시) 이 값을 올려
// 이전 캐시를 쓰지 않게 한다. 서버는 이 인자를 읽지 않는다.
export const KIM_FIELD_VIEW = 'bg2'

export async function fetchKimGktgField({ tmfc, hf, level, revision, domain }, options = {}) {
  const params = new URLSearchParams({ tmfc, hf: String(hf), level, view: KIM_FIELD_VIEW })
  if (revision) params.set('revision', revision)
  if (domain && domain !== 'kr') params.set('domain', domain)
  const jsonUrl = `/api/kim/gktg/field?${params.toString()}`
  // GKTG 판(revision)은 목록에서 오며 이진 파일 이름에 들어간다.
  if (revision && /^[a-z0-9]+$/i.test(revision) && kimMapBinarySupported()) {
    try {
      return await fetchKimMapBinary(kimMapBinaryUrl({ domain, tmfc, hf, level, name: kimMapBinaryName('gktg', revision) }), options)
    } catch (error) {
      if (options?.signal?.aborted) throw error
    }
  }
  return fetchJson(jsonUrl, options)
}

export async function fetchKtgIndex(options = {}) {
  return fetchJson('/api/ktg/index', options)
}

export async function fetchKtgGrid({ altFt, hf, tmfc, revision }, options = {}) {
  const params = new URLSearchParams({ altFt: String(altFt) })
  if (Number.isFinite(Number(hf))) params.set('hf', String(Number(hf)))
  if (tmfc) params.set('tmfc', tmfc)
  if (revision) params.set('revision', revision)
  return fetchJson(`/api/ktg/grid?${params}`, options)
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

export async function loadChangedWeatherData(changes, { deferredKeys = 'all', signal } = {}) {
  const fetches = []
  const keys = []
  const preserveJson = (url) => fetchJson(url, { optional: 'preserve', signal })

  if (changes.metar) { fetches.push(preserveJson('/api/metar')); keys.push('metar') }
  if (changes.metarOverseas) { fetches.push(preserveJson('/api/metar-overseas')); keys.push('metarOverseas') }
  if (changes.taf) { fetches.push(preserveJson('/api/taf')); keys.push('taf') }
  if (changes.tafOverseas) { fetches.push(preserveJson('/api/taf-overseas')); keys.push('tafOverseas') }
  if (changes.warning) { fetches.push(preserveJson('/api/warning')); keys.push('warning') }
  if (changes.kmaSpecialWarning) { fetches.push(preserveJson('/api/kma-special-warning')); keys.push('kmaSpecialWarning') }
  if (changes.sigmet) { fetches.push(preserveJson('/api/sigmet')); keys.push('sigmet') }
  if (changes.sigmetOverseas) { fetches.push(preserveJson('/api/sigmet-overseas')); keys.push('sigmetOverseas') }
  if (changes.airmet) { fetches.push(preserveJson('/api/airmet')); keys.push('airmet') }
  if (changes.sigwxLow) {
    fetches.push(preserveJson('/api/sigwx-low'))
    keys.push('sigwxLow')
    if (includesDeferredKey(deferredKeys, 'sigwxLowHistory')) {
      fetches.push(preserveJson('/api/sigwx-low-history'))
      keys.push('sigwxLowHistory')
    }
    fetches.push(preserveJson('/api/sigwx-front-meta'))
    keys.push('sigwxFrontMeta')
    fetches.push(preserveJson('/api/sigwx-cloud-meta'))
    keys.push('sigwxCloudMeta')
  }
  if (!changes.sigwxLow && changes.sigwxFrontMeta) {
    fetches.push(preserveJson('/api/sigwx-front-meta'))
    keys.push('sigwxFrontMeta')
  }
  if (!changes.sigwxLow && changes.sigwxCloudMeta) {
    fetches.push(preserveJson('/api/sigwx-cloud-meta'))
    keys.push('sigwxCloudMeta')
  }
  if (changes.amos) { fetches.push(preserveJson('/api/amos')); keys.push('amos') }
  if (changes.lightning) { fetches.push(preserveJson('/api/lightning')); keys.push('lightning') }
  if (!ADSB_FETCH_DISABLED && changes.adsb && includesDeferredKey(deferredKeys, 'adsb')) { fetches.push(preserveJson('/api/adsb')); keys.push('adsb') }
  if (changes.groundForecast) { fetches.push(preserveJson('/api/ground-forecast')); keys.push('groundForecast') }
  if (changes.groundOverview && includesDeferredKey(deferredKeys, 'groundOverview')) { fetches.push(preserveJson('/api/ground-overview')); keys.push('groundOverview') }
  if (changes.environment && includesDeferredKey(deferredKeys, 'environment')) { fetches.push(preserveJson('/api/environment')); keys.push('environment') }
  if (changes.wissdomMeta) { fetches.push(preserveJson('/data/radar/wissdom/wissdom_meta.json')); keys.push('wissdomMeta') }
  if (changes.qpfMeta) { fetches.push(preserveJson('/data/radar/qpf/qpf_meta.json')); keys.push('qpfMeta') }
  if (changes.hsrMeta) { fetches.push(preserveJson('/data/radar/hsr/hsr_meta.json')); keys.push('hsrMeta') }
  if (changes.hciMeta) { fetches.push(preserveJson('/data/radar/hci/hci_meta.json')); keys.push('hciMeta') }
  if (changes.echoTopMeta) { fetches.push(preserveJson('/data/radar/echotop/echotop_meta.json')); keys.push('echoTopMeta') }
  if (changes.rainviewerMeta) { fetches.push(preserveJson('/data/radar/rainviewer_meta.json')); keys.push('rainviewerMeta') }
  if (changes.satMeta) { fetches.push(preserveJson('/data/satellite/sat_meta.json')); keys.push('satMeta') }
  if (changes.satVisibleMeta) { fetches.push(preserveJson('/data/satellite/visible/visible_meta.json')); keys.push('satVisibleMeta') }
  if (changes.convectiveMeta) { fetches.push(preserveJson('/data/satellite/convective/convective_meta.json')); keys.push('convectiveMeta') }
  if (changes.airportInfo && includesDeferredKey(deferredKeys, 'airportInfo')) { fetches.push(preserveJson('/api/airport-info')); keys.push('airportInfo') }

  const results = await Promise.all(fetches)
  const out = {}
  for (let i = 0; i < keys.length; i += 1) {
    out[keys[i]] = results[i]
  }
  return out
}

export function fetchKimAciIndex(options = {}) {
  return fetchJson(`/api/kim/aci/index?domain=${KIM_MAP_DOMAIN}`,options)
}
export async function fetchKimAciField(selection,options = {}) {
  const {domain,tmfc,hf,revision}=selection
  if(revision && kimMapBinarySupported()) {
    try {return await fetchKimMapBinary(kimMapBinaryUrl({domain,tmfc,hf,level:'column',name:`aci-${revision}-score-v1`}),options)}
    catch(error){if(options.signal?.aborted)throw error}
  }
  return fetchJson(`/api/kim/aci/field?${kimFieldParams({domain,tmfc,hf,revision})}`,options)
}
export function fetchKimAciPoint(selection,point,options = {}) {
  const params=kimFieldParams(selection);params.set('lon',String(point.lon));params.set('lat',String(point.lat))
  return fetchJson(`/api/kim/aci/point?${params}`,options)
}
