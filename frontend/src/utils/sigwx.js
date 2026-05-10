const SIGWX_MAP_RANGES = {
  normal: { minLat: 27.5, maxLat: 39, minLon: 121, maxLon: 135 },
  wide: { minLat: 27.3, maxLat: 44, minLon: 119, maxLon: 135 },
}

const SIGWX_SYMBOL_BASE = '/Symbols/Reference%20Symbols/icon_sigwx'

function normalizeText(value) {
  return String(value || '').replace(/&#10;/g, ' ').replace(/\s+/g, ' ').trim()
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
  const itemName = String(item?.item_name || item?.text_label || '').toLowerCase()
  const iconTokens = Array.isArray(item?.icon_tokens) ? item.icon_tokens.map((token) => String(token).toLowerCase()) : []

  if (contour === 'freezing_level') return 'FZ LEVEL'
  if (contour === 'sfc_vis') return 'SFC VIS'
  if (contour === 'icing_area' || itemName.includes('ice') || iconTokens.some((token) => token.includes('ice'))) return 'ICING'
  if (contour === 'ktg' || itemName.includes('turb') || iconTokens.some((token) => token.includes('turb'))) return 'TURB'
  if (contour === 'cld') return 'CLOUD'
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

function sigwxLabel(item) {
  const base = phenomenonName(item)
  const intensity = intensityLabel(item)
  if (String(item?.contour_name || '').toLowerCase() === 'freezing_level') {
    return normalizeText(item?.label || item?.text_label || base)
  }
  if (intensity && base && !base.startsWith(intensity)) return `${intensity} ${base}`
  return base || normalizeText(item?.label || item?.text_label || item?.icon_name || 'SIGWX')
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
  const label = String(item?.label || '').trim().toLowerCase()
  const hasLine = Array.isArray(item?.lat_lngs) && item.lat_lngs.length >= 2
  if (!hasLine || contour === 'freezing_level') return false
  if (type === 9) return contour === 'cld' || contour === 'font_line' || contour === 'pressure' || contour === ''
  if (type === 10) return contour === '' || label.includes('km/h')
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
    return /\.(png|jpg|jpeg|webp)$/i.test(value) ? value : `${value}.png`
  }

  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  const label = String(item?.label || item?.text_label || '').toLowerCase()
  if (contour === 'freezing_level') {
    if (label.includes('sfc')) return 'freezing_level_sfc.png'
    if (label.includes('050') || label.includes(':50')) return 'freezing_level_050.png'
    return 'freezing_level.png'
  }
  if (contour === 'sfc_wind' || itemName.includes('wind')) return 'box_wind.png'
  return null
}

function encodedSymbolUrl(fileName) {
  return `${SIGWX_SYMBOL_BASE}/${String(fileName).split('/').map(encodeURIComponent).join('/')}`
}

function featureProperties(item, index) {
  const fileName = iconFileName(item)
  return {
    id: item?.id || `sigwx-low-${index}`,
    label: sigwxLabel(item),
    contour: item?.contour_name || '',
    itemName: item?.item_name || '',
    itemType: Number(item?.item_type) || 0,
    colorLine: item?.color_line || '#7c3aed',
    colorBack: item?.color_back || '#a78bfa',
    lineWidth: Number(item?.line_width) || 2,
    isFill: Boolean(item?.is_fill || item?.is_close),
    iconKey: fileName ? `sigwx-${fileName}` : '',
    iconUrl: fileName ? encodedSymbolUrl(fileName) : '',
  }
}

export function sigwxLowToMapboxData(payload) {
  const source = payload?.source || payload
  const items = Array.isArray(payload?.items) ? payload.items : []
  const polygonFeatures = []
  const lineFeatures = []
  const labelFeatures = []
  const iconFeatures = []
  const iconImages = new Map()

  items.forEach((item, index) => {
    const coords = itemCoordinates(item, source)
    if (coords.length === 0) return

    const properties = featureProperties(item, index)
    const labelPoint = labelPosition(item, source, coords)
    const closed = Boolean(item?.is_close || item?.is_fill)
    const pathCoords = closed && coords.length >= 3 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])
      ? [...coords, coords[0]]
      : coords

    if (needsPath(item) && pathCoords.length >= 2) {
      const pathFeature = {
        type: 'Feature',
        id: properties.id,
        properties,
        geometry: closed && pathCoords.length >= 4
          ? { type: 'Polygon', coordinates: [pathCoords] }
          : { type: 'LineString', coordinates: pathCoords },
      }
      if (pathFeature.geometry.type === 'Polygon') polygonFeatures.push(pathFeature)
      else lineFeatures.push(pathFeature)
    }

    if (labelPoint) {
      labelFeatures.push({
        type: 'Feature',
        id: `${properties.id}-label`,
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

  return {
    polygons: { type: 'FeatureCollection', features: polygonFeatures },
    lines: { type: 'FeatureCollection', features: lineFeatures },
    labels: { type: 'FeatureCollection', features: labelFeatures },
    icons: { type: 'FeatureCollection', features: iconFeatures },
    iconImages: [...iconImages.entries()].map(([id, url]) => ({ id, url })),
  }
}
