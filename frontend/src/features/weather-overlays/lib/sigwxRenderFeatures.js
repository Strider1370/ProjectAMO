function emptyCollection() {
  return { type: 'FeatureCollection', features: [] }
}

function coordsFromLatLngs(item) {
  return (item?.lat_lngs || [])
    .filter((point) => Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]))
    .map(([lat, lon]) => [lon, lat])
}

function pointFromItem(item) {
  const coords = coordsFromLatLngs(item)
  if (!coords.length) return null
  return [
    coords.reduce((sum, point) => sum + point[0], 0) / coords.length,
    coords.reduce((sum, point) => sum + point[1], 0) / coords.length,
  ]
}

function pathGeometry(item) {
  const coords = coordsFromLatLngs(item)
  if (coords.length < 2) return null
  if (item?.is_close && coords.length >= 3) {
    const closed = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords
      : [...coords, coords[0]]
    return { type: 'Polygon', coordinates: [closed] }
  }
  return { type: 'LineString', coordinates: coords }
}

function propertiesFor(phenomenon, item) {
  const iconFile = iconFileName(item)
  return {
    id: item?.id || phenomenon.id,
    groupKey: phenomenon.id,
    groupLabel: phenomenon.visibleLabel || phenomenon.semanticRole,
    semanticRole: phenomenon.semanticRole,
    renderRole: phenomenon.renderRole,
    filterKey: phenomenon.filterKey || 'pressure',
    label: phenomenon.visibleLabel || '',
    iconKey: iconFile ? `sigwx-${iconFile}` : '',
    iconUrl: iconFile ? sigwxAssetUrl(iconFile) : '',
    iconScale: sigwxIconScale(item, iconFile),
    colorLine: item?.color_line || '#2563eb',
    colorBack: item?.color_back || '#93c5fd',
    lineWidth: normalizedLineWidth(item),
  }
}

function sigwxAssetUrl(fileName) {
  return `/Symbols/Reference%20Symbols/icon_sigwx/${String(fileName).split('/').map(encodeURIComponent).join('/')}`
}

function iconFileName(item) {
  const iconName = String(item?.icon_name || '').trim()
  if (!iconName) return ''
  return /\.(png|jpg|jpeg|webp)$/i.test(iconName) ? iconName : `${iconName}.png`
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
  return 0.72
}

function normalizedLineWidth(item) {
  const width = Number(item?.line_width) || 2
  return Number(Math.max(0.9, Math.min(1.4, width * 0.6)).toFixed(2))
}

function pushPathFeature(target, phenomenon) {
  const item = phenomenon.sourceItem
  const geometry = pathGeometry(item)
  if (!geometry) return
  const feature = {
    type: 'Feature',
    id: item?.id || phenomenon.id,
    properties: propertiesFor(phenomenon, item),
    geometry,
  }
  if (geometry.type === 'Polygon') target.polygons.features.push(feature)
  else target.lines.features.push(feature)
}

function pushWindDiamonds(target, phenomenon) {
  for (const child of phenomenon.children || []) {
    if (child.renderRole !== 'wind-diamond-label') continue
    const point = pointFromItem(child.sourceItem)
    if (!point) continue
    target.windDiamonds.features.push({
      type: 'Feature',
      id: child.id,
      properties: {
        id: child.id,
        groupKey: phenomenon.id,
        groupLabel: phenomenon.visibleLabel || phenomenon.semanticRole,
        semanticRole: child.semanticRole,
        renderRole: child.renderRole,
        filterKey: child.filterKey || phenomenon.filterKey || 'wind',
        label: child.visibleLabel || '',
        iconScale: 0.46,
        textSize: 8,
      },
      geometry: { type: 'Point', coordinates: point },
    })
  }
  if (target.windDiamonds.features.length > 0 && !target.iconImages.some((image) => image.id === 'sigwx-box-wind')) {
    target.iconImages.push({ id: 'sigwx-box-wind', url: '/Symbols/Reference%20Symbols/icon_sigwx/box_wind.png' })
  }
}

function pushCloudLabel(target, phenomenon) {
  const lines = phenomenon.render?.labelLines || []
  if (phenomenon.renderRole !== 'cloud-scallop-boundary' || lines.length === 0) return
  const sourceItemId = phenomenon.sourceItem?.id
  if (sourceItemId && target.specialLineLabels.features.some((feature) => feature.properties?.sourceItemId === sourceItemId)) return
  const point = pointFromItem(phenomenon.sourceItem)
  if (!point) return
  target.specialLineLabels.features.push({
    type: 'Feature',
    id: `${phenomenon.id}-label`,
    properties: {
      id: `${phenomenon.id}-label`,
      groupKey: phenomenon.id,
      semanticRole: phenomenon.semanticRole,
      renderRole: 'cloud-label',
      filterKey: phenomenon.filterKey || 'cloud',
      label: lines.join('\n'),
      labelLines: lines,
    },
    geometry: { type: 'Point', coordinates: point },
  })
}

function pushIconFeature(target, phenomenon) {
  if (phenomenon.renderRole !== 'icon-marker' && phenomenon.renderRole !== 'pressure-center-icon') return
  const point = pointFromItem(phenomenon.sourceItem)
  if (!point) return

  const properties = propertiesFor(phenomenon, phenomenon.sourceItem)
  if (!properties.iconKey || !properties.iconUrl) return

  target.icons.features.push({
    type: 'Feature',
    id: `${properties.id}-icon`,
    properties,
    geometry: { type: 'Point', coordinates: point },
  })
  if (!target.iconImages.some((image) => image.id === properties.iconKey)) {
    target.iconImages.push({ id: properties.iconKey, url: properties.iconUrl })
  }

  if (properties.label) {
    target.labels.features.push({
      type: 'Feature',
      id: `${properties.id}-label`,
      properties,
      geometry: { type: 'Point', coordinates: point },
    })
  }
}

export function phenomenaToSigwxRenderFeatures(payload, options = {}) {
  const hiddenGroupKeys = new Set(options.hiddenGroupKeys || [])
  const filters = options.filters || {}
  const result = {
    polygons: emptyCollection(),
    lines: emptyCollection(),
    labels: emptyCollection(),
    icons: emptyCollection(),
    arrowLabels: emptyCollection(),
    textChips: emptyCollection(),
    windDiamonds: emptyCollection(),
    specialLines: payload?.specialLineFeatures?.lines || emptyCollection(),
    specialLineSymbols: payload?.specialLineFeatures?.symbols || emptyCollection(),
    specialLineLabels: payload?.specialLineFeatures?.labels || emptyCollection(),
    iconImages: [],
    groups: [],
  }

  for (const phenomenon of payload?.phenomena || []) {
    const filterKey = phenomenon.filterKey || 'pressure'
    const hidden = hiddenGroupKeys.has(phenomenon.id)
    const enabledByFilter = filters[filterKey] !== false
    result.groups.push({
      mapKey: phenomenon.id,
      label: phenomenon.visibleLabel || phenomenon.semanticRole,
      filterKey,
      memberCount: phenomenon.items?.length || 1,
      hidden,
      enabledByFilter,
    })
    if (hidden || !enabledByFilter) continue
    pushPathFeature(result, phenomenon)
    pushWindDiamonds(result, phenomenon)
    pushCloudLabel(result, phenomenon)
    pushIconFeature(result, phenomenon)
  }

  return result
}
