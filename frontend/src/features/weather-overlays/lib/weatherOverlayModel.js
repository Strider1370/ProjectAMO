import {
  buildTimelineTicks,
  normalizeFrame,
  normalizeFrames,
  pickNearestPreviousFrame,
} from './weatherTimeline.js'
import { advisoryItemsToFeatureCollection, advisoryItemsToLabelFeatureCollection, formatAdvisoryFir } from './advisoryLayers.js'
import { phenomenonText } from '../../../shared/weather/phenomenonKo.js'
import { sigwxLowToMapboxData } from './sigwxData.js'
import { LIGHTNING_AGE_BANDS, LIGHTNING_RECENT_COUNT_WINDOW_MINUTES, createLightningGeoJSON } from './lightningLayers.js'

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

function normalizeWissdomFrames(meta, heightM) {
  const frames = meta?.framesByHeight?.[String(heightM)] || meta?.framesByHeight?.[heightM] || []
  return normalizeFrames(frames)
}

function normalizeQpfFrames(meta) {
  const normalized = (Array.isArray(meta?.frames) ? meta.frames : [])
    .map((frame) => {
      const timeMs = Number.isFinite(frame?.timeMs) ? frame.timeMs : parseFrameTmToMs(frame?.tm)
      const analysisTimeMs = Number.isFinite(frame?.analysisTimeMs) ? frame.analysisTimeMs : timeMs
      const validTimeMs = Number(frame?.validTimeMs)
      const leadMinutes = Number(frame?.leadMinutes)
      if (!Number.isFinite(timeMs) || !Number.isFinite(analysisTimeMs) || !Number.isFinite(validTimeMs) || !Number.isFinite(leadMinutes) || validTimeMs <= analysisTimeMs) return null
      return { ...frame, timeMs, analysisTimeMs, validTimeMs, leadMinutes }
    })
    .filter(Boolean)
    .sort((a, b) => a.validTimeMs - b.validTimeMs || b.analysisTimeMs - a.analysisTimeMs)
  return normalized.filter((frame, index) => index === 0 || normalized[index - 1].validTimeMs !== frame.validTimeMs)
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
  wissdomMeta,
  qpfMeta,
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
  radarWindHeightM = null,
  radarWindRequested = false,
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
  tz = 'KST',
}) {
  const radarFrames = normalizeFrames(echoMeta?.frames?.length ? echoMeta.frames : [echoMeta?.nationwide])
  const wissdomFrames = normalizeWissdomFrames(wissdomMeta, radarWindHeightM)
  const qpfFrames = normalizeQpfFrames(qpfMeta)
  const forecastTimelineTicks = [...new Set(qpfFrames.map((frame) => frame.validTimeMs))]
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
  const timelineTicks = [...new Set([...weatherTimelineTicks, ...forecastTimelineTicks])].sort((a, b) => a - b)
  const firstTickMs = timelineTicks.length ? timelineTicks[0] : null
  const latestTickMs = timelineTicks.length ? timelineTicks[timelineTicks.length - 1] : null
  const resolvedWeatherTimeMs = timelineTicks.length
    ? (Number.isFinite(selectedWeatherTimeMs)
      ? Math.min(Math.max(selectedWeatherTimeMs, firstTickMs), latestTickMs)
      : (weatherTimelineTicks.at(-1) ?? null))
    : null
  const weatherTimelineVisible = (visibility.radar || visibility.radarOverseas || visibility.echoTop || visibility.satellite || visibility.ci || visibility.ctps || visibility.lightning) && timelineTicks.length > 0
  const observedRadarFrame = pickNearestPreviousFrame(radarFrames, resolvedWeatherTimeMs)
  const qpfFrame = qpfFrames.find((frame) => frame.validTimeMs === selectedWeatherTimeMs) || null
  const radarFrame = qpfFrame ? null : observedRadarFrame
  const radarDisplayVisible = Boolean(visibility.radar && radarFrame)
  const wissdomExactFrame = observedRadarFrame
    ? wissdomFrames.find((frame) => frame.tm === observedRadarFrame.tm) || null
    : null
  const wissdomAvailable = Boolean(visibility.radar && !qpfFrame && wissdomExactFrame)
  const wissdomFrame = radarWindRequested && wissdomAvailable ? wissdomExactFrame : null
  const qpfStatus = qpfFrame
    ? {
      source: 'MAPLE',
      analysisTimeMs: qpfFrame.analysisTimeMs,
      validTimeMs: qpfFrame.validTimeMs,
      leadMinutes: qpfFrame.leadMinutes,
      unit: 'mm/h',
    }
    : null
  // Echo Top은 레이더와 같은 선택 규칙을 쓴다 — 같이 켜면 같이 보이고 같이 사라진다.
  // 수집 지연도 레이더와 같게 맞춰(config.radar_echo_top.delay_minutes) 평상시엔 시각이 일치하고,
  // 한 주기를 놓쳤을 때만 직전 프레임이 대신 나온다.
  // 그 경우를 감추지 않기 위해 stale(선택 시각보다 과거)임을 표시로 남긴다 — 범례·상세정보가
  // 프레임의 실제 관측시각을 그대로 보여주므로, 5분 전 자료가 현재 시각으로 위장되지는 않는다.
  // pickNearestPreviousFrame은 선택 시각이 모든 프레임보다 과거여도 null이 아니라 frames[0]을 준다
  // (weatherTimeline.js: `return selected || frames[0]`). 그대로 두면 아직 관측되지도 않은
  // 미래 프레임이 현재 시각의 자료처럼 표시된다 — RainViewer가 같은 이유로 두는 가드다.
  const echoTopSelected = visibility.echoTop
    && echoTopFrames.length
    && Number.isFinite(resolvedWeatherTimeMs)
    && resolvedWeatherTimeMs >= echoTopFrames[0].timeMs
    ? pickNearestPreviousFrame(echoTopFrames, resolvedWeatherTimeMs)
    : null
  const echoTopFrame = echoTopSelected
    ? {
      ...echoTopSelected,
      partial: Number.isFinite(echoTopSelected.siteCount?.ok)
        && Number.isFinite(echoTopSelected.siteCount?.total)
        && echoTopSelected.siteCount.ok < echoTopSelected.siteCount.total,
      stale: Number.isFinite(resolvedWeatherTimeMs) && echoTopSelected.timeMs < resolvedWeatherTimeMs,
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
  const motion = radarFrame?.motion || null
  // 표시 조건은 "선택 시각과 motion.tm이 정확히 일치"뿐이다(스펙 참조) — 3시간 보존 구간
  // 전부가 이 조건을 만족하면 다 보여준다. 최신 시각과의 근접도로 추가로 거르지 않는다.
  const hasExactMotion = Number.isFinite(radarReferenceTimeMs)
    && Number(motion?.observedAtMs) === radarReferenceTimeMs
    && Boolean(motion?.path)
  const radarMotion = {
    visible: Boolean(radarDisplayVisible && hasExactMotion),
    frameTm: radarFrame?.tm ?? null,
    dataUrl: radarDisplayVisible && hasExactMotion ? motion.path : null,
    observedAtMs: radarDisplayVisible && hasExactMotion ? motion.observedAtMs : null,
    comparedFromMs: radarDisplayVisible && hasExactMotion ? motion.comparedFromMs ?? null : null,
  }
  // 낙뢰 나이의 기준시각. 벽시계를 쓰면 수집이 늦어질수록 방금 친 번개가 밴드를 넘겨
  // 30분 창 밖으로 사라진다 — 낙뢰 자료 자신의 수집시각을 기준으로 재고, 그 시각이
  // 없을 때만 벽시계로 물러난다. (범례는 이 기준시각을 실제 시계 시각으로 찍어 주므로
  // 자료가 오래됐다는 사실이 감춰지지는 않는다.)
  const lightningCollectedAtMs = new Date(lightningData?.fetched_at ?? NaN).getTime()
  const resolvedLightningReferenceTimeMs = visibility.radar && Number.isFinite(radarReferenceTimeMs)
    ? radarReferenceTimeMs
    : (Number.isFinite(lightningCollectedAtMs) ? lightningCollectedAtMs : lightningReferenceTimeMs)
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
    wissdomFrames,
    qpfFrames,
    echoTopFrames,
    rainviewerMeta: rainviewerMeta || null,
    rainviewerFrames,
    satelliteFrames,
    convectiveFrames,
    lightningFrames,
    weatherTimelineTicks,
    forecastTimelineTicks,
    selectedWeatherTimeMs: resolvedWeatherTimeMs,
    weatherTimelineVisible,
    radarFrame,
    radarDisplayVisible,
    wissdomFrame,
    wissdomAvailable,
    qpfFrame,
    qpfStatus,
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
    lightningCount: lightningGeoJSON.features.filter((f) => f.properties.ageMinutes < LIGHTNING_RECENT_COUNT_WINDOW_MINUTES).length,
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
    nwpSelection,
    nwpValidLabel: (() => {
      const base = parseUtcTmfcToMs(nwpSelection?.tmfc)
      const hf = Number(nwpSelection?.hf)
      if (!Number.isFinite(base) || !Number.isFinite(hf)) return '-'
      return formatSigwxStamp(new Date(base + hf * 3600000).toISOString(), tz)
    })(),
    ktgIssueLabel: formatUtcTmfcStamp(ktgGrid?.run?.tmfc ?? null, tz),
    ktgValidLabel: formatSigwxStamp(ktgGrid?.run?.validTime ?? null, tz),
    blinkLightning,
    lightningBlinkOff,
    lightningReferenceTimeMs: resolvedLightningReferenceTimeMs,
  }
}
