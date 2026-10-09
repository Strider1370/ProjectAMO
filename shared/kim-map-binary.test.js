import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeKimMapBinary, encodeKimMapBinary, isKimMapBinary } from './kim-map-binary.js'

const grid = { nx: 4, ny: 3, lonMin: 90, lonMax: 90.25, latMin: 6, latMax: 6.166 }

test('round-trips a KIM map payload exactly like JSON, whatever the array kinds', () => {
  const payload = {
    type: 'kim_nwp_temperature', grid, level: { id: '700hPa' }, belowGround: 'AAAA', stats: { min: 1.5 },
    T: [27728, 27734, -32768, 27748, 27754, 27758, 27760, 27701, 27702, 27703, 27704, -32768],
    gktg: [0, 0.219, null, 0.34, 0.15, 1.499, null, 0, 0.001, 0.2, 0.22, 0.05],
    geopotentialHeight: [3100, 3101, null, 3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110, 3111],
    big: [70000, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null],
    fraction: [0.12345, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    short: [1, 2, 3],
  }
  for (const measure of [null, (bytes) => bytes.length]) {
    const bytes = encodeKimMapBinary(payload, { measure })
    assert.ok(isKimMapBinary(bytes))
    assert.deepStrictEqual(decodeKimMapBinary(bytes), JSON.parse(JSON.stringify(payload)))
    assert.deepStrictEqual(decodeKimMapBinary(bytes.buffer.slice(0)), JSON.parse(JSON.stringify(payload)))
  }
  assert.throws(() => decodeKimMapBinary(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /Not a KIM map binary/)
})
