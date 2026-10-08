import { useEffect, useMemo, useState } from 'react'
import { useKimSurfaceWind, selectFallbackKimNwpSelection } from './useKimSurfaceWind.js'
import { useKimTemperature } from './useKimTemperature.js'
import { useKimCloudPotential } from './useKimCloudPotential.js'
import { useKimIcing } from './useKimIcing.js'
import { useKtgTurbulence } from './useKtgTurbulence.js'
import { useKimGktg } from './useKimGktg.js'
import { getCloudPotentialMaxSpread } from './cloudPotentialField.js'
import { pickNearestNwp } from './timelineRailModel.js'
import { compatibleKimFields, fieldMatchesSelection, isCloudIcingVisible } from './cloudIcingModel.js'
import {
  pinnedKimLevels,
  pinnedKimSelection,
  pinnedModel,
} from '../../organization-lounge/lib/pinnedMapDataSelection.js'

export function useNwpOverlays({
  enableWindOverlay,
  metVisibility,
  windFlowOpacity,
  windFlowTrail,
  windFlowWidth,
  timelineSelectedMs = null,
  dataMode = 'live',
  mapDataSelection = null,
}) {
  const [nwpSelection, setNwpSelection] = useState(null)
  const pinned = dataMode === 'pinned'

  const windEnabled = enableWindOverlay && metVisibility.wind
  const combinedEnabled = enableWindOverlay && isCloudIcingVisible(metVisibility)
  const tempEnabled = combinedEnabled
  const cloudEnabled = combinedEnabled && metVisibility.cloud
  const icingEnabled = combinedEnabled && metVisibility.icing
  const turbulenceEnabled = enableWindOverlay && metVisibility.turbulence
  const legacyKtgPinned = pinned && !!pinnedModel(mapDataSelection, 'ktg') && !pinnedModel(mapDataSelection, 'gktg')
  const anyKimActive = windEnabled || tempEnabled || cloudEnabled || icingEnabled || (turbulenceEnabled && !legacyKtgPinned)

  useEffect(() => {
    if (!pinned) return
    setNwpSelection((previous) => {
      const variable = metVisibility.turbulence && !legacyKtgPinned ? 'gktg' : combinedEnabled ? 'temperature' : 'wind'
      const level = combinedEnabled && !/^\d+(?:\.\d+)?hPa$/.test(previous?.level)
        ? pinnedKimLevels(mapDataSelection).find(id => /^\d+(?:\.\d+)?hPa$/.test(id)) : previous?.level
      const next = pinnedKimSelection(mapDataSelection, { level, variable })
        ?? (combinedEnabled ? pinnedKimSelection(mapDataSelection, { level, variable: 'cloud' }) ?? pinnedKimSelection(mapDataSelection, { level, variable: 'icing' }) : null)
      if (!next || (combinedEnabled && !/^\d+(?:\.\d+)?hPa$/.test(next.level))) return null
      return previous?.bundleId === next.bundleId
        && previous?.tmfc === next.tmfc
        && Number(previous?.hf) === Number(next.hf)
        && previous?.level === next.level
        && previous?.revision === next.revision ? previous : next
    })
  }, [pinned, mapDataSelection, metVisibility.turbulence, legacyKtgPinned, combinedEnabled])

  const pinOptions = { dataMode, mapDataSelection }
  const pinnedLevel = nwpSelection?.level
  const windSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'wind' }) : nwpSelection
  const temperatureSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'temperature' }) : nwpSelection
  const cloudSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'cloud' }) : nwpSelection
  const icingSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'icing' }) : nwpSelection
  const kimSurfaceWind = useKimSurfaceWind(windEnabled, windSelection, setNwpSelection, pinOptions)
  const kimTemperature = useKimTemperature(tempEnabled, temperatureSelection, setNwpSelection, { ...pinOptions, pressureOnly: true })
  const kimCloudPotential = useKimCloudPotential(cloudEnabled, cloudSelection, null, pinOptions)
  const kimIcing = useKimIcing(icingEnabled, icingSelection, null, pinOptions)
  const gktgSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'gktg' }) : nwpSelection
  const ktgTurbulence = useKimGktg(turbulenceEnabled && !legacyKtgPinned, gktgSelection, setNwpSelection, pinOptions)

  const legacyKtg = useKtgTurbulence(turbulenceEnabled && legacyKtgPinned, nwpSelection, pinOptions)

  // T 자료 목록 조회가 실패해도 다른 정상 자료의 목록으로 공통 선택을 유지한다.
  // 자식 훅이 각자 고도·시간을 변경하지 않고, 여기서 하나의 선택만 정한다.
  const combinedSource = kimTemperature.temperatureIndex ? kimTemperature : kimCloudPotential.cloudIndex ? kimCloudPotential : kimIcing
  const combinedIndex = kimTemperature.temperatureIndex ?? kimCloudPotential.cloudIndex ?? kimIcing.icingIndex
  useEffect(() => {
    if (pinned || !combinedEnabled || kimTemperature.temperatureIndex || !combinedIndex) return
    setNwpSelection(previous => selectFallbackKimNwpSelection(combinedIndex, previous) || previous)
  }, [pinned, combinedEnabled, kimTemperature.temperatureIndex, combinedIndex])

  const windRendererOptions = useMemo(() => ({
    ...(kimSurfaceWind.lowPower
      ? { desktopCap: 800, mobileCap: 800, frameCap: 15, sampleStep: 4, pixelRatioCap: 1.5 }
      : {}),
    adaptiveParticleDensity: true,
    zoomAdaptiveDensity: true,
    samplerLod: true,
    // 지상일기도 바람처럼 줌 6보다 멀리 볼수록 입자 속도를 올려 화면상 꼬리 길이를 유지한다(확대 영역에서 점처럼 보였다).
    zoomSpeedReference: 6,
    flowColorMode: metVisibility.windSpeed ? 'neutral' : 'speed',
    flowOpacity: windFlowOpacity,
    flowWidth: windFlowWidth,
    trailPersistence: windFlowTrail,
  }), [kimSurfaceWind.lowPower, metVisibility.windSpeed, windFlowOpacity, windFlowTrail, windFlowWidth])

  const nwpSliderSource = metVisibility.turbulence
    ? ktgTurbulence
    : combinedEnabled
      ? combinedSource
      : kimSurfaceWind

  const nwpSliderIndex = metVisibility.turbulence
    ? ktgTurbulence.gktgIndex
    : combinedEnabled
      ? combinedIndex
      : kimSurfaceWind.windIndex

  // 메인 타임라인이 예보시각을 소유: 활성 예보 레이어(KIM 우선, 없으면 난류)의 시간 목록.
  const pinnedKimModel = pinnedModel(mapDataSelection, metVisibility.turbulence && !legacyKtgPinned ? 'gktg' : 'kim')
  const sliderTimes = pinned && anyKimActive
    ? (pinnedKimModel?.validTime ? [{ tmfc: pinnedKimModel.tmfc, hf: pinnedKimModel.hf, validTime: pinnedKimModel.validTime }] : [])
    : anyKimActive
    ? nwpSliderSource.availableTimes
    : (turbulenceEnabled ? legacyKtg.availableTimes : [])

  // 메인 타임라인 스크럽(절대시각) → 가장 가까운 예보시간(hf)으로 공유 selection 갱신.
  // NWP·난류가 함께 그 예보시각으로 따라감. 라이브(selectedMs=null)면 기본 예보시각 유지.
  useEffect(() => {
    if (pinned || !Number.isFinite(timelineSelectedMs)) return
    const nearest = pickNearestNwp(sliderTimes, timelineSelectedMs)
    if (!nearest) return
    setNwpSelection((prev) => {
      if (prev && Number(prev.hf) === Number(nearest.hf)) return prev
      return prev ? { ...prev, hf: Number(nearest.hf) } : { hf: Number(nearest.hf) }
    })
  }, [pinned, timelineSelectedMs, sliderTimes])

  const pinnedVariable = metVisibility.turbulence ? 'gktg' : combinedEnabled ? 'temperature' : 'wind'
  const pinnedSliderLevels = pinnedKimLevels(mapDataSelection, pinnedVariable)
    .filter((id) => /^\d+(?:\.\d+)?hPa$/.test(id) && (combinedEnabled ? ['temperature', 'cloud', 'icing'] : [pinnedVariable]).some(variable => pinnedKimSelection(mapDataSelection, { level: id, variable })))
    .map((id) => ({ id, kind: 'pressure', value: Number.parseFloat(id) }))
  const pinnedAvailability = Object.fromEntries(pinnedSliderLevels.map(({ id }) => [id, { [String(pinnedKimModel?.hf)]: true }]))

  const expectedSelection = nwpSelection
  const temperatureField = fieldMatchesSelection(kimTemperature.temperatureField, expectedSelection) ? kimTemperature.temperatureField : null
  const cloudField = fieldMatchesSelection(kimCloudPotential.cloudField, expectedSelection) ? kimCloudPotential.cloudField : null
  const icingField = fieldMatchesSelection(kimIcing.icingField, expectedSelection) ? kimIcing.icingField : null
  const aligned = compatibleKimFields([temperatureField, cloudField, icingField])

  return {
    // map sync
    windField: kimSurfaceWind.windField,
    windRendererOptions,
    temperatureField,
    cloudField: aligned ? cloudField : null,
    icingField: aligned ? icingField : null,
    ktgGrid: legacyKtgPinned ? legacyKtg.ktgGrid : ktgTurbulence.gktgField,
    // WeatherOverlayPanel status + controls
    windStatus: kimSurfaceWind.status,
    tempStatus: kimTemperature.status,
    cloudStatus: aligned ? kimCloudPotential.status : 'error',
    icingStatus: aligned ? kimIcing.status : 'error',
    turbulenceStatus: legacyKtgPinned ? legacyKtg.status : ktgTurbulence.status,
    lowPower: kimSurfaceWind.lowPower,
    // WeatherLegends
    cloudMaxSpread: getCloudPotentialMaxSpread(kimCloudPotential.cloudField),
    // KTG turbulence altitude slider
    altLevelsFt: legacyKtgPinned ? legacyKtg.altLevelsFt : [],
    selectedAltFt: legacyKtg.selectedAltFt,
    setSelectedAltFt: legacyKtg.setSelectedAltFt,
    // NWP 레벨 레일은 KIM 활성 시에만(난류는 자체 고도 레일 사용). 시간축은 메인 타임라인 공유.
    sliderLevels: anyKimActive ? (pinned ? pinnedSliderLevels : nwpSliderSource.availableLevels) : [],
    sliderTimes,
    sliderAvailability: pinned ? pinnedAvailability : nwpSliderIndex?.availability,
    nwpSelection,
    setNwpSelection,
  }
}
