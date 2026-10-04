import { nearestTangent, createBoundaryPatterns, isSelectableHazard, insideArea, nearBoundary } from './wafsChartGeometry.js'
import { CSS_VARS } from '../../../shared/theme/tokens.js'
import { outlinedStroke, jetBarb as barb } from './jetSymbols.js'

import { chartColor, WAFS_CHART_PALETTES } from './wafsChartPalette.js'

const ASSETS = import.meta.glob('../assets/wafs/*.svg', { eager: true, query: '?url', import: 'default' })
const FONT = `11px ${CSS_VARS['--font-base']}`

function cloudBoundary(ctx, samples, ink, palette) {
  ctx.beginPath()
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 0.01) continue
    const nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length
    if (i === 1) ctx.moveTo(a.x, a.y)
    const bulge = length * 0.65
    const mid = { x: (a.x + b.x) / 2 + nx * bulge, y: (a.y + b.y) / 2 + ny * bulge }
    ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y)
  }
  outlinedStroke(ctx, ink, 2.3, palette)
}

function arrow(ctx, p, angle, palette) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle)
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(-15, -6); ctx.lineTo(-12, 0); ctx.lineTo(-15, 6); ctx.closePath()
  ctx.strokeStyle = palette.halo; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = palette.ink; ctx.fill(); ctx.restore()
}

function loadSymbol(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 110; c.height = 110
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, 110, 110)
      const pixels = ctx.getImageData(0, 0, 110, 110).data
      let left = 110, top = 110, right = 0, bottom = 0
      for (let y = 0; y < 110; y++) for (let x = 0; x < 110; x++) if (pixels[(y * 110 + x) * 4 + 3] > 0) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      }
      resolve({ canvas: c, left, top, width: right - left + 1, height: bottom - top + 1 })
    }
    img.onerror = () => reject(new Error('WAFS 기호를 읽을 수 없습니다.'))
    img.src = url
  })
}
const symbolName = p => p.phenomenon === 'TURBULENCE' ? `${p.severity === 'SEV' ? 'Severe' : 'Moderate'}Turbulence`
  : p.phenomenon === 'AIRFRAME_ICING' ? `${p.severity === 'SEV' ? 'Severe' : 'Moderate'}AircraftIcing`
    : p.phenomenon === 'VOLCANO' ? 'VolcanicEruption' : p.phenomenon === 'TROPICAL_CYCLONE' ? 'TropicalCyclone' : null

export const chartSymbolUrl = p => ASSETS[`../assets/wafs/WeatherSymbol_ICAO_${symbolName(p)}.svg`]

/** Screen-space SIGWX lines/symbols above native hazard fills and aviation vectors.
 * Every symbol, feather and label uses the same projected geographic anchor per render.
 * Canvas is pointer-transparent; hitTest reports current-frame annotations to the owner.
 */
export function createWafsChartRenderer(map, onError) {
  const canvas = document.createElement('canvas')
  canvas.className = 'wafs-chart-canvas'; canvas.setAttribute('aria-hidden', 'true')
  map.getCanvasContainer().append(canvas)
  const ctx = canvas.getContext('2d')
  let palette = WAFS_CHART_PALETTES.light
  let data = { features: [] }, revision = 0, signature = '', disposed = false, hitBoxes = []
  let selectedId = null, boundaryPaths = new Map(), boundaryFeatures = new Map()
  const boundaryPatterns = createBoundaryPatterns()
  let settleTimer, patternGeneration = 0
  function settlePatterns() {
    window.clearTimeout(settleTimer)
    // Wheel events can finish in quick succession. Reflow only once the gesture
    // has stopped, keeping geographic decoration anchors intact in between.
    settleTimer = window.setTimeout(() => {
      if (disposed || map.isZooming()) return
      boundaryPatterns.reset(); patternGeneration++; signature = ''; render()
    }, 160)
  }
  const symbols = {}, tinted = new Map()
  function icon(name, ink) {
    const key = name + ink
    if (tinted.has(key)) return tinted.get(key)
    const s = symbols[name]; if (!s) return null
    const c = document.createElement('canvas'); c.width = 56; c.height = 56
    const g = c.getContext('2d'), scale = 48 / Math.max(s.width, s.height)
    g.drawImage(s.canvas, s.left, s.top, s.width, s.height, (56 - s.width * scale) / 2, (56 - s.height * scale) / 2, s.width * scale, s.height * scale)
    g.globalCompositeOperation = 'source-in'; g.fillStyle = ink; g.fillRect(0, 0, 56, 56)
    tinted.set(key, c); return c
  }
  Promise.all(Object.entries(ASSETS).map(async ([path, url]) => {
    const name = path.match(/WeatherSymbol_ICAO_(.+)\.svg$/)[1]
    symbols[name] = await loadSymbol(url)
  })).then(() => { if (!disposed) { signature = ''; render() } }).catch(error => { if (!disposed) onError(error.message) })

  function render() {
    if (disposed) return
    const { width, height } = map.getCanvas().getBoundingClientRect(), ratio = window.devicePixelRatio || 1
    const center = map.getCenter()
    const next = [revision, width, height, ratio, center.lng, center.lat, map.getZoom(), map.getBearing(), map.getPitch()].join('/')
    if (signature === next) return
    signature = next
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.font = FONT
    hitBoxes = []
    const stats = { scallops: 0, icing: 0, barbs: 0, arrows: 0, markers: 0, labels: 0, selectedAreas: 0, hazardLabels: 0, hazardFills: 0 }
    const pathsById = new Map(), reserved = []
    const within = p => p.x > -60 && p.x < width + 60 && p.y > -60 && p.y < height + 60
    const project = coordinates => map.project(coordinates)
    boundaryFeatures = new Map(data.features.filter(f => f.properties.role === 'boundary').map(f => [f.properties.objectId, f]))
    const selected = boundaryFeatures.get(selectedId)
    const area = data.areas?.find(a => a.objectId === selectedId)
    stats.hazardFills = data.areas?.length || 0 // Fills are rendered by Mapbox below aviation vectors.
    stats.selectedAreas = selected && area ? 1 : 0
    const panel = map.getContainer().querySelector('.sigwx-high-details, .wafs-sample')
    if (panel) {
      const a = panel.getBoundingClientRect(), b = canvas.getBoundingClientRect()
      reserved.push({ x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height })
    }
    for (const f of boundaryFeatures.values()) {
      pathsById.set(f.properties.objectId, f.geometry.coordinates.map(line => line.map(project)))
    }
    // Explicit drawing passes: contours < CB < complete jets (axis and feathers).
    for (const kind of ['TROPOPAUSE', 'CLOUD', 'JETSTREAM']) {
      for (const f of boundaryFeatures.values()) {
        if (f.properties.phenomenon !== kind) continue
        const paths = pathsById.get(f.properties.objectId)
        if (kind !== 'CLOUD') {
          ctx.beginPath()
          for (const path of paths) path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
          if (kind === 'TROPOPAUSE') {
            ctx.setLineDash([6.5, 3.9]); ctx.strokeStyle = palette.tropopause; ctx.lineWidth = 2.2; ctx.stroke(); ctx.setLineDash([])
          } else outlinedStroke(ctx, palette.ink, 3.5, palette)
          continue
        }
        for (let i = 0; i < paths.length; i++) {
          if (!paths[i].some(within)) continue
          const anchors = boundaryPatterns.get(
            f.geometry.coordinates[i], 13, project,
            point => map.unproject(point).toArray()
          )
          cloudBoundary(ctx, anchors.map(project), chartColor(f.properties, palette), palette)
          stats.scallops++
        }
      }
    }
    boundaryPaths = pathsById
    const annotations = []
    function addHit(p, f, radius = 18) { hitBoxes.push({ x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2, feature: f }) }
    const points = data.features.filter(f => f.geometry.type === 'Point')
      .sort((a, b) => Number(a.properties.role === 'marker') - Number(b.properties.role === 'marker'))
    for (const f of points) {
      const p = project(f.geometry.coordinates), props = f.properties
      if (!within(p)) continue
      const paths = pathsById.get(props.objectId) || []
      const angle = nearestTangent(p, paths)
      if (props.role === 'wind') {
        barb(ctx, p, angle, props.speedKt, f.geometry.coordinates[1], palette); addHit(p, f, 25); stats.barbs++
        const extra = props.isotachLower && props.isotachUpper ? `${props.isotachLower.replace('FL ', '')}/${props.isotachUpper.replace('FL ', '')}` : ''
        annotations.push({ f, p, angle, lines: [props.windLevel, extra].filter(Boolean), priority: 1, jet: true })
      } else if (props.role === 'direction') {
        arrow(ctx, p, angle, palette); addHit(p, f); stats.arrows++
      } else if (props.role === 'marker') {
        const image = icon(symbolName(props), chartColor(props, palette))
        ctx.fillStyle = palette.background; ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill()
        if (image) ctx.drawImage(image, p.x - 15, p.y - 15, 30, 30)
        addHit(p, f); stats.markers++
        annotations.push({ f, p, lines: props.label.split('\n'), priority: 0 })
      } else if (props.role === 'label' && props.phenomenon !== 'JETSTREAM' && !isSelectableHazard(props)) {
        annotations.push({ f, p, lines: props.label.split('\n'), priority: props.severity === 'SEV' ? 2 : 3 })
      }
    }
    const overlaps = box => reserved.some(b => box.x < b.x + b.w + 3 && box.x + box.w + 3 > b.x && box.y < b.y + b.h + 3 && box.y + box.h + 3 > b.y)
    for (const a of annotations.sort((a, b) => a.priority - b.priority)) {
      const ink = chartColor(a.f.properties, palette), name = a.f.properties.role === 'label' ? symbolName(a.f.properties) : null
      const image = name && icon(name, ink), iconWidth = image ? 23 : 0
      const w = Math.ceil(Math.max(...a.lines.map(s => ctx.measureText(s).width)) + 10 + iconWidth), h = Math.max(22, a.lines.length * 13 + 8)
      let angle = a.jet ? a.angle : 0
      if (angle > Math.PI / 2) angle -= Math.PI
      if (angle < -Math.PI / 2) angle += Math.PI
      const offsets = a.jet ? [[0, 14], [0, 30]] : [[15, 12], [-w - 15, 12], [15, -h - 12], [-w - 15, -h - 12]]
      let box, origin
      for (const [dx, dy] of offsets) {
        if (a.jet) {
          const c = Math.cos(angle), s = Math.sin(angle)
          const o = { x: a.p.x + c * (-w / 2) - s * dy, y: a.p.y + s * (-w / 2) + c * dy }
          const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => ({ x: o.x + c * x - s * y, y: o.y + s * x + c * y }))
          const xs = corners.map(p => p.x), ys = corners.map(p => p.y)
          const candidate = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
          if (candidate.x < 3 || candidate.x + candidate.w > width - 3 || candidate.y < 3 || candidate.y + candidate.h > height - 3 || overlaps(candidate)) continue
          box = candidate; origin = o; break
        }
        const candidate = { x: a.p.x + dx, y: a.p.y + dy, w, h }
        if (candidate.x < 3 || candidate.x + w > width - 3 || candidate.y < 3 || candidate.y + h > height - 3 || overlaps(candidate)) continue
        box = candidate; break
      }
      if (!box) continue
      reserved.push(box); hitBoxes.push({ ...box, feature: a.f }); stats.labels++
      if (isSelectableHazard(a.f.properties)) stats.hazardLabels++
      // Leader lines retain the exact source anchor; collision handling moves only text.
      if (!a.jet) {
        ctx.beginPath(); ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(Math.max(box.x, Math.min(a.p.x, box.x + w)), Math.max(box.y, Math.min(a.p.y, box.y + h)))
        ctx.strokeStyle = ink; ctx.lineWidth = 0.7; ctx.stroke()
      }
      ctx.save(); ctx.translate(origin?.x ?? box.x, origin?.y ?? box.y); ctx.rotate(angle)
      ctx.fillStyle = palette.background; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = ink; ctx.lineWidth = 0.6; ctx.strokeRect(0, 0, w, h)
      if (image) ctx.drawImage(image, 3, (h - 22) / 2, 22, 22)
      ctx.fillStyle = ink; ctx.textBaseline = 'top'
      a.lines.forEach((text, i) => ctx.fillText(text, 5 + iconWidth, 4 + i * 13))
      ctx.restore()
    }
    canvas.dataset.palette = palette.mode
    canvas.dataset.stats = JSON.stringify(stats)
    canvas.dataset.frame = data.metadata?.frameId || ''
    canvas.dataset.patternGeneration = String(patternGeneration)
    canvas.dataset.selectedArea = selected && area ? selectedId : ''
  }
  map.on('render', render)
  map.on('zoomend', settlePatterns)
  map.on('pitchend', settlePatterns)
  map.on('resize', settlePatterns)
  return {
    setData(next, nextPalette = palette) {
      palette = nextPalette
      if (data.metadata?.frameId !== next.metadata?.frameId) selectedId = null
      data = next; revision++; render()
    },
    selectArea(id) { selectedId = id; revision++; render() },
    redraw() { signature = ''; render() },
    hitTest(point) { return [...hitBoxes].reverse().find(b => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h)?.feature },
    hitAreas(point) {
      const [lon, lat] = map.unproject(point).toArray(), [west, south, east, north] = data.metadata.bounds
      if (lon < west || lon > east || lat < south || lat > north) return []
      return (data.areas || []).filter(a => insideArea([lon, lat], a.polygons) || nearBoundary(point, boundaryPaths.get(a.objectId) || []))
        .map(a => boundaryFeatures.get(a.objectId)).filter(Boolean)
        .sort((a, b) => Number(b.properties.severity === 'SEV') - Number(a.properties.severity === 'SEV'))
    },
    destroy() {
      disposed = true; window.clearTimeout(settleTimer)
      map.off('render', render); map.off('zoomend', settlePatterns)
      map.off('pitchend', settlePatterns); map.off('resize', settlePatterns)
      canvas.remove(); tinted.clear(); boundaryPatterns.reset()
    },
  }
}
