import {
  getFlightCategory,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  computeRelativeHumidity,
  computeFeelsLikeC,
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
  getCrosswindComponentKt,
  getCrosswindSide,
  pickCrosswindArrow,
} from '../../../shared/weather/helpers.js'
import { convertWeatherToKorean } from '../../../shared/weather/visual-mapper.js'
import { resolveWeatherVisual } from '../../../shared/weather/weather-visual-resolver.js'
import { getWindDirectionRotation } from './formatters.js'

function pickCeilingCloud(clouds) {
  return (clouds || [])
    .filter((c) => c.amount === 'BKN' || c.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0] || null
}

function buildWindToken(wind) {
  if (!wind || wind.calm) return null
  const dir = wind.variable ? 'VRB' : (Number.isFinite(wind.direction) ? String(wind.direction).padStart(3, '0') : null)
  const speed = Number.isFinite(wind.speed) ? String(wind.speed).padStart(2, '0') : null
  if (!dir || !speed) return null
  const gust = Number.isFinite(wind.gust) ? `G${String(wind.gust).padStart(2, '0')}` : ''
  return `${dir}${speed}${gust}${wind.unit || 'KT'}`
}

function buildVisibilityToken(obs) {
  const value = obs?.visibility?.value
  return Number.isFinite(value) ? String(value) : null
}

function buildCeilingToken(obs) {
  const ceilingCloud = pickCeilingCloud(obs?.clouds)
  if (!ceilingCloud || !Number.isFinite(ceilingCloud.base)) return null
  const hundreds = String(Math.round(ceilingCloud.base / 100)).padStart(3, '0')
  return `${ceilingCloud.amount}${hundreds}`
}

function weatherTokens(obs) {
  const raw = obs?.display?.weather
  return raw ? String(raw).split(/\s+/).filter(Boolean) : []
}

function levelHighlightClass(cat) {
  if (!cat || cat.category === 'VFR') return null
  return `ap-metar-tac-hl ap-metar-tac-hl--level-${cat.category.toLowerCase()}`
}

function splitSegmentsOn(segments, token, className) {
  if (!token) return segments
  return segments.flatMap((seg) => {
    if (seg.className || !seg.text.includes(token)) return [seg]
    const idx = seg.text.indexOf(token)
    const before = seg.text.slice(0, idx)
    const match = seg.text.slice(idx, idx + token.length)
    const after = seg.text.slice(idx + token.length)
    return [
      ...(before ? [{ text: before }] : []),
      { text: match, className },
      ...(after ? [{ text: after }] : []),
    ]
  })
}

// 원문(rawText)은 절대 바꾸지 않는다 — 이미 계산된 값(vm)이 원문 안에서 발견되는 구간만
// className을 붙여 쪼갠다. 못 찾으면 그 항목만 건너뛴다(원문 전체는 항상 그대로 보존).
export function buildMetarTacSegments(rawText, vm) {
  if (!rawText) return []
  let segments = [{ text: rawText }]

  if (vm.highWind) {
    segments = splitSegmentsOn(segments, buildWindToken(vm.obs?.wind), 'ap-metar-tac-hl ap-metar-tac-hl--wind')
  }

  const visClass = levelHighlightClass(vm.visCat)
  if (visClass) {
    segments = splitSegmentsOn(segments, buildVisibilityToken(vm.obs), visClass)
  }

  if (vm.precipitationWeather || vm.specialWeather) {
    const wxClass = vm.specialWeather
      ? 'ap-metar-tac-hl ap-metar-tac-hl--special'
      : 'ap-metar-tac-hl ap-metar-tac-hl--precip'
    for (const token of weatherTokens(vm.obs)) {
      segments = splitSegmentsOn(segments, token, wxClass)
    }
  }

  const ceilClass = levelHighlightClass(vm.ceilCat)
  if (ceilClass) {
    segments = splitSegmentsOn(segments, buildCeilingToken(vm.obs), ceilClass)
  }

  return segments
}

export function buildMetarViewModel({ metar, amosData, icao, airportMeta }) {
  const obs = metar.observation
  const disp = obs?.display
  const hdr = metar.header

  const wind = obs?.wind || null
  const windSpeed = wind?.speed
  const windGust = wind?.gust
  const visibility = obs?.visibility?.value

  const ceilingCloud = pickCeilingCloud(obs?.clouds)
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

  const weatherKorean = convertWeatherToKorean(disp?.weather, obs?.cavok, obs?.clouds || [])
  const weatherVisual = resolveWeatherVisual(obs, hdr?.observation_time)
  const precipitationWeather = hasPrecipitationWeather(obs)
  const specialWeather = hasSpecialWeather(obs)

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
    precipitationWeather,
    specialWeather,
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
