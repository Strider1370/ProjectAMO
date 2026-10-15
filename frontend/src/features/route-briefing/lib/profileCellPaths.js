// Batch adjacent, non-overlapping cells in paint order. Never combine overlapping
// rows: their alpha compositing must remain identical to separate rectangles.
export function profileCellPaths(cells) {
  const paths = []
  let batch
  for (const cell of cells) {
    const { x, y, w, h, fill } = cell
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue
    if (!batch || batch.fill !== fill || batch.y !== y || batch.h !== h || x < batch.right) {
      batch = { key: cell.key, fill, y, h, right: x, d: '' }
      paths.push(batch)
    }
    batch.d += `M${x},${y}h${w}v${h}h${-w}Z`
    batch.right = x + w
  }
  return paths
}
