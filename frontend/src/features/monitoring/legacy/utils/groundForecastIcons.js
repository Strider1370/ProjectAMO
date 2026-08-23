const DAY_ICONS = Object.freeze({
  sunny: 'clear-day',
  partly_cloudy: 'few-clouds-day',
  mostly_cloudy: 'broken-clouds',
  cloudy: 'overcast',
  rain: 'rain-day',
  shower: 'showers-day',
  snow: 'snow-day',
  sleet: 'snow-day',
})

function minutes(value) {
  const [hour, minute = '0'] = String(value ?? '').match(/^(\d{2})(?::?(\d{2}))?/)?.slice(1) || []
  const parsedHour = Number(hour)
  const parsedMinute = Number(minute)
  return Number.isInteger(parsedHour) && Number.isInteger(parsedMinute) && parsedHour < 24 && parsedMinute < 60
    ? (parsedHour * 60) + parsedMinute
    : null
}

function isNight(time, sunTimes) {
  const forecastMinutes = minutes(time)
  const sunrise = minutes(sunTimes?.sunrise)
  const sunset = minutes(sunTimes?.sunset)
  if (forecastMinutes == null || sunrise == null || sunset == null) return false
  return forecastMinutes < sunrise || forecastMinutes >= sunset
}

export function mapGroundForecastIcon(icon, time, sunTimes) {
  if (isNight(time, sunTimes) && icon === 'sunny') return 'clear-night'
  if (isNight(time, sunTimes) && icon === 'partly_cloudy') return 'few-clouds-night'
  return DAY_ICONS[icon] || 'unknown'
}
