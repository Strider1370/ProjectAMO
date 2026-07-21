import {
  getFlightCategory,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
} from '../../../shared/weather/helpers.js'
import { tacRoleClass } from './metarViewModel.js'

// 비행 카테고리 3단계(초록/주황/빨강) — 헌법 §5 레벨 토큰 값 미러(단일 출처). JS 인라인 스타일이라 hex로 보관.
export const TAF_CATEGORY_COLOR = { VFR: '#166534', IFR: '#92400e', LIFR: '#c0291f' }

function getTafCeiling(slot) {
  return slot?.clouds
    ?.filter((cloud) => cloud.amount === 'BKN' || cloud.amount === 'OVC')
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null
}

function formatTafClouds(slot) {
  if (slot?.visibility?.cavok ?? slot?.cavok) return 'CAVOK'
  const clouds = Array.isArray(slot?.clouds) ? slot.clouds : []
  if (clouds.length === 0) return 'NSC'
  return clouds.map((cloud) => cloud.raw || `${cloud.amount || ''}${Number.isFinite(cloud.base) ? String(Math.round(cloud.base / 100)).padStart(3, '0') : ''}${cloud.type === 'CB' ? 'CB' : ''}`).filter(Boolean).join(' ')
}

function formatTafVisibility(slot) {
  const value = slot?.visibility?.value
  if (Number.isFinite(value)) return String(value)
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
  const weatherText = slot?.display?.weather || ((slot?.visibility?.cavok ?? slot?.cavok) ? 'CAVOK' : 'NSW')
  const wind = slot?.wind
  const windRotation = Number.isFinite(wind?.direction) ? ((wind.direction % 360) + 180) % 360 : 0

  return {
    slot,
    time: slot?.time,
    flight,
    visibilityCategory,
    ceilingCategory,
    weatherText,
    windText: formatTafWind(slot),
    windRotation,
    highWind: hasHighWindCondition(wind),
    hasPrecipitation: hasPrecipitationWeather(slot),
    isSpecialWeather: hasSpecialWeather(slot),
    visibilityText: formatTafVisibility(slot),
    cloudText: formatTafClouds(slot),
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

function buildTafLineSegments(line, slot, icao) {
  if (!line.tokens || !slot) return [{ text: line.text || line }]
  const context = {
    highWind: hasHighWindCondition(slot.wind),
    visCat: classifyVisibilityCategory(slot.visibility?.value, icao),
    ceilCat: classifyCeilingCategory(getTafCeiling(slot), icao),
    precipitationWeather: hasPrecipitationWeather(slot),
    specialWeather: hasSpecialWeather(slot),
  }
  return line.tokens.map((token) => ({ text: token.text, className: tacRoleClass(token.role, context) }))
}

// TAC 원문을 줄 단위로 나누고, 각 줄(기본/TEMPO/BECMG/FM/PROB)의 변화시각을 이미 계산된
// timeline과 맞춰 그 시점의 비행조건 배지 + 임계값 색칠을 함께 붙인다.
export function buildTafTacLines(taf, icao) {
  const rawText = taf?.header?.raw_text
  if (!rawText) return []
  const rawTimeline = Array.isArray(taf.timeline) ? taf.timeline : []
  const lines = taf?.header?.tac?.display_lines
  if (!lines) return [{ text: rawText, category: null, segments: [{ text: rawText }] }]
  const slotMap = new Map(rawTimeline.map((slot) => [slot.time, slot]))
  return lines.map((line) => {
    const slot = slotMap.get(line.slot_time)
    const category = slot ? getFlightCategory(slot?.visibility?.value, getTafCeiling(slot), icao).category : null
    return { text: line.text, category, segments: buildTafLineSegments(line, slot, icao) }
  })
}

// 탭 배지: §10 정본 = 작동 프로토타입 badges()의 TAF 분기 이식. 예보 기간 중 VFR을 벗어나는
// 연속 시간창 수를 세고, 그중 LIFR이 하나라도 있으면 적, 없으면(IFR만) 앰버.
export function countTafHazardPeriods(slots) {
  let count = 0
  let worst = 0
  let prevHazard = false
  for (const s of slots || []) {
    const cat = s.flight?.category
    const hazard = cat && cat !== 'VFR'
    if (hazard) {
      if (!prevHazard) count++
      worst = Math.max(worst, cat === 'LIFR' ? 2 : 1)
    }
    prevHazard = hazard
  }
  return count ? { count, severity: worst >= 2 ? 'red' : 'amber' } : null
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
