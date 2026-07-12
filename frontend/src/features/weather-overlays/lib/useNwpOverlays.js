import { useEffect, useMemo, useState } from 'react'
import { useKimSurfaceWind } from './useKimSurfaceWind.js'
import { useKimTemperature } from './useKimTemperature.js'
import { useKimCloudPotential } from './useKimCloudPotential.js'
import { useKimIcing } from './useKimIcing.js'
import { useKtgTurbulence } from './useKtgTurbulence.js'
import { getCloudPotentialMaxSpread } from './cloudPotentialField.js'
import { pickNearestNwp } from './timelineRailModel.js'

export function useNwpOverlays({ enableWindOverlay, metVisibility, windFlowOpacity, windFlowTrail, windFlowWidth, timelineSelectedMs = null }) {
  const [nwpSelection, setNwpSelection] = useState(null)

  const windEnabled = enableWindOverlay && metVisibility.wind
  const tempEnabled = enableWindOverlay && metVisibility.temp
  const cloudEnabled = enableWindOverlay && metVisibility.cloud
  const icingEnabled = enableWindOverlay && metVisibility.icing
  const turbulenceEnabled = enableWindOverlay && metVisibility.turbulence
  const anyKimActive = windEnabled || tempEnabled || cloudEnabled || icingEnabled

  const kimSurfaceWind = useKimSurfaceWind(windEnabled, nwpSelection, setNwpSelection)
  const kimTemperature = useKimTemperature(tempEnabled, nwpSelection, setNwpSelection)
  const kimCloudPotential = useKimCloudPotential(cloudEnabled, nwpSelection, setNwpSelection)
  const kimIcing = useKimIcing(icingEnabled, nwpSelection, setNwpSelection)
  const ktgTurbulence = useKtgTurbulence(turbulenceEnabled, nwpSelection)

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

  const nwpSliderSource = metVisibility.icing
    ? kimIcing
    : metVisibility.cloud
    ? kimCloudPotential
    : metVisibility.temp
      ? kimTemperature
      : kimSurfaceWind

  const nwpSliderIndex = metVisibility.icing
    ? kimIcing.icingIndex
    : metVisibility.cloud
    ? kimCloudPotential.cloudIndex
    : metVisibility.temp
      ? kimTemperature.temperatureIndex
      : kimSurfaceWind.windIndex

  // 메인 타임라인이 예보시각을 소유: 활성 예보 레이어(KIM 우선, 없으면 난류)의 시간 목록.
  const sliderTimes = anyKimActive
    ? nwpSliderSource.availableTimes
    : (turbulenceEnabled ? ktgTurbulence.availableTimes : [])

  // 메인 타임라인 스크럽(절대시각) → 가장 가까운 예보시간(hf)으로 공유 selection 갱신.
  // NWP·난류가 함께 그 예보시각으로 따라감. 라이브(selectedMs=null)면 기본 예보시각 유지.
  useEffect(() => {
    if (!Number.isFinite(timelineSelectedMs)) return
    const nearest = pickNearestNwp(sliderTimes, timelineSelectedMs)
    if (!nearest) return
    setNwpSelection((prev) => {
      if (prev && Number(prev.hf) === Number(nearest.hf)) return prev
      return prev ? { ...prev, hf: Number(nearest.hf) } : { hf: Number(nearest.hf) }
    })
  }, [timelineSelectedMs, sliderTimes])

  return {
    // map sync
    windField: kimSurfaceWind.windField,
    windRendererOptions,
    temperatureField: kimTemperature.temperatureField,
    cloudField: kimCloudPotential.cloudField,
    icingField: kimIcing.icingField,
    ktgGrid: ktgTurbulence.ktgGrid,
    // WeatherOverlayPanel status + controls
    windStatus: kimSurfaceWind.status,
    tempStatus: kimTemperature.status,
    cloudStatus: kimCloudPotential.status,
    icingStatus: kimIcing.status,
    turbulenceStatus: ktgTurbulence.status,
    lowPower: kimSurfaceWind.lowPower,
    // WeatherLegends
    cloudMaxSpread: getCloudPotentialMaxSpread(kimCloudPotential.cloudField),
    // KTG turbulence altitude slider
    altLevelsFt: ktgTurbulence.altLevelsFt,
    selectedAltFt: ktgTurbulence.selectedAltFt,
    setSelectedAltFt: ktgTurbulence.setSelectedAltFt,
    // NWP 레벨 레일은 KIM 활성 시에만(난류는 자체 고도 레일 사용). 시간축은 메인 타임라인 공유.
    sliderLevels: anyKimActive ? nwpSliderSource.availableLevels : [],
    sliderTimes,
    sliderAvailability: nwpSliderIndex?.availability,
    nwpSelection,
    setNwpSelection,
  }
}
