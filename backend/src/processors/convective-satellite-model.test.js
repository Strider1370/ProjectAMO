import assert from 'node:assert/strict'
import test from 'node:test'
import { CTPS_INVALID_HEIGHT, CTPS_INVALID_TEMPERATURE, buildCiFeatureCollection, decodeCtpsRecord, encodeCtpsBinary, normalizeCtps } from './convective-satellite-model.js'
import { enToLatLon } from '../lib/lcc-projection.js'

test('CTPS normalization and binary retain valid values above UInt16 range', () => {
  const attrs = { width: 1, height: 2, pixelSize: 2000, ulEasting: -899000, ulNorthing: 899000, cthScale: 1, cthOffset: 0, cthFill: 65535, cttScale: 1, cttOffset: 0, cttFill: 65535, flagFill: 255 }
  const normalized = normalizeCtps({ cth: new Uint16Array([25000, 65535]), ctt: new Uint16Array([300, 65535]), flag: new Uint8Array([0, 255]), attrs })
  assert.ok(normalized.heightFt[0] > 65535); assert.equal(normalized.heightFt[1], CTPS_INVALID_HEIGHT); assert.equal(normalized.temperatureCentiC[1], CTPS_INVALID_TEMPERATURE)
  const binary = encodeCtpsBinary(normalized)
  assert.equal(decodeCtpsRecord(binary, 0).heightFt, normalized.heightFt[0]); assert.equal(decodeCtpsRecord(binary, 1), null); assert.throws(() => decodeCtpsRecord(Buffer.from('bad'), 0))
})

function pointInRing([x, y], ring) { let inside = false; for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) { const [xi, yi] = ring[index], [xj, yj] = ring[previous]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside } return inside }
function pointInMultiPolygon(point, coordinates) { return coordinates.some((rings) => pointInRing(point, rings[0]) && !rings.slice(1).some((ring) => pointInRing(point, ring))) }
test('CI native Lambert contours cover every valid source signal cell', () => {
  const attrs = { width: 3, height: 3, pixelSize: 2000, ulEasting: -899000, ulNorthing: 899000, signalFill: 255, dqfFill: 255 }
  const parsed = { signal: new Uint8Array([0, 0, 0, 0, 3, 0, 0, 0, 4]), dqf: new Uint8Array(9), attrs }
  const features = new Map(buildCiFeatureCollection(parsed).features.map((feature) => [feature.properties.signal, feature.geometry.coordinates]))
  for (const [index, signal] of [[4, 3], [8, 4]]) { const row = Math.floor(index / attrs.width), col = index % attrs.width, [lat, lon] = enToLatLon(attrs.ulEasting + col * attrs.pixelSize, attrs.ulNorthing - row * attrs.pixelSize); assert.ok(pointInMultiPolygon([lon, lat], features.get(signal))) }
})
