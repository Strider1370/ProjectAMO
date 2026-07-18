import {
  getFlightCategory,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
} from '../../../shared/weather/helpers.js'
import { convertWeatherToKorean } from '../../../shared/weather/visual-mapper.js'
import { resolveWeatherVisual } from '../../../shared/weather/weather-visual-resolver.js'
import {
  buildWindToken,
  buildVisibilityToken,
  buildCeilingToken,
  weatherTokens,
  levelHighlightClass,
  splitSegmentsOn,
} from './metarViewModel.js'

// 비행 카테고리 3단계(초록/주황/빨강) — 헌법 §5 레벨 토큰 값 미러(단일 출처). JS 인라인 스타일이라 hex로 보관.
export const TAF_CATEGORY_COLOR = { VFR: '#166534', IFR: '#92400e', LIFR: '#c0291f' }

function getTafCeiling(slot) {
  return slot?.clouds
    ?.filter((cloud) => cloud.amount === 'BKN' || cloud.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null
}

function formatTafCeiling(value) {
  return Number.isFinite(value) ? `${value} ft` : 'NSC'
}

function formatTafVisibility(slot) {
  const value = slot?.visibility?.value
  if (Number.isFinite(value)) return `${value} m`
  return slot?.display?.visibility || '-'
}

function formatTafWind(slot) {
  const wind = slot?.wind
  if (!wind) return '-'
  if (wind.calm) return 'CALM'
  const dir = wind.variable ? 'VRB' : Number.isFinite(wind.direction) ? String(wind.direction).padStart(3, '0') : '///'
  const speed = Number.isFinite(wind.speed) ? String(wind.speed).padStart(2, '0') : '//'
  return `${dir}${speed}${wind.gust ? `G${wind.gust}` : ''}${wind.unit || 'KT'}`
}

function tafSlotView(slot, icao) {
  const visibility = slot?.visibility?.value ?? null
  const ceiling = getTafCeiling(slot)
  const flight = getFlightCategory(visibility, ceiling, icao)
  const visibilityCategory = classifyVisibilityCategory(visibility, icao)
  const ceilingCategory = classifyCeilingCategory(ceiling, icao)
  const visual = resolveWeatherVisual(slot, slot?.time)
  const weatherLabel = convertWeatherToKorean(slot?.display?.weather, slot?.visibility?.cavok ?? slot?.cavok, slot?.clouds || [])
  const wind = slot?.wind
  const windRotation = Number.isFinite(wind?.direction) ? ((wind.direction % 360) + 180) % 360 : 0

  return {
    slot,
    time: slot?.time,
    flight,
    visibilityCategory,
    ceilingCategory,
    visual,
    weatherLabel,
    windText: formatTafWind(slot),
    windRotation,
    highWind: hasHighWindCondition(wind),
    hasPrecipitation: hasPrecipitationWeather(slot),
    isSpecialWeather: hasSpecialWeather(slot),
    visibilityText: formatTafVisibility(slot),
    ceilingText: formatTafCeiling(ceiling),
  }
}

export function groupTafSlots(slots, keyFn) {
  const groups = []
  slots.forEach((slot) => {
    const key = keyFn(slot)
    const prev = groups[groups.length - 1]
    if (prev?.key === key) prev.items.push(slot)
    else groups.push({ key, items: [slot] })
  })
  return groups.map((group) => ({ ...group, width: `${(group.items.length / Math.max(1, slots.length)) * 100}%`, first: group.items[0] }))
}

export function formatTafHour(iso, tz = 'UTC') {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  const display = tz === 'KST' ? new Date(d.getTime() + 9 * 3600 * 1000) : d
  return `${String(display.getUTCDate()).padStart(2, '0')}/${String(display.getUTCHours()).padStart(2, '0')}${tz === 'UTC' ? 'Z' : ''}`
}

// TAF 원문 줄바꿈 — NOAA rawTAF는 한 줄로 옴 → FM/BECMG/TEMPO/PROBxx/RMK 앞에서 개행해 줄 단위로 쪼갠다.
function splitTafLines(raw) {
  if (!raw) return []
  return String(raw)
    .replace(/\s+(FM\d{6}|PROB\d{2}\s+TEMPO|PROB\d{2}|BECMG|TEMPO|RMK)\b/g, '\n$1')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

// 줄 맨 앞의 변화시각(DDHH/DDHH 또는 FMDDHHmm)에서 시작 day+hour만 뽑는다 — 시간대별
// 해상도로 이미 계산된 timeline과 맞춰보기 위한 키. RMK 등 시각이 없는 줄은 null.
function lineStartKey(line) {
  const fm = line.match(/^FM(\d{2})(\d{2})/)
  if (fm) return `${fm[1]}${fm[2]}`
  const range = line.match(/(\d{2})(\d{2})\/(\d{2})(\d{2})/)
  return range ? `${range[1]}${range[2]}` : null
}

function buildTafLineSegments(line, slot, icao) {
  let segments = [{ text: line }]
  if (!slot) return segments
  if (hasHighWindCondition(slot.wind)) {
    segments = splitSegmentsOn(segments, buildWindToken(slot.wind), 'ap-metar-tac-hl ap-metar-tac-hl--wind')
  }
  const visClass = levelHighlightClass(classifyVisibilityCategory(slot?.visibility?.value, icao))
  if (visClass) segments = splitSegmentsOn(segments, buildVisibilityToken(slot), visClass)
  if (hasPrecipitationWeather(slot) || hasSpecialWeather(slot)) {
    const wxClass = hasSpecialWeather(slot) ? 'ap-metar-tac-hl ap-metar-tac-hl--special' : 'ap-metar-tac-hl ap-metar-tac-hl--precip'
    for (const token of weatherTokens(slot)) segments = splitSegmentsOn(segments, token, wxClass)
  }
  const ceilClass = levelHighlightClass(classifyCeilingCategory(getTafCeiling(slot), icao))
  if (ceilClass) segments = splitSegmentsOn(segments, buildCeilingToken(slot), ceilClass)
  return segments
}

// TAC 원문을 줄 단위로 나누고, 각 줄(기본/TEMPO/BECMG/FM/PROB)의 변화시각을 이미 계산된
// timeline과 맞춰 그 시점의 비행조건 배지 + 임계값 색칠을 함께 붙인다.
export function buildTafTacLines(taf, icao) {
  const rawText = taf?.header?.raw_text
  if (!rawText) return []
  const rawTimeline = Array.isArray(taf.timeline) ? taf.timeline : []
  const hourMap = new Map()
  for (const slot of rawTimeline) {
    const d = new Date(slot.time)
    if (Number.isNaN(d.getTime())) continue
    hourMap.set(`${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}`, slot)
  }
  return splitTafLines(rawText).map((line) => {
    const slot = hourMap.get(lineStartKey(line))
    const category = slot ? getFlightCategory(slot?.visibility?.value, getTafCeiling(slot), icao).category : null
    return { text: line, category, segments: buildTafLineSegments(line, slot, icao) }
  })
}

export function buildTafViewModel(taf, icao) {
  const rawTimeline = Array.isArray(taf.timeline) ? taf.timeline : []
  const timeline = rawTimeline.filter((slot) => new Date(slot.time).getTime() + 3600 * 1000 > Date.now())
  return {
    rawTimeline,
    slots: timeline.map((slot) => tafSlotView(slot, icao)),
    hdr: taf.header,
  }
}
