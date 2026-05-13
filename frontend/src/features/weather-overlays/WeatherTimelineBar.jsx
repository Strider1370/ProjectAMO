import { Pause, Play } from 'lucide-react'
import { formatKstMinute } from './lib/weatherTimeline.js'

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4]

function WeatherTimelineBar({
  isVisible,
  isPlaying,
  selectedIndex,
  tickCount,
  selectedTimeMs,
  playbackSpeed,
  onPlayPause,
  onIndexChange,
  onPlaybackSpeedChange,
}) {
  if (!isVisible || tickCount <= 0) return null
  const handleSliderInput = (event) => onIndexChange(Number(event.target.value))

  return (
    <section className="weather-timeline-bar" aria-label="Weather playback timeline">
      <button type="button" className="weather-timeline-play" onClick={onPlayPause} aria-label={isPlaying ? 'Pause weather loop' : 'Play weather loop'}>
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <input
        className="weather-timeline-slider"
        type="range"
        min="0"
        max={Math.max(0, tickCount - 1)}
        value={selectedIndex}
        onChange={handleSliderInput}
        onInput={handleSliderInput}
        aria-label="Weather frame time"
      />
      <div className="weather-timeline-time">{formatKstMinute(selectedTimeMs)}</div>
      <label className="weather-timeline-speed">
        <span>Speed</span>
        <select value={playbackSpeed} onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))} aria-label="Weather playback speed">
          {PLAYBACK_SPEEDS.map((speed) => (
            <option key={speed} value={speed}>{speed}x</option>
          ))}
        </select>
      </label>
    </section>
  )
}

export default WeatherTimelineBar
