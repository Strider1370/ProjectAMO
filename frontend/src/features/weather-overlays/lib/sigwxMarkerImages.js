// Coupled chart marks are one image at the source-provided anchor. This keeps
// the number inside its diamond and the CB lines together through style reloads.
function createTurbulenceImage(canvas, ctx, kind, text) {
  const ratio = 2
  const lines = text ? text.split('\n') : []
  const font = '11px "Courier New", monospace'
  ctx.font = font
  const textWidth = lines.length ? Math.ceil(Math.max(...lines.map(line => ctx.measureText(line).width))) + 4 : 0
  // Transparent padding on the left keeps the symbol's center at the geo anchor.
  const width = 2 * (15 + textWidth)
  const height = Math.max(32, lines.length * 14 + 4)
  canvas.width = width * ratio
  canvas.height = height * ratio
  ctx.scale(ratio, ratio)
  const x = width / 2
  const y = height / 2
  ctx.strokeStyle = '#f97316'
  ctx.lineWidth = 2
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  ctx.moveTo(x - 12, y + 3)
  ctx.lineTo(x - 4, y + 3)
  ctx.lineTo(x, y - 3)
  ctx.lineTo(x + 4, y + 3)
  ctx.lineTo(x + 12, y + 3)
  if (kind === 'turbulence-severe') {
    ctx.moveTo(x - 4, y - 3)
    ctx.lineTo(x, y - 9)
    ctx.lineTo(x + 4, y - 3)
  }
  ctx.stroke()
  if (lines.length) {
    const left = x + 15
    const top = (height - lines.length * 14) / 2
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(left, top, textWidth, lines.length * 14)
    ctx.font = font
    ctx.fillStyle = '#111111'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    lines.forEach((line, index) => ctx.fillText(line, left + textWidth / 2, top + index * 14 + 7))
    if (lines.length === 2) {
      ctx.strokeStyle = '#111111'
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(left + 2, top + 14)
      ctx.lineTo(left + textWidth - 2, top + 14)
      ctx.stroke()
    }
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function createVisibilitySetImage(canvas, ctx) {
  // 24px symbols with 8px gutters, centered on the original fog anchor.
  canvas.width = 88 * 2
  canvas.height = 28 * 2
  ctx.scale(2, 2)
  ctx.strokeStyle = '#00cc00'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (const y of [2, 16]) {
    for (const x of [1, 6, 11, 16]) {
      ctx.moveTo(x, y + 10)
      ctx.lineTo(x + 5, y)
    }
  }
  ctx.stroke()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  for (const y of [7, 14, 21]) {
    ctx.moveTo(32, y)
    ctx.lineTo(56, y)
  }
  for (const y of [10.5, 17.5]) {
    ctx.moveTo(64, y)
    ctx.lineTo(88, y)
  }
  ctx.stroke()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export function createSigwxMarkerImage({ kind, text }) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx && kind === 'visibility-set') return createVisibilitySetImage(canvas, ctx)
  if (ctx && ['turbulence-moderate', 'turbulence-severe'].includes(kind)) return createTurbulenceImage(canvas, ctx, kind, text)
  if (!ctx || !text || !['wind', 'cloud-label'].includes(kind)) return null
  const ratio = 2
  const lines = text.split('\n')
  const font = kind === 'wind' ? '12px Arial, sans-serif' : '11px "Courier New", monospace'
  ctx.font = font
  const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width))
  const width = kind === 'wind' ? Math.max(32, Math.ceil(textWidth * 2 + 8)) : Math.ceil(textWidth + 6)
  const height = kind === 'wind' ? width : lines.length * 14 + 4
  canvas.width = width * ratio
  canvas.height = height * ratio
  ctx.scale(ratio, ratio)
  ctx.fillStyle = '#ffffff'
  if (kind === 'wind') {
    ctx.beginPath()
    ctx.moveTo(width / 2, 1)
    ctx.lineTo(width - 1, height / 2)
    ctx.lineTo(width / 2, height - 1)
    ctx.lineTo(1, height / 2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#0000ff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  } else {
    ctx.fillRect(0, 0, width, height)
  }
  ctx.font = font
  ctx.fillStyle = kind === 'wind' ? '#0000ff' : '#111111'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, index) => ctx.fillText(line, width / 2, kind === 'wind' ? height / 2 : 2 + index * 14 + 7))
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
