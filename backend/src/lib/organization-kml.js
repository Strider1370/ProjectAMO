import zlib from 'node:zlib'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { kinks, polygon } from '@turf/turf'

const MAX_EXPANDED = 100 * 1024 * 1024
const MAX_POINTS = 50000
const many = value => value == null ? [] : Array.isArray(value) ? value : [value]
const invalid = reason => { throw new Error(`invalid_map_material:${reason}`) }

function extractKml(zip) {
  let end = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0 || zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6) || end + 22 + zip.readUInt16LE(end + 20) !== zip.length) invalid('zip_directory')
  const entries = zip.readUInt16LE(end + 10)
  if (!entries || entries > 1000 || entries === 65535) invalid('zip_entries')
  let cursor = zip.readUInt32LE(end + 16), total = 0
  const candidates = []
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50) invalid('zip_entry')
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10)
    const compressedSize = zip.readUInt32LE(cursor + 20), size = zip.readUInt32LE(cursor + 24)
    const nameSize = zip.readUInt16LE(cursor + 28), extraSize = zip.readUInt16LE(cursor + 30), commentSize = zip.readUInt16LE(cursor + 32)
    const offset = zip.readUInt32LE(cursor + 42)
    if (cursor + 46 + nameSize + extraSize + commentSize > end) invalid('zip_entry_bounds')
    const name = zip.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8').replace(/\\/g, '/')
    if (flags & 1 || ![0, 8].includes(method) || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) invalid('zip_path_or_method')
    total += size
    if (total > MAX_EXPANDED) invalid('zip_expanded_size')
    if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== 0x04034b50) invalid('zip_offset')
    const localNameSize = zip.readUInt16LE(offset + 26), localExtraSize = zip.readUInt16LE(offset + 28)
    if (zip.subarray(offset + 30, offset + 30 + localNameSize).toString('utf8').replace(/\\/g, '/') !== name || zip.readUInt16LE(offset + 8) !== method) invalid('zip_header_mismatch')
    const start = offset + 30 + localNameSize + localExtraSize
    if (start + compressedSize > cursor) invalid('zip_data_bounds')
    if (/\.kml$/i.test(name)) {
      const compressed = zip.subarray(start, start + compressedSize)
      const bytes = method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_EXPANDED, size + 1) })
      if (bytes.length !== size) invalid('zip_size_mismatch')
      if (zlib.crc32(bytes) !== zip.readUInt32LE(cursor + 16)) invalid('zip_checksum')
      candidates.push({ name, bytes })
    }
    cursor += 46 + nameSize + extraSize + commentSize
  }
  const chosen = candidates.find(item => item.name.toLowerCase() === 'doc.kml') ?? (candidates.length === 1 ? candidates[0] : null)
  if (!chosen) invalid('zip_kml_missing_or_ambiguous')
  return chosen.bytes.toString('utf8')
}

export function parseOrganizationMapMaterial(buffer, mimeType = 'application/vnd.google-earth.kml+xml') {
  const text = mimeType.endsWith('kmz') ? extractKml(buffer) : buffer.toString('utf8')
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) invalid('xml')
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(text)
  if (!parsed.kml) invalid('kml_root')
  let points = 0
  function coordinates(value, minimum) {
    const raw = typeof value === 'object' ? value?.['#text'] : value
    if (typeof raw !== 'string') invalid('coordinates_missing')
    const result = raw.trim().split(/\s+/).map(part => {
      const strings = part.split(',')
      if (strings.length < 2 || strings.length > 3 || strings.some(item => !item.trim())) invalid('coordinate_format')
      const numbers = strings.map(Number)
      if (!numbers.every(Number.isFinite) || Math.abs(numbers[0]) > 180 || Math.abs(numbers[1]) > 90) invalid('coordinate_range')
      if (++points > MAX_POINTS) invalid('too_many_coordinates')
      return numbers
    })
    if (result.length < minimum) invalid('too_few_coordinates')
    return result
  }
  function ring(node) {
    const result = coordinates(node?.LinearRing?.coordinates, 4)
    if (result[0][0] !== result.at(-1)[0] || result[0][1] !== result.at(-1)[1]) invalid('ring_not_closed')
    return result
  }
  function geometry(node) {
    if (node.Point) {
      const list = coordinates(node.Point.coordinates, 1)
      if (list.length !== 1) invalid('point_count')
      return [{ type: 'Point', coordinates: list[0] }]
    }
    if (node.LineString) return [{ type: 'LineString', coordinates: coordinates(node.LineString.coordinates, 2) }]
    if (node.Polygon) {
      const rings = [ring(node.Polygon.outerBoundaryIs), ...many(node.Polygon.innerBoundaryIs).map(ring)]
      if (kinks(polygon(rings)).features.length) invalid('polygon_self_intersection')
      return [{ type: 'Polygon', coordinates: rings }]
    }
    if (node.MultiGeometry) return many(node.MultiGeometry).flatMap(multi => Object.entries(multi).flatMap(([key, value]) => many(value).flatMap(item => geometry({ [key]: item }))))
    return []
  }
  const features = []
  const warnings = new Set()
  function walk(node, depth = 0) {
    if (depth > 32) invalid('xml_depth')
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (['NetworkLink', 'NetworkLinkControl'].includes(key)) invalid('external_link')
      // Only geometry and plain text survive conversion. Icons/overlays are never fetched.
      if (key === 'href') warnings.add('ignored_resource_reference')
      if (key === 'Placemark') {
        for (const placemark of many(value)) {
          for (const shape of geometry(placemark)) {
            if (features.length >= 1000) invalid('too_many_features')
            features.push({ type: 'Feature', id: `material-${features.length + 1}`, properties: {
              name: String(placemark.name ?? '').slice(0, 200), description: String(placemark.description ?? '').replace(/<[^>]*>/g, '').slice(0, 4000),
            }, geometry: shape })
          }
        }
      }
      for (const child of many(value)) walk(child, depth + 1)
    }
  }
  walk(parsed.kml)
  if (!features.length) invalid('no_supported_geometry')
  return { geojson: { type: 'FeatureCollection', features }, warnings: [...warnings], featureCount: features.length }
}
