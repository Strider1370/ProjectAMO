import {
  getFlightCategory,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  computeRelativeHumidity,
  computeFeelsLikeC,
  hasHighWindCondition,
  getCrosswindComponentKt,
  getCrosswindSide,
  pickCrosswindArrow,
} from '../../../shared/weather/helpers.js'
import { convertWeatherToKorean } from '../../../shared/weather/visual-mapper.js'
import { resolveWeatherVisual } from '../../../shared/weather/weather-visual-resolver.js'
import { getWindDirectionRotation } from './formatters.js'

export function buildMetarViewModel({ metar, amosData, icao, airportMeta }) {
  const obs = metar.observation
  const disp = obs?.display
  const hdr = metar.header

  const wind = obs?.wind || null
  const windSpeed = wind?.speed
  const windGust = wind?.gust
  const visibility = obs?.visibility?.value

  const clouds = obs?.clouds || []
  const ceilingCloud = clouds
    .filter((c) => c.amount === 'BKN' || c.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]
  const ceilingFt = ceilingCloud?.base ?? null

  const flightCat = getFlightCategory(visibility, ceilingFt, icao)
  const visCat = classifyVisibilityCategory(visibility, icao)
  const ceilCat = classifyCeilingCategory(ceilingFt, icao)

  const tempC = obs?.temperature?.air
  const dewpointC = obs?.temperature?.dewpoint
  const rh = computeRelativeHumidity(tempC, dewpointC)
  const feelsLike = computeFeelsLikeC({ tempC, dewpointC, windKt: windSpeed, observedAt: hdr?.observation_time })

  const runwayHdg = airportMeta?.runway_hdg ?? null
  const highWind = hasHighWindCondition(wind)
  const crosswindKt = getCrosswindComponentKt(wind, runwayHdg)
  const crosswindSide = getCrosswindSide(wind, runwayHdg)
  const crosswindArrow = pickCrosswindArrow(wind, runwayHdg)

  const weatherKorean = convertWeatherToKorean(disp?.weather, obs?.cavok, clouds)
  const weatherVisual = resolveWeatherVisual(obs, hdr?.observation_time)

  const obsTime = hdr?.observation_time || hdr?.issue_time
  const visValue = disp?.visibility != null ? `${disp.visibility} m` : '??'
  const ceilValue = Number.isFinite(ceilingFt) ? `${ceilingFt} ft` : 'NSC'
  const windDir = wind?.calm ? 'CALM' : wind?.variable ? 'VRB' : Number.isFinite(wind?.direction) ? `${wind.direction}°` : '??'
  const windSpeedText = wind?.calm ? '0' : Number.isFinite(windSpeed) ? `${windSpeed}` : '??'
  const windGustText = Number.isFinite(windGust) ? `G${windGust}` : null
  const windRotation = getWindDirectionRotation(wind)
  const tempDisplay = Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : '??'
  const rhDisplay = Number.isFinite(rh) ? `${Math.round(rh)}%` : '??'
  const feelsLikeText = feelsLike.value != null ? `체감 ${feelsLike.value.toFixed(1)}°C` : null

  const rainMm = amosData?.daily_rainfall?.mm
  const rainText = rainMm != null && rainMm > 0 ? `${rainMm.toFixed(1)} mm` : null

  const qnhRaw = disp?.qnh ?? '??'
  const qnh = qnhRaw.startsWith('Q') ? `${qnhRaw.substring(1)} hPa` : qnhRaw

  return {
    obs,
    hdr,
    flightCat,
    visCat,
    ceilCat,
    runwayHdg,
    highWind,
    crosswindKt,
    crosswindSide,
    crosswindArrow,
    weatherKorean,
    weatherVisual,
    obsTime,
    visValue,
    ceilValue,
    windDir,
    windSpeedText,
    windGustText,
    windRotation,
    tempDisplay,
    rhDisplay,
    feelsLikeText,
    rainText,
    qnh,
  }
}
