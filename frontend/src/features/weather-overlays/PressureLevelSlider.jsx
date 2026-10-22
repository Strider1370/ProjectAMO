import { useContext, useMemo } from 'react'
import {
  altitudePositionPct,
  formatPressureFlightLevel,
  isMajorPressureLevel,
  standardAltitudeFtForPressure,
} from './lib/pressureLevelModel.js'
import { AltitudeMarksContext } from './lib/altitudeMarksContext.js'
import LevelSliderPanel from './LevelSliderPanel.jsx'

export default function PressureLevelSlider({ levels = [], activeValue, onSelect }) {
  const orderedLevels = useMemo(
    () => [
      ...levels.filter((level) => level?.kind === 'pressure').sort((a, b) => Number(a.value) - Number(b.value)),
      ...levels.filter((level) => level?.kind === 'height').sort((a, b) => Number(b.value) - Number(a.value)),
    ],
    [levels],
  )

  const items = orderedLevels.map((level) => level.kind === 'height'
    ? { id: level.id, primary: level.id === '10m' ? '지상' : level.label, secondary: `${level.value} m AGL`, major: true }
    : {
      id: level.id,
      primary: formatPressureFlightLevel(level.value),
      secondary: `${level.value} hPa`,
      major: isMajorPressureLevel(level),
    })

  // 지도형 브리핑: 축 위에 위험 고도(실제 고도 위치)·비행 범위, 위에 "전 고도" 위험, 손잡이 옆에 순항 대비 지도 고도와 그 고도의 위험.
  const marks = useContext(AltitudeMarksContext)
  const overlay = useMemo(() => {
    if (!marks) return null
    const span = (lowFt, highFt) => {
      const top = altitudePositionPct(orderedLevels, highFt)
      const bottom = altitudePositionPct(orderedLevels, lowFt)
      return top == null || bottom == null ? null : { top, height: Math.max(0, bottom - top) }
    }
    const decorations = []
    const flight = marks.flight && span(marks.flight.lowFt, marks.flight.highFt)
    if (flight) decorations.push({ key: 'flight', className: 'is-flight-range', ...flight, title: '비행 범위(지상~순항)' })
    for (const band of marks.bands) {
      const position = span(band.lowFt, band.highFt)
      if (!position) continue
      decorations.push({
        key: band.key, ...position,
        className: `is-${band.kind}${band.mine ? ' is-mine' : ' is-other'}${band.source === 'AIRMET' ? ' is-airmet' : ''}`,
        color: band.color, title: `${band.label}${band.kind === 'model' ? ` ${band.level}` : ''}`,
      })
    }
    return { decorations, header: marks.allAltitude }
  }, [marks, orderedLevels])
  const activeLevel = orderedLevels.find((level) => level.id === activeValue)
  const note = marks && activeLevel?.kind === 'pressure'
    ? marks.noteFor(standardAltitudeFtForPressure(activeLevel.value), formatPressureFlightLevel(activeLevel.value))
    : null

  return <LevelSliderPanel items={items} activeValue={activeValue} onSelect={onSelect} ariaLabel="KIM 고도"
    decorations={overlay?.decorations} header={overlay?.header} valueNote={note} />
}
