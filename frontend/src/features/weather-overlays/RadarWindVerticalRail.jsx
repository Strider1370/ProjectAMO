import { useState } from 'react'

import NwpSliderBar from './NwpSliderBar.jsx'
import LevelSliderPanel from './LevelSliderPanel.jsx'
import { resolveVerticalRailSource, INITIAL_WISSDOM_HEIGHT_M, WISSDOM_HEIGHTS_M } from './lib/useRadarWindOverlay.js'

// WISSDOM 고도는 미터로 요청하지만(305·610·914 m …) 원래 격자는 1,000 ft 간격이다 —
// 305 m = 1,000 ft, 3,048 m = 10,000 ft로 정확히 떨어진다. 조종사가 읽는 단위인 피트로 표기한다.
export function wissdomHeightLabel(heightM) {
  return `${(Math.round(heightM / 304.8) * 1000).toLocaleString()} ft`
}

export default function RadarWindVerticalRail({
  kimActive,
  levels,
  times,
  selection,
  availability,
  onKimSelectionChange,
  radarWindActive,
  radarWindHeightM = INITIAL_WISSDOM_HEIGHT_M,
  onRadarWindHeightChange,
}) {
  const [preferredSource, setPreferredSource] = useState('kim')
  const source = resolveVerticalRailSource({ preferredSource, kimActive, radarWindActive })

  if (!source) return null

  return (
    <>
      {kimActive && radarWindActive && (
        <select aria-label="세로 고도 레일 자료원" value={source} onChange={(event) => setPreferredSource(event.target.value)}>
          <option value="kim">KIM · {selection?.level ?? ''}</option>
          <option value="wissdom">WISSDOM · {wissdomHeightLabel(radarWindHeightM)}</option>
        </select>
      )}
      <NwpSliderBar
        isVisible={source === 'kim' && kimActive}
        levels={levels}
        times={times}
        selection={selection}
        availability={availability}
        isElevated
        timeSliderEnabled={false}
        onSelectionChange={onKimSelectionChange}
      />
      {source === 'wissdom' && (
        <LevelSliderPanel
          // 트랙 위쪽(index 0)이 위 화살표 방향 — 높은 고도가 맨 위로 오게 내림차순.
          // 통합 고도 레일(지형 근접·난류)과 같은 규칙이다.
          items={[...WISSDOM_HEIGHTS_M].sort((a, b) => b - a)
            .map((heightM) => ({ id: heightM, primary: wissdomHeightLabel(heightM) }))}
          activeValue={radarWindHeightM}
          onSelect={onRadarWindHeightChange}
          ariaLabel="WISSDOM 높이"
        />
      )}
    </>
  )
}
