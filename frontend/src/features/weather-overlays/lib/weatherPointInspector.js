import { gktgBand } from '../../../../../shared/gktg.js'
import { createCloudPotentialSampler, pickCloudPotentialColor } from './cloudPotentialField.js'
import { createIcingPotentialSampler, pickIcingColor } from './icingPotentialField.js'
import { createTemperatureFieldSampler, pickTemperatureColor } from './temperatureField.js'
import { createWindFieldSampler, pickWindSpeedColor } from './windField.js'
import { KTG_COLOR_RAMP, pickKtgRgba } from './ktgTurbulenceField.js'
import { decodeKimBelowGround, KIM_BELOW_GROUND_COLOR, KIM_BELOW_GROUND_LABEL } from './kimBelowGround.js'

const MS_TO_KT = 1.943844

function fixed(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function formatAltitude(field) {
  const level = field?.level
  if (!level) return '—'
  if (level.unit === 'hPa') return `${level.value} hPa`
  if (level.unit === 'm') return `${level.value} m`
  return level.label || level.id || '—'
}

function decodeGeopotentialHeight(value, field) {
  const encoding = field?.geopotentialHeightEncoding
  if (!Number.isFinite(value) || value === encoding?.missing) return null
  return encoding?.encoding === 'int16-scaled-json-v1'
    ? value * (encoding.scale ?? 1) + (encoding.offset ?? 0)
    : value
}

function geopotentialHeightLabel(field, lon, lat) {
  const grid = field?.grid
  const values = field?.geopotentialHeight
  if (!grid || !Array.isArray(values) || !Number.isFinite(grid.nx) || !Number.isFinite(grid.ny)) return null
  const dx = (grid.lonMax - grid.lonMin) / Math.max(1, grid.nx - 1)
  const dy = (grid.latMax - grid.latMin) / Math.max(1, grid.ny - 1)
  const x = Math.round((lon - grid.lonMin) / dx)
  const y = Math.round((lat - grid.latMin) / dy)
  if (x < 0 || y < 0 || x >= grid.nx || y >= grid.ny) return null
  const meters = decodeGeopotentialHeight(values[y * grid.nx + x], field)
  return Number.isFinite(meters) ? `예측 ${Math.round(meters).toLocaleString('en-US')} m MSL` : null
}

function windDirectionFromComponents(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || (u === 0 && v === 0)) return null
  return (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
}

function buildWindRow(field, sampler, metadata) {
  const sample = sampler.sample(metadata.lon, metadata.lat)
  if (!sample) return null
  const speedKt = sample.speed * MS_TO_KT
  const direction = windDirectionFromComponents(sample.u, sample.v)
  return {
    key: 'wind',
    label: '바람',
    value: `풍향 ${Number.isFinite(direction) ? `${Math.round(direction).toString().padStart(3, '0')}°` : '—'} · ${fixed(speedKt)} kt`,
    altitude: formatAltitude(field),
    geopotentialHeight: geopotentialHeightLabel(field, metadata.lon, metadata.lat),
    color: pickWindSpeedColor(sample.speed).color,
    ...metadata.time,
  }
}

function buildTemperatureRow(field, sampler, metadata) {
  const value = sampler.sample(metadata.lon, metadata.lat)
  if (!Number.isFinite(value)) return null
  return {
    key: 'temp',
    label: '기온',
    value: `${fixed(value, 1)} °C`,
    altitude: formatAltitude(field),
    geopotentialHeight: geopotentialHeightLabel(field, metadata.lon, metadata.lat),
    color: pickTemperatureColor(value).color,
    ...metadata.time,
  }
}

function buildCloudRow(field, sampler, metadata) {
  const value = sampler.sample(metadata.lon, metadata.lat)
  if (!Number.isFinite(value)) return null
  return {
    key: 'cloud',
    label: '구름층 추정',
    value: `${fixed(value, 1)} °C`,
    detail: '이슬점 편차 (T−Td)',
    altitude: formatAltitude(field),
    geopotentialHeight: geopotentialHeightLabel(field, metadata.lon, metadata.lat),
    color: pickCloudPotentialColor(value, field).color || 'rgba(24, 96, 44, 0.68)',
    ...metadata.time,
  }
}

function icingLabel(grade) {
  return pickIcingColor(grade).label
}

function buildIcingRow(field, sampler, metadata) {
  const sample = sampler.sample(metadata.lon, metadata.lat)
  if (!sample) return null
  return {
    key: 'icing',
    label: '착빙',
    value: icingLabel(sample.grade),
    detail: `잠재도 ${fixed(sample.score, 2)}`,
    altitude: formatAltitude(field),
    geopotentialHeight: geopotentialHeightLabel(field, metadata.lon, metadata.lat),
    color: pickIcingColor(sample.grade).color || 'var(--stroke-2)',
    ...metadata.time,
  }
}

function createKtgSampler(field) {
  const grid = field?.grid
  if (!field || !grid || !Array.isArray(field.gktg || field.ktg)) return { sample: () => null }
  const dx = (grid.lonMax - grid.lonMin) / Math.max(1, grid.nx - 1)
  const dy = (grid.latMax - grid.latMin) / Math.max(1, grid.ny - 1)
  const belowGround = decodeKimBelowGround(field)
  const indexAt = (lon, lat) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) return null
    const x = Math.round((lon - grid.lonMin) / dx)
    const y = Math.round((lat - grid.latMin) / dy)
    if (x < 0 || y < 0 || x >= grid.nx || y >= grid.ny) return null
    return y * grid.nx + x
  }
  return {
    sample(lon, lat) {
      const index = indexAt(lon, lat)
      return index === null ? null : (field.gktg || field.ktg)[index]
    },
    isBelowGround(lon, lat) {
      const index = indexAt(lon, lat)
      return index !== null && belowGround?.[index] === 1
    },
  }
}

function ktgLabel(value) {
  return KTG_COLOR_RAMP.find((entry) => value >= entry.ktgMin && value < entry.ktgMax)?.label || 'None'
}

function ktgColor(value) {
  const rgba = pickKtgRgba(value)
  return rgba ? `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${(rgba[3] / 255).toFixed(2)})` : 'var(--stroke-2)'
}

function buildTurbulenceRow(field, sampler, metadata) {
  const value = sampler.sample(metadata.lon, metadata.lat)
  if (sampler.isBelowGround?.(metadata.lon, metadata.lat)) {
    return { key: 'turbulence', label: '난류', value: KIM_BELOW_GROUND_LABEL, detail: '지상기압보다 높은 기압면', altitude: formatAltitude(field),
      geopotentialHeight: null, color: KIM_BELOW_GROUND_COLOR, ...metadata.time }
  }
  if (!Number.isFinite(value)) return null
  const band = field.product === 'GKTG' ? gktgBand(value) : null
  if (field.product === 'GKTG' && (!band || band.min === 0)) return null
  return {
    key: 'turbulence',
    label: '난류',
    value: `${field.product === 'GKTG' ? band.label : ktgLabel(value)} · ${fixed(value, 3)}`,
    detail: field.product === 'GKTG' ? 'GKTG 강도' : 'KTG 강도',
    altitude: field.product === 'GKTG' ? formatAltitude(field) : Number.isFinite(Number(field.altFt)) ? `${field.altFt} ft` : '—',
    geopotentialHeight: field.product === 'GKTG' ? geopotentialHeightLabel(field, metadata.lon, metadata.lat) : null,
    color: field.product === 'GKTG' ? band.color : ktgColor(value),
    ...metadata.time,
  }
}

export function createWeatherPointSamplers({ windField, temperatureField, cloudField, icingField, ktgGrid }) {
  return {
    wind: createWindFieldSampler(windField),
    temp: createTemperatureFieldSampler(temperatureField),
    cloud: createCloudPotentialSampler(cloudField),
    icing: createIcingPotentialSampler(icingField),
    turbulence: createKtgSampler(ktgGrid),
  }
}

// 지면 아래(지상기압보다 큰 기압면) 칸이면 값 대신 "지면 아래"를 보인다. 서버가 그 칸 값을 비우고 표시를 붙인다.
function belowGroundAt(field, lon, lat) {
  const mask = decodeKimBelowGround(field)
  const grid = field?.grid
  if (!mask || !grid) return false
  const dx = (grid.lonMax - grid.lonMin) / Math.max(1, grid.nx - 1)
  const dy = (grid.latMax - grid.latMin) / Math.max(1, grid.ny - 1)
  const x = Math.round((lon - grid.lonMin) / dx)
  const y = Math.round((lat - grid.latMin) / dy)
  return x >= 0 && y >= 0 && x < grid.nx && y < grid.ny && mask[y * grid.nx + x] === 1
}

function belowGroundRow(key, label, field, metadata) {
  return { key, label, value: KIM_BELOW_GROUND_LABEL, detail: '지상기압보다 높은 기압면', altitude: formatAltitude(field),
    geopotentialHeight: null, color: KIM_BELOW_GROUND_COLOR, ...metadata.time }
}

export function buildWeatherPointRows({
  lon,
  lat,
  visibility = {},
  fields = {},
  samplers,
  issueLabel = '-',
  validLabel = '-',
  turbulenceIssueLabel = issueLabel,
  turbulenceValidLabel = validLabel,
}) {
  const metadata = { lon, lat, time: { issueLabel, validLabel } }
  const turbulenceMetadata = { lon, lat, time: { issueLabel: turbulenceIssueLabel, validLabel: turbulenceValidLabel } }
  const rows = []
  const row = (key, label, field, build) => (belowGroundAt(field, lon, lat) ? belowGroundRow(key, label, field, metadata) : build())
  if (visibility.wind && fields.windField) rows.push(row('wind', '바람', fields.windField, () => buildWindRow(fields.windField, samplers.wind, metadata)))
  if (visibility.temp && fields.temperatureField) rows.push(row('temp', '기온', fields.temperatureField, () => buildTemperatureRow(fields.temperatureField, samplers.temp, metadata)))
  if (visibility.cloud && fields.cloudField) rows.push(row('cloud', '구름층 추정', fields.cloudField, () => buildCloudRow(fields.cloudField, samplers.cloud, metadata)))
  if (visibility.icing && fields.icingField) rows.push(row('icing', '착빙', fields.icingField, () => buildIcingRow(fields.icingField, samplers.icing, metadata)))
  if (visibility.turbulence && fields.ktgGrid) rows.push(buildTurbulenceRow(fields.ktgGrid, samplers.turbulence, turbulenceMetadata))
  return rows.filter(Boolean)
}

export function formatWeatherPointCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(3)}°${value >= 0 ? positive : negative}`
}

export function chooseWeatherPointPlacement(pointX, containerWidth, cardWidth = 380) {
  const rightSpace = containerWidth - pointX
  const leftSpace = pointX
  return rightSpace < cardWidth + 16 && leftSpace >= cardWidth + 16 ? 'left' : 'right'
}
