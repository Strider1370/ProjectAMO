import { windParts } from './wafsChartGeometry.js'

// SIGWX HIGH 렌더러와 권계면·제트 렌더러가 공유하는 제트 기호. palette는 { ink, halo }.
export function outlinedStroke(ctx, ink, width, palette) {
  ctx.strokeStyle = palette.halo; ctx.lineWidth = width + 1.6; ctx.stroke()
  ctx.strokeStyle = ink; ctx.lineWidth = width; ctx.stroke()
}

// 제트 축(angle, 화면 라디안) 위의 바람깃: 삼각 50 · 긴 깃 10 · 짧은 깃 5 kt.
export function jetBarb(ctx, p, angle, speed, latitude, palette) {
  const parts = windParts(speed)
  if (!parts) return
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle)
  // Barbs lie on the poleward side: left of flow in the northern hemisphere.
  const side = latitude >= 0 ? -1 : 1
  const length = Math.max(34, parts.pennants * 10 + parts.full * 6 + parts.half * 6 + 8)
  ctx.beginPath(); ctx.moveTo(-length / 2, 0); ctx.lineTo(length / 2, 0)
  outlinedStroke(ctx, palette.ink, 2.2, palette)
  let x = -length / 2
  for (let i = 0; i < parts.pennants; i++) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 5, side * 15); ctx.lineTo(x + 9, 0); ctx.closePath()
    ctx.strokeStyle = palette.halo; ctx.lineWidth = 1.8; ctx.stroke(); ctx.fillStyle = palette.ink; ctx.fill(); x += 11
  }
  for (let i = 0; i < parts.full + parts.half; i++) {
    const half = i >= parts.full
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - (half ? 3 : 6), side * (half ? 8 : 15))
    outlinedStroke(ctx, palette.ink, 1.7, palette); x += 6
  }
  ctx.restore()
}

// 제트 방향으로 회전한 흰 상자 라벨(FL340, 핵은 260/480). 선 아래 14 px, 겹치면 30 px.
// reserved에 이미 쓴 영역을 넣어 겹침을 피하고, 놓을 자리가 없으면 그리지 않는다.
export function jetLevelLabel(ctx, p, angle, lines, { reserved, width, height, palette, font, accept = null }) {
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI
  ctx.font = font
  const w = Math.ceil(Math.max(...lines.map(s => ctx.measureText(s).width)) + 10), h = Math.max(22, lines.length * 13 + 8)
  const c = Math.cos(angle), s = Math.sin(angle)
  for (const dy of [14, 30]) {
    const o = { x: p.x + c * (-w / 2) - s * dy, y: p.y + s * (-w / 2) + c * dy }
    const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => ({ x: o.x + c * x - s * y, y: o.y + s * x + c * y }))
    const xs = corners.map(q => q.x), ys = corners.map(q => q.y)
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    if (box.x < 3 || box.y < 3 || box.x + box.w > width - 3 || box.y + box.h > height - 3
      || reserved.some(b => box.x < b.x + b.w + 3 && box.x + box.w + 3 > b.x && box.y < b.y + b.h + 3 && box.y + box.h + 3 > b.y)
      || (accept && !accept(box))) continue
    reserved.push(box)
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(angle)
    ctx.fillStyle = palette.background ?? palette.halo; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = palette.ink; ctx.lineWidth = 0.6; ctx.strokeRect(0, 0, w, h)
    ctx.fillStyle = palette.ink; ctx.textBaseline = 'top'
    lines.forEach((text, i) => ctx.fillText(text, 5, 4 + i * 13))
    ctx.restore()
    return box
  }
  return null
}
