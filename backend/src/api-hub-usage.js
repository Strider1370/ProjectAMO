import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import config from './config.js'

export const API_HUB_LIMIT_BYTES = 5_000_000_000
export const API_HUB_THRESHOLD_BYTES = 4_750_000_000

export const API_HUB_KEY_CATEGORIES = {
  aviation: '항공·일반',
  radar_satellite: '레이더·위성',
  kim_nwp: 'KIM NWP',
}

// Only these fixed labels may reach the persisted admin ledger.
export const API_HUB_ENDPOINTS = {
  metar: 'METAR', taf: 'TAF', warning: '공항 경보', sigmet: 'SIGMET', airmet: 'AIRMET',
  airport_info: '공항 정보', takeoff_fcst: '이륙 예보', sigwx_low: '저고도 SIGWX', amos: 'AMOS', sfc_vis: '지상 시정',
  special_warning: '기상특보', uv: '자외선', lightning: '낙뢰', typhoon_now: '태풍 현황', typhoon_list: '태풍 목록',
  ground_forecast: '단기 예보', mid_land: '중기 육상예보', mid_ta: '중기 기온예보', asos_ceiling: 'ASOS 운고',
  kim_grid: 'KIM 격자', ktg: 'KTG 격자',
  radar_echo: '레이더 반사도', radar_qcd: '레이더 QCD (Echo Top)',
  radar_wissdom: 'WISSDOM', radar_qpf: 'QPF', radar_hsr: '레이더 HSR', radar_hci: '레이더 HCI',
  satellite_ir: 'GK2A IR', satellite_visible: 'GK2A 가시', satellite_fog: 'GK2A 안개', satellite_ci: 'GK2A CI', satellite_ctps: 'GK2A CTPS',
}

function error(code) {
  const value = new Error(code)
  value.code = code
  return value
}

function kstDay(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function nextKstMidnight(now = Date.now()) {
  const day = kstDay(now)
  return new Date(`${day}T15:00:00.000Z`).toISOString()
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex')
}

function emptyRecord() {
  return { bytes: 0, requests: 0, successes: 0, failures: 0, lastCalledAt: null, blockedReason: null, endpoints: {} }
}

function load(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return value && typeof value === 'object' && value.days && typeof value.days === 'object' ? value : { version: 1, days: {} }
  } catch {
    return { version: 1, days: {} }
  }
}

export function createApiHubUsage({ root, keys }) {
  const filePath = path.join(root, 'api-hub-usage.json')
  const configuredKeys = Object.fromEntries(Object.entries(keys).filter(([, value]) => value))
  const categoryByFingerprint = new Map(Object.entries(configuredKeys).map(([category, value]) => [fingerprint(value), category]))
  let data = load(filePath)
  let writing = Promise.resolve()

  function resolveCategory(credential) {
    const category = credential && categoryByFingerprint.get(fingerprint(credential))
    if (!category) throw error('unknown_api_hub_credential')
    return category
  }

  function recordFor(day, credential) {
    const id = fingerprint(credential)
    if (!data.days[day]) data.days[day] = { keys: {} }
    if (!data.days[day].keys[id]) data.days[day].keys[id] = emptyRecord()
    return data.days[day].keys[id]
  }

  function trimDays() {
    const days = Object.keys(data.days).sort().reverse()
    for (const day of days.slice(2)) delete data.days[day]
  }

  function persist() {
    writing = writing.then(async () => {
      fs.mkdirSync(root, { recursive: true })
      const tempPath = `${filePath}.tmp`
      fs.writeFileSync(tempPath, JSON.stringify(data), 'utf8')
      fs.renameSync(tempPath, filePath)
    })
    return writing
  }

  function assertAllowed(credential, { now = Date.now() } = {}) {
    resolveCategory(credential)
    const current = data.days[kstDay(now)]?.keys?.[fingerprint(credential)]
    if (current?.blockedReason) throw error('api_hub_budget_blocked')
  }

  async function record(credential, { bytes, status, endpoint, now = Date.now() }) {
    resolveCategory(credential)
    if (!Object.hasOwn(API_HUB_ENDPOINTS, endpoint)) throw error('unknown_api_hub_endpoint')
    const receivedBytes = Number(bytes)
    if (!Number.isFinite(receivedBytes) || receivedBytes < 0) throw error('invalid_api_hub_bytes')
    const item = recordFor(kstDay(now), credential)
    const calledAt = new Date(now).toISOString()
    item.bytes += receivedBytes
    item.requests += 1
    if (Number(status) >= 200 && Number(status) < 400) item.successes += 1
    else item.failures += 1
    item.lastCalledAt = calledAt
    const endpointItem = item.endpoints[endpoint] || { bytes: 0, requests: 0, successes: 0, failures: 0, lastCalledAt: null }
    endpointItem.bytes += receivedBytes
    endpointItem.requests += 1
    if (Number(status) >= 200 && Number(status) < 400) endpointItem.successes += 1
    else endpointItem.failures += 1
    endpointItem.lastCalledAt = calledAt
    item.endpoints[endpoint] = endpointItem
    if (Number(status) === 403) item.blockedReason = 'upstream_403'
    else if (item.bytes >= API_HUB_THRESHOLD_BYTES) item.blockedReason = 'daily_budget'
    trimDays()
    await persist()
  }

  function snapshot({ now = Date.now() } = {}) {
    const day = kstDay(now)
    const dayData = data.days[day]?.keys || {}
    return {
      generatedAt: new Date(now).toISOString(),
      keys: Object.entries(API_HUB_KEY_CATEGORIES).map(([category, label]) => {
        const credential = configuredKeys[category]
        const id = credential ? fingerprint(credential) : null
        const record = id ? (dayData[id] || emptyRecord()) : emptyRecord()
        return {
          category,
          label,
          fingerprintSuffix: id ? id.slice(-8) : null,
          dayKst: day,
          bytes: record.bytes,
          limitBytes: API_HUB_LIMIT_BYTES,
          thresholdBytes: API_HUB_THRESHOLD_BYTES,
          requests: record.requests,
          successes: record.successes,
          failures: record.failures,
          lastCalledAt: record.lastCalledAt,
          status: credential ? (record.blockedReason ? 'blocked' : 'active') : 'unconfigured',
          blockedReason: record.blockedReason,
          resetsAt: nextKstMidnight(now),
          endpoints: Object.entries(record.endpoints)
            .map(([endpoint, value]) => ({ label: API_HUB_ENDPOINTS[endpoint], ...value }))
            .sort((a, b) => b.bytes - a.bytes),
        }
      }),
    }
  }

  return { assertAllowed, record, resolveCategory, snapshot }
}

const apiHubUsage = createApiHubUsage({
  root: config.storage.base_path,
  keys: {
    aviation: config.api.auth_key,
    radar_satellite: config.api.radar_satellite_auth_key,
    kim_nwp: config.api.kim_nwp_auth_key,
  },
})

export default apiHubUsage
