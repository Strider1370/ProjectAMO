import {
  fetchSnapshotMeta as fetchCurrentSnapshotMeta,
  loadChangedWeatherData,
  loadWeatherData,
} from '../../api/weatherApi.js'

async function fetchJson(url, { optional = false } = {}) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
    return res.json()
  } catch (error) {
    if (optional) return null
    throw error
  }
}

export async function loadMonitoringStaticData() {
  const [airports, warningTypes, alertDefaults] = await Promise.all([
    fetchJson('/api/airports', { optional: true }),
    fetchJson('/api/warning-types', { optional: true }),
    fetchJson('/api/alert-defaults'),
  ])
  return { airports: airports || [], warningTypes: warningTypes || {}, alertDefaults }
}

export async function loadMonitoringData() {
  const data = await loadWeatherData()
  const [warningTypes, sigwxLowFronts, sigwxLowClouds] = await Promise.all([
    fetchJson('/api/warning-types', { optional: true }),
    fetchJson('/api/sigwx-low-fronts', { optional: true }),
    fetchJson('/api/sigwx-low-clouds', { optional: true }),
  ])

  return {
    ...data,
    warningTypes: warningTypes || {},
    sigwxLowFronts,
    sigwxLowClouds,
  }
}

export async function loadMonitoringAlertDefaults() {
  return fetchJson('/api/alert-defaults')
}

export async function fetchMonitoringSnapshotMeta() {
  return fetchCurrentSnapshotMeta()
}

export async function loadChangedMonitoringData(changes) {
  const changed = await loadChangedWeatherData(changes)

  if (changes.sigwxLow || changes.sigwxFrontMeta) {
    changed.sigwxLowFronts = await fetchJson('/api/sigwx-low-fronts', { optional: true })
  }
  if (changes.sigwxLow || changes.sigwxCloudMeta) {
    changed.sigwxLowClouds = await fetchJson('/api/sigwx-low-clouds', { optional: true })
  }

  return changed
}
