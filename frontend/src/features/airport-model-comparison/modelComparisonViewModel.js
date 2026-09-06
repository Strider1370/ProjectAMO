import { computeRelativeHumidity } from '../../shared/weather/helpers.js'

const HOUR_MS = 3_600_000
export const MODEL_ORDER = ['kim', 'ecmwf', 'gfs', 'icon']
export const MODEL_LABELS = { kim: 'KIM', ecmwf: 'ECMWF', gfs: 'GFS', icon: 'ICON' }
export const MODEL_COLORS = { metar: '#242424', amos: '#616161', taf: '#92400e', kim: '#2563eb', ecmwf: '#7c3aed', gfs: '#0f766e', icon: '#c2410c' }

const finite = value => Number.isFinite(value)
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const roundHour = value => new Date(Math.floor(Date.parse(value) / HOUR_MS) * HOUR_MS).toISOString()
const fmtNumber = (value, digits = 0) => finite(value) ? value.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '자료 없음'

export function firstForecastHour(nowMs) {
  return new Date(Math.ceil(nowMs / HOUR_MS) * HOUR_MS).toISOString()
}

export function cumulativeHourly(values) {
  let total = 0
  let complete = true
  return values.map(value => {
    if (!finite(value)) complete = false
    if (!complete) return null
    total += value
    return total
  })
}

export function pathSegments(points) {
  const segments = []
  let current = []
  for (const point of points) {
    if (finite(point?.value) && finite(point?.x)) current.push(point)
    else if (current.length) { segments.push(current); current = [] }
  }
  if (current.length) segments.push(current)
  return segments
}

function formatTime(value, tz, includeZone = true) {
  const date = new Date(value)
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz === 'KST' ? 'Asia/Seoul' : 'UTC', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = type => parts.find(part => part.type === type)?.value
  return `${get('month')}.${get('day')} ${get('hour')}:${get('minute')}${includeZone ? ` ${tz}` : ''}`
}

function statusText(record) {
  const status = record?.ceiling_status
  if (status === 'not_detected_below_limit') return `${fmtNumber(record.ceiling_limit_ft ?? 5000)} ft 이하 조건 미검출`
  if (status === 'no_ceiling') return '운고 없음'
  if (status === 'missing_input') return '입력자료 없음'
  if (status === 'outside_run') return '예보 범위 밖'
  return '자료 없음'
}

export function methodLabel(method) {
  return ({ model_diagnostic: '모델 자체 운고', cloud_condensate_estimate: '운량·응결물 기반 추정', pressure_level_estimate: '압력면 기반 추정', humidity_based_estimate: '습도 기반 추정' })[method] || '산출 방식 미상'
}

function cloudPercent(clouds) {
  if (finite(clouds?.[0])) return clouds[0]
  const amount = clouds?.find?.(cloud => cloud?.amount || cloud?.coverage)?.amount ?? clouds?.find?.(cloud => cloud?.coverage)?.coverage
  return ({ FEW: 25, SCT: 50, BKN: 75, OVC: 100, VV: 100 })[amount] ?? null
}

function detail(record, airport) {
  if (!record) return null
  return {
    model: record.model,
    airport_icao: record.airport_icao || airport?.icao,
    run_at: record.run_at,
    valid_at: record.valid_at || record.observed_at,
    forecast_hour: record.forecast_hour,
    selection_method: record.selection_method,
    temporal_method: record.temporal_method,
    available_at: record.available_at,
    collected_at: record.collected_at,
    window_start_at: record.window_start_at,
    window_end_at: record.window_end_at,
    field_provenance: record.field_provenance,
    grid_lat: record.grid_lat,
    grid_lon: record.grid_lon,
    grid_elevation_m: record.grid_elevation_m,
    airport_elevation_ft: airport?.elevation_ft,
    grid_elevation_difference_m: finite(record.grid_elevation_m) && finite(airport?.elevation_ft) ? record.grid_elevation_m - airport.elevation_ft * 0.3048 : null,
    ceiling_method: record.ceiling_method,
    ceiling_status: record.ceiling_status,
    ceiling_source_levels: record.ceiling_source_levels || [],
  }
}

function nwpCell(record, kind, slotAt, airport) {
  if (!record) return { slot_at: slotAt, valid_at: slotAt, status: 'outside_run', value: null, text: '예보 범위 밖' }
  const base = { slot_at: slotAt, valid_at: record.valid_at, run_at: record.run_at, forecast_hour: record.forecast_hour, model: record.model, detail: detail(record, airport), status: 'value' }
  if (kind === 'wind') return { ...base, value: record.wind_speed_kt, gust: record.wind_gust_kt, direction: record.wind_direction_deg, text: `${finite(record.wind_direction_deg) ? `${Math.round(record.wind_direction_deg)}°` : '풍향 자료 없음'} ${fmtNumber(record.wind_speed_kt)} kt`, subtext: finite(record.wind_gust_kt) ? `G ${fmtNumber(record.wind_gust_kt)} kt` : '돌풍 자료 없음' }
  if (kind === 'precipitation') return { ...base, value: record.precipitation_mm, text: finite(record.precipitation_mm) ? `${fmtNumber(record.precipitation_mm, 1)} mm` : '자료 없음' }
  if (kind === 'ceiling') return { ...base, value: record.ceiling_agl_ft, status: finite(record.ceiling_agl_ft) ? 'value' : record.ceiling_status || 'missing_input', text: finite(record.ceiling_agl_ft) ? `${fmtNumber(record.ceiling_agl_ft)} ft` : statusText(record), method: methodLabel(record.ceiling_method), clouds: [record.cloud_total_pct, record.cloud_low_pct, record.cloud_mid_pct, record.cloud_high_pct] }
  const temperature = record.temperature_c, rh = record.relative_humidity_pct
  return { ...base, value: temperature, rh, temperature, text: `${finite(temperature) ? `${fmtNumber(temperature, 1)}°C` : '자료 없음'} / ${finite(rh) ? `${fmtNumber(rh)}%` : '자료 없음'}`, dewPoint: record.dew_point_c, pressure: record.pressure_msl_hpa }
}

function observationRows(data, times, kind, effectiveNow) {
  const rows = []
  const metars = (data.observations?.metar || []).filter(item => Date.parse(item.observed_at) <= effectiveNow).sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
  if (kind !== 'precipitation') {
    rows.push({ id: 'metar', label: kind === 'temperatureRh' ? 'METAR 계산' : 'METAR', color: MODEL_COLORS.metar, cells: times.map(slot => {
      const reports = metars.filter(item => roundHour(item.observed_at) === slot)
      if (!reports.length) return null
      const cells = reports.map(item => {
      if (kind === 'wind') return { slot_at: slot, valid_at: item.observed_at, value: item.wind_speed_kt, gust: item.wind_gust_kt, direction: item.wind_direction_deg, text: `${finite(item.wind_direction_deg) ? `${Math.round(item.wind_direction_deg)}°` : 'VRB'} ${fmtNumber(item.wind_speed_kt)} kt`, subtext: finite(item.wind_gust_kt) ? `G ${fmtNumber(item.wind_gust_kt)} kt` : '돌풍 없음', detail: detail(item) }
      if (kind === 'ceiling') { const cloud = item.clouds?.find(c => ['BKN', 'OVC', 'VV'].includes(c.amount ?? c.coverage) && finite(c.base ?? c.base_ft)); const base = cloud?.base ?? cloud?.base_ft; return { slot_at: slot, valid_at: item.observed_at, value: base ?? null, text: cloud ? `${fmtNumber(base)} ft` : '운고 없음', clouds: item.clouds, detail: detail(item) } }
      const rh = computeRelativeHumidity(item.temperature_c, item.dew_point_c)
      return { slot_at: slot, valid_at: item.observed_at, value: item.temperature_c, temperature: item.temperature_c, rh, text: `${finite(item.temperature_c) ? `${fmtNumber(item.temperature_c, 1)}°C` : '자료 없음'} / ${finite(rh) ? `${fmtNumber(rh)}%` : '자료 없음'}`, dewPoint: item.dew_point_c, detail: detail(item) }
      })
      return { ...cells.at(-1), reports: cells }
    }) })
  }
  if (kind === 'precipitation') {
    rows.push({ id: 'metar', label: 'METAR 현재날씨', color: MODEL_COLORS.metar, cells: times.map(slot => { const reports = metars.filter(x => roundHour(x.observed_at) === slot).map(item => ({ slot_at: slot, valid_at: item.observed_at, value: null, text: item.weather?.map(x => x.raw).filter(Boolean).join(' ') || '현상 없음' })); return reports.length ? { ...reports.at(-1), reports } : null }) })
  }
  const taf = data.observations?.taf
  if (kind !== 'temperatureRh') rows.push({ id: 'taf', label: 'TAF', color: MODEL_COLORS.taf, cells: times.map(slot => {
    if (!taf) return { slot_at: slot, valid_at: slot, value: null, text: '자료 없음', status: 'missing_input' }
    if (Date.parse(slot) < Date.parse(taf.valid_from) || Date.parse(slot) >= Date.parse(taf.valid_to)) return null
    const groups = taf.change_groups || []
    const persistent = groups.filter(g => (g.type === 'FM' && Date.parse(g.start) <= Date.parse(slot)) || (g.type === 'BECMG' && Date.parse(g.end || g.start) <= Date.parse(slot)))
    const conditional = groups.filter(g => g.type !== 'FM' && Date.parse(g.start) <= Date.parse(slot) && Date.parse(slot) < Date.parse(g.end))
    const merge = (base, change) => ({ ...base, ...Object.fromEntries(Object.entries(change || {}).filter(([key, value]) => value != null && !['type', 'start', 'end'].includes(key))), wind: change?.wind ?? base?.wind, clouds: change?.clouds_touched === false ? base?.clouds : change?.clouds ?? base?.clouds, wx: change?.wx_touched === false ? base?.wx : change?.wx ?? base?.wx })
    const values = persistent.reduce(merge, taf.base || {})
    const condition = [...persistent.slice(-1), ...conditional].map(g => g.type).join(' + ') || null
    const conditionalValues = conditional.map(group => ({ type: `${group.type} ${group.start}–${group.end}`, values: merge(values, group) }))
    const conditionTextFor = kind => conditionalValues.map(({ type, values: alternate }) => {
      if (kind === 'wind') return `${type} ${alternate.wind?.direction ?? 'VRB'}° ${alternate.wind?.speed ?? '—'} kt`
      if (kind === 'precipitation') return `${type} ${alternate.wx?.map(x => x.raw).filter(Boolean).join(' ') || 'NSW'}`
      const cloud = alternate.clouds?.find(c => ['BKN', 'OVC', 'VV'].includes(c.amount ?? c.coverage) && finite(c.base ?? c.base_ft))
      return `${type} ${cloud ? `${fmtNumber(cloud.base ?? cloud.base_ft)} ft` : '운고 없음'}`
    }).join(' · ')
    if (kind === 'wind') return { slot_at: slot, valid_at: slot, value: values.wind?.speed ?? null, gust: values.wind?.gust ?? null, direction: values.wind?.direction ?? null, text: finite(values.wind?.speed) ? `${values.wind.direction ?? 'VRB'}° ${values.wind.speed} kt` : '자료 없음', subtext: finite(values.wind?.gust) ? `G ${fmtNumber(values.wind.gust)} kt` : '돌풍 없음', condition, conditionText: conditionTextFor(kind) }
    if (kind === 'precipitation') return { slot_at: slot, valid_at: slot, value: null, text: values.wx?.map(x => x.raw).filter(Boolean).join(' ') || 'NSW', condition, conditionText: conditionTextFor(kind) }
    const cloud = values.clouds?.find(c => ['BKN', 'OVC', 'VV'].includes(c.amount ?? c.coverage) && finite(c.base ?? c.base_ft)), base = cloud?.base ?? cloud?.base_ft
    return { slot_at: slot, valid_at: slot, value: base ?? null, text: cloud ? `${fmtNumber(base)} ft` : '운고 없음', condition, conditionText: conditionTextFor(kind), clouds: values.clouds }
  }) })
  if (kind === 'precipitation') {
    const amos = data.observations?.amos || []
    rows.push({ id: 'amos', label: 'AMOS 실측', color: MODEL_COLORS.amos, cells: times.map(slot => { const item = amos.find(x => x.observed_at === slot); return item ? { slot_at: slot, valid_at: item.observed_at, value: item.precipitation_mm, text: finite(item.precipitation_mm) ? `${fmtNumber(item.precipitation_mm, 1)} mm` : '자료 없음' } : null }) })
  }
  return rows
}

export function buildComparisonViewModel({ data, nowMs, selectedValidAt, tz = 'KST' }) {
  if (!data) return null
  const effectiveNow = Number.isFinite(nowMs) ? nowMs : Date.parse(data.effective_now)
  const first = firstForecastHour(effectiveNow)
  const selected = iso(selectedValidAt) || first
  const baseStart = Date.parse(first) - 3 * HOUR_MS
  const selectedMs = Date.parse(selected)
  const selectedNearWindow = Math.abs(selectedMs - Date.parse(first)) <= 48 * HOUR_MS
  const starts = [baseStart, selectedNearWindow ? selectedMs : baseStart]
  const ends = [Date.parse(first), selectedNearWindow ? selectedMs : Date.parse(first)]
  for (const model of data.models || []) for (const rec of model.records || []) ends.push(Date.parse(rec.valid_at))
  const startMs = Math.min(...starts), endMs = Math.max(...ends.filter(Number.isFinite))
  const times = Array.from({ length: Math.floor((endMs - startMs) / HOUR_MS) + 1 }, (_, i) => new Date(startMs + i * HOUR_MS).toISOString())
  const modelRecords = new Map((data.models || []).map(model => [model.model, new Map((model.records || []).map(rec => [rec.valid_at, rec]))]))
  const rows = {}
  for (const kind of ['wind', 'precipitation', 'ceiling', 'temperatureRh']) {
    rows[kind] = [...observationRows(data, times, kind, effectiveNow), ...MODEL_ORDER.map(model => ({ id: model, label: MODEL_LABELS[model], color: MODEL_COLORS[model], cells: times.map(slot => nwpCell(modelRecords.get(model)?.get(slot), kind, slot, data.airport)) }))]
  }
  const samples = row => row.cells.flatMap(cell => cell?.reports || [cell])
  const charts = {
    wind: rows.wind.map(row => ({ ...row, points: samples(row).map(cell => cell ? { at: cell.valid_at, value: cell.value, gust: cell.gust, status: cell.status, text: [cell.text, cell.subtext].filter(Boolean).join(' · '), conditionText: cell.conditionText, detail: cell.detail } : { at: null, value: null }) })),
    precipitation: rows.precipitation.filter(row => MODEL_ORDER.includes(row.id) || row.id === 'amos').map(row => {
      const cumulative = cumulativeHourly(row.cells.map(cell => cell?.value))
      return { ...row, points: cumulative.map((value, i) => ({ at: times[i], value, hourly: row.cells[i]?.value, status: row.cells[i]?.status, text: finite(value) ? `누적 ${fmtNumber(value, 1)} mm · 시간당 ${fmtNumber(row.cells[i]?.value, 1)} mm` : `누적 자료 없음 · 시간당 ${row.cells[i]?.text || '자료 없음'}`, detail: row.cells[i]?.detail })) }
    }),
    ceiling: rows.ceiling.map(row => ({ ...row, points: samples(row).map(cell => ({ at: cell?.valid_at || null, value: cell?.value ?? null, secondary: cloudPercent(cell?.clouds), status: cell?.status, text: cell?.detail?.model ? `${cell.text} · 전/저/중/상 ${cell.clouds?.map(v => finite(v) ? `${fmtNumber(v)}%` : '자료 없음').join(' / ') || '자료 없음'}` : cell?.text, conditionText: cell?.conditionText, detail: cell?.detail })) })),
    temperatureRh: rows.temperatureRh.map(row => ({ ...row, points: samples(row).map(cell => ({ at: cell?.valid_at || null, value: cell?.temperature ?? null, secondary: cell?.rh ?? null, status: cell?.status, text: cell?.text, detail: cell?.detail })) })),
  }
  const selectedModels = MODEL_ORDER.map(model => modelRecords.get(model)?.get(selected)).filter(Boolean)
  const winds = selectedModels.map(r => r.wind_speed_kt).filter(finite), gusts = selectedModels.map(r => r.wind_gust_kt).filter(finite)
  const range = values => values.length ? `${fmtNumber(Math.min(...values))}–${fmtNumber(Math.max(...values))}` : '자료 없음'
  const summary = {
    valid_at: selected,
    valid_at_label: formatTime(selected, tz),
    modelCount: selectedModels.length,
    wind: `${selectedModels.length}개 모델 · 풍속 ${range(winds)} kt${gusts.length ? ` · 돌풍 ${range(gusts)} kt` : ' · 돌풍 자료 없음'}`,
    precipitation: MODEL_ORDER.map(model => { const r = modelRecords.get(model)?.get(selected); return `${MODEL_LABELS[model]} ${finite(r?.precipitation_mm) ? `${fmtNumber(r.precipitation_mm, 1)} mm` : '자료 없음'}` }).join(' · '),
    ceiling: MODEL_ORDER.map(model => { const r = modelRecords.get(model)?.get(selected); return `${MODEL_LABELS[model]} ${finite(r?.ceiling_agl_ft) ? `${fmtNumber(r.ceiling_agl_ft)} ft` : r ? statusText(r) : '예보 범위 밖'}` }).join(' · '),
  }
  const modelChips = MODEL_ORDER.map(model => { const source = (data.models || []).find(x => x.model === model); return { model, label: MODEL_LABELS[model], run_at: source?.run_at || null, available_at: source?.available_at || source?.records?.[0]?.available_at || null, status: source ? 'available' : 'missing' } })
  const observationChips = [
    { id: 'metar', label: 'METAR 실황', at: (data.observations?.metar || []).filter(item => Date.parse(item.observed_at) <= effectiveNow).sort((a,b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)).at(-1)?.observed_at || null },
    { id: 'taf', label: 'TAF 발표', at: data.observations?.taf?.issued_at || null },
  ]
  return { airport: data.airport, status: data.status, issues: data.issues || [], effectiveNow, selectedValidAt: selected, selectedOutsideWindow: !times.includes(selected), times, timeLabels: times.map(t => formatTime(t, tz)), rows, charts, summary, modelChips, observationChips }
}
