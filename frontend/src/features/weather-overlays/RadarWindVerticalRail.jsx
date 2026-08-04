import { useState } from 'react'

import NwpSliderBar from './NwpSliderBar.jsx'
import LevelSliderPanel from './LevelSliderPanel.jsx'
import { resolveVerticalRailSource, WISSDOM_HEIGHTS_M } from './lib/useRadarWindOverlay.js'

export default function RadarWindVerticalRail({
  kimActive,
  levels,
  times,
  selection,
  availability,
  onKimSelectionChange,
  radarWindActive,
  radarWindHeightM,
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
          <option value="wissdom">WISSDOM · {radarWindHeightM.toLocaleString()} m</option>
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
          items={WISSDOM_HEIGHTS_M.map((heightM) => ({ id: heightM, primary: `${heightM.toLocaleString()} m` }))}
          activeValue={radarWindHeightM}
          onSelect={onRadarWindHeightChange}
          ariaLabel="WISSDOM 높이"
        />
      )}
    </>
  )
}
