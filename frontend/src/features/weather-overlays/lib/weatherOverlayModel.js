import {
  buildTimelineTicks,
  normalizeFrame,
  normalizeFrames,
  pickNearestPreviousFrame,
} from './weatherTimeline.js'
import { advisoryItemsToFeatureCollection, advisoryItemsToLabelFeatureCollection } from './advisoryLayers.js'
import { sigwxLowToMapboxData } from './sigwxData.js'
import { LIGHTNING_AGE_BANDS, createLightningGeoJSON } from './lightningLayers.js'

export function parseFrameTmToMs(tm) {
  if (!tm || !/^\d{12}$/.test(String(tm))) return null
  const raw = String(tm)
  const date = new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - 9,
    Number(raw.slice(10, 12)),
    0,
    0,
  ))
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : null
}

export function formatReferenceTimeLabel(timeMs) {
  if (!Number.isFinite(timeMs)) return '--:--'
  const kst = new Date(timeMs + 9 * 60 * 60 * 1000)
  const hours = String(kst.getUTCHours()).padStart(2, '0')
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function parseSigwxTmfcToMs(tmfc) {
  if (!tmfc || !/^\d{10}(\d{2})?$/.test(String(tmfc))) return null
  const raw = String(tmfc)
  const date = new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - 9,
    raw.length >= 12 ? Number(raw.slice(10, 12)) : 0,
    0,
    0,
  ))
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : null
}

export function formatSigwxStamp(value) {
  const timeMs = value?.includes?.('T')
    ? Date.parse(value)
    : parseSigwxTmfcToMs(value)
  if (!Number.isFinite(timeMs)) return '-'
  const kst = new Date(timeMs + 9 * 60 * 60 * 1000)
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hours = String(kst.getUTCHours()).padStart(2, '0')
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes} KST`
}

export function formatAdvisoryPanelLabel(item, kind) {
  const base = kind === 'sigmet' ? 'SIGMET' : 'AIRMET'
  const sequence = item?.sequence_number ? ` ${item.sequence_number}` : ''
  const phenomenon = item?.phenomenon_code || item?.phenomenon_label || ''
  return `${base}${sequence}${phenomenon ? ` ${phenomenon}` : ''}`
}

export function formatAdvisoryValidLabel(item) {
  const start = Date.parse(item?.valid_from)
  const end = Date.parse(item?.valid_to)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return `${formatSigwxStamp(new Date(start).toISOString())} ~ ${formatSigwxStamp(new Date(end).toISOString())}`
}

function advisoryItemsWithPanelData(data, kind) {
  return (data?.items || []).map((item, index) => ({
    ...item,
    mapKey: item.id || `${kind}-${index}`,
    panelLabel: formatAdvisoryPanelLabel(item, kind),
    validLabel: formatAdvisoryValidLabel(item),
  }))
}

export function buildWeatherOverlayModel({
  echoMeta,
  satMeta,
  lightningData,
  sigwxLowData,
  sigwxLowHistoryData,
  sigmetData,
  airmetData,
  visibility = {},
  weatherTimelineIndex,
  sigwxHistoryIndex,
  sigwxFilter,
  hiddenAdvisoryKeys = {},
  selectedSigwxFrontMeta,
  selectedSigwxCloudMeta,
  lightningReferenceTimeMs,
  blinkLightning,
  lightningBlinkOff,
}) {
  const radarFrames = normalizeFrames(echoMeta?.frames?.length ? echoMeta.frames : [echoMeta?.nationwide])
  const satelliteFrames = normalizeFrames(satMeta?.frames?.length ? satMeta.frames : [satMeta?.latest])
  const lightningFrame = normalizeFrame({ tm: lightningData?.query?.tm })
  const lightningFrames = lightningFrame ? [lightningFrame] : []
  const weatherTimelineTicks = buildTimelineTicks([
    visibility.radar ? radarFrames : [],
    visibility.satellite ? satelliteFrames : [],
    visibility.lightning ? lightningFrames : [],
  ])
  const effectiveWeatherTimelineIndex = weatherTimelineTicks.length > 0
    ? weatherTimelineIndex >= 0
      ? Math.min(weatherTimelineIndex, weatherTimelineTicks.length - 1)
      : weatherTimelineTicks.length - 1
    : 0
  const selectedWeatherTimeMs = weatherTimelineTicks[effectiveWeatherTimelineIndex] ?? null
  const weatherTimelineVisible = (visibility.radar || visibility.satellite || visibility.lightning) && weatherTimelineTicks.length > 0
  const radarFrame = pickNearestPreviousFrame(radarFrames, selectedWeatherTimeMs)
  const satelliteFrame = pickNearestPreviousFrame(satelliteFrames, selectedWeatherTimeMs)
  const lightningGeoJSON = createLightningGeoJSON(lightningData, lightningReferenceTimeMs)

  const sigmetItems = advisoryItemsWithPanelData(sigmetData, 'sigmet')
  const airmetItems = advisoryItemsWithPanelData(airmetData, 'airmet')
  const visibleSigmetPayload = {
    ...sigmetData,
    items: sigmetItems.filter((item) => !(hiddenAdvisoryKeys.sigmet || []).includes(item.mapKey)),
  }
  const visibleAirmetPayload = {
    ...airmetData,
    items: airmetItems.filter((item) => !(hiddenAdvisoryKeys.airmet || []).includes(item.mapKey)),
  }
  const sigmetFeatures = advisoryItemsToFeatureCollection(visibleSigmetPayload, 'sigmet')
  const sigmetLabels = advisoryItemsToLabelFeatureCollection(visibleSigmetPayload, 'sigmet')
  const airmetFeatures = advisoryItemsToFeatureCollection(visibleAirmetPayload, 'airmet')
  const airmetLabels = advisoryItemsToLabelFeatureCollection(visibleAirmetPayload, 'airmet')

  const sigwxHistoryEntries = Array.isArray(sigwxLowHistoryData) && sigwxLowHistoryData.length > 0
    ? sigwxLowHistoryData
    : sigwxLowData
      ? [sigwxLowData]
      : []
  const selectedSigwxEntry = sigwxHistoryEntries[sigwxHistoryIndex] || sigwxHistoryEntries[0] || sigwxLowData || null
  const sigwxLowMapData = sigwxLowToMapboxData(selectedSigwxEntry, {
    hiddenGroupKeys: hiddenAdvisoryKeys.sigwxLow || [],
    filters: sigwxFilter,
  })
  const sigwxGroups = sigwxLowMapData.groups || []
  const visibleSigwxGroups = sigwxGroups.filter((group) => !group.hidden && group.enabledByFilter)
  const showVisibleSigwxFrontOverlay = visibleSigwxGroups.some((group) => group.overlayRole === 'front')
  const showVisibleSigwxCloudOverlay = visibleSigwxGroups.some((group) => group.overlayRole === 'cloud')
  const advisoryBadgeItems = [
    visibility.sigwx ? { key: 'sigwxLow', label: 'SIGWX_LOW', count: sigwxGroups.length, tone: 'sigwx' } : null,
    visibility.sigmet ? { key: 'sigmet', label: 'SIGMET', count: sigmetItems.length, tone: 'sigmet' } : null,
    visibility.airmet ? { key: 'airmet', label: 'AIRMET', count: airmetItems.length, tone: 'airmet' } : null,
  ].filter(Boolean)

  return {
    visibility,
    radarFrames,
    satelliteFrames,
    lightningFrames,
    weatherTimelineTicks,
    effectiveWeatherTimelineIndex,
    selectedWeatherTimeMs,
    weatherTimelineVisible,
    radarFrame,
    satelliteFrame,
    lightningGeoJSON,
    sigwxHistoryEntries,
    selectedSigwxEntry,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    sigwxLowMapData,
    sigwxGroups,
    visibleSigwxGroups,
    showVisibleSigwxFrontOverlay,
    showVisibleSigwxCloudOverlay,
    sigmetItems,
    airmetItems,
    sigmetFeatures,
    sigmetLabels,
    airmetFeatures,
    airmetLabels,
    advisoryBadgeItems,
    sigmetCount: sigmetFeatures.features.length,
    airmetCount: airmetFeatures.features.length,
    sigwxCount: sigwxGroups.length,
    lightningCount: lightningGeoJSON.features.length,
    radarLegendVisible: visibility.radar && !!radarFrame,
    lightningLegendVisible: visibility.lightning,
    lightningLegendEntries: LIGHTNING_AGE_BANDS.map((band) => ({
      ...band,
      color: band.color,
      label: formatReferenceTimeLabel(lightningReferenceTimeMs - band.max * 60 * 1000),
    })),
    radarReferenceTimeMs: parseFrameTmToMs(radarFrame?.tm) ?? Date.now(),
    sigwxIssueLabel: formatSigwxStamp(selectedSigwxEntry?.fetched_at),
    sigwxValidLabel: formatSigwxStamp(selectedSigwxEntry?.tmfc),
    blinkLightning,
    lightningBlinkOff,
    lightningReferenceTimeMs,
  }
}
