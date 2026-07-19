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

export function levelHighlightClass(cat) {
  if (!cat || cat.category === 'VFR') return null
  return `ap-metar-tac-hl ap-metar-tac-hl--level-${cat.category.toLowerCase()}`
}

// 탭 배지: docs/superpowers/specs/2026-07-13-airport-panel-single-scroll-tac-hero-design.md §10 정본 =
// 작동 프로토타입 frontend/public/airport-panel-redesign.html badges()의 METAR 분기를 그대로 이식.
// 항목: 시정·운고(각각 공항 최저치 미만=적/5000m·1500ft 미만=앰버) · 돌풍편차≥10kt(앰버) ·
// 지속풍속≥20kt(앰버, ≥30kt 적) · 유의기상 존재(앰버) · 윈드시어(적)
export function countMetarHazards({ visCat, ceilCat, obs } = {}) {
  const wind = obs?.wind || {}
  let count = 0
  let worst = 0
  const bump = (severity) => { count++; worst = Math.max(worst, severity) }

  if (visCat && visCat.category !== 'VFR') bump(visCat.category === 'LIFR' ? 2 : 1)
  if (ceilCat && ceilCat.category !== 'VFR') bump(ceilCat.category === 'LIFR' ? 2 : 1)
  if (wind.gust && Number.isFinite(wind.speed) && wind.gust - wind.speed >= 10) bump(1)
  if (Number.isFinite(wind.speed) && wind.speed >= 20) bump(wind.speed >= 30 ? 2 : 1)
  if ((obs?.weather || []).length) bump(1)
  if (obs?.wind_shear) bump(2)

  return count ? { count, severity: worst >= 2 ? 'red' : 'amber' } : null
}

export function tacRoleClass(role, { highWind, visCat, ceilCat }) {
  if (role === 'wind' && highWind) return 'ap-metar-tac-hl ap-metar-tac-hl--wind'
  if (role === 'visibility') return levelHighlightClass(visCat)
  if (role === 'weather-special') return 'ap-metar-tac-hl ap-metar-tac-hl--special'
  if (role === 'weather-precip') return 'ap-metar-tac-hl ap-metar-tac-hl--precip'
  if (role === 'cloud-cb') return 'ap-metar-tac-hl ap-metar-tac-hl--special'
  if (role === 'ceiling') return levelHighlightClass(ceilCat)
  return undefined
}

// 역할은 서버의 구조화 토큰에서만 받는다. 원문 문자열 검색은 하지 않는다.
export function buildMetarTacSegments(rawText, vm) {
  if (!rawText) return []
  const tokens = vm.hdr?.tac?.display_lines?.[0]?.tokens
  if (!tokens) return [{ text: rawText }]
  return tokens.map((token) => ({ text: token.text, className: tacRoleClass(token.role, vm) }))
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
