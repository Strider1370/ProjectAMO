import { useState } from 'react'
import { normalizeWissdomFrames, pickWissdomFrameForRadar } from './weatherOverlayModel.js'

export const WISSDOM_HEIGHTS_M = Object.freeze([305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048])
export const INITIAL_WISSDOM_HEIGHT_M = 1524

export function deriveRadarWindOverlayState({ requestedVisible, radarHsrEnabled, exactFrameAvailable }) {
  void radarHsrEnabled
  const nextRequestedVisible = Boolean(requestedVisible)
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
export function hasExactRadarWindFrame({ selectedTimeMs, wissdomMeta, heightM }) {
  const frames = normalizeWissdomFrames(wissdomMeta, heightM)
  const referenceTimeMs = Number.isFinite(selectedTimeMs) ? selectedTimeMs : frames.at(-1)?.timeMs
  return Boolean(pickWissdomFrameForRadar(frames, { timeMs: referenceTimeMs }))
}

// 선택한 고도는 자료 유무로 되돌리지 않는다 — 한 프레임 비었다고 조종사가 고른 WISSDOM 고도가
// 바뀌면 안 된다. 그래서 "받을 수 있는 고도 목록"은 아예 받지 않는다.
export default function useRadarWindOverlay({ exactFrameAvailable }) {
  const [requestedVisible, setRequestedVisible] = useState(false)
  const [heightM, setHeightM] = useState(INITIAL_WISSDOM_HEIGHT_M)
  const state = deriveRadarWindOverlayState({
    requestedVisible,
    exactFrameAvailable: typeof exactFrameAvailable === 'function'
      ? exactFrameAvailable(heightM)
      : exactFrameAvailable,
  })

  return { ...state, heightM, setHeightM, setRequestedVisible }
}
