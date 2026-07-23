import { contours } from 'd3-contour'
import { KO_DISPLAY_GRID, displayPixelToSourceIndex } from '../lib/satellite-ko-grid.js'
import { enToLatLon } from '../lib/lcc-projection.js'

export const CTPS_MIN_FL_OPTIONS = Object.freeze(['all', 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550])
export const CTPS_INVALID_HEIGHT = 0xffffffff
export const CTPS_INVALID_TEMPERATURE = -32768
export const CTPS_INVALID_QUALITY = 255
const CI_PROPERTIES = { 3: { signal: 3, level: 'medium', label: '중간 상승기류 신호', color: '#F6C945' }, 4: { signal: 4, level: 'strong', label: '강한 상승기류 신호', color: '#E8751A' } }
export const CI_RENDER_VERSION = 'ci-native-lcc-v2'

function validRings(coordinates) { return coordinates.map((polygon) => polygon.filter((ring) => ring.length >= 4)).filter((polygon) => polygon.length) }
export function buildCiFeatureCollection(parsedCi) {
  const generator = contours().size([parsedCi.attrs.width, parsedCi.attrs.height]).thresholds([0.5])
  const features = []
  for (const signal of [3, 4]) {
    const mask = new Uint8Array(parsedCi.attrs.width * parsedCi.attrs.height)
    for (let index = 0; index < mask.length; index += 1) if ((parsedCi.dqf[index] === 0 || parsedCi.dqf[index] === 1) && parsedCi.dqf[index] !== parsedCi.attrs.dqfFill && parsedCi.signal[index] !== parsedCi.attrs.signalFill && parsedCi.signal[index] === signal) mask[index] = 1
    const [contour] = generator(mask)
    if (!contour?.coordinates?.length) continue
    const geometry = { type: 'MultiPolygon', coordinates: validRings(contour.coordinates.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => { const [lat, lon] = enToLatLon(parsedCi.attrs.ulEasting + (x - 0.5) * parsedCi.attrs.pixelSize, parsedCi.attrs.ulNorthing - (y - 0.5) * parsedCi.attrs.pixelSize); return [lon, lat] })))) }
    if (!geometry.coordinates.length) continue
    const feature = { type: 'Feature', properties: CI_PROPERTIES[signal], geometry }
    features.push(feature)
  }
  return { type: 'FeatureCollection', features }
}
export function normalizeCtps(parsedCtps) {
  const { cth, ctt, flag, attrs } = parsedCtps; const size = attrs.width * attrs.height
  const heightFt = new Uint32Array(size).fill(CTPS_INVALID_HEIGHT), temperatureCentiC = new Int16Array(size).fill(CTPS_INVALID_TEMPERATURE), quality = new Uint8Array(size).fill(CTPS_INVALID_QUALITY)
  for (let index = 0; index < size; index += 1) {
    if (flag[index] !== 0 || flag[index] === attrs.flagFill || cth[index] === attrs.cthFill || ctt[index] === attrs.cttFill) continue
    const height = Math.round((cth[index] * attrs.cthScale + attrs.cthOffset) * 3280.839895)
    if (!Number.isFinite(height) || height <= 0) continue
    heightFt[index] = height; temperatureCentiC[index] = Math.round((ctt[index] * attrs.cttScale + attrs.cttOffset - 273.15) * 100); quality[index] = 0
  }
  return { attrs, heightFt, temperatureCentiC, quality }
}
function ctpsColor(heightFt) { if (heightFt < 10000) return [22,163,74]; if (heightFt < 20000) return [234,179,8]; if (heightFt < 30000) return [249,115,22]; if (heightFt < 40000) return [220,38,38]; return [126,34,206] }
export function renderCtpsRgba(normalized, minFl = 'all') {
  if (!CTPS_MIN_FL_OPTIONS.includes(minFl)) throw new Error('Invalid CTPS minimum FL')
  const rgba = Buffer.alloc(KO_DISPLAY_GRID.width * KO_DISPLAY_GRID.height * 4), minHeightFt = minFl === 'all' ? 0 : minFl * 100
  for (let y = 0; y < KO_DISPLAY_GRID.height; y += 1) for (let x = 0; x < KO_DISPLAY_GRID.width; x += 1) {
    const index = displayPixelToSourceIndex(x, y, normalized.attrs)
    if (index === null || normalized.quality[index] !== 0 || normalized.heightFt[index] < minHeightFt) continue
    const offset = (y * KO_DISPLAY_GRID.width + x) * 4, [r,g,b] = ctpsColor(normalized.heightFt[index]); rgba[offset] = r; rgba[offset + 1] = g; rgba[offset + 2] = b; rgba[offset + 3] = 255
  }
  return rgba
}
export function encodeCtpsBinary(normalized) {
  const { attrs, heightFt, temperatureCentiC, quality } = normalized, count = attrs.width * attrs.height, buffer = Buffer.alloc(32 + count * 7)
  buffer.write('AMOCTPS1', 0, 'ascii'); buffer.writeUInt16LE(attrs.width, 8); buffer.writeUInt16LE(attrs.height, 10); buffer.writeInt32LE(attrs.ulEasting, 12); buffer.writeInt32LE(attrs.ulNorthing, 16); buffer.writeUInt16LE(attrs.pixelSize, 20); buffer.writeUInt8(7, 22); buffer.writeUInt32LE(count, 24)
  for (let index = 0; index < count; index += 1) { const offset = 32 + index * 7; buffer.writeUInt32LE(heightFt[index], offset); buffer.writeInt16LE(temperatureCentiC[index], offset + 4); buffer.writeUInt8(quality[index], offset + 6) }
  return buffer
}
export function decodeCtpsRecord(buffer, index) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32 || buffer.toString('ascii', 0, 8) !== 'AMOCTPS1') throw new Error('Invalid CTPS binary header')
  const width = buffer.readUInt16LE(8), height = buffer.readUInt16LE(10), recordBytes = buffer.readUInt8(22), count = buffer.readUInt32LE(24)
  if (recordBytes !== 7 || count !== width * height || buffer.length !== 32 + count * recordBytes) throw new Error('Invalid CTPS binary length')
  if (!Number.isInteger(index) || index < 0 || index >= count) return null
  const offset = 32 + index * recordBytes, heightFt = buffer.readUInt32LE(offset), temperatureCentiC = buffer.readInt16LE(offset + 4), quality = buffer.readUInt8(offset + 6)
  return heightFt === CTPS_INVALID_HEIGHT || temperatureCentiC === CTPS_INVALID_TEMPERATURE || quality !== 0 ? null : { heightFt, temperatureC: temperatureCentiC / 100, qualityCode: quality, quality: 'normal' }
}
