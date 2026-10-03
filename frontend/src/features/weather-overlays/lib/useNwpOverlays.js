import { useEffect, useMemo, useState } from 'react'
import { useKimSurfaceWind } from './useKimSurfaceWind.js'
import { useKimTemperature } from './useKimTemperature.js'
import { useKimCloudPotential } from './useKimCloudPotential.js'
import { useKimIcing } from './useKimIcing.js'
import { useKtgTurbulence } from './useKtgTurbulence.js'
import { useKimGktg } from './useKimGktg.js'
import { getCloudPotentialMaxSpread } from './cloudPotentialField.js'
import { pickNearestNwp } from './timelineRailModel.js'
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
  const tempEnabled = enableWindOverlay && metVisibility.temp
  const cloudEnabled = enableWindOverlay && metVisibility.cloud
  const icingEnabled = enableWindOverlay && metVisibility.icing
  const turbulenceEnabled = enableWindOverlay && metVisibility.turbulence
  const legacyKtgPinned = pinned && !!pinnedModel(mapDataSelection, 'ktg') && !pinnedModel(mapDataSelection, 'gktg')
  const anyKimActive = windEnabled || tempEnabled || cloudEnabled || icingEnabled || (turbulenceEnabled && !legacyKtgPinned)

  useEffect(() => {
    if (!pinned) return
    setNwpSelection((previous) => {
      const next = pinnedKimSelection(mapDataSelection, { level: previous?.level, variable: metVisibility.turbulence && !legacyKtgPinned ? 'gktg' : 'wind' })
      if (!next) return null
      return previous?.bundleId === next.bundleId
        && previous?.tmfc === next.tmfc
        && Number(previous?.hf) === Number(next.hf)
        && previous?.level === next.level
        && previous?.revision === next.revision ? previous : next
    })
  }, [pinned, mapDataSelection, metVisibility.turbulence, legacyKtgPinned])

  const pinOptions = { dataMode, mapDataSelection }
  const pinnedLevel = nwpSelection?.level
  const windSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'wind' }) : nwpSelection
  const temperatureSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'temperature' }) : nwpSelection
  const cloudSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'cloud' }) : nwpSelection
  const icingSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'icing' }) : nwpSelection
  const kimSurfaceWind = useKimSurfaceWind(windEnabled, windSelection, setNwpSelection, pinOptions)
  const kimTemperature = useKimTemperature(tempEnabled, temperatureSelection, setNwpSelection, pinOptions)
  const kimCloudPotential = useKimCloudPotential(cloudEnabled, cloudSelection, setNwpSelection, pinOptions)
  const kimIcing = useKimIcing(icingEnabled, icingSelection, setNwpSelection, pinOptions)
  const gktgSelection = pinned ? pinnedKimSelection(mapDataSelection, { level: pinnedLevel, variable: 'gktg' }) : nwpSelection
  const ktgTurbulence = useKimGktg(turbulenceEnabled && !legacyKtgPinned, gktgSelection, setNwpSelection, pinOptions)

  const legacyKtg = useKtgTurbulence(turbulenceEnabled && legacyKtgPinned, nwpSelection, pinOptions)

  const windRendererOptions = useMemo(() => ({
    ...(kimSurfaceWind.lowPower
      ? { desktopCap: 800, mobileCap: 800, frameCap: 15, sampleStep: 4, pixelRatioCap: 1.5 }
      : {}),
    adaptiveParticleDensity: true,
    zoomAdaptiveDensity: true,
    samplerLod: true,
    flowColorMode: metVisibility.windSpeed ? 'neutral' : 'speed',
    flowOpacity: windFlowOpacity,
    flowWidth: windFlowWidth,
    trailPersistence: windFlowTrail,
  }), [kimSurfaceWind.lowPower, metVisibility.windSpeed, windFlowOpacity, windFlowTrail, windFlowWidth])

  const nwpSliderSource = metVisibility.turbulence
    ? ktgTurbulence
    : metVisibility.icing
    ? kimIcing
    : metVisibility.cloud
    ? kimCloudPotential
    : metVisibility.temp
      ? kimTemperature
      : kimSurfaceWind

  const nwpSliderIndex = metVisibility.turbulence
    ? ktgTurbulence.gktgIndex
    : metVisibility.icing
    ? kimIcing.icingIndex
    : metVisibility.cloud
    ? kimCloudPotential.cloudIndex
    : metVisibility.temp
      ? kimTemperature.temperatureIndex
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

  const pinnedVariable = metVisibility.turbulence ? 'gktg' : metVisibility.icing ? 'icing' : metVisibility.cloud ? 'cloud' : metVisibility.temp ? 'temperature' : 'wind'
  const pinnedSliderLevels = pinnedKimLevels(mapDataSelection, pinnedVariable)
    .filter((id) => /^\d+(?:\.\d+)?hPa$/.test(id) && pinnedKimSelection(mapDataSelection, { level: id, variable: pinnedVariable }))
    .map((id) => ({ id, kind: 'pressure', value: Number.parseFloat(id) }))
  const pinnedAvailability = Object.fromEntries(pinnedSliderLevels.map(({ id }) => [id, { [String(pinnedKimModel?.hf)]: true }]))

  return {
    // map sync
    windField: kimSurfaceWind.windField,
    windRendererOptions,
    temperatureField: kimTemperature.temperatureField,
    cloudField: kimCloudPotential.cloudField,
    icingField: kimIcing.icingField,
    ktgGrid: legacyKtgPinned ? legacyKtg.ktgGrid : ktgTurbulence.gktgField,
    // WeatherOverlayPanel status + controls
    windStatus: kimSurfaceWind.status,
    tempStatus: kimTemperature.status,
    cloudStatus: kimCloudPotential.status,
    icingStatus: kimIcing.status,
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
