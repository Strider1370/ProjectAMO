import assert from 'node:assert/strict'
import test from 'node:test'

import { versionedAsset } from './versionedAsset.js'

test('without a build id the static data url is unchanged', () => {
  assert.equal(versionedAsset('/data/airports.geojson'), '/data/airports.geojson')
  assert.equal(versionedAsset(null), null)
})
