import fs from 'node:fs'
import path from 'node:path'

import config from './config.js'

const ENDPOINTS = ['metadata', 'forecast']

export function createWifsUsage({ root, now = Date.now } = {}) {
  const file = path.join(root, 'stats', 'wifs-usage.json')
  let days
  try {
    days = JSON.parse(fs.readFileSync(file, 'utf8')).days || {}
  } catch {
    days = {}
  }

  function snapshot() {
    const day = new Date(now()).toISOString().slice(0, 10)
    const current = days[day] || { requests: 0, successes: 0, failures: 0, bytes: 0, endpoints: {} }
    return { day, ...current }
  }

  function record({ endpoint, status, bytes = 0, forecastHour = null }) {
    if (!ENDPOINTS.includes(endpoint) || !Number.isInteger(bytes) || bytes < 0) throw new Error('invalid_wifs_usage_event')
    const day = new Date(now()).toISOString().slice(0, 10)
    const current = days[day] ||= { requests: 0, successes: 0, failures: 0, bytes: 0, endpoints: {} }
    const row = current.endpoints[endpoint] ||= { requests: 0, successes: 0, failures: 0, bytes: 0 }
    const success = status === 200
    for (const entry of [current, row]) {
      entry.requests += 1
      entry[success ? 'successes' : 'failures'] += 1
      entry.bytes += bytes
      entry.lastStatus = Number.isInteger(status) ? status : null
      entry.lastCalledAt = new Date(now()).toISOString()
    }
    if (endpoint === 'forecast' && Number.isInteger(forecastHour)) row.lastForecastHour = forecastHour
    for (const old of Object.keys(days).sort().reverse().slice(2)) delete days[old]
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    try {
      fs.writeFileSync(temp, JSON.stringify({ version: 1, days }))
      fs.renameSync(temp, file)
    } finally {
      fs.rmSync(temp, { force: true })
    }
  }

  return { record, snapshot }
}

const wifsUsage = createWifsUsage({ root: config.storage.base_path })
export default wifsUsage
