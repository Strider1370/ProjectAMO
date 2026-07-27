import { useEffect, useState } from 'react'

import { formatNwpTimeTick, getNwpSliderOptions, shouldCommitNwpSelection } from './NwpSliderBarModel.js'
import PressureLevelSlider from './PressureLevelSlider.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

function NwpSliderBar({
  isVisible,
  levels = [],
  times = [],
  selection = null,
  availability = null,
  isElevated = false,
  timeSliderEnabled = true,
  onSelectionChange,
}) {
  const { tz } = useTimeZone()
  const [draftSelection, setDraftSelection] = useState(selection)

  useEffect(() => {
    setDraftSelection(selection)
  }, [selection?.tmfc, selection?.hf, selection?.level])

  if (!isVisible || !selection) return null

  const activeSelection = draftSelection || selection

  const { availableLevels, availableTimes, showTimeSlider, showLevelSlider } = getNwpSliderOptions({
    levels,
    times,
    selection: activeSelection,
    availability,
  })
  if (!showTimeSlider && !showLevelSlider) return null

  const selectedIndex = Math.max(0, availableTimes.findIndex((time) => Number(time.hf) === Number(activeSelection.hf)))
  const selectedLevel = availableLevels.find((level) => level.id === activeSelection.level) || availableLevels[0]

  const nextTimeSelection = (timeIndex) => {
    const nextTime = availableTimes[timeIndex]
    return nextTime ? { ...selection, ...activeSelection, hf: Number(nextTime.hf) } : null
  }

  const nextLevelSelection = (levelIndex) => {
    const nextLevel = availableLevels[levelIndex]
    if (!nextLevel) return null
    const currentHfAvailable = availability?.[nextLevel.id]?.[String(activeSelection.hf)]
    const nextTime = currentHfAvailable
      ? { hf: activeSelection.hf }
      : times.find((time) => availability?.[nextLevel.id]?.[String(time.hf)])
    if (!nextTime) return null
    return { ...selection, ...activeSelection, level: nextLevel.id, hf: Number(nextTime.hf) }
  }

  const updateDraft = (nextSelection) => {
    if (nextSelection) setDraftSelection(nextSelection)
  }

  const commitSelection = (nextSelection) => {
    if (nextSelection) onSelectionChange?.(nextSelection)
  }

  const handleTimeInput = (event) => updateDraft(nextTimeSelection(Number(event.target.value)))
  const handleTimeChange = (event) => {
    const nextSelection = nextTimeSelection(Number(event.currentTarget.value))
    updateDraft(nextSelection)
    commitSelection(nextSelection)
  }
  const handleTimeCommit = (event) => {
    if (shouldCommitNwpSelection(event.type)) {
      commitSelection(nextTimeSelection(Number(event.currentTarget.value)))
    }
  }
  const selectLevel = (levelId) => {
    const nextSelection = nextLevelSelection(availableLevels.findIndex((level) => level.id === levelId))
    updateDraft(nextSelection)
    commitSelection(nextSelection)
  }

  return (
    <>
      {showTimeSlider && timeSliderEnabled && (
        <div className={`nwp-time-slider-bar${isElevated ? ' nwp-time-slider-bar--elevated' : ''}`}>
          <div className="nwp-time-slider-main">
            <input
              className="nwp-time-slider"
              type="range"
              min="0"
              max={String(availableTimes.length - 1)}
              step="1"
              value={String(selectedIndex)}
              aria-label="NWP forecast time"
              onInput={handleTimeInput}
              onChange={handleTimeChange}
              onPointerUp={handleTimeCommit}
              onKeyUp={handleTimeCommit}
              onBlur={handleTimeCommit}
            />
            <div className="nwp-time-slider-ticks" aria-hidden="true">
              {availableTimes.map((time, index) => (
                <span
                  key={time.hf}
                  className={`nwp-time-slider-tick${Number(time.hf) === Number(activeSelection.hf) ? ' is-active' : ''}`}
                >
                  {formatNwpTimeTick(time, availableTimes[index - 1], tz)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {showLevelSlider && selectedLevel && (
        <PressureLevelSlider levels={availableLevels} activeValue={activeSelection.level} onSelect={selectLevel} />
      )}
    </>
  )
}

export default NwpSliderBar
