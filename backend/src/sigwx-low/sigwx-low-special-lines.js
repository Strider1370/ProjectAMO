import {
  fpvPointToLngLat,
  offsetSamplesFromPolygon,
  samplePolylineByDistance,
} from './sigwx-low-chart-geometry.js'

const FRONT_SYMBOLS = {
  fl_cold: { symbolType: 'cold-front-triangle', color: '#2563eb', offset: 56, repeat: 132 },
  fl_worm: { symbolType: 'warm-front-semicircle', color: '#dc2626', offset: 56, repeat: 132 },
  fl_occl: { symbolType: 'occluded-front-alternating', color: '#7c3aed', offset: 56, repeat: 132 },
  fl_stat: { symbolType: 'stationary-front-alternating', color: '#2563eb', offset: 56, repeat: 132 },
}

function labelLines(value) {
  return String(value || '')
    .split(/&#10;|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function fpvCoords(item) {
  return (item.fpv_points || [])
    .filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
}

function lngLatLine(points, source) {
  return points.map((point) => fpvPointToLngLat(point, source)).filter(Boolean)
}

function isCloudLine(item) {
  return String(item?.contour_name || '').toLowerCase() === 'cld'
    && String(item?.item_name || '').toLowerCase() === 'cloud'
    && String(item?.line_type || '') === '5'
}

function frontConfig(item) {
  if (String(item?.contour_name || '').toLowerCase() !== 'font_line') return null
  return FRONT_SYMBOLS[String(item?.item_name || '').toLowerCase()] || null
}

export function buildSigwxSpecialLineFeatures(payload) {
  const source = payload?.source || {}
  const lines = []
  const symbols = []
  const labels = []

  for (const item of payload?.items || []) {
    const points = fpvCoords(item)
    if (points.length < 2) continue

    const config = frontConfig(item)
    if (config) {
      const coordinates = lngLatLine(points, source)
      if (coordinates.length >= 2) {
        lines.push({
          type: 'Feature',
          properties: {
            id: item.id,
            sourceItemId: item.id,
            renderRole: 'front-special-line',
            colorLine: item.color_line || config.color,
            lineWidth: 1.2,
          },
          geometry: { type: 'LineString', coordinates },
        })
      }
      samplePolylineByDistance(points, config).forEach((sample, index) => {
        const coordinates = fpvPointToLngLat(sample, source)
        if (!coordinates) return
        const isAlternating = config.symbolType === 'occluded-front-alternating' || config.symbolType === 'stationary-front-alternating'
        const symbolType = isAlternating
          ? (index % 2 === 0 ? 'cold-front-triangle' : 'warm-front-semicircle')
          : config.symbolType
        const colorLine = config.symbolType === 'stationary-front-alternating'
          ? (index % 2 === 0 ? '#2563eb' : '#dc2626')
          : (item.color_line || config.color)
        symbols.push({
          type: 'Feature',
          properties: {
            id: `${item.id}-front-symbol-${index}`,
            sourceItemId: item.id,
            symbolType,
            rotation: sample.angle,
            colorLine,
            symbolSize: 10,
          },
          geometry: { type: 'Point', coordinates },
        })
      })
      continue
    }

    if (isCloudLine(item)) {
      const closedPoints = item.is_close ? [...points, points[0]] : points
      const coordinates = lngLatLine(closedPoints, source)
      if (coordinates.length >= 2) {
        lines.push({
          type: 'Feature',
          properties: {
            id: item.id,
            sourceItemId: item.id,
            renderRole: 'cloud-special-line',
            colorLine: item.color_line || '#a52a2a',
            lineWidth: 1.1,
          },
          geometry: {
            type: item.is_close ? 'Polygon' : 'LineString',
            coordinates: item.is_close ? [coordinates] : coordinates,
          },
        })
      }

      offsetSamplesFromPolygon(
        samplePolylineByDistance(closedPoints, { offset: 18, repeat: 24 }),
        points,
        9,
      ).forEach((sample, index) => {
        const coordinates = fpvPointToLngLat(sample, source)
        if (!coordinates) return
        symbols.push({
          type: 'Feature',
          properties: {
            id: `${item.id}-cloud-scallop-${index}`,
            sourceItemId: item.id,
            symbolType: 'cloud-scallop',
            rotation: sample.angle,
            colorLine: item.color_line || '#a52a2a',
            symbolSize: 11,
          },
          geometry: { type: 'Point', coordinates },
        })
      })

      const rawLines = labelLines(item.label || item.text_label)
      const labelPoint = fpvPointToLngLat(item.rect_label
        ? { x: item.rect_label.left + (item.rect_label.width / 2), y: item.rect_label.top + (item.rect_label.height / 2) }
        : points[0], source)
      if (rawLines.length > 0 && labelPoint) {
        labels.push({
          type: 'Feature',
          properties: {
            id: `${item.id}-cloud-label`,
            sourceItemId: item.id,
            label: rawLines.join('\n'),
            labelLines: rawLines,
          },
          geometry: { type: 'Point', coordinates: labelPoint },
        })
      }
    }
  }

  return {
    lines: { type: 'FeatureCollection', features: lines },
    symbols: { type: 'FeatureCollection', features: symbols },
    labels: { type: 'FeatureCollection', features: labels },
  }
}
