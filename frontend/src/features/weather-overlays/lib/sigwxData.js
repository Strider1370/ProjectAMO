const SIGWX_MAP_RANGES = {
  normal: { minLat: 27.5, maxLat: 39, minLon: 121, maxLon: 135 },
  wide: { minLat: 27.3, maxLat: 44, minLon: 119, maxLon: 135 },
}

const SIGWX_SYMBOL_BASE = '/Symbols/Reference%20Symbols/icon_sigwx'
const SIGWX_ICON_EXCLUDED_PREFIXES = ['L_', 'BOX_']

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

function chartMarker(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const name = String(item?.item_name || '').toLowerCase()
  const kind = contour === 'sfc_wind' && name === 'wind_strong' ? 'wind'
    : contour === 'cld' && name === 'cloud' && Number(item?.item_type) === 4 ? 'cloud-label'
    : Number(item?.item_type) === 7 && ['moderate_turbulence', 'severe_turbulence'].includes(name)
      ? `turbulence-${name.startsWith('severe') ? 'severe' : 'moderate'}` : null
  if (!kind) return null
  const text = kind === 'wind' ? normalizeText(item?.label)
    : String(item?.label || '').replace(/&#(?:10|x0*a);/gi, '\n').replace(/\r\n?/g, '\n')
      .split('\n').map(line => line.trim()).filter(Boolean).join('\n')
  return text || kind.startsWith('turbulence-') ? { id: `sigwx-${kind}-${encodeURIComponent(text)}`, kind, text } : null
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
  }

  return next
}

function smoothSigwxCoords(coords, tension = 0, isClosed = false) {
  if (!Array.isArray(coords) || coords.length < 3 || tension <= 0) {
    return coords || []
  }

  const iterations = Math.max(1, Math.min(3, Math.round(1 + (2 * Math.max(0, Math.min(1, tension))))))
  let current = [...coords]
  if (isClosed && current[0][0] === current.at(-1)[0] && current[0][1] === current.at(-1)[1]) current.pop()
  for (let i = 0; i < iterations; i += 1) {
    current = chaikinPass(current, isClosed)
  }
  return current
}

function labelPosition(item, source, coords) {
  // The coupled turbulence graphic is centered on the symbol, not its text box.
  if (chartMarker(item)?.kind.startsWith('turbulence-')) {
    const point = item?.fpv_points?.[0]
    return fpvPointToLngLat(point?.x, point?.y, source) || coords[0] || null
  }
  const rect = item?.rect_label
  if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
    return fpvPointToLngLat(rect.left + rect.width / 2, rect.top + rect.height / 2, source) || centerOfCoords(coords)
  }

  const fpvPoints = Array.isArray(item?.fpv_points) ? item.fpv_points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)) : []
  const pointSymbol = [7, 8].includes(Number(item?.item_type))
  if (fpvPoints.length === 0) return pointSymbol ? coords[0] || null : centerOfCoords(coords)

  const labelPos = Number(item?.label_pos_pt)
  const anchor = Number.isInteger(labelPos) && labelPos >= 0 && labelPos < fpvPoints.length
    ? fpvPoints[labelPos]
    : pointSymbol ? fpvPoints[0] : {
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
  const itemName = String(item?.item_name || item?.text_label || '').toLowerCase()
  const iconTokens = Array.isArray(item?.icon_tokens) ? item.icon_tokens.map((token) => String(token).toLowerCase()) : []

  if (contour === 'freezing_level') return '0℃'
  if (contour === 'sfc_vis') return 'SFCVIS'
  if (contour === 'icing_area' || itemName.includes('ice') || iconTokens.some((token) => token.includes('ice'))) return 'ICING'
  if (contour === 'ktg' || itemName.includes('turb') || iconTokens.some((token) => token.includes('turb'))) return 'TURB'
  if (contour === 'cld') return 'CLOUD'
  if (contour === 'pressure') return 'PRESSURE'
  if (contour === 'font_line') return 'FRONT'
  return normalizeText(item?.text_label || item?.item_name || item?.contour_name || 'SIGWX').toUpperCase()
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
  const rawLabel = normalizeText(item?.label || item?.text_label || item?.item_name)

  if (contour === 'freezing_level') {
    return rawLabel || '0℃'
  }
  if (contour === 'sfc_vis') return rawLabel || 'SFCVIS'
  if (intensity && base && !base.startsWith(intensity)) return `${intensity} ${base}`
  return base || rawLabel || 'SIGWX'
}

function sigwxAltitudeParts(item) {
  const rawLabel = normalizeText(item?.label || item?.text_label)
  const parts = rawLabel.split(/\s+/).filter(Boolean)
  if (parts.length !== 2) return null
  return { upper: parts[0], lower: parts[1] }
}

function needsLabelMarker(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  if (contour === 'freezing_level') return Number(item?.item_type) === 10
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
  if (String(item?.item_name || '').toLowerCase() === 'wind_strong') return null
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
  return sigwxLabel(item)
}

function lineTypeForMapbox(item) {
  return String(item?.line_type || '')
}

function featureProperties(item, index) {
  const fileName = iconFileName(item)
  const marker = chartMarker(item)
  const label = sigwxLabel(item)
  const altitudeParts = sigwxAltitudeParts(item)
  return {
    id: item?.id || `sigwx-low-${index}`,
    label,
    rawLabel: normalizeText(item?.label || item?.text_label || item?.item_name),
    contour: item?.contour_name || '',
    itemName: item?.item_name || '',
    itemType: Number(item?.item_type) || 0,
    colorLine: item?.color_line || '#7c3aed',
    colorBack: item?.color_back || '#a78bfa',
    lineWidth: Number(item?.line_width) || 2,
    lineType: lineTypeForMapbox(item),
    isFill: Boolean(item?.is_fill),
    iconKey: marker?.id || (fileName ? `sigwx-${fileName}` : ''),
    iconUrl: fileName ? sigwxAssetUrl(fileName) : '',
    markerKind: marker?.kind || '',
    markerText: marker?.text || '',
    iconScale: marker ? 1 : String(item?.contour_name || '').toLowerCase() === 'freezing_level' ? 0.6
      : ['rain', 'rain_kor', 'shower_rain'].includes(String(item?.item_name || '').toLowerCase()) ? 0.3 : 0.52,
    filterKey: getSigwxFilterKey(item?.contour_name, item),
    overlayRole: overlayRoleForItem(item),
    chipText: contourChipText(item),
    chipTone: contourChipTone(item),
    altitudeUpper: altitudeParts?.upper || '',
    altitudeLower: altitudeParts?.lower || '',
  }
}

function contourChipText(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  const label = normalizeText(item?.label || item?.text_label || '')
  if (contour === 'freezing_level') return label || '0℃'
  if (contour === 'sfc_vis') return label || 'SFCVIS'
  if (getSigwxFilterKey(contour, item) === 'turbulence') return sigwxLabel(item)
  if (getSigwxFilterKey(contour, item) === 'icing') return sigwxLabel(item)
  return ''
}

function contourChipTone(item) {
  const filterKey = getSigwxFilterKey(item?.contour_name, item)
  if (filterKey === 'freezing') return 'neutral'
  if (filterKey === 'visibility') return 'green'
  if (filterKey === 'icing') return 'blue'
  if (filterKey === 'turbulence') return 'orange'
  return 'neutral'
}

function shouldRenderTextChip(item) {
  const contour = String(item?.contour_name || '').toLowerCase()
  if (getSigwxFilterKey(contour, item) === 'turbulence') return false
  if (contour === 'sfc_vis' && !normalizeText(item?.label)) return false
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
  if (chartMarker(item)) return false
  if (getSigwxFilterKey(contour, item) === 'turbulence' && !normalizeText(item?.label)) return false
  // item_name/text_label fallbacks name the object, not text authored on the chart.
  if (['sfc_wind', 'sfc_vis', 'cld'].includes(contour) && !normalizeText(item?.label)) return false
  if (shouldRenderTextChip(item) || shouldRenderArrowLabel(item)) return false
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

function coupleVisibilitySymbolRows(entries) {
  // The feed has no set ID. Only couple this recognizable three-symbol row
  // immediately following a labelled visibility area, using chart coordinates
  // (never current map zoom or screen-space proximity).
  const names = ['rain', 'widespread_fog', 'widespread_mist']
  entries.forEach((area, index) => {
    const rect = area.item.rect_label
    if (area.contour !== 'sfc_vis' || !area.closed || !normalizeText(area.item.label)
      || !rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return
    const row = entries.slice(index + 1, index + 4)
    if (row.length !== 3 || !row.every((entry, i) => entry.contour === 'sfc_vis'
      && Number(entry.item.item_type) === 7 && String(entry.item.item_name).toLowerCase() === names[i]
      && !normalizeText(entry.item.label) && entry.labelPoint && !entry.symbolSetHidden)) return
    const points = row.map(entry => entry.item.fpv_points?.[0])
    const end = row[1].item.fpv_points?.[1]
    if (!points.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)) || !Number.isFinite(end?.x)) return
    const size = Math.abs(end.x - points[1].x)
    if (!(size > 0) || points.some(p => Math.abs(p.y - points[1].y) > size * 0.5)
      || points.slice(1).some((p, i) => p.x <= points[i].x || p.x - points[i].x > size * 3)
      || Math.abs(points[1].x - (rect.left + rect.width / 2)) > size * 2
      || points[1].y < rect.top + rect.height || points[1].y - (rect.top + rect.height) > size * 3) return
    row.forEach((entry, i) => {
      entry.groupKey = area.groupKey
      entry.groupLabel = area.groupLabel
      entry.properties = { ...entry.properties, groupKey: area.groupKey, groupLabel: area.groupLabel }
      entry.symbolSetHidden = i !== 1
    })
    // The middle symbol's original geographic anchor stays unchanged.
    row[1].properties = {
      ...row[1].properties,
      iconKey: 'sigwx-visibility-rain-fog-mist-v1', iconUrl: '', iconScale: 1,
      markerKind: 'visibility-set', markerText: '', symbolMembers: row.map(entry => entry.properties.id),
    }
  })
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

    return enriched
  })

  coupleVisibilitySymbolRows(enrichedItems)
  enrichedItems.forEach(entry => registerGroup(groups, entry))

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
    if (entry.symbolSetHidden) return
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

    if ((needsLabelMarker(item) || properties.markerKind) && labelPoint && properties.iconKey && (properties.iconUrl || properties.markerKind)) {
      iconFeatures.push({
        type: 'Feature',
        id: `${properties.id}-icon`,
        properties,
        geometry: { type: 'Point', coordinates: labelPoint },
      })
      iconImages.set(properties.iconKey, properties.markerKind
        ? { id: properties.iconKey, kind: properties.markerKind, text: properties.markerText }
        : { id: properties.iconKey, url: properties.iconUrl })
    }
  })

  return {
    polygons: { type: 'FeatureCollection', features: polygonFeatures },
    lines: { type: 'FeatureCollection', features: lineFeatures },
    labels: { type: 'FeatureCollection', features: labelFeatures },
    icons: { type: 'FeatureCollection', features: iconFeatures },
    arrowLabels: { type: 'FeatureCollection', features: arrowLabelFeatures },
    textChips: { type: 'FeatureCollection', features: textChipFeatures },
    iconImages: [...iconImages.values()],
    groups: groupList,
  }
}
