import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseOrganizationMapMaterial } from '../src/lib/organization-kml.js'
const wrap = body => Buffer.from(`<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`)

test('valid KML retains point, line and polygon coordinates as usable GeoJSON', () => {
  const result = parseOrganizationMapMaterial(wrap('<Placemark><name>현장</name><MultiGeometry><Point><coordinates>127,35,120</coordinates></Point><LineString><coordinates>126,35 127,36</coordinates></LineString><Polygon><outerBoundaryIs><LinearRing><coordinates>126,35 127,35 127,36 126,35</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark>'))
  assert.deepEqual(result.geojson.features.map(feature => feature.geometry.type), ['Point', 'LineString', 'Polygon'])
  assert.deepEqual(result.geojson.features[0].geometry.coordinates, [127, 35, 120])
})

function zipKml({ name = 'doc.kml', descriptor = false, size, crc } = {}) {
  const bytes = wrap('<Placemark><Point><coordinates>127,35</coordinates></Point></Placemark>')
  const compressed = zlib.deflateRawSync(bytes)
  const filename = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(descriptor ? 8 : 0, 6); local.writeUInt16LE(8, 8)
  local.writeUInt16LE(filename.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(descriptor ? 8 : 0, 8); central.writeUInt16LE(8, 10)
  central.writeUInt32LE(crc ?? zlib.crc32(bytes), 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(size ?? bytes.length, 24)
  central.writeUInt16LE(filename.length, 28)
  const dataDescriptor = descriptor ? Buffer.alloc(16) : Buffer.alloc(0)
  const start = local.length + filename.length + compressed.length + dataDescriptor.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(start, 16)
  return Buffer.concat([local, filename, compressed, dataDescriptor, central, filename, end])
}

test('KMZ reads deflated data-descriptor archives and rejects traversal, bomb metadata and corrupt bytes', () => {
  const mime = 'application/vnd.google-earth.kmz'
  for (const descriptor of [false, true]) assert.equal(parseOrganizationMapMaterial(zipKml({ descriptor }), mime).featureCount, 1)
  for (const input of [{ name: '../doc.kml' }, { size: 101 * 1024 * 1024 }, { crc: 1 }]) {
    assert.throws(() => parseOrganizationMapMaterial(zipKml(input), mime), /invalid_map_material/)
  }
})

test('server rejects malformed XML, invalid coordinates and remote resource variants', () => {
  for (const body of ['<Placemark><Point><coordinates>NaN,35</coordinates></Point></Placemark>', '<Placemark><Point><coordinates>181,35</coordinates></Point></Placemark>', '<Placemark><Point><coordinates>127,</coordinates></Point></Placemark>', '<NetworkLink><Link><href>https://example.org/remote</href></Link></NetworkLink>', '<Style><IconStyle><Icon><href>file:///secret</href></Icon></IconStyle></Style>', '<Placemark>']) {
    assert.throws(() => parseOrganizationMapMaterial(wrap(body)), /invalid_map_material/)
  }
  assert.throws(() => parseOrganizationMapMaterial(Buffer.from('<!DOCTYPE kml [<!ENTITY x SYSTEM "file:///secret">]><kml>&x;</kml>')), /invalid_map_material:xml/)
})

test('existing real KML fixture can be parsed without loading remote content', () => {
  const fixture = fs.readFileSync(new URL('./fixtures/notam-sample.kml', import.meta.url))
  const result = parseOrganizationMapMaterial(fixture)
  assert.ok(result.featureCount > 0)
  assert.deepEqual(result.warnings, ['ignored_resource_reference'])
  assert.equal(JSON.stringify(result.geojson).includes('http://aim.koca.go.kr'), false)
})
