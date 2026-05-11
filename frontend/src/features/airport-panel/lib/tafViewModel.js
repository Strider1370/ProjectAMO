import {
  getFlightCategory,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  hasHighWindCondition,
} from '../../../shared/weather/helpers.js'
import { convertWeatherToKorean } from '../../../shared/weather/visual-mapper.js'
import { resolveWeatherVisual } from '../../../shared/weather/weather-visual-resolver.js'

export const TAF_CATEGORY_COLOR = { VFR: '#15803d', MVFR: '#2563eb', IFR: '#f59e0b', LIFR: '#dc2626' }

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

export function formatTafHour(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCHours()).padStart(2, '0')}Z`
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
