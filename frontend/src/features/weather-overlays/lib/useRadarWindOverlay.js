import { useEffect, useState } from 'react'

export const WISSDOM_HEIGHTS_M = Object.freeze([305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048])
export const INITIAL_WISSDOM_HEIGHT_M = 1524

export function deriveRadarWindOverlayState({ requestedVisible, radarEnabled, exactFrameAvailable }) {
  const nextRequestedVisible = Boolean(requestedVisible && radarEnabled)
  return {
    requestedVisible: nextRequestedVisible,
    effectiveVisible: Boolean(nextRequestedVisible && exactFrameAvailable),
  }
}

export function resolveVerticalRailSource({ preferredSource, kimActive, radarWindActive }) {
  if (kimActive && radarWindActive) return preferredSource === 'wissdom' ? 'wissdom' : 'kim'
  if (radarWindActive) return 'wissdom'
  if (kimActive) return 'kim'
  return null
}

export function deriveRadarWindRailActive({ requestedVisible, effectiveVisible }) {
  void effectiveVisible
  return Boolean(requestedVisible)
}

export function hasExactRadarWindFrame({ radarFrame, wissdomMeta, heightM }) {
  return Boolean(
    radarFrame?.tm
    && wissdomMeta?.framesByHeight?.[String(heightM)]?.some((frame) => frame?.tm === radarFrame.tm),
  )
}

export default function useRadarWindOverlay({ radarEnabled, availableHeightsM, exactFrameAvailable }) {
  const [requestedVisible, setRequestedVisible] = useState(false)
  const [heightM, setHeightM] = useState(INITIAL_WISSDOM_HEIGHT_M)
  const state = deriveRadarWindOverlayState({
    requestedVisible,
    radarEnabled,
    exactFrameAvailable: typeof exactFrameAvailable === 'function'
      ? exactFrameAvailable(heightM)
      : exactFrameAvailable,
  })

  useEffect(() => {
    if (!radarEnabled) setRequestedVisible(false)
  }, [radarEnabled])

  // Availability is intentionally not used to normalize the selected height: a temporary
  // missing frame must not change the pilot's selected WISSDOM level.
  void availableHeightsM

  return { ...state, heightM, setHeightM, setRequestedVisible }
}
