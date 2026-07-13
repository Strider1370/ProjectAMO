import { buildMetarViewModel } from './metarViewModel.js'
import {
  buildTafViewModel,
  formatTafHour,
  groupTafSlots,
  TAF_CATEGORY_COLOR,
} from './tafViewModel.js'
import { fmtKstShort } from './formatters.js'

const HOUR_MS = 60 * 60 * 1000

// 경보 종류 키(shared/warning-types.js) → 한국어 표기
const WARNING_NAME_KO = {
  WIND_SHEAR: '급변풍경보',
  LOW_VISIBILITY: '저시정경보',
  STRONG_WIND: '강풍경보',
  HEAVY_RAIN: '호우경보',
  LOW_CEILING: '저운고경보',
  THUNDERSTORM: '뇌우경보',
  TYPHOON: '태풍경보',
  HEAVY_SNOW: '대설경보',
  YELLOW_DUST: '황사경보',
}

function pickWarningName(item) {
  return WARNING_NAME_KO[item?.wrng_type_key] || item?.wrng_type_name || item?.type_label || item?.type || '미확인 경보'
}

function formatCompactWind(obs) {
  const wind = obs?.wind
  if (!wind) return '-'
  if (wind.calm) return 'CALM'
  const direction = wind.variable
    ? 'VRB'
    : Number.isFinite(wind.direction)
      ? String(wind.direction).padStart(3, '0')
      : '///'
  const speed = Number.isFinite(wind.speed) ? String(wind.speed).padStart(2, '0') : '//'
  return `${direction}/${speed}kt`
}

export function buildCurrentWarningModel(warning, tz = 'UTC') {
  const warnings = Array.isArray(warning?.warnings) ? warning.warnings : []
  const items = warnings.map((item) => ({
    key: item?.wrng_type_key || item?.type || item?.wrng_type_name || 'UNKNOWN',
    name: pickWarningName(item),
    timeText: `${fmtKstShort(item?.valid_start, tz)} – ${fmtKstShort(item?.valid_end, tz)}`,
    raw: item,
  }))

  return {
    active: items.length > 0,
    count: items.length,
    label: items.length > 0 ? '공항경보' : '공항경보 없음',
    items,
  }
}

export function formatRvrSummary(obs) {
  const entries = Array.isArray(obs?.rvr) ? obs.rvr : []
  const parts = entries
    .map((item) => {
      if (!item?.runway || !Number.isFinite(item?.mean)) return null
      return `R${item.runway}/${item.mean}m`
    })
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

export function buildCompactMetarModel({ metar, amosData, icao, airportMeta }) {
  if (!metar?.observation) return { empty: true }

  const vm = buildMetarViewModel({ metar, amosData, icao, airportMeta })
  const temperature = vm.obs?.temperature || {}
  const temperatureValue = Number.isFinite(temperature.air) && Number.isFinite(temperature.dewpoint)
    ? `${Math.round(temperature.air)}°C / ${Math.round(temperature.dewpoint)}°C`
    : vm.tempDisplay
  const rvrText = formatRvrSummary(vm.obs)

  return {
    empty: false,
    flight: vm.flightCat,
    flightCategory: vm.flightCat.category,
    weatherVisual: vm.weatherVisual,
    cards: {
      weather: {
        id: 'weather',
        label: '현재날씨',
        value: vm.weatherKorean,
        secondary: vm.rainText,
        visual: vm.weatherVisual,
      },
      wind: {
        id: 'wind',
        label: '바람',
        value: formatCompactWind(vm.obs),
        secondary: vm.windGustText ? `${vm.windGustText}kt` : null,
        windRotation: vm.windRotation,
        highWind: vm.highWind,
      },
      visibility: {
        id: 'visibility',
        label: '시정',
        value: vm.visValue,
        secondary: null,
        color: vm.visCat.valueColor,
        background: vm.visCat.bg,
        border: vm.visCat.border,
      },
      ceiling: {
        id: 'ceiling',
        label: '운고',
        value: vm.ceilValue,
        color: vm.ceilCat.valueColor,
        background: vm.ceilCat.bg,
        border: vm.ceilCat.border,
      },
      qnh: {
        id: 'qnh',
        label: 'QNH',
        value: vm.qnh,
      },
      temperature: {
        id: 'temperature',
        label: '기온/이슬점',
        value: temperatureValue,
      },
      rvr: { id: 'rvr', label: 'RVR', value: rvrText || '2000+' },
    },
  }
}

export function buildCompactTafModel({ taf, icao, now = new Date(), hours = 6 }) {
  if (!taf?.timeline) {
    return {
      empty: true,
      hdr: taf?.header || null,
      rawTimeline: [],
      sourceSlotCount: 0,
      slots: [],
      hourCount: 0,
    }
  }

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const endMs = nowMs + hours * HOUR_MS
  const originalNow = Date.now
  Date.now = () => nowMs
  let source

  try {
    source = buildTafViewModel(taf, icao)
  } finally {
    Date.now = originalNow
  }

  const slots = source.slots.filter((slot) => {
    const slotStart = new Date(slot.time).getTime()
    if (Number.isNaN(slotStart)) return false
    const slotEnd = slotStart + HOUR_MS
    return slotStart < endMs && slotEnd > nowMs
  })

  return {
    ...source,
    empty: false,
    slots,
    sourceSlotCount: source.rawTimeline.length,
    hourCount: slots.length,
    formatTafHour,
    groupTafSlots,
    categoryColor: TAF_CATEGORY_COLOR,
  }
}
