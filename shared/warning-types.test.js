import { test } from 'node:test'
import assert from 'node:assert/strict'

import warningTypes, { warningNameKo } from './warning-types.js'

test('every airport warning type has a Korean name', () => {
  for (const type of Object.values(warningTypes)) assert.match(type.nameKo, /경보$/)
})

test('warningNameKo finds the Korean name by key, also for alerts stored with the English name', () => {
  assert.equal(warningNameKo({ wrng_type_key: 'WIND_SHEAR', wrng_type_name: 'Wind Shear Warning' }), '급변풍경보')
  assert.equal(warningNameKo({ wrng_type_key: 'STRONG_WIND' }), '강풍경보')
  assert.equal(warningNameKo({ wrng_type_key: 'UNKNOWN', wrng_type_name: 'Unknown Warning' }), 'Unknown Warning')
  assert.equal(warningNameKo(null), null)
})
