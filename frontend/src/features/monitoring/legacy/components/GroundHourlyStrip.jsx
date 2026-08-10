import { getWeatherIconSrc } from '../../../../shared/weather/weather-icon-registry.js'
import { mapGroundForecastIcon } from './GroundForecastPanel.jsx'
import { createTemperatureScale, forecastColumnCenter, precipitationBar, selectHourlyForecastSlots } from '../utils/groundForecastViewModel.js'

const W = 1015, H = 430, LEFT = 28, RIGHT = 987, TEMP_TOP = 155, TEMP_BOTTOM = 250, PRECIP_TOP = 255, PRECIP_BOTTOM = 355
const ICON_BAND_TOP = 52, ICON_BAND_HEIGHT = 80
const hour = (time) => time ? `${Number(String(time).slice(0, 2))}시` : '-'
const isPrecipitationIcon = (icon) => ['rain', 'shower', 'snow', 'sleet'].includes(icon)
const dateLabel = (date) => {
  const day = Number(String(date || '').slice(6, 8))
  return Number.isFinite(day) ? `${day}일` : null
}

export default function GroundHourlyStrip({ airport }) {
  const slots = selectHourlyForecastSlots(airport?.hourly || [])
  const center = (index) => forecastColumnCenter(index, { start: LEFT, end: RIGHT, count: 8 })
  const scale = createTemperatureScale(slots, { top: TEMP_TOP, bottom: TEMP_BOTTOM })
  const temperatures = slots.map((slot) => slot?.temp).filter(Number.isFinite)
  const minimumTemperature = temperatures.length ? Math.min(...temperatures) : null
  const maximumTemperature = temperatures.length ? Math.max(...temperatures) : null
  const points = slots.map((slot, index) => {
    const y = scale(slot?.temp)
    return y == null ? null : `${center(index)},${y}`
  }).filter(Boolean).join(' ')
  const iconBandStart = center(0) - 40
  const iconBandEnd = center(7) + 40
  const rainRuns = []
  let runStart = null
  slots.forEach((slot, index) => {
    if (isPrecipitationIcon(slot?.icon) && runStart == null) runStart = index
    if (!isPrecipitationIcon(slot?.icon) && runStart != null) {
      rainRuns.push([runStart, index - 1])
      runStart = null
    }
  })
  if (runStart != null) rainRuns.push([runStart, slots.length - 1])

  return <svg className="ground-hourly-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="시간별 기온과 강수확률">
    <title>시간별 기온과 강수확률</title><desc>8개 시간별 열의 기온과 강수확률</desc>
    <rect className="ghs-iconband" data-hourly-icon-band x={iconBandStart} y={ICON_BAND_TOP} width={iconBandEnd - iconBandStart} height={ICON_BAND_HEIGHT} rx="16" />
    {rainRuns.map(([start, end]) => {
      const x = start === 0 ? iconBandStart : (center(start - 1) + center(start)) / 2
      const right = end === slots.length - 1 ? iconBandEnd : (center(end) + center(end + 1)) / 2
      return <rect key={`${start}-${end}`} className="ghs-iconband-rain" data-hourly-precip-icon-band x={x} y={ICON_BAND_TOP} width={right - x} height={ICON_BAND_HEIGHT} rx="16" />
    })}
    <polyline points={points} className="ghs-line" fill="none" />
    {slots.map((slot, index) => {
      const x = center(index), y = scale(slot?.temp), rain = precipitationBar(slot?.rainProb, { top: PRECIP_TOP, bottom: PRECIP_BOTTOM })
      const value = Number.isFinite(slot?.rainProb) ? rain.value : '-'
      const changed = index > 0 && slot?.date !== slots[index - 1]?.date
      const date = dateLabel(slot?.date)
      const label = (index === 0 || changed) && date ? `${date} ${hour(slot?.time)}` : hour(slot?.time)
      const extreme = slot?.temp === maximumTemperature ? 'is-max' : slot?.temp === minimumTemperature ? 'is-min' : ''
      return <g key={index} data-hourly-column={index} data-center-x={x}>
        <text className={`ghs-time${index === 0 ? ' is-now' : ''}${changed ? ' is-daybreak' : ''}`} data-hourly-row="time" data-hourly-time x={x} y="45" textAnchor="middle">{label}</text>
        {slot ? <image data-hourly-row="icon" data-hourly-icon href={getWeatherIconSrc(mapGroundForecastIcon(slot.icon))} x={x - 34} y="58" width="68" height="68" /> : <text x={x} y="100" textAnchor="middle">-</text>}
        {y != null && <><circle className={`ghs-dot ${extreme}`} data-hourly-row="temp-dot" data-hourly-dot cx={x} cy={y} r="6" /><text className={`ghs-temp ${extreme}`} data-hourly-row="temp-label" data-hourly-temperature x={x} y={y - 18} textAnchor="middle">{slot.temp}°</text></>}
        <rect data-hourly-row="precip-bar" x={x - 12} y={rain.y} width="24" height={rain.height} />
        <text data-hourly-row="precip-label" data-hourly-precipitation x={x} y="405" textAnchor="middle">{value}{value === '-' ? '' : '%'}</text>
      </g>
    })}
  </svg>
}
