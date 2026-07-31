import clearDay from '../../../assets/weather-icons/basmilius/clear-day.svg'
import clearNight from '../../../assets/weather-icons/basmilius/clear-night.svg'
import snowDay from '../../../assets/weather-icons/basmilius/snow-day.svg'
import forecastCloud from '../assets/forecast-cloud-transparent.png'
import forecastPartly from '../assets/forecast-partly-transparent.png'
import forecastRain from '../assets/forecast-rain-transparent.png'
import forecastStorm from '../assets/forecast-storm-transparent.png'

const assets = {
  partly: forecastPartly,
  mostlyCloudy: forecastCloud,
  cloudy: forecastCloud,
  rain: forecastRain,
  shower: forecastRain,
  snow: snowDay,
  storm: forecastStorm,
}

function assetFor(weather) {
  if (weather.type !== 'clear') return assets[weather.type] ?? forecastCloud
  const hour = Number(weather.time?.slice(0, 2))
  return hour >= 18 || hour < 6 ? clearNight : clearDay
}

export function WeatherVisual({ weather, size = 'normal', includeCondition = true, textPriority = 'ordinary' }) {
  if (!weather?.available) return <span className={`terminal-weather-visual terminal-weather-visual--${size}`}>예보 확인 중</span>

  return <span className={`terminal-weather-visual terminal-weather-visual--${size}`}>
    <img className={`weather-image weather-image--${weather.type}`} src={assetFor(weather)} alt="" aria-hidden="true" />
    {includeCondition && <em className="weather-condition" data-signage-text={textPriority}>{weather.label}</em>}
  </span>
}
