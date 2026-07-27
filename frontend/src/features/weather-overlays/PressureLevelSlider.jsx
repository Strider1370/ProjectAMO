import { useMemo } from 'react'
import {
  formatPressureFlightLevel,
  isMajorPressureLevel,
} from './lib/pressureLevelModel.js'
import LevelSliderPanel from './LevelSliderPanel.jsx'

export default function PressureLevelSlider({ levels = [], activeValue, onSelect }) {
  const orderedLevels = useMemo(
    () => [...levels].filter((level) => level?.kind === 'pressure').sort((a, b) => Number(a.value) - Number(b.value)),
    [levels],
  )

  const items = orderedLevels.map((level) => ({
    id: level.id,
    primary: formatPressureFlightLevel(level.value),
    secondary: `${level.value} hPa`,
    major: isMajorPressureLevel(level),
  }))

  return <LevelSliderPanel items={items} activeValue={activeValue} onSelect={onSelect} ariaLabel="KIM 등압면 고도" />
}
