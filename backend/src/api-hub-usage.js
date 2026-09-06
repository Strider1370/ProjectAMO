import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import config from './config.js'
import { API_HUB_ENDPOINTS } from './api-operation-registry.js'

export const API_HUB_LIMIT_BYTES = 5_000_000_000
export const API_HUB_THRESHOLD_BYTES = 4_750_000_000

export const API_HUB_KEY_CATEGORIES = {
  aviation: '항공·일반',
  radar_satellite: '레이더·위성',
  kim_nwp: 'KIM NWP',
}

// Only these fixed labels may reach the persisted admin ledger.
export { API_HUB_ENDPOINTS }

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
  let tempSeq = 0

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

  // 쓰기 한 번이 실패해도 줄을 다시 세운다. 예전에는 실패한 약속이 체인에 남아, 그 뒤의 모든
  // 기록이 시도조차 없이 같은 오류로 거절됐다 — 2026-09-06에 rename 한 번이 어긋난 뒤
  // 국내 수집 전체가 재시작 전까지 6시간 40분 멈췄다.
  // 임시 파일 이름도 호출마다 다르게 잡아 다른 쓰기와 바꿔치기가 겹치지 않게 한다.
  function persist() {
    writing = writing.catch(() => {}).then(async () => {
      fs.mkdirSync(root, { recursive: true })
      const tempPath = `${filePath}.${process.pid}.${++tempSeq}.tmp`
      fs.writeFileSync(tempPath, JSON.stringify(data), 'utf8')
      try {
        fs.renameSync(tempPath, filePath)
      } catch (renameError) {
        fs.rmSync(tempPath, { force: true })
        throw renameError
      }
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
