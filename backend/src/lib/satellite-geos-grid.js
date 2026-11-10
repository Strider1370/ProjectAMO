import { enToLatLon } from './lcc-projection.js'
import { KO_SOURCE_GRID } from './satellite-ko-grid.js'

const RAD = Math.PI / 180

// GK2A CFAC/LFAC navigation (one-based line/column), verified against NMSC's
// gk2a_ami_ela020ge_latlon.nc. These navigation factors define the scan geometry;
// the upstream sweep_angle_axis attribute alone does not reproduce that table.
// https://nmsc.kma.go.kr/upload/resource/data/gk2a/gk2a_ami_ela020ge_latlon.nc
export function geosPixelForLatLon(lat, lon, grid) {
  const phi = lat * RAD, lambda = (lon - grid.longitude) * RAD
  const e2 = 1 - (grid.semiMinor / grid.semiMajor) ** 2
  const n = grid.semiMajor / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const earthX = n * Math.cos(phi) * Math.cos(lambda)
  const earthY = n * Math.cos(phi) * Math.sin(lambda)
  const earthZ = n * (1 - e2) * Math.sin(phi)
  const satelliteDistance = grid.semiMajor + grid.satelliteHeight
  if (earthX * (satelliteDistance - earthX) - earthY ** 2 - earthZ ** 2 / (1 - e2) <= 0) return null
  const dx = satelliteDistance - earthX
  const x = Math.atan2(earthY, dx)
  const y = -Math.asin(earthZ / Math.hypot(dx, earthY, earthZ))
  return [grid.columnOffset + x / RAD * grid.columnScale / 65536 - 1,
    grid.lineOffset + y / RAD * grid.lineScale / 65536 - 1]
}

// Resample raw values with nearest neighbours so flags and fill values remain
// categorical. The existing CTPS binary, mask, renderer and point API stay on KO.
export function resampleGeosCtpsToKo(parsed, grid, target = KO_SOURCE_GRID) {
  const count = target.width * target.height
  const cth = new parsed.cth.constructor(count).fill(parsed.attrs.cthFill)
  const ctt = new parsed.ctt.constructor(count).fill(parsed.attrs.cttFill)
  const flag = new parsed.flag.constructor(count).fill(parsed.attrs.flagFill)
  let covered = 0
  for (let row = 0; row < target.height; row += 1) for (let col = 0; col < target.width; col += 1) {
    const [lat, lon] = enToLatLon(target.ulEasting + col * target.pixelSize, target.ulNorthing - row * target.pixelSize)
    const pixel = geosPixelForLatLon(lat, lon, grid)
    if (!pixel) continue
    const x = Math.round(pixel[0]), y = Math.round(pixel[1])
    if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) continue
    const source = y * grid.width + x, dest = row * target.width + col
    covered += 1
    cth[dest] = parsed.cth[source]; ctt[dest] = parsed.ctt[source]; flag[dest] = parsed.flag[source]
  }
  if (!covered) throw new Error('GEOS CTPS grid does not cover the target area')
  return { cth, ctt, flag, attrs: { ...parsed.attrs, ...target } }
}
