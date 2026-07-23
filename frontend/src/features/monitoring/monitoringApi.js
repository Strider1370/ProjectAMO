import {
  fetchSnapshotMeta as fetchCurrentSnapshotMeta,
  loadChangedWeatherData,
  loadDeferredWeatherData,
  loadWeatherData,
} from '../../api/weatherApi.js'

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
  const [deferredData, warningTypes, sigwxLowFronts, sigwxLowClouds] = await Promise.all([
    loadDeferredWeatherData(['sigwxLowHistory', 'groundOverview', 'environment', 'airportInfo', 'adsb']),
    fetchJson('/api/warning-types', { optional: true }),
    fetchJson('/api/sigwx-low-fronts', { optional: true }),
    fetchJson('/api/sigwx-low-clouds', { optional: true }),
  ])

  return {
    ...data,
    ...deferredData,
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
    changed.sigwxLowFronts = await fetchJson('/api/sigwx-low-fronts', { optional: 'preserve' })
  }
  if (changes.sigwxLow || changes.sigwxCloudMeta) {
    changed.sigwxLowClouds = await fetchJson('/api/sigwx-low-clouds', { optional: 'preserve' })
  }

  return changed
}

export async function loadMonitoringInitialData() {
  const [{ airports, warningTypes, alertDefaults }, result] = await Promise.all([
    loadMonitoringStaticData(),
    loadMonitoringData(),
  ])
  const merged = {
    ...result,
    airports: result.airports?.length ? result.airports : airports,
    warningTypes: result.warningTypes || warningTypes,
  }
  return { data: merged, alertDefaults }
}

function hashOf(entry) {
  return entry?.hash ?? null
}

function tmOf(entry) {
  return entry?.tm ?? null
}

function overlayKey(entry) {
  if (!entry) return null
  return [
    entry.tmfc || '',
    entry.source_hash || '',
    entry.updated_at || '',
    entry.render_version || '',
  ].join('|')
}

export function buildMonitoringSnapshot(data) {
  return {
    metar: data.metar?.content_hash || null,
    metarOverseas: data.metarOverseas?.content_hash || null,
    taf: data.taf?.content_hash || null,
    tafOverseas: data.tafOverseas?.content_hash || null,
    warning: data.warning?.content_hash || null,
    sigmet: data.sigmet?.content_hash || null,
    sigmetOverseas: data.sigmetOverseas?.content_hash || null,
    airmet: data.airmet?.content_hash || null,
    sigwxLow: data.sigwxLow?.content_hash || null,
    amos: data.amos?.content_hash || null,
    lightning: data.lightning?.content_hash || null,
    adsb: data.adsb?.content_hash || null,
    groundForecast: data.groundForecast?.content_hash || null,
    groundOverview: data.groundOverview?.content_hash || null,
    environment: data.environment?.content_hash || null,
    airportInfo: data.airportInfo?.content_hash || null,
    echo: data.echoMeta?.tm || null,
    satellite: data.satMeta?.tm || null,
    sigwxFrontMeta: overlayKey(data.sigwxFrontMeta),
    sigwxCloudMeta: overlayKey(data.sigwxCloudMeta),
  }
}

export function detectMonitoringSnapshotChanges(snapshot, saved) {
  const sigwxLow = snapshot?.sigwxLow || snapshot?.sigwx_low
  const metarOverseas = snapshot?.metarOverseas || snapshot?.metar_overseas
  const tafOverseas = snapshot?.tafOverseas || snapshot?.taf_overseas
  const sigmetOverseas = snapshot?.sigmetOverseas || snapshot?.sigmet_overseas
  const groundForecast = snapshot?.groundForecast || snapshot?.ground_forecast
  const groundOverview = snapshot?.groundOverview || snapshot?.ground_overview
  const echo = snapshot?.echoMeta || snapshot?.echo
  const satellite = snapshot?.satMeta || snapshot?.satellite

  return {
    metar: hashOf(snapshot?.metar) !== saved.metar,
    metarOverseas: hashOf(metarOverseas) !== saved.metarOverseas,
    taf: hashOf(snapshot?.taf) !== saved.taf,
    tafOverseas: hashOf(tafOverseas) !== saved.tafOverseas,
    warning: hashOf(snapshot?.warning) !== saved.warning,
    sigmet: hashOf(snapshot?.sigmet) !== saved.sigmet,
    sigmetOverseas: hashOf(sigmetOverseas) !== saved.sigmetOverseas,
    airmet: hashOf(snapshot?.airmet) !== saved.airmet,
    sigwxLow: hashOf(sigwxLow) !== saved.sigwxLow,
    amos: hashOf(snapshot?.amos) !== saved.amos,
    lightning: hashOf(snapshot?.lightning) !== saved.lightning,
    adsb: hashOf(snapshot?.adsb) !== saved.adsb,
    groundForecast: hashOf(groundForecast) !== saved.groundForecast,
    groundOverview: hashOf(groundOverview) !== saved.groundOverview,
    environment: hashOf(snapshot?.environment) !== saved.environment,
    airportInfo: hashOf(snapshot?.airportInfo) !== saved.airportInfo,
    echoMeta: tmOf(echo) !== saved.echo,
    satMeta: tmOf(satellite) !== saved.satellite,
    sigwxFrontMeta: overlayKey(snapshot?.sigwxFrontMeta) !== saved.sigwxFrontMeta,
    sigwxCloudMeta: overlayKey(snapshot?.sigwxCloudMeta) !== saved.sigwxCloudMeta,
  }
}

export function nextMonitoringSnapshot(snapshot, changedData, saved) {
  const sigwxLow = snapshot?.sigwxLow || snapshot?.sigwx_low
  const metarOverseas = snapshot?.metarOverseas || snapshot?.metar_overseas
  const tafOverseas = snapshot?.tafOverseas || snapshot?.taf_overseas
  const sigmetOverseas = snapshot?.sigmetOverseas || snapshot?.sigmet_overseas
  const groundForecast = snapshot?.groundForecast || snapshot?.ground_forecast
  const groundOverview = snapshot?.groundOverview || snapshot?.ground_overview
  const echo = snapshot?.echoMeta || snapshot?.echo
  const satellite = snapshot?.satMeta || snapshot?.satellite

  return {
    metar: changedData.metar?.content_hash ?? hashOf(snapshot?.metar) ?? saved.metar,
    metarOverseas: changedData.metarOverseas?.content_hash ?? hashOf(metarOverseas) ?? saved.metarOverseas,
    taf: changedData.taf?.content_hash ?? hashOf(snapshot?.taf) ?? saved.taf,
    tafOverseas: changedData.tafOverseas?.content_hash ?? hashOf(tafOverseas) ?? saved.tafOverseas,
    warning: changedData.warning?.content_hash ?? hashOf(snapshot?.warning) ?? saved.warning,
    sigmet: changedData.sigmet?.content_hash ?? hashOf(snapshot?.sigmet) ?? saved.sigmet,
    sigmetOverseas: changedData.sigmetOverseas?.content_hash ?? hashOf(sigmetOverseas) ?? saved.sigmetOverseas,
    airmet: changedData.airmet?.content_hash ?? hashOf(snapshot?.airmet) ?? saved.airmet,
    sigwxLow: changedData.sigwxLow?.content_hash ?? hashOf(sigwxLow) ?? saved.sigwxLow,
    amos: changedData.amos?.content_hash ?? hashOf(snapshot?.amos) ?? saved.amos,
    lightning: changedData.lightning?.content_hash ?? hashOf(snapshot?.lightning) ?? saved.lightning,
    adsb: changedData.adsb?.content_hash ?? hashOf(snapshot?.adsb) ?? saved.adsb,
    groundForecast: changedData.groundForecast?.content_hash ?? hashOf(groundForecast) ?? saved.groundForecast,
    groundOverview: changedData.groundOverview?.content_hash ?? hashOf(groundOverview) ?? saved.groundOverview,
    environment: changedData.environment?.content_hash ?? hashOf(snapshot?.environment) ?? saved.environment,
    airportInfo: changedData.airportInfo?.content_hash ?? hashOf(snapshot?.airportInfo) ?? saved.airportInfo,
    echo: changedData.echoMeta?.tm ?? tmOf(echo) ?? saved.echo,
    satellite: changedData.satMeta?.tm ?? tmOf(satellite) ?? saved.satellite,
    sigwxFrontMeta: overlayKey(changedData.sigwxFrontMeta) ?? overlayKey(snapshot?.sigwxFrontMeta) ?? saved.sigwxFrontMeta,
    sigwxCloudMeta: overlayKey(changedData.sigwxCloudMeta) ?? overlayKey(snapshot?.sigwxCloudMeta) ?? saved.sigwxCloudMeta,
  }
}
