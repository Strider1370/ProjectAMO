const INTERNAL_LABEL_VALUES = new Set([
  'freez',
  'mountain_obscuration',
  'pressure15',
  'rain',
  'widespread_fog',
  'widespread_mist',
  'wind_strong',
])

function cleanLabel(value) {
  return String(value || '')
    .replace(/&#10;/g, '\n')
    .replace(/\r/g, '')
    .trim()
}

function labelLines(value) {
  return cleanLabel(value)
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalized(value) {
  return String(value || '').trim().toLowerCase()
}

function isInternalName(item, value) {
  const label = normalized(value)
  if (!label) return false
  if (/^pressure\d+$/i.test(label) || /^freez(?:e|ing)?\d*$/i.test(label)) return true
  return label === normalized(item?.item_name)
    || label === normalized(item?.contour_name)
    || label === normalized(String(item?.icon_name || '').replace(/\.(png|jpg|jpeg|webp)$/i, ''))
    || INTERNAL_LABEL_VALUES.has(label)
}

function isMergedInternalTokenLabel(item, value) {
  const label = normalized(value)
  if (!label.includes('/')) return false
  return label
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => isInternalName(item, part))
}

function formatFreezingLabel(item) {
  const raw = cleanLabel(item?.label || item?.text_label)
  const numeric = raw.match(/(?:0\s*℃?\s*:?\s*)?(\d{2,3})\b/i)?.[1]
  if (numeric && !isInternalName(item, raw)) return `0C:${numeric}`
  return '0C:100'
}

function visibleLabelForItem(item) {
  if (normalized(item?.contour_name) === 'freezing_level') return formatFreezingLabel(item)

  const raw = cleanLabel(item?.label)
  if (raw && !isInternalName(item, raw) && !isMergedInternalTokenLabel(item, raw)) return raw

  const fallback = cleanLabel(item?.text_label)
  return fallback && !isInternalName(item, fallback) && !isMergedInternalTokenLabel(item, fallback) ? fallback : ''
}

function baseSemanticRole(item) {
  const contour = normalized(item?.contour_name)
  const itemName = normalized(item?.item_name)
  if (contour === 'freezing_level') return 'freezing-level'
  if (contour === 'sfc_wind' && itemName === 'l_wind') return 'strong-surface-wind-area'
  if (contour === 'sfc_wind' && itemName === 'wind_strong') return 'strong-surface-wind-speed'
  if (contour === 'cld' && itemName === 'cloud') return 'cb-cloud-area'
  if (contour === 'font_line') return 'front'
  if (contour === 'pressure') return 'pressure'
  if (contour === 'sfc_vis') return 'surface-visibility'
  if (contour === 'mountain_obscu') return 'mountain-obscuration'
  if (contour === 'ktg') return 'turbulence'
  if (contour === 'icing_area') return 'icing'
  return contour || 'sigwx-low'
}

function baseRenderRole(item) {
  const contour = normalized(item?.contour_name)
  const itemName = normalized(item?.item_name)
  const itemType = Number(item?.item_type)
  if (contour === 'freezing_level' && String(item?.line_type || '') === '3') return 'dashed-freezing-line'
  if (contour === 'sfc_wind' && itemName === 'l_wind') return 'blue-wind-area-boundary'
  if (contour === 'sfc_wind' && itemName === 'wind_strong' && normalized(item?.shape_type) === 'diamond') return 'wind-diamond-label'
  if (contour === 'cld' && itemName === 'cloud' && String(item?.line_type || '') === '5') return 'cloud-scallop-boundary'
  if (contour === 'font_line') return 'front-overlay-source'
  if (contour === 'pressure' && itemType === 7) return 'pressure-center-icon'
  if (itemType === 7) return 'icon-marker'
  if (itemType === 8) return 'text-label'
  if (item?.is_close) return 'area-boundary'
  return 'line-boundary'
}

function filterKeyForRole(semanticRole) {
  if (semanticRole.includes('wind')) return 'wind'
  if (semanticRole.includes('cloud')) return 'cloud'
  if (semanticRole.includes('freezing')) return 'freezing'
  if (semanticRole.includes('visibility') || semanticRole.includes('obscuration')) return 'visibility'
  if (semanticRole.includes('turbulence')) return 'turbulence'
  if (semanticRole.includes('icing')) return 'icing'
  return 'pressure'
}

export function classifySigwxLowItem(item) {
  const semanticRole = baseSemanticRole(item)
  const renderRole = baseRenderRole(item)
  const visibleLabel = visibleLabelForItem(item)
  return {
    semanticRole,
    renderRole,
    visibleLabel,
    labelLines: labelLines(visibleLabel),
    filterKey: filterKeyForRole(semanticRole),
    sourceItem: item,
  }
}
