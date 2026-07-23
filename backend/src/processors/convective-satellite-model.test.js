import assert from 'node:assert/strict'
import test from 'node:test'
import { CTPS_INVALID_HEIGHT, CTPS_INVALID_TEMPERATURE, decodeCtpsRecord, encodeCtpsBinary, normalizeCtps } from './convective-satellite-model.js'

test('CTPS normalization and binary retain valid values above UInt16 range', () => {
  const attrs = { width: 1, height: 2, pixelSize: 2000, ulEasting: -899000, ulNorthing: 899000, cthScale: 1, cthOffset: 0, cthFill: 65535, cttScale: 1, cttOffset: 0, cttFill: 65535, flagFill: 255 }
  const normalized = normalizeCtps({ cth: new Uint16Array([25000, 65535]), ctt: new Uint16Array([300, 65535]), flag: new Uint8Array([0, 255]), attrs })
  assert.ok(normalized.heightFt[0] > 65535); assert.equal(normalized.heightFt[1], CTPS_INVALID_HEIGHT); assert.equal(normalized.temperatureCentiC[1], CTPS_INVALID_TEMPERATURE)
  const binary = encodeCtpsBinary(normalized)
  assert.equal(decodeCtpsRecord(binary, 0).heightFt, normalized.heightFt[0]); assert.equal(decodeCtpsRecord(binary, 1), null); assert.throws(() => decodeCtpsRecord(Buffer.from('bad'), 0))
})
