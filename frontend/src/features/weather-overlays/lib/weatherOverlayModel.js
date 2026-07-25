import {
  buildTimelineTicks,
  normalizeFrame,
  normalizeFrames,
  pickNearestPreviousFrame,
} from './weatherTimeline.js'
import { advisoryItemsToFeatureCollection, advisoryItemsToLabelFeatureCollection, formatAdvisoryFir } from './advisoryLayers.js'
import { phenomenonText } from '../../../shared/weather/phenomenonKo.js'
import { sigwxLowToMapboxData } from './sigwxData.js'
import { LIGHTNING_AGE_BANDS, createLightningGeoJSON } from './lightningLayers.js'

export const RADAR_MOTION_ENABLED = false

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

export function formatReferenceTimeLabel(timeMs, tz = 'KST') {
  if (!Number.isFinite(timeMs)) return '--:--'
  const offset = tz === 'KST' ? 9 * 60 * 60 * 1000 : 0
  const d = new Date(timeMs + offset)
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function parseCompactTmfcToMs(tmfc, sourceOffsetHours) {
  if (!tmfc || !/^\d{10}(\d{2})?$/.test(String(tmfc))) return null
  const raw = String(tmfc)
  const date = new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - sourceOffsetHours,
    raw.length >= 12 ? Number(raw.slice(10, 12)) : 0,
    0,
    0,
  ))
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : null
}

// SIGWX compact times are published in KST.
export function parseSigwxTmfcToMs(tmfc) {
  return parseCompactTmfcToMs(tmfc, 9)
}

// KIM/KTG compact times are published in UTC; their ISO validTime fields are
// already UTC and do not need this conversion.
export function parseUtcTmfcToMs(tmfc) {
  return parseCompactTmfcToMs(tmfc, 0)
}

function formatEpochStamp(timeMs, tz) {
  if (!Number.isFinite(timeMs)) return '-'
  const offset = tz === 'KST' ? 9 * 60 * 60 * 1000 : 0
  const d = new Date(timeMs + offset)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes} ${tz}`
}

export function formatSigwxStamp(value, tz = 'KST') {
  const timeMs = value?.includes?.('T')
    ? Date.parse(value)
    : parseSigwxTmfcToMs(value)
  return formatEpochStamp(timeMs, tz)
}

export function formatUtcTmfcStamp(value, tz = 'KST') {
  return formatEpochStamp(parseUtcTmfcToMs(value), tz)
}

export function formatAdvisoryPanelLabel(item, kind) {
  const base = kind === 'sigmet' ? 'SIGMET' : 'AIRMET'
  const sequence = item?.sequence_number ? ` ${item.sequence_number}` : ''
  const fir = formatAdvisoryFir(item)
  const firLabel = fir ? ` · ${fir}` : ''
  const phenomenon = phenomenonText(item?.phenomenon_code, item?.phenomenon_label || '')
  return `${base}${sequence}${firLabel}${phenomenon ? ` ${phenomenon}` : ''}`
}

export function formatAdvisoryValidLabel(item, tz = 'KST') {
  const start = Date.parse(item?.valid_from)
  const end = Date.parse(item?.valid_to)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return `${formatSigwxStamp(new Date(start).toISOString(), tz)} ~ ${formatSigwxStamp(new Date(end).toISOString(), tz)}`
}

function advisoryItemsWithPanelData(data, kind, tz = 'KST') {
  return (data?.items || []).map((item, index) => ({
    ...item,
    mapKey: item.id || `${kind}-${index}`,
    panelLabel: formatAdvisoryPanelLabel(item, kind),
    validLabel: formatAdvisoryValidLabel(item, tz),
  }))
}

// 해외 레이더(RainViewer) 프레임은 KMA와 형식이 다르다: tm(KST 12자리)이 아니라 timeMs(epoch)가 이미 들어있다.
// normalizeFrames는 tm 파싱 전용이라 재사용 불가 — 여기서 검증+정렬만 한다.
function normalizeRainviewerFrames(meta) {
  return (Array.isArray(meta?.frames) ? meta.frames : [])
    .filter((f) => Number.isFinite(f?.timeMs) && typeof f?.path === 'string' && f.path)
    .map((f) => ({ ...f }))
    .sort((a, b) => a.timeMs - b.timeMs)
}

// pickNearestPreviousFrame은 선택 시각이 모든 프레임보다 과거여도 null이 아니라 frames[0]을 준다
// (weatherTimeline.js: `return selected || frames[0]`). RainViewer는 2시간치뿐이라, 위성(6시간) 등이
// 타임라인을 더 과거로 늘리면 "3시간 전을 보는데 2시간 전 강수를 그리는" 시간 어긋남이 생긴다.
// → 커버 범위 밖이면 명시적으로 null. 프레임 없음 = 레이어 숨김 + 안내 문구.
function pickRainviewerFrame(frames, selectedTimeMs) {
  if (!frames.length || !Number.isFinite(selectedTimeMs)) return null
  if (selectedTimeMs < frames[0].timeMs) return null
  return pickNearestPreviousFrame(frames, selectedTimeMs)
}

export function buildWeatherOverlayModel({
  echoMeta,
  echoTopMeta,
  rainviewerMeta,
  satMeta,
  convectiveMeta,
  lightningData,
  sigwxLowData,
  sigwxLowHistoryData,
  sigmetData,
  airmetData,
  visibility = {},
  selectedWeatherTimeMs = null,
  sigwxHistoryIndex,
  sigwxFilter,
  hiddenAdvisoryKeys = {},
  selectedSigwxFrontMeta,
  selectedSigwxCloudMeta,
  lightningReferenceTimeMs,
  blinkLightning,
  lightningBlinkOff,
  nwpSelection = null,
  ktgGrid = null,
  flightCategoryGeojson = null,
  tz = 'KST',
}) {
  const radarFrames = normalizeFrames(echoMeta?.frames?.length ? echoMeta.frames : [echoMeta?.nationwide])
  const echoTopFrames = normalizeFrames(echoTopMeta?.frames?.length ? echoTopMeta.frames : [echoTopMeta?.latest])
  const rainviewerFrames = normalizeRainviewerFrames(rainviewerMeta)
  const satelliteFrames = normalizeFrames(satMeta?.frames?.length ? satMeta.frames : [satMeta?.latest])
  const convectiveFrames = normalizeFrames(convectiveMeta?.frames?.length ? convectiveMeta.frames : [convectiveMeta?.latest])
  const lightningFrame = normalizeFrame({ tm: lightningData?.query?.tm })
  const lightningFrames = lightningFrame ? [lightningFrame] : []
  const weatherTimelineTicks = buildTimelineTicks([
    visibility.radar ? radarFrames : [],
    // 해외 레이더도 국내와 대등하게 자기 눈금을 낸다(상호배타라 둘이 동시에 눈금을 내지 않는다).
    visibility.radarOverseas ? rainviewerFrames : [],
    visibility.echoTop ? echoTopFrames : [],
    (visibility.satellite || visibility.ci || visibility.ctps) ? satelliteFrames : [],
    visibility.lightning ? lightningFrames : [],
  ])
  // selectedWeatherTimeMs is the unified absolute-time axis; null = live (newest frame).
  // Scrubbing into the forecast (future) zone clamps observed layers to their newest frame.
  const firstTickMs = weatherTimelineTicks.length ? weatherTimelineTicks[0] : null
  const latestTickMs = weatherTimelineTicks.length ? weatherTimelineTicks[weatherTimelineTicks.length - 1] : null
  const resolvedWeatherTimeMs = weatherTimelineTicks.length
    ? (Number.isFinite(selectedWeatherTimeMs)
      ? Math.min(Math.max(selectedWeatherTimeMs, firstTickMs), latestTickMs)
      : latestTickMs)
    : null
  const weatherTimelineVisible = (visibility.radar || visibility.radarOverseas || visibility.echoTop || visibility.satellite || visibility.ci || visibility.ctps || visibility.lightning) && weatherTimelineTicks.length > 0
  const radarFrame = pickNearestPreviousFrame(radarFrames, resolvedWeatherTimeMs)
  // Echo Top은 재산출 산출물이라 "가장 가까운 과거 프레임" 대체가 금지된다(FR-002/FR-005).
  // 선택 시각과 tm이 정확히 같은 프레임만 쓰고, 없으면 레이어를 숨긴다.
  const echoTopExact = visibility.echoTop
    ? echoTopFrames.find((frame) => frame.timeMs === resolvedWeatherTimeMs) || null
    : null
  const echoTopFrame = echoTopExact
    ? {
      ...echoTopExact,
      partial: Number.isFinite(echoTopExact.siteCount?.ok)
        && Number.isFinite(echoTopExact.siteCount?.total)
        && echoTopExact.siteCount.ok < echoTopExact.siteCount.total,
    }
    : null
  const rainviewerFrame = pickRainviewerFrame(rainviewerFrames, resolvedWeatherTimeMs)
  const satelliteFrame = pickNearestPreviousFrame(satelliteFrames, resolvedWeatherTimeMs)
  const rawFutureSatelliteSelection = Number.isFinite(selectedWeatherTimeMs)
    && Number.isFinite(satelliteFrames.at(-1)?.timeMs)
    && selectedWeatherTimeMs > satelliteFrames.at(-1).timeMs
  const convectiveFrame = rawFutureSatelliteSelection
    ? null
    : convectiveFrames.find((frame) => frame.tm === satelliteFrame?.tm) || null
  const ciFrame = convectiveFrame?.ci ? { ...convectiveFrame, ...convectiveFrame.ci } : null
  const ctpsFrame = convectiveFrame?.ctps ? { ...convectiveFrame, ...convectiveFrame.ctps } : null
  const radarReferenceTimeMs = parseFrameTmToMs(radarFrame?.tm)
  const latestRadarFrame = radarFrames.at(-1) || null
  const latestRadarTimeMs = latestRadarFrame?.timeMs ?? null
  const motion = radarFrame?.motion || null
  const hasExactMotion = Number.isFinite(radarReferenceTimeMs)
    && Number(motion?.observedAtMs) === radarReferenceTimeMs
    && Boolean(motion?.path)
  const motionStale = hasExactMotion
    && Number.isFinite(latestRadarTimeMs)
    && latestRadarTimeMs - radarReferenceTimeMs > 20 * 60 * 1000
  const radarMotion = {
    visible: Boolean(RADAR_MOTION_ENABLED && visibility.radar && hasExactMotion && !motionStale),
    stale: Boolean(motionStale),
    frameTm: radarFrame?.tm ?? null,
    dataUrl: RADAR_MOTION_ENABLED && hasExactMotion ? motion.path : null,
    observedAtMs: RADAR_MOTION_ENABLED && hasExactMotion ? motion.observedAtMs : null,
    comparedFromMs: RADAR_MOTION_ENABLED && hasExactMotion ? motion.comparedFromMs ?? null : null,
  }
  const resolvedLightningReferenceTimeMs = visibility.radar && Number.isFinite(radarReferenceTimeMs)
    ? radarReferenceTimeMs
    : lightningReferenceTimeMs
  const lightningGeoJSON = createLightningGeoJSON(lightningData, resolvedLightningReferenceTimeMs)

  const sigmetItems = advisoryItemsWithPanelData(sigmetData, 'sigmet', tz)
  const airmetItems = advisoryItemsWithPanelData(airmetData, 'airmet', tz)
  const visibleSigmetPayload = {
    ...sigmetData,
    items: sigmetItems.filter((item) => !(hiddenAdvisoryKeys.sigmet || []).includes(item.mapKey)),
  }
  const visibleAirmetPayload = {
    ...airmetData,
    items: airmetItems.filter((item) => !(hiddenAdvisoryKeys.airmet || []).includes(item.mapKey)),
  }
  // 국내(KMA)/해외(NOAA=source:'NOAA')로 SIGMET 지도 레이어를 분리 — 각각 독립 토글.
  // 뱃지·목록(sigmetItems)은 합쳐서 유지(위험 요약은 하나), 지도 폴리곤만 두 레이어로 나눔.
  const domesticSigmetPayload = { ...visibleSigmetPayload, items: visibleSigmetPayload.items.filter((i) => i.source !== 'NOAA') }
  const intlSigmetPayload = { ...visibleSigmetPayload, items: visibleSigmetPayload.items.filter((i) => i.source === 'NOAA') }
  const sigmetFeatures = advisoryItemsToFeatureCollection(domesticSigmetPayload, 'sigmet', tz)
  const sigmetLabels = advisoryItemsToLabelFeatureCollection(domesticSigmetPayload, 'sigmet', tz)
  const sigmetIntlFeatures = advisoryItemsToFeatureCollection(intlSigmetPayload, 'sigmet_intl', tz)
  const sigmetIntlLabels = advisoryItemsToLabelFeatureCollection(intlSigmetPayload, 'sigmet_intl', tz)
  const airmetFeatures = advisoryItemsToFeatureCollection(visibleAirmetPayload, 'airmet', tz)
  const airmetLabels = advisoryItemsToLabelFeatureCollection(visibleAirmetPayload, 'airmet', tz)

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
  // SIGMET/AIRMET은 위험 알림이라 레이어 토글과 무관하게 활성(count>0)이면 상시 표시.
  // SIGWX_LOW는 차트 레이어라 레이어를 켰을 때만 동반 뱃지로 노출(기존 유지).
  // 상단 SIGMET 칩은 국내(KMA)만 카운트. 해외(NOAA)는 기상레이어 패널의 'SIGMET(해외)' 토글로만 표시.
  const domesticSigmetCount = sigmetItems.filter((i) => i.source !== 'NOAA').length
  const advisoryBadgeItems = [
    visibility.sigwx ? { key: 'sigwxLow', label: 'SIGWX_LOW', count: sigwxGroups.length, tone: 'sigwx' } : null,
    domesticSigmetCount > 0 ? { key: 'sigmet', label: 'SIGMET', count: domesticSigmetCount, tone: 'sigmet' } : null,
    airmetItems.length > 0 ? { key: 'airmet', label: 'AIRMET', count: airmetItems.length, tone: 'airmet' } : null,
  ].filter(Boolean)

  return {
    visibility,
    radarFrames,
    echoTopFrames,
    rainviewerMeta: rainviewerMeta || null,
    rainviewerFrames,
    satelliteFrames,
    convectiveFrames,
    lightningFrames,
    weatherTimelineTicks,
    selectedWeatherTimeMs: resolvedWeatherTimeMs,
    weatherTimelineVisible,
    radarFrame,
    echoTopFrame,
    radarMotion,
    rainviewerFrame,
    satelliteFrame,
    ciFrame,
    ctpsFrame,
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
    sigmetIntlFeatures,
    sigmetIntlLabels,
    airmetFeatures,
    airmetLabels,
    advisoryBadgeItems,
    sigmetCount: sigmetFeatures.features.length,
    sigmetIntlCount: sigmetIntlFeatures.features.length,
    airmetCount: airmetFeatures.features.length,
    sigwxCount: sigwxGroups.length,
    lightningCount: lightningGeoJSON.features.length,
    radarLegendVisible: visibility.radar && !!radarFrame,
    radarOverseasLegendVisible: !!visibility.radarOverseas,
    // 레이어는 켰는데 선택 시각이 RainViewer 커버(최근 2시간) 밖 — 조용히 사라지면 고장으로 보인다.
    rainviewerOutOfRange: !!visibility.radarOverseas && rainviewerFrames.length > 0 && !rainviewerFrame,
    lightningLegendVisible: visibility.lightning,
    lightningLegendEntries: LIGHTNING_AGE_BANDS.map((band) => ({
      ...band,
      color: band.color,
      label: formatReferenceTimeLabel(resolvedLightningReferenceTimeMs - band.max * 60 * 1000, tz),
    })),
    radarReferenceTimeMs: radarReferenceTimeMs ?? Date.now(),
    sigwxIssueLabel: formatSigwxStamp(selectedSigwxEntry?.fetched_at, tz),
    sigwxValidLabel: formatSigwxStamp(selectedSigwxEntry?.tmfc, tz),
    nwpIssueLabel: formatUtcTmfcStamp(nwpSelection?.tmfc ?? null, tz),
    nwpValidLabel: (() => {
      const base = parseUtcTmfcToMs(nwpSelection?.tmfc)
      const hf = Number(nwpSelection?.hf)
      if (!Number.isFinite(base) || !Number.isFinite(hf)) return '-'
      return formatSigwxStamp(new Date(base + hf * 3600000).toISOString(), tz)
    })(),
    ktgIssueLabel: formatUtcTmfcStamp(ktgGrid?.run?.tmfc ?? null, tz),
    ktgValidLabel: formatSigwxStamp(ktgGrid?.run?.validTime ?? null, tz),
    flightCategoryIssueLabel: formatSigwxStamp(flightCategoryGeojson?.fetched_at ?? null, tz),
    blinkLightning,
    lightningBlinkOff,
    lightningReferenceTimeMs: resolvedLightningReferenceTimeMs,
  }
}
