import { useEffect, useState } from 'react'
import { normalizeWissdomFrames, pickWissdomFrameForRadar } from './weatherOverlayModel.js'

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

// Availability must use the same rule the model renders with, or the control and the layer disagree.
export function hasExactRadarWindFrame({ radarFrame, wissdomMeta, heightM }) {
  return Boolean(pickWissdomFrameForRadar(normalizeWissdomFrames(wissdomMeta, heightM), radarFrame))
}

// 선택한 고도는 자료 유무로 되돌리지 않는다 — 한 프레임 비었다고 조종사가 고른 WISSDOM 고도가
// 바뀌면 안 된다. 그래서 "받을 수 있는 고도 목록"은 아예 받지 않는다.
export default function useRadarWindOverlay({ radarEnabled, exactFrameAvailable }) {
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

  return { ...state, heightM, setHeightM, setRequestedVisible }
}
