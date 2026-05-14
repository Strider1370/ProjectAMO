import { phenomenaToSigwxRenderFeatures } from './sigwxRenderFeatures.js'

const SIGWX_MAP_RANGES = {
  normal: { minLat: 27.5, maxLat: 39, minLon: 121, maxLon: 135 },
  wide: { minLat: 27.3, maxLat: 44, minLon: 119, maxLon: 135 },
}

const SIGWX_SYMBOL_BASE = '/Symbols/Reference%20Symbols/icon_sigwx'
const SIGWX_ICON_EXCLUDED_PREFIXES = ['L_', 'BOX_']
const INTERNAL_LABEL_VALUES = new Set([
  'freez',
  'mountain_obscuration',
  'pressure15',
  'rain',
  'widespread_fog',
  'widespread_mist',
  'wind_strong',
  'l_wind',
  'cloud',
])

export const SIGWX_FILTER_OPTIONS = [
  { key: 'pressure', label: 'Pressure/Front' },
  { key: 'cloud', label: 'Cloud' },
  { key: 'turbulence', label: 'Turb' },
  { key: 'icing', label: 'Icing' },
  { key: 'visibility', label: 'SFC VIS' },
  { key: 'freezing', label: 'Freezing' },
  { key: 'wind', label: 'Wind' },
]

export const SIGWX_LEGEND_ITEMS = [
  { label: 'Thunderstorm', asset: 'tu.png' },
  { label: 'Strong wind', asset: 'box_wind.png' },
  { label: 'Turbulence', asset: 'moderate_turbulence.png' },
  { label: 'Icing', asset: 'Moderate aircraft icing.png' },
  { label: 'Precipitation', asset: 'rain.png' },
  { label: 'Freezing rain', asset: 'freezing_precipitation.png' },
  { label: 'Fog/Hail', asset: 'widespread_fog.png' },
  { label: 'Strong wind area', asset: 'L_WIND.PNG' },
  { label: 'Turbulence area', asset: 'L_TU.png' },
  { label: 'Icing area', asset: 'L_ICE.png' },
  { label: 'Cloudy area', asset: 'L_CB.png' },
  { label: 'Precipitation area', asset: 'L_RAIN.png' },
  { label: 'Low visibility area', asset: 'low_visibility_area.png' },
  { label: 'Freezing level', asset: 'L_FREEZ.png' },
  { label: 'Cold/Warm front', asset: 'L_STAT.png' },
  { label: 'Occluded/Stationary front', asset: 'L_OCCL.png' },
]

export function sigwxAssetUrl(fileName) {
  if (!fileName) return ''
  return `${SIGWX_SYMBOL_BASE}/${String(fileName).split('/').map(encodeURIComponent).join('/')}`
}

function normalizeText(value) {
  return String(value || '').replace(/&#10;/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizedText(value) {
  return normalizeText(value).toLowerCase()
}

function isMergedInternalTokenLabel(item, value) {
  const normalized = normalizedText(value)
  if (!normalized.includes('/')) return false
  return normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => INTERNAL_LABEL_VALUES.has(part) || isInternalLabel(item, part))
}

function iconLabelStem(item) {
  return String(item?.icon_name || '')
    .split('/')
    .pop()
    .replace(/\.(png|jpg|jpeg|webp)$/i, '')
}

function isInternalLabel(item, value) {
  const normalized = normalizedText(value)
  if (!normalized) return false
  if (/^pressure\d+$/i.test(normalized) || /^freez(?:e|ing)?\d*$/i.test(normalized)) return true
  return normalized === normalizedText(item?.item_name)
    || normalized === normalizedText(item?.contour_name)
    || normalized === normalizedText(iconLabelStem(item))
    || INTERNAL_LABEL_VALUES.has(normalized)
}

function visibleTextLabel(item) {
  const label = normalizeText(item?.label)
  if (label && !isInternalLabel(item, label) && !isMergedInternalTokenLabel(item, label)) return label

  const fallback = normalizeText(item?.text_label)
  return fallback && !isInternalLabel(item, fallback) && !isMergedInternalTokenLabel(item, fallback) ? fallback : ''
}

function formatFreezingLabel(item) {
  const raw = normalizeText(item?.label || item?.text_label)
  const numeric = raw.match(/(?:0\s*℃?\s*:?\s*)?(\d{2,3})\b/i)?.[1]
  if (numeric && !isInternalLabel(item, raw)) return `0C:${numeric}`
  return '0C:100'
}

function sigwxIconScale(item, fileName = iconFileName(item)) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  const iconName = String(fileName || '').toLowerCase()
  if (contour === 'icing_area' || iconName.includes('mod_ice') || itemName.includes('ice')) return 0.36
  if (contour === 'ktg' || iconName.includes('turbulence') || itemName.includes('turb')) return 0.38
  if (contour === 'mountain_obscu' || iconName.includes('mountain_obscuration')) return 0.24
  if (iconName.includes('widespread_fog') || iconName.includes('widespread_mist') || itemName.includes('fog') || itemName.includes('mist')) return 0.25
  if (iconName.includes('rain') || itemName.includes('rain')) return 0.38
  if (iconName.includes('l_wind') || iconName.includes('box_wind') || itemName.includes('wind')) return 0.38
  if (contour === 'freezing_level') return 0.6
  return 0.72
}

function fpvPointToLngLat(x, y, source) {
  const width = Number(source?.fpv_safe_bound_width)
  const height = Number(source?.fpv_safe_bound_height)
  const range = SIGWX_MAP_RANGES[String(source?.map_range_mode || 'normal')] || SIGWX_MAP_RANGES.normal

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0) {
    return null
  }

  const lon = range.minLon + (x / width) * (range.maxLon - range.minLon)
  const lat = range.maxLat - (y / height) * (range.maxLat - range.minLat)
  return [lon, lat]
}

function itemCoordinates(item, source) {
  if (Array.isArray(item?.lat_lngs) && item.lat_lngs.length > 0) {
    return item.lat_lngs
      .filter((point) => Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]))
      .map(([lat, lon]) => [lon, lat])
  }

  return (item?.fpv_points || [])
    .map((point) => fpvPointToLngLat(Number(point?.x), Number(point?.y), source))
    .filter(Boolean)
}

function centerOfCoords(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null
  return [
    coords.reduce((sum, point) => sum + point[0], 0) / coords.length,
    coords.reduce((sum, point) => sum + point[1], 0) / coords.length,
  ]
}

function chaikinPass(points, isClosed) {
  if (!Array.isArray(points) || points.length < 2) return points || []
  const next = []

  if (!isClosed) {
    next.push(points[0])
  }

  const limit = isClosed ? points.length : points.length - 1
  for (let i = 0; i < limit; i += 1) {
    const current = points[i]
    const following = points[(i + 1) % points.length]
    if (!current || !following) continue
    next.push([
      (0.75 * current[0]) + (0.25 * following[0]),
      (0.75 * current[1]) + (0.25 * following[1]),
    ])
    next.push([
      (0.25 * current[0]) + (0.75 * following[0]),
      (0.25 * current[1]) + (0.75 * following[1]),
    ])
  }

  if (!isClosed) {
    next.push(points[points.length - 1])
  } else if (next.length > 0) {
    next.push(next[0])
  }

  return next
}

function smoothSigwxCoords(coords, tension = 0, isClosed = false) {
  if (!Array.isArray(coords) || coords.length < 3 || tension <= 0) {
    return coords || []
  }

  const iterations = Math.max(1, Math.min(3, Math.round(1 + (2 * Math.max(0, Math.min(1, tension))))))
  let current = isClosed ? [...coords, coords[0]] : [...coords]
  for (let i = 0; i < iterations; i += 1) {
    current = chaikinPass(current, isClosed)
  }
  return current
}

function labelPosition(item, source, coords) {
  const rect = item?.rect_label
  if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
    return fpvPointToLngLat(rect.left + rect.width / 2, rect.top + rect.height / 2, source) || centerOfCoords(coords)
  }

  const fpvPoints = Array.isArray(item?.fpv_points) ? item.fpv_points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)) : []
  if (fpvPoints.length === 0) return centerOfCoords(coords)

  const labelPos = Number(item?.label_pos_pt)
  const anchor = Number.isInteger(labelPos) && labelPos >= 0 && labelPos < fpvPoints.length
    ? fpvPoints[labelPos]
    : {
        x: fpvPoints.reduce((sum, point) => sum + point.x, 0) / fpvPoints.length,
        y: fpvPoints.reduce((sum, point) => sum + point.y, 0) / fpvPoints.length,
      }

  return fpvPointToLngLat(
    anchor.x + (Number(item?.label_pos_offset_x) || 0),
    anchor.y + (Number(item?.label_pos_offset_y) || 0),
    source,
  ) || centerOfCoords(coords)
}

function phenomenonName(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  const iconTokens = Array.isArray(item?.icon_tokens) ? item.icon_tokens.map((token) => String(token).toLowerCase()) : []

  if (contour === 'freezing_level') return formatFreezingLabel(item)
  if (contour === 'sfc_vis') return 'SFCVIS'
  if (contour === 'icing_area' || itemName.includes('ice') || iconTokens.some((token) => token.includes('ice'))) return 'ICING'
  if (contour === 'ktg' || itemName.includes('turb') || iconTokens.some((token) => token.includes('turb'))) return 'TURB'
  if (contour === 'cld') return 'CLOUD'
  if (contour === 'pressure') return 'PRESSURE'
  if (contour === 'font_line') return 'FRONT'
  return visibleTextLabel(item).toUpperCase() || normalizeText(item?.contour_name || 'SIGWX').toUpperCase()
}

function intensityLabel(item) {
  const itemName = String(item?.item_name || '').toLowerCase()
  const iconName = String(item?.icon_name || '').toLowerCase()
  const label = normalizeText(item?.label || item?.text_label).toLowerCase()
  if (itemName.includes('severe') || iconName.includes('severe') || label.includes('sev')) return 'SEV'
  if (itemName.includes('moderate') || iconName.includes('moderate') || itemName.includes('mod_') || iconName.includes('mod_') || label.includes('mod')) return 'MOD'
  if (label.includes('isol')) return 'ISOL'
  return ''
}

export function sigwxLabel(item) {
  const base = phenomenonName(item)
  const intensity = intensityLabel(item)
  const contour = String(item?.contour_name || '').toLowerCase()
  const rawLabel = visibleTextLabel(item)

  if (contour === 'freezing_level') {
    return rawLabel || formatFreezingLabel(item)
  }
  if (contour === 'sfc_vis') return rawLabel
  if (intensity && base && !base.startsWith(intensity)) return `${intensity} ${base}`
  return base || rawLabel || 'SIGWX'
}

function sigwxAltitudeParts(item) {
  const rawLabel = normalizeText(item?.label || item?.text_label)
  const parts = rawLabel.split(/\s+/).filter(Boolean)
  if (parts.length !== 2) return null
  return { upper: parts[0], lower: parts[1] }
}

function normalizedLineWidth(item) {
  const width = Number(item?.line_width) || 2
  return Number(Math.max(0.9, Math.min(1.4, width * 0.6)).toFixed(2))
}

function isTurbulenceOrIcing(item) {
  const filterKey = getSigwxFilterKey(item?.contour_name, item)
  return filterKey === 'turbulence' || filterKey === 'icing'
}

function altitudeChipText(item) {
  const parts = sigwxAltitudeParts(item)
  return parts ? `${parts.upper}/${parts.lower}` : ''
}

function needsLabelMarker(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  if (contour === 'freezing_level') return false
  if (contour === 'sfc_wind' && itemName === 'wind_strong') return true
  return [7, 8, 10, 11, 12].includes(Number(item?.item_type))
}

function isArrowItem(item) {
  const type = Number(item?.item_type)
  const contour = String(item?.contour_name || '').toLowerCase()
  const label = normalizeText(item?.label || '').toLowerCase()
  const hasLine = (Array.isArray(item?.lat_lngs) && item.lat_lngs.length >= 2) || (Array.isArray(item?.fpv_points) && item.fpv_points.length >= 2)
  if (!hasLine || contour === 'freezing_level') return false
  if (type === 9) return contour === 'cld' || contour === 'font_line' || contour === 'pressure' || contour === ''
  if (type === 10) return contour === '' || contour === 'pressure' || label.includes('km/h')
  return false
}

function needsPath(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  if (isArrowItem(item)) return false
  if (contour === 'cld' && itemName === 'cloud') return false
  if (contour === 'font_line') return false
  if (contour === 'sfc_wind' && itemName === 'wind_strong') return false
  return ![7, 10, 12].includes(Number(item?.item_type))
}

function iconFileName(item) {
  const candidates = [
    item?.icon_name,
    ...(Array.isArray(item?.icon_tokens) ? item.icon_tokens : []),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const value = String(candidate).trim()
    if (!value) continue
    const upper = value.toUpperCase()
    if (SIGWX_ICON_EXCLUDED_PREFIXES.some((prefix) => upper.startsWith(prefix))) continue
    return /\.(png|jpg|jpeg|webp)$/i.test(value) ? value : `${value}.png`
  }

  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  const label = normalizeText(item?.label || item?.text_label).toLowerCase()
  if (contour === 'freezing_level') {
    if (label.includes('sfc')) return 'freezing_level_sfc.png'
    if (label.includes('050') || label.includes(':50')) return 'freezing_level_050.png'
    return 'freezing_level.png'
  }
  if (contour === 'sfc_wind' || itemName.includes('wind')) return 'box_wind.png'
  return null
}

export function getSigwxFilterKey(contourName, item = null) {
  const contour = String(contourName || item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  if (contour === 'pressure' || contour === 'font_line') return 'pressure'
  if (contour === 'cld') return 'cloud'
  if (contour === 'freezing_level') return 'freezing'
  if (contour === 'sfc_vis') return 'visibility'
  if (contour === 'sfc_wind') return 'wind'
  if (contour === 'icing_area' || itemName.includes('ice')) return 'icing'
  if (contour === 'ktg' || itemName.includes('turb')) return 'turbulence'
  return 'pressure'
}

function overlayRoleForItem(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  if (contour === 'cld') return 'cloud'
  if (contour === 'pressure' || contour === 'font_line') return 'front'
  return null
}

function baseGroupKey(item, index) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const label = normalizeText(item?.label || item?.text_label || item?.item_name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (contour === 'pressure' || contour === 'font_line') return 'pressure-system'
  if (contour === 'cld') return label ? `cloud-${label}` : `cloud-${index}`
  if (contour === 'freezing_level') return label ? `freezing-${label}` : `freezing-${index}`
  if (contour === 'sfc_vis') return label ? `sfc-vis-${label}` : `sfc-vis-${index}`
  if (contour === 'sfc_wind') return label ? `wind-${label}` : `wind-${index}`
  if (getSigwxFilterKey(contour, item) === 'icing') return label ? `icing-${label}` : `icing-${index}`
  if (getSigwxFilterKey(contour, item) === 'turbulence') return label ? `turb-${label}` : `turb-${index}`
  return label ? `${contour || 'sigwx'}-${label}` : `${contour || 'sigwx'}-${index}`
}

function groupLabelForItem(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  if (contour === 'pressure' || contour === 'font_line') return 'Pressure / Front'
  if (contour === 'mountain_obscu') return visibleTextLabel(item) || 'Mountain obscuration'
  if (contour === 'sfc_vis') return visibleTextLabel(item) || 'Visibility'
  return sigwxLabel(item)
}

function lineTypeForMapbox(item) {
  return String(item?.line_type || '')
}

function featureProperties(item, index) {
  const fileName = iconFileName(item)
  const label = sigwxLabel(item)
  const altitudeParts = sigwxAltitudeParts(item)
  const compactPhenomenonLabel = isTurbulenceOrIcing(item) && Boolean(altitudeParts)
  return {
    id: item?.id || `sigwx-low-${index}`,
    label: compactPhenomenonLabel ? '' : label,
    rawLabel: normalizeText(item?.label || item?.text_label || item?.item_name),
    contour: item?.contour_name || '',
    itemName: item?.item_name || '',
    itemType: Number(item?.item_type) || 0,
    colorLine: item?.color_line || '#7c3aed',
    colorBack: item?.color_back || '#a78bfa',
    lineWidth: normalizedLineWidth(item),
    lineType: lineTypeForMapbox(item),
    isFill: Boolean(item?.is_fill || item?.is_close),
    iconKey: fileName ? `sigwx-${fileName}` : '',
    iconUrl: fileName ? sigwxAssetUrl(fileName) : '',
    iconScale: sigwxIconScale(item, fileName),
    filterKey: getSigwxFilterKey(item?.contour_name, item),
    overlayRole: overlayRoleForItem(item),
    chipText: contourChipText(item),
    chipTone: contourChipTone(item),
    chipPlacement: compactPhenomenonLabel ? 'below' : 'center',
    altitudeUpper: altitudeParts?.upper || '',
    altitudeLower: altitudeParts?.lower || '',
  }
}

function contourChipText(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  if (contour === 'freezing_level') return visibleTextLabel(item) || formatFreezingLabel(item)
  if (contour === 'sfc_vis') return visibleTextLabel(item) || ''
  if (isTurbulenceOrIcing(item)) return altitudeChipText(item)
  return ''
}

function contourChipTone(item) {
  const filterKey = getSigwxFilterKey(item?.contour_name, item)
  if (filterKey === 'freezing' || filterKey === 'visibility' || filterKey === 'icing' || filterKey === 'turbulence') return 'chart'
  return 'neutral'
}

function shouldRenderTextChip(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  if (contour === 'freezing_level') return true
  if (isTurbulenceOrIcing(item) && altitudeChipText(item)) return true
  if (needsLabelMarker(item) && iconFileName(item)) return false
  return contour === 'freezing_level'
    || contour === 'sfc_vis'
    || getSigwxFilterKey(contour, item) === 'turbulence'
    || getSigwxFilterKey(contour, item) === 'icing'
}

function shouldRenderArrowLabel(item) {
  if (!isArrowItem(item)) return false
  const contour = String(item?.contour_name || '').toLowerCase()
  const label = normalizeText(item?.label || item?.text_label)
  return contour === 'pressure' || /km\/h/i.test(label)
}

function shouldRenderGenericLabel(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  if (shouldRenderTextChip(item) || shouldRenderArrowLabel(item)) return false
  if (!visibleTextLabel(item) && isInternalLabel(item, item?.text_label || item?.item_name)) return false
  if (contour === 'font_line' || contour === 'pressure') return normalizeText(item?.label || item?.text_label).length > 0
  return true
}

function registerGroup(groups, enriched) {
  const existing = groups.get(enriched.groupKey)
  if (existing) {
    existing.memberCount += 1
    existing.overlayRole = existing.overlayRole || enriched.overlayRole
    existing.lineColor = existing.lineColor || enriched.properties.colorLine
    return existing
  }

  const group = {
    mapKey: enriched.groupKey,
    label: enriched.groupLabel,
    contour: enriched.contour,
    filterKey: enriched.filterKey,
    overlayRole: enriched.overlayRole,
    memberCount: 1,
    lineColor: enriched.properties.colorLine,
  }
  groups.set(group.mapKey, group)
  return group
}

function buildPathGeometry(coords, closed, tension = 0) {
  const smoothedCoords = smoothSigwxCoords(coords, tension, closed)
  const pathCoords = closed && smoothedCoords.length >= 3 && (smoothedCoords[0][0] !== smoothedCoords[smoothedCoords.length - 1][0] || smoothedCoords[0][1] !== smoothedCoords[smoothedCoords.length - 1][1])
    ? [...smoothedCoords, smoothedCoords[0]]
    : smoothedCoords

  if (closed && pathCoords.length >= 4) {
    return { type: 'Polygon', coordinates: [pathCoords] }
  }
  if (pathCoords.length >= 2) {
    return { type: 'LineString', coordinates: pathCoords }
  }
  return null
}

export function sigwxLowToMapboxData(payload, options = {}) {
  const source = payload?.source || payload
  const items = Array.isArray(payload?.items) ? payload.items : []
  const hiddenGroupKeys = new Set(options.hiddenGroupKeys || [])
  const filters = options.filters || {}
  const iconImages = new Map()
  const groups = new Map()

  const enrichedItems = items.map((item, index) => {
    const coords = itemCoordinates(item, source)
    const properties = featureProperties(item, index)
    const contour = String(item?.contour_name || '').toLowerCase()
    const groupKey = baseGroupKey(item, index)
    const groupLabel = groupLabelForItem(item)
    const filterKey = properties.filterKey
    const overlayRole = properties.overlayRole
    const labelPoint = labelPosition(item, source, coords)
    const closed = Boolean(item?.is_close || item?.is_fill)

    const enriched = {
      item,
      index,
      coords,
      contour,
      closed,
      labelPoint,
      filterKey,
      overlayRole,
      groupKey,
      groupLabel,
      properties: {
        ...properties,
        groupKey,
        groupLabel,
      },
    }

    registerGroup(groups, enriched)
    return enriched
  })

  const groupList = [...groups.values()].map((group) => ({
    ...group,
    hidden: hiddenGroupKeys.has(group.mapKey),
    enabledByFilter: filters[group.filterKey] !== false,
  }))

  const visibleGroupKeys = new Set(
    groupList
      .filter((group) => !group.hidden && group.enabledByFilter)
      .map((group) => group.mapKey),
  )

  const polygonFeatures = []
  const lineFeatures = []
  const labelFeatures = []
  const iconFeatures = []
  const arrowLabelFeatures = []
  const textChipFeatures = []

  enrichedItems.forEach((entry) => {
    if (entry.coords.length === 0) return
    if (!visibleGroupKeys.has(entry.groupKey)) return

    const { item, coords, closed, labelPoint, properties } = entry
    const geometry = buildPathGeometry(coords, closed, Number(item?.curve_tension) || 0)

    if (needsPath(item) && geometry) {
      const feature = {
        type: 'Feature',
        id: properties.id,
        properties,
        geometry,
      }
      if (geometry.type === 'Polygon') polygonFeatures.push(feature)
      else lineFeatures.push(feature)
    }

    if (labelPoint && shouldRenderGenericLabel(item)) {
      labelFeatures.push({
        type: 'Feature',
        id: `${properties.id}-label`,
        properties,
        geometry: { type: 'Point', coordinates: labelPoint },
      })
    }

    if (labelPoint && shouldRenderArrowLabel(item)) {
      arrowLabelFeatures.push({
        type: 'Feature',
        id: `${properties.id}-arrow-label`,
        properties: {
          ...properties,
          label: normalizeText(item?.label || item?.text_label || properties.label),
        },
        geometry: { type: 'Point', coordinates: labelPoint },
      })
    }

    if (labelPoint && shouldRenderTextChip(item)) {
      textChipFeatures.push({
        type: 'Feature',
        id: `${properties.id}-chip`,
        properties,
        geometry: { type: 'Point', coordinates: labelPoint },
      })
    }

    if (needsLabelMarker(item) && labelPoint && properties.iconKey && properties.iconUrl) {
      iconFeatures.push({
        type: 'Feature',
        id: `${properties.id}-icon`,
        properties,
        geometry: { type: 'Point', coordinates: labelPoint },
      })
      iconImages.set(properties.iconKey, properties.iconUrl)
    }
  })

  const base = {
    polygons: { type: 'FeatureCollection', features: polygonFeatures },
    lines: { type: 'FeatureCollection', features: lineFeatures },
    labels: { type: 'FeatureCollection', features: labelFeatures },
    icons: { type: 'FeatureCollection', features: iconFeatures },
    arrowLabels: { type: 'FeatureCollection', features: arrowLabelFeatures },
    textChips: { type: 'FeatureCollection', features: textChipFeatures },
    iconImages: [...iconImages.entries()].map(([id, url]) => ({ id, url })),
    groups: groupList,
  }

  if (!Array.isArray(payload?.phenomena)) return base

  const additions = phenomenaToSigwxRenderFeatures(payload, options)
  const imageIds = new Set(base.iconImages.map((image) => image.id))
  return {
    ...base,
    windDiamonds: additions.windDiamonds,
    specialLines: additions.specialLines,
    specialLineSymbols: additions.specialLineSymbols,
    specialLineLabels: additions.specialLineLabels,
    iconImages: [
      ...base.iconImages,
      ...additions.iconImages.filter((image) => {
        if (imageIds.has(image.id)) return false
        imageIds.add(image.id)
        return true
      }),
    ],
  }
}
