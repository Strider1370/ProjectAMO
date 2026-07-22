import { XMLParser } from 'fast-xml-parser'
import {
  toArray, text, number, lastToken,
  parseCloudLayer, parseWeatherCode, parseWind,
  resolveWeatherIconKey, pickPrimaryWeatherIcon, toMetarTempToken,
} from './parse-utils.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  isArray: (name) => ['iwxxm:presentWeather', 'iwxxm:weather', 'iwxxm:layer', 'iwxxm:trendForecast', 'item'].includes(name),
})

function decodeXmlEntities(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/&#xD;/gi, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseInnerMetar(xml) {
  const decoded = decodeXmlEntities(xml)
  const parsed = parser.parse(decoded)
  return parsed['iwxxm:METAR'] || parsed['iwxxm:SPECI'] || parsed
}

function normalizeIwxxmRoot(node) {
  if (!node || typeof node !== 'object') return {}
  return node['iwxxm:METAR'] || node['iwxxm:SPECI'] || node
}

function detectReportType(metarNode) {
  if (typeof metarNode === 'string') {
    if (metarNode.includes('iwxxm:SPECI')) return 'SPECI'
    if (metarNode.includes('iwxxm:METAR')) return 'METAR'
  }
  if (metarNode && typeof metarNode === 'object') {
    if (metarNode['iwxxm:SPECI']) return 'SPECI'
    if (metarNode['iwxxm:METAR']) return 'METAR'
  }
  return 'METAR'
}

function getOuterItem(xmlString) {
  const outer = parser.parse(xmlString)
  const items = toArray(outer?.response?.body?.items?.item || outer?.body?.items?.item || outer?.items?.item)
  return items[0] || null
}

function parseWindShear(obs) {
  const ws = obs?.['iwxxm:windShear']?.['iwxxm:AerodromeWindShear'] || obs?.['iwxxm:AerodromeWindShear']
  if (!ws) return null

  const allRunways = String(ws?.['@_allRunways'] || 'false').toLowerCase() === 'true'
  if (allRunways) return { all_runways: true, runways: null }

  const runways = toArray(ws?.['iwxxm:runway']).map((r) => text(r)).filter(Boolean)
  return { all_runways: false, runways: runways.length > 0 ? runways : null }
}

// 경향예보(BECMG/TEMPO) 시간지시자 → TAC 시간군. WMO IWXXM 2023-1 TrendForecastTimeIndicatorType 4종.
// KMA 응답엔 실제로 실린 사례를 아직 못 봤음(전 공항 조회로 확인) — WMO 공식 예제(metar-A3-1.xml) 구조 기반 방어적 파싱.
function trendHhmm(timePosition) {
  const d = new Date(text(timePosition))
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function trendTimeToken(indicator, phenomenonTime) {
  const instant = phenomenonTime?.['gml:TimeInstant']?.['gml:timePosition']
  const period = phenomenonTime?.['gml:TimePeriod']
  if (indicator === 'AT' && instant) { const t = trendHhmm(instant); return t ? `AT${t}` : '' }
  if (indicator === 'UNTIL' && period) { const t = trendHhmm(period['gml:endPosition']); return t ? `TL${t}` : '' }
  if (indicator === 'FROM' && (instant || period)) { const t = trendHhmm(instant || period['gml:beginPosition']); return t ? `FM${t}` : '' }
  if (indicator === 'FROM_UNTIL' && period) {
    const fm = trendHhmm(period['gml:beginPosition'])
    const tl = trendHhmm(period['gml:endPosition'])
    return fm && tl ? `FM${fm}TL${tl}` : ''
  }
  return ''
}

const TREND_CHANGE_TOKEN = { BECOMING: 'BECMG', TEMPORARY_FLUCTUATIONS: 'TEMPO' }

// NOSIG(변화없음)는 IWXXM 스키마에 별도 코드가 없음 — trendForecast 요소 자체가 없는 것으로 표현됨(스키마 minOccurs=0).
function parseTrendForecast(metar) {
  return toArray(metar['iwxxm:trendForecast'])
    .map((tf) => tf?.['iwxxm:MeteorologicalAerodromeTrendForecast'])
    .filter(Boolean)
    .map((node) => {
      const changeToken = TREND_CHANGE_TOKEN[node['@_changeIndicator']]
      if (!changeToken) return null

      const parts = [changeToken]
      const timeToken = trendTimeToken(text(node['iwxxm:timeIndicator']), node['iwxxm:phenomenonTime'])
      if (timeToken) parts.push(timeToken)

      if (String(node['@_cloudAndVisibilityOK'] || 'false').toLowerCase() === 'true') {
        parts.push('CAVOK')
      } else {
        const visValue = number(node['iwxxm:prevailingVisibility'])
        if (Number.isFinite(visValue)) parts.push(visValue === 10000 ? '9999' : String(visValue))

        for (const w of toArray(node['iwxxm:weather'])) {
          const nilReason = String(w?.['@_nilReason'] || '').toLowerCase()
          if (nilReason.includes('nothingofoperationalsignificance')) continue
          const href = w?.['@_xlink:href']
          const parsedWeather = href ? parseWeatherCode(lastToken(href)) : null
          if (parsedWeather) parts.push(parsedWeather.raw)
        }

        const cloudLayers = toArray(node['iwxxm:cloud']?.['iwxxm:AerodromeCloud']?.['iwxxm:layer'])
        for (const layer of cloudLayers.map(parseCloudLayer).filter(Boolean)) parts.push(layer.raw)
      }

      return parts.join(' ')
    })
    .filter(Boolean)
}

function pickCodeFromHref(value) {
  const raw = text(value)
  if (!raw) return null
  return lastToken(raw).toUpperCase() || null
}

function extractRunwayDesignator(value) {
  const direct = text(value)
  if (direct) {
    const normalized = String(direct).trim().toUpperCase()
    const shortNumeric = normalized.match(/^\d[LRC]?$/)
    if (shortNumeric) {
      const suffix = /[LRC]$/.test(normalized) ? normalized.slice(-1) : ''
      const digits = suffix ? normalized.slice(0, -1) : normalized
      return `${digits.padStart(2, '0')}${suffix}`
    }
    const m = normalized.match(/\b(\d{2}[LRC]?)\b/)
    if (m) return m[1]
  }

  if (!value || typeof value !== 'object') return null

  const nestedDesignator =
    text(value['aixm:designator']) ||
    text(value['aixm:RunwayDirection']?.['aixm:timeSlice']?.['aixm:RunwayDirectionTimeSlice']?.['aixm:designator']) ||
    text(value['aixm:RunwayDirection']?.['aixm:designator']) ||
    null

  if (nestedDesignator) {
    const normalized = String(nestedDesignator).trim().toUpperCase()
    const shortNumeric = normalized.match(/^\d[LRC]?$/)
    if (shortNumeric) {
      const suffix = /[LRC]$/.test(normalized) ? normalized.slice(-1) : ''
      const digits = suffix ? normalized.slice(0, -1) : normalized
      return `${digits.padStart(2, '0')}${suffix}`
    }
    const m = normalized.match(/\b(\d{2}[LRC]?)\b/)
    if (m) return m[1]
  }

  for (const entry of Object.values(value)) {
    if (entry && typeof entry === 'object') {
      const found = extractRunwayDesignator(entry)
      if (found) return found
    }
  }

  return null
}

function parseRvrMagnitude(rawValue) {
  const raw = text(rawValue)
  if (!raw) return { value: null, operator: null }

  const trimmed = String(raw).trim().toUpperCase()
  const operator = trimmed.startsWith('P') ? 'ABOVE' : trimmed.startsWith('M') ? 'BELOW' : null
  const numeric = Number(trimmed.replace(/^[PM]/, ''))

  return { value: Number.isFinite(numeric) ? numeric : null, operator }
}

function collectRunwayVisualRanges(node, result = []) {
  if (!node || typeof node !== 'object') return result

  for (const [key, value] of Object.entries(node)) {
    if (key === 'iwxxm:AerodromeRunwayVisualRange') {
      toArray(value).forEach((item) => { if (item && typeof item === 'object') result.push(item) })
      continue
    }
    if (Array.isArray(value)) { value.forEach((entry) => collectRunwayVisualRanges(entry, result)); continue }
    if (value && typeof value === 'object') collectRunwayVisualRanges(value, result)
  }

  return result
}

function parseRunwayVisualRanges(obs) {
  return collectRunwayVisualRanges(obs)
    .map((node) => {
      const runway = extractRunwayDesignator(node['iwxxm:runway']) || extractRunwayDesignator(node)
      const parsedMeanRvr = parseRvrMagnitude(node['iwxxm:meanRVR'])
      const parsedMeanRange = parseRvrMagnitude(node['iwxxm:meanRunwayVisualRange'])
      const parsedRvr = parseRvrMagnitude(node['iwxxm:rvr'])
      const mean = parsedMeanRvr.value || parsedMeanRange.value || parsedRvr.value || null
      const minimum = number(node['iwxxm:minimumRVR'])
      const maximum = number(node['iwxxm:maximumRVR'])
      const tendency =
        pickCodeFromHref(node['@_pastTendency']) ||
        pickCodeFromHref(node['iwxxm:pastTendency']?.['@_xlink:href']) ||
        pickCodeFromHref(node['iwxxm:pastTendency']) || null
      const operator =
        pickCodeFromHref(node['@_meanRVROperator']) ||
        pickCodeFromHref(node['iwxxm:meanRVROperator']?.['@_xlink:href']) ||
        pickCodeFromHref(node['iwxxm:meanRVROperator']) ||
        parsedMeanRvr.operator || parsedMeanRange.operator || parsedRvr.operator || null

      if (!runway && mean == null && minimum == null && maximum == null) return null
      return { runway, mean, minimum, maximum, tendency, operator }
    })
    .filter(Boolean)
}

function buildDisplay(observation, flags) {
  return {
    wind: observation.wind.raw,
    visibility: observation.visibility.value === 10000 ? '9999' : String(observation.visibility.value ?? '//'),
    minimum_visibility: observation.visibility.minimum_value != null ? String(observation.visibility.minimum_value) : null,
    weather: observation.weather.map((w) => w.raw).join(' '),
    clouds: (flags.cavok || flags.nsc) ? 'NSC' : observation.clouds.map((c) => c.raw).join(' '),
    temperature:
      observation.temperature.air != null && observation.temperature.dewpoint != null
        ? `${toMetarTempToken(observation.temperature.air)}/${toMetarTempToken(observation.temperature.dewpoint)}`
        : null,
    qnh: observation.qnh.value != null ? `Q${observation.qnh.value}` : null,
    weather_icon: flags.cavok ? 'CAVOK' : pickPrimaryWeatherIcon(observation.weather),
    weather_intensity: observation.weather[0]?.intensity || null,
  }
}

export function parse(xmlString) {
  const item = getOuterItem(xmlString)
  if (!item) return null

  let metar = {}
  const metarNode = item.metarMsg || item.metar
  const reportType = detectReportType(metarNode)
  if (typeof metarNode === 'string') {
    metar = normalizeIwxxmRoot(parseInnerMetar(metarNode))
  } else if (metarNode && typeof metarNode === 'object') {
    metar = normalizeIwxxmRoot(metarNode)
  }

  const issueTime =
    text(metar['iwxxm:issueTime']?.['gml:TimeInstant']?.['gml:timePosition']) ||
    text(metar['iwxxm:issueTime']?.['gml:timePosition'])

  const observationTime =
    text(metar['iwxxm:observationTime']?.['gml:TimeInstant']?.['gml:timePosition']) ||
    text(metar['iwxxm:observationTime']?.['gml:timePosition'])

  const obs = metar['iwxxm:observation']?.['iwxxm:MeteorologicalAerodromeObservation'] || {}

  const cavok = String(metar['@_cloudAndVisibilityOK'] || obs['@_cloudAndVisibilityOK'] || 'false').toLowerCase() === 'true'

  const windNode = obs['iwxxm:surfaceWind']?.['iwxxm:AerodromeSurfaceWind'] || {}
  const wind = parseWind(windNode)

  const visibilityNode =
    obs['iwxxm:visibility']?.['iwxxm:AerodromeHorizontalVisibility']?.['iwxxm:prevailingVisibility'] ||
    obs['iwxxm:visibility']?.['iwxxm:prevailingVisibility'] ||
    obs['iwxxm:visibility']

  const visibility = {
    value: cavok ? 9999 : number(visibilityNode),
    minimum_value:
      number(obs['iwxxm:visibility']?.['iwxxm:AerodromeHorizontalVisibility']?.['iwxxm:minimumVisibility']) ||
      number(obs['iwxxm:visibility']?.['iwxxm:minimumVisibility']) ||
      number(obs['iwxxm:minimumVisibility']),
    minimum_direction_degrees:
      number(obs['iwxxm:visibility']?.['iwxxm:AerodromeHorizontalVisibility']?.['iwxxm:minimumVisibilityDirection']) ||
      number(obs['iwxxm:visibility']?.['iwxxm:minimumVisibilityDirection']) ||
      number(obs['iwxxm:minimumVisibilityDirection']),
    cavok,
  }

  let weather = []
  if (!cavok) {
    const weatherNodes = toArray(obs['iwxxm:presentWeather'])
    weather = weatherNodes
      .map((node) => {
        const href = node?.['@_xlink:href']
        const nilReason = String(node?.['@_nilReason'] || '').toLowerCase()
        if (nilReason.includes('nothingofoperationalsignificance')) return null
        if (href) return parseWeatherCode(lastToken(href))
        const raw = text(node)
        return raw ? parseWeatherCode(lastToken(raw)) : null
      })
      .filter(Boolean)
      .map((w) => ({ ...w, icon_key: resolveWeatherIconKey(w) }))
  }

  const cloudNode = obs['iwxxm:cloud']
  const cloudNilReason = String(cloudNode?.['@_nilReason'] || '').toLowerCase()
  const nscFlag = cloudNilReason.includes('nothingofoperationalsignificance')

  let clouds = []
  if (!cavok && !nscFlag) {
    const layerNodes = toArray(cloudNode?.['iwxxm:AerodromeCloud']?.['iwxxm:layer'])
    clouds = layerNodes.map(parseCloudLayer).filter(Boolean)
  }

  const temperature = {
    air: number(obs['iwxxm:airTemperature']),
    dewpoint: number(obs['iwxxm:dewpointTemperature']),
  }

  const qnhNode = obs['iwxxm:qnh'] || {}
  const qnh = { value: number(qnhNode), unit: text(qnhNode?.['@_uom']) || 'hPa' }

  const observation = { wind, visibility, weather, clouds, temperature, qnh, wind_shear: parseWindShear(obs), rvr: parseRunwayVisualRanges(obs) }
  observation.display = buildDisplay(observation, { cavok, nsc: nscFlag })

  const parsed = {
    header: {
      icao:
        text(item.icaoCode) ||
        text(metar['iwxxm:aerodrome']?.['aixm:AirportHeliport']?.['aixm:timeSlice']?.['aixm:AirportHeliportTimeSlice']?.['aixm:locationIndicatorICAO']) ||
        text(metar['iwxxm:aerodrome']?.['aixm:AirportHeliport']?.['aixm:timeSlice']?.['aixm:AirportHeliportTimeSlice']?.['aixm:designator']),
      airport_name:
        text(item.airportName) ||
        text(item.airportNm) ||
        text(metar['iwxxm:aerodrome']?.['aixm:AirportHeliport']?.['aixm:timeSlice']?.['aixm:AirportHeliportTimeSlice']?.['aixm:name']) ||
        null,
      report_type: reportType,
      issue_time: issueTime,
      observation_time: observationTime,
      automated: String(metar['@_automatedStation'] || 'false').toLowerCase() === 'true',
      // #1 출처·시각 배지용. METAR는 관측 스냅샷이라 유효기간 없음(valid_* null). fetch_time은 프로세서가 배치 수신시각으로 채움.
      source: {
        identifier: 'KMA',
        publish_time: issueTime || observationTime || null,
        valid_from: null,
        valid_to: null,
        fetch_time: null,
      },
    },
    observation,
    cavok_flag: cavok,
    nsc_flag: nscFlag,
    trend: parseTrendForecast(metar),
  }

  if (!parsed.header.icao) return null
  return parsed
}

export default { parse }
