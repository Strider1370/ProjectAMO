// ISA 기압고도(100 ft 단위 FL). FL은 기압고도이므로 지오퍼텐셜고도가 아니라 기압에서 바로 환산한다.
export function pressureToFl(hPa) {
  if (!Number.isFinite(hPa) || hPa <= 0) return NaN
  const meters = hPa >= 226.32 ? 44330.8 * (1 - (hPa / 1013.25) ** 0.190263) : 11000 + 6341.6 * Math.log(226.32 / hPa)
  return meters / 0.3048 / 100
}

export function sampleField(field, name, lon, lat) {
  const { nx, ny, lonMin, latMin, lonMax, latMax } = field.grid
  const i = Math.round((lon - lonMin) / (lonMax - lonMin) * (nx - 1)), j = Math.round((lat - latMin) / (latMax - latMin) * (ny - 1))
  if (i < 0 || j < 0 || i >= nx || j >= ny) return null
  const v = field[name]?.[j * nx + i]
  return Number.isFinite(v) ? v : null
}
