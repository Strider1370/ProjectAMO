import { CSS_VARS } from '../../../shared/theme/tokens.js'
import { JET_INK, TROP_CAP_FL, TROP_LABEL } from '../../../shared/weather/tropopauseJetPresentation.js'
import { jetBarb, jetLevelLabel } from './jetSymbols.js'

const FONT = `11px ${CSS_VARS['--font-base']}`
const BOLD = `700 11px ${CSS_VARS['--font-base']}`
const PALETTE = { ...JET_INK, background: '#ffffff' }

/** Screen-space vector layer for the tropopause/jet overlay: band edges with TROP labels,
 * the 80 kt line, jet axes, SIGWX-style barbs and FL labels. Raster bands and hatching are
 * Mapbox image layers below; this canvas is pointer-transparent. */
export function createTropopauseJetRenderer(map) {
  const canvas = document.createElement('canvas')
  canvas.className = 'tropopause-jet-canvas'; canvas.setAttribute('aria-hidden', 'true')
  map.getCanvasContainer().append(canvas)
  const ctx = canvas.getContext('2d')
  let model = null, signature = '', disposed = false

  function strokePath(points, color, width, dash = []) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
    ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([])
  }

  // 지도 위에 떠 있는 버튼·카드 아래에는 라벨을 놓지 않는다(그 자리 최상단 요소가 지도인지 확인).
  function uncovered(box) {
    const r = canvas.getBoundingClientRect(), container = map.getCanvasContainer()
    return [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h], [box.x + box.w / 2, box.y + box.h / 2]]
      .every(([x, y]) => { const el = document.elementFromPoint(r.left + x, r.top + y); return !el || container.contains(el) })
  }

  function tropLabel(p, text, reserved, width, height) {
    ctx.font = BOLD
    const w = ctx.measureText(text).width + 12, h = 18, box = { x: p.x - w / 2, y: p.y - h / 2, w, h }
    if (box.x < 3 || box.y < 3 || box.x + w > width - 3 || box.y + h > height - 3
      || reserved.some(b => box.x < b.x + b.w + 40 && box.x + w + 40 > b.x && box.y < b.y + b.h + 24 && box.y + h + 24 > b.y)
      || !uncovered(box)) return false
    reserved.push(box)
    ctx.beginPath(); ctx.roundRect(box.x, box.y, w, h, 9)
    ctx.fillStyle = TROP_LABEL.fill; ctx.fill(); ctx.strokeStyle = TROP_LABEL.stroke; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.fillStyle = TROP_LABEL.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, p.x, p.y + 0.5)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    return true
  }

  function render() {
    if (disposed) return
    const { width, height } = map.getCanvas().getBoundingClientRect(), ratio = window.devicePixelRatio || 1
    const center = map.getCenter()
    const next = [model?.key ?? '', width, height, ratio, center.lng, center.lat, map.getZoom(), map.getBearing(), map.getPitch()].join('/')
    if (signature === next) return
    signature = next
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height)
    if (!model) return
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    const project = ([lon, lat]) => map.project([lon, lat])
    const reserved = []
    const stats = { edges: 0, tropLabels: 0, jets: 0, barbs: 0 }
    // 권계면 단계 경계: 얇은 흰 선
    for (const edge of model.edges) for (const line of edge.lines) {
      strokePath(line.map(project), 'rgba(255,255,255,0.9)', 1.2); stats.edges++
    }
    // 제트 축·화살촉
    for (const jet of model.jets) {
      const pts = jet.coordinates.map(project)
      strokePath(pts, PALETTE.halo, jet.minor ? 5 : 7, jet.minor ? [8, 6] : [])
      strokePath(pts, PALETTE.ink, jet.minor ? 2 : 3.2, jet.minor ? [8, 6] : [])
      const end = pts.at(-1), from = pts[Math.max(0, pts.length - 4)], a = Math.atan2(end.y - from.y, end.x - from.x), size = jet.minor ? 11 : 16
      for (const [color, s] of [[PALETTE.halo, size + 4], [PALETTE.ink, size]]) {
        ctx.beginPath(); ctx.moveTo(end.x + Math.cos(a) * s * 0.4, end.y + Math.sin(a) * s * 0.4)
        ctx.lineTo(end.x + Math.cos(a + 2.6) * s, end.y + Math.sin(a + 2.6) * s); ctx.lineTo(end.x + Math.cos(a - 2.6) * s, end.y + Math.sin(a - 2.6) * s)
        ctx.closePath(); ctx.fillStyle = color; ctx.fill()
      }
      stats.jets++
    }
    // 제트마다 가장 센 지점에 깃과 FL 하나. 그 지점이 화면 밖이면 보이는 구간의 원 격자 최대풍 지점에 둔다.
    const inView = p => p.x > 20 && p.y > 20 && p.x < width - 20 && p.y < height - 20
    const drawBarb = (jet, k, speedKt, flightLevel, extra) => {
      const p = project(jet.coordinates[k])
      const a = project(jet.coordinates[Math.max(0, k - 2)]), b = project(jet.coordinates[Math.min(jet.coordinates.length - 1, k + 2)])
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      jetBarb(ctx, p, angle, speedKt, jet.coordinates[k][1], PALETTE)
      jetLevelLabel(ctx, p, angle, [`FL${flightLevel}`, extra].filter(Boolean), { reserved, width, height, palette: PALETTE, font: FONT, accept: uncovered })
      stats.barbs++
    }
    for (const jet of model.jets) {
      let shown = 0
      for (const barb of [...jet.barbs].sort((a, b) => Number(b.core) - Number(a.core))) {
        if (!inView(project(barb.coordinates))) continue
        drawBarb(jet, barb.k, barb.speedKt, barb.flightLevel, null); shown++
      }
      if (shown) continue
      let best = -1
      jet.coordinates.forEach((c, k) => {
        const s = jet.samples?.[k]
        if (inView(project(c)) && k > 1 && k < jet.coordinates.length - 3 && Number.isFinite(s?.kt) && Number.isFinite(s?.fl) && (best < 0 || s.kt > jet.samples[best].kt)) best = k
      })
      if (best >= 0) drawBarb(jet, best, Math.round(jet.samples[best].kt / 5) * 5, Math.round(jet.samples[best].fl / 10) * 10, null)
    }
    // TROP 라벨: 경계선 하나에 최대 2개, 같은 높이 라벨끼리 화면 350 px 이상 떨어뜨린다.
    for (const edge of model.edges) {
      const placed = []
      for (const line of edge.lines) {
        const pts = line.map(project).filter(p => p.x > 0 && p.y > 0 && p.x < width && p.y < height)
        if (pts.length < 8) continue
        let count = 0
        for (const f of [0.5, 0.2, 0.8, 0.35, 0.65]) {
          if (count >= 2) break
          const p = pts[Math.floor(pts.length * f)]
          if (placed.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 350)) continue
          if (tropLabel(p, edge.level >= TROP_CAP_FL ? `TROP ${TROP_CAP_FL}` : `TROP ${edge.level}`, reserved, width, height)) { placed.push(p); count++; stats.tropLabels++ }
        }
      }
    }
    canvas.dataset.stats = JSON.stringify(stats)
    canvas.dataset.model = model.key
  }

  map.on('render', render)
  return {
    setModel(next) { model = next; signature = ''; render(); map.triggerRepaint?.() },
    destroy() {
      disposed = true
      map.off('render', render)
      canvas.remove()
    },
  }
}
