import { fetchSnapshotMeta as fetchCurrentSnapshotMeta } from '../../api/weatherApi.js'

async function fetchJson(url, { optional = false } = {}) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
    return res.json()
  } catch (error) {
    if (optional === 'preserve') return undefined
    if (optional) return null
    throw error
  }
}

const MONITORING_DATA_FETCHERS = {
  airports: { url: '/api/airports', optional: true },
  metar: { url: '/api/metar', optional: true },
  taf: { url: '/api/taf', optional: true },
  amos: { url: '/api/amos', optional: true },
  warning: { url: '/api/warning', optional: true },
  kmaSpecialWarning: { url: '/api/kma-special-warning', optional: true },
  sigmet: { url: '/api/sigmet', optional: true },
  airmet: { url: '/api/airmet', optional: true },
  lightning: { url: '/api/lightning', optional: true },
  groundForecast: { url: '/api/ground-forecast', optional: true },
  groundOverview: { url: '/api/ground-overview', optional: true },
  environment: { url: '/api/environment', optional: true },
  airportInfo: { url: '/api/airport-info', optional: true },
  warningTypes: { url: '/api/warning-types', optional: true },
  hsrMeta: { url: '/data/radar/hsr/hsr_meta.json', optional: true },
  hciMeta: { url: '/data/radar/hci/hci_meta.json', optional: true },
  satMeta: { url: '/data/satellite/sat_meta.json', optional: true },
  satVisibleMeta: { url: '/data/satellite/visible/visible_meta.json', optional: true },
}

async function loadMonitoringEntries(keys, optional = true) {
  const uniqueKeys = [...new Set(keys)].filter((key) => MONITORING_DATA_FETCHERS[key])
  const values = await Promise.all(uniqueKeys.map((key) => {
    const entry = MONITORING_DATA_FETCHERS[key]
    return fetchJson(entry.url, { optional: optional === 'preserve' ? 'preserve' : entry.optional })
  }))
  return Object.fromEntries(uniqueKeys.map((key, index) => [key, values[index]]))
}

export async function loadMonitoringData() {
  const data = await loadMonitoringEntries(Object.keys(MONITORING_DATA_FETCHERS))
  return {
    ...data,
    airports: data.airports || [],
    warningTypes: data.warningTypes || {},
  }
}

export async function loadMonitoringAlertDefaults() {
  return fetchJson('/api/alert-defaults')
}

export async function fetchMonitoringSnapshotMeta() {
  return fetchCurrentSnapshotMeta()
}

export async function loadChangedMonitoringData(changes) {
  const changedKeys = Object.keys(MONITORING_DATA_FETCHERS)
    .filter((key) => changes[key])
  const changed = await loadMonitoringEntries(changedKeys, 'preserve')
  return Object.fromEntries(Object.entries(changed).map(([key, value]) => [key, value ?? undefined]))
}

export async function loadMonitoringInitialData() {
  const [data, alertDefaults] = await Promise.all([
    loadMonitoringData(),
    loadMonitoringAlertDefaults(),
  ])
  return { data, alertDefaults }
}

function hashOf(entry) {
  return entry?.hash ?? null
}

function tmOf(entry) {
  return entry?.tm ?? null
}

function graphicsKey(entry) {
  if (!entry) return null
  return [
    entry.tm || '',
    entry.content_hash || entry.hash || '',
    entry.updated_at || entry.updatedAt || '',
  ].join('|')
}

function snapshotValue(snapshot, camelCase, snakeCase = camelCase) {
  return snapshot?.[camelCase] || snapshot?.[snakeCase]
}

export function buildMonitoringSnapshot(data) {
  return {
    metar: data.metar?.content_hash || null,
    taf: data.taf?.content_hash || null,
    warning: data.warning?.content_hash || null,
    kmaSpecialWarning: data.kmaSpecialWarning?.content_hash || null,
    sigmet: data.sigmet?.content_hash || null,
    airmet: data.airmet?.content_hash || null,
    amos: data.amos?.content_hash || null,
    lightning: data.lightning?.content_hash || null,
    groundForecast: data.groundForecast?.content_hash || null,
    groundOverview: data.groundOverview?.content_hash || null,
    environment: data.environment?.content_hash || null,
    airportInfo: data.airportInfo?.content_hash || null,
    hsrMeta: graphicsKey(data.hsrMeta),
    hciMeta: graphicsKey(data.hciMeta),
    satMeta: tmOf(data.satMeta),
    satVisibleMeta: tmOf(data.satVisibleMeta),
  }
}

export function detectMonitoringSnapshotChanges(snapshot, saved) {
  const groundForecast = snapshotValue(snapshot, 'groundForecast', 'ground_forecast')
  const groundOverview = snapshotValue(snapshot, 'groundOverview', 'ground_overview')
  const hsrMeta = snapshotValue(snapshot, 'hsrMeta', 'hsr_meta')
  const hciMeta = snapshotValue(snapshot, 'hciMeta', 'hci_meta')
  const satMeta = snapshotValue(snapshot, 'satMeta', 'satellite')
  const satVisibleMeta = snapshotValue(snapshot, 'satVisibleMeta', 'sat_visible')

  return {
    metar: hashOf(snapshot?.metar) !== saved.metar,
    taf: hashOf(snapshot?.taf) !== saved.taf,
    warning: hashOf(snapshot?.warning) !== saved.warning,
    kmaSpecialWarning: hashOf(snapshot?.kmaSpecialWarning) !== saved.kmaSpecialWarning,
    sigmet: hashOf(snapshot?.sigmet) !== saved.sigmet,
    airmet: hashOf(snapshot?.airmet) !== saved.airmet,
    amos: hashOf(snapshot?.amos) !== saved.amos,
    lightning: hashOf(snapshot?.lightning) !== saved.lightning,
    groundForecast: hashOf(groundForecast) !== saved.groundForecast,
    groundOverview: hashOf(groundOverview) !== saved.groundOverview,
    environment: hashOf(snapshot?.environment) !== saved.environment,
    airportInfo: hashOf(snapshot?.airportInfo) !== saved.airportInfo,
    hsrMeta: graphicsKey(hsrMeta) !== saved.hsrMeta,
    hciMeta: graphicsKey(hciMeta) !== saved.hciMeta,
    satMeta: tmOf(satMeta) !== saved.satMeta,
    satVisibleMeta: tmOf(satVisibleMeta) !== saved.satVisibleMeta,
  }
}

export function nextMonitoringSnapshot(snapshot, changedData, saved) {
  const groundForecast = snapshotValue(snapshot, 'groundForecast', 'ground_forecast')
  const groundOverview = snapshotValue(snapshot, 'groundOverview', 'ground_overview')
  const hsrMeta = snapshotValue(snapshot, 'hsrMeta', 'hsr_meta')
  const hciMeta = snapshotValue(snapshot, 'hciMeta', 'hci_meta')
  const satMeta = snapshotValue(snapshot, 'satMeta', 'satellite')
  const satVisibleMeta = snapshotValue(snapshot, 'satVisibleMeta', 'sat_visible')

  return {
    metar: changedData.metar?.content_hash ?? hashOf(snapshot?.metar) ?? saved.metar,
    taf: changedData.taf?.content_hash ?? hashOf(snapshot?.taf) ?? saved.taf,
    warning: changedData.warning?.content_hash ?? hashOf(snapshot?.warning) ?? saved.warning,
    kmaSpecialWarning: changedData.kmaSpecialWarning?.content_hash ?? hashOf(snapshot?.kmaSpecialWarning) ?? saved.kmaSpecialWarning,
    sigmet: changedData.sigmet?.content_hash ?? hashOf(snapshot?.sigmet) ?? saved.sigmet,
    airmet: changedData.airmet?.content_hash ?? hashOf(snapshot?.airmet) ?? saved.airmet,
    amos: changedData.amos?.content_hash ?? hashOf(snapshot?.amos) ?? saved.amos,
    lightning: changedData.lightning?.content_hash ?? hashOf(snapshot?.lightning) ?? saved.lightning,
    groundForecast: changedData.groundForecast?.content_hash ?? hashOf(groundForecast) ?? saved.groundForecast,
    groundOverview: changedData.groundOverview?.content_hash ?? hashOf(groundOverview) ?? saved.groundOverview,
    environment: changedData.environment?.content_hash ?? hashOf(snapshot?.environment) ?? saved.environment,
    airportInfo: changedData.airportInfo?.content_hash ?? hashOf(snapshot?.airportInfo) ?? saved.airportInfo,
    hsrMeta: graphicsKey(changedData.hsrMeta) ?? graphicsKey(hsrMeta) ?? saved.hsrMeta,
    hciMeta: graphicsKey(changedData.hciMeta) ?? graphicsKey(hciMeta) ?? saved.hciMeta,
    satMeta: changedData.satMeta?.tm ?? tmOf(satMeta) ?? saved.satMeta,
    satVisibleMeta: changedData.satVisibleMeta?.tm ?? tmOf(satVisibleMeta) ?? saved.satVisibleMeta,
  }
}
