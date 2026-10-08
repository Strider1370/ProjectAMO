export function parseRgba(color) {
  const match = String(color).match(/rgba\(([^)]+)\)/)
  if (!match) return [0, 0, 0, 0]
  const [r, g, b, a] = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return [r, g, b, Math.round((a ?? 1) * 255)]
}

const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const latFromMercatorY = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI
const rowCache = new WeakMap()

// 이미지 행 수 배율. 1이면 행 경계가 격자 칸 경계와 최대 반 칸 어긋나지만 격자 해상도 안이다. 4배로 했더니 고도·시간을
// 바꿀 때마다 레이어마다 4배 큰 이미지를 만들고 PNG로 인코딩해 눈에 띄게 늦어졌다(확대 영역, 2026-10-08).
export const RASTER_ROW_SCALE = 1

function cellExtent(grid) {
  const { nx, ny, lonMin, lonMax, latMin, latMax } = grid
  const dx = (lonMax - lonMin) / Math.max(1, nx - 1)
  const dy = (latMax - latMin) / Math.max(1, ny - 1)
  return { dy, west: lonMin - dx / 2, east: lonMax + dx / 2, south: Math.max(-85, latMin - dy / 2), north: Math.min(85, latMax + dy / 2) }
}

// 격자 이미지 1열 = 격자 1칸이 되도록 이미지 모서리를 격자점 중심이 아니라 칸 바깥 경계에 둔다.
export function cellCoordinatesForGrid(grid) {
  if (!grid || ![grid.lonMin, grid.lonMax, grid.latMin, grid.latMax, grid.nx, grid.ny].every(Number.isFinite)) return null
  const { west, east, south, north } = cellExtent(grid)
  return [[west, north], [east, north], [east, south], [west, south]]
}

// 이미지 소스는 네 모서리 사이를 Web Mercator에서 선형으로 늘린다. 격자는 위도 간격이 일정하므로 행을 그대로 쌓으면
// 중간 위도가 남북으로 밀린다(한반도 30~44°N 최대 약 36 km, 확대 영역 6~50°N 최대 약 270 km).
// cellCoordinatesForGrid로 붙인 이미지의 y행(위에서부터) 픽셀 중심이 놓이는 위도를 구해, 그 위도를 담은 격자 행(남쪽부터)을 돌려준다.
export function mercatorSourceRows(grid, height = grid?.ny * RASTER_ROW_SCALE) {
  if (!grid || !Number.isInteger(height) || height <= 0) return null
  const cached = rowCache.get(grid)
  if (cached?.length === height) return cached
  const { latMin, ny } = grid
  const { dy, south, north } = cellExtent(grid)
  const rows = new Int32Array(height)
  const top = mercatorY(north)
  const bottom = mercatorY(south)
  for (let y = 0; y < height; y += 1) {
    const lat = latFromMercatorY(top - ((y + 0.5) / height) * (top - bottom))
    rows[y] = Math.min(ny - 1, Math.max(0, Math.round((lat - latMin) / dy)))
  }
  rowCache.set(grid, rows)
  return rows
}

export function coordinatesForGrid(grid) {
  if (!grid) return null
  const { lonMin, lonMax, latMin, latMax } = grid
  if (![lonMin, lonMax, latMin, latMax].every(Number.isFinite)) return null
  return [[lonMin, latMax], [lonMax, latMax], [lonMax, latMin], [lonMin, latMin]]
}
