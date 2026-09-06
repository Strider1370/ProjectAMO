import config from './config.js'
import { requestObservedApi } from './lib/request-observability.js'

const { api } = config

function shouldDecodeEucKr(contentType) {
  return /euc-kr|ks_c_5601|cp949/i.test(contentType || '')
}

async function responseToText(response) {
  const contentType = response.headers.get('content-type') || ''
  const buffer = Buffer.from(await response.arrayBuffer())
  if (shouldDecodeEucKr(contentType)) {
    try { return new TextDecoder('euc-kr').decode(buffer) } catch {}
  }
  return buffer.toString('utf8')
}

export function buildUrl(type, icao = null) {
  const endpoint = api.endpoints[type]
  if (!endpoint) throw new Error(`Unknown API type: ${type}`)

  const params = new URLSearchParams({
    ...api.default_params,
    authKey: api.auth_key,
  })

  if (icao) params.set('icao', icao)
  return `${api.base_url}${endpoint}?${params.toString()}`
}

export function buildSigwxLowUrl(tmfc) {
  const params = new URLSearchParams({
    tmfc,
    authKey: api.auth_key,
  })
  return `${api.sigwx_low_url}?${params.toString()}`
}

function parseApiHeader(xmlText) {
  const codeMatch = xmlText.match(/<resultCode>([^<]+)<\/resultCode>/i)
  const msgMatch = xmlText.match(/<resultMsg>([^<]+)<\/resultMsg>/i)
  return {
    resultCode: codeMatch ? codeMatch[1].trim() : null,
    resultMsg: msgMatch ? msgMatch[1].trim() : null,
  }
}

function isSuccessByType(type, resultCode, resultMsg) {
  if (type === 'sigwx_low') return true
  if (resultCode == null) return false
  if (resultCode === '00') return true
  if (type === 'warning' && resultCode === '03' && /NO_DATA/i.test(resultMsg || '')) return true
  if (type === 'airport_info' && resultCode === '03') return true
  if (type === 'takeoff_fcst' && resultCode === '03') return true // 발표 없음(빈 자료)도 정상 취급
  return false
}

async function fetchTextWithRetries(url, type, options = {}) {
  const configuredRetries = Number(api.max_retries)
  const requestedRetries = Number(options.maxRetries)
  const maxRetries = Math.min(
    3,
    Math.max(
      1,
      Number.isFinite(requestedRetries)
        ? requestedRetries
        : (Number.isFinite(configuredRetries) ? configuredRetries : 1)
    )
  )

  const requestOptions = { maxAttempts: maxRetries }
  if (options.signal) requestOptions.signal = options.signal
  if (options.retryDelayMs !== undefined) requestOptions.retryDelayMs = options.retryDelayMs
  if (options.skipApiHeader) requestOptions.skipApiHeader = true

  const response = await requestObservedApi({
    operation: type === 'kma_special_warning' ? 'special_warning' : type,
    url,
    options: requestOptions,
    validate: async (value) => {
      const body = await responseToText(value)
      if (!value.ok) throw new Error(`HTTP ${value.status}: ${body.slice(0, 200)}`)
      if (options.skipApiHeader) return
      const { resultCode, resultMsg } = parseApiHeader(body)
      if (type === 'sigwx_low' && !/<odmap_ml[\s>]/i.test(body)) throw new Error('SIGWX LOW payload missing odmap_ml')
      if (!isSuccessByType(type, resultCode, resultMsg)) throw new Error(`API ${resultCode}: ${resultMsg || 'UNKNOWN_ERROR'}`)
    },
  })
  return responseToText(response)
}

export async function fetchApi(type, icao = null, options = {}) {
  const url = buildUrl(type, icao)
  return fetchTextWithRetries(url, type, options)
}

export async function fetchSigwxLow(tmfc, options = {}) {
  const url = buildSigwxLowUrl(tmfc)
  return fetchTextWithRetries(url, 'sigwx_low', options)
}

export function buildAirportInfoUrl(icao, baseDate, baseTime) {
  const params = new URLSearchParams({
    numOfRows: 10,
    pageNo: 1,
    dataType: 'XML',
    base_date: baseDate,
    base_time: baseTime,
    airPortCd: icao,
    authKey: api.auth_key,
  })
  return `${api.base_url}${api.endpoints.airport_info}?${params.toString()}`
}

export async function fetchAirportInfo(icao, baseDate, baseTime, options = {}) {
  const url = buildAirportInfoUrl(icao, baseDate, baseTime)
  return fetchTextWithRetries(url, 'airport_info', options)
}

export function buildKmaSpecialWarningUrl() {
  const params = new URLSearchParams({ authKey: api.kma_special_warning_auth_key })
  return `${api.kma_special_warning_url}?${params.toString()}`
}

export async function fetchKmaSpecialWarning(options = {}) {
  const url = buildKmaSpecialWarningUrl()
  const body = await fetchTextWithRetries(url, 'kma_special_warning', { ...options, skipApiHeader: true })
  if (!body.includes('#START7777')) throw new Error('KMA special warning payload is invalid')
  return body
}

// 이륙예보(AirInfoService/getAirInfo) — fctm=발표시각(KST YYYYMMDDHHmm), icaoCode별 매시 wd/ws/ta/qnh.
export function buildTakeoffFcstUrl(icao, fctm) {
  const params = new URLSearchParams({
    numOfRows: 24,
    pageNo: 1,
    dataType: 'XML',
    fctm,
    icaoCode: icao,
    authKey: api.auth_key,
  })
  return `${api.base_url}${api.endpoints.takeoff_fcst}?${params.toString()}`
}

export async function fetchTakeoffFcst(icao, fctm, options = {}) {
  const url = buildTakeoffFcstUrl(icao, fctm)
  return fetchTextWithRetries(url, 'takeoff_fcst', options)
}

export function buildKimGridUrl({
  data,
  name,
  level,
  tmfc,
  hf = 0,
  sub,
  map = 'S',
  disp = 'A',
  group = 'KIMG',
  nwp = 'NE57',
  credential = api.kim_nwp_auth_key,
}) {
  const params = new URLSearchParams({
    group,
    nwp,
    data,
    name,
    level: String(level),
    tmfc,
    hf: String(hf),
    map,
    sub,
    disp,
    authKey: credential,
  })
  return `${api.kim_grid_url}?${params.toString()}`
}

export async function fetchKimGrid({ signal, ...params }) {
  const url = buildKimGridUrl(params)
  const response = await requestObservedApi({
    operation: 'kim_grid',
    url,
    options: { signal },
    validate: async (value) => {
      const body = await responseToText(value)
      if (!value.ok) throw new Error(`HTTP ${value.status}: ${body.slice(0, 200)}`)
    },
  })
  return responseToText(response)
}

// ── NOAA Aviation Weather (해외 기상, JSON, 무인증) ─────────────────────────
// KMA 경로와 분리: resultCode 검사 없음, EUC-KR 디코딩 없음(항상 UTF-8 JSON).
const { noaa } = config

async function fetchNoaaJson(pathname, params) {
  const query = new URLSearchParams({ ...params, format: 'json' })
  const url = `${noaa.base_url}${pathname}?${query.toString()}`
  const operation = { '/metar': 'noaa_metar', '/taf': 'noaa_taf', '/isigmet': 'noaa_sigmet' }[pathname]
  const response = await requestObservedApi({
    operation,
    url,
    validate: async (value) => {
      if (!value.ok) {
        const body = (await value.text()).slice(0, 200)
        throw new Error(`NOAA HTTP ${value.status}: ${body}`)
      }
      await value.json()
    },
  })
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

// ids = ICAO 배열(벌크 다건 1콜). 빈 배열이면 호출 안 함.
export async function fetchNoaaMetar(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  return fetchNoaaJson('/metar', { ids: ids.join(',') })
}

export async function fetchNoaaTaf(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  return fetchNoaaJson('/taf', { ids: ids.join(',') })
}

// 국제 SIGMET은 ids 없음 — 전세계 전량 1콜(프로세서가 firId로 필터).
export async function fetchNoaaSigmet() {
  return fetchNoaaJson('/isigmet', {})
}

export default {
  fetch: fetchApi,
  fetchNoaaMetar,
  fetchNoaaTaf,
  fetchNoaaSigmet,
  fetchSigwxLow,
  fetchKmaSpecialWarning,
  fetchAirportInfo,
  fetchTakeoffFcst,
  fetchKimGrid,
  buildUrl,
  buildSigwxLowUrl,
  buildKmaSpecialWarningUrl,
  buildAirportInfoUrl,
  buildTakeoffFcstUrl,
  buildKimGridUrl,
}
