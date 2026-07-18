import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWeatherCode } from '../src/parsers/parse-utils.js'

test('parseWeatherCode rejects non-weather placeholders', () => {
  assert.equal(parseWeatherCode('NULL'), null)
  assert.deepEqual(parseWeatherCode('+TSRA'), { raw: '+TSRA', intensity: 'HEAVY', descriptor: 'TS', phenomena: ['RA'] })
})
