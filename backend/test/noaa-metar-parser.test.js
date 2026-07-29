import assert from 'node:assert/strict'
import test from 'node:test'
import noaaMetarParser from '../src/parsers/noaa-metar-parser.js'

test('NOAA station ICAO is not parsed as present weather', () => {
  const parsed = noaaMetarParser.parse({
    icaoId: 'ZSSS',
    rawOb: 'METAR ZSSS 291430Z 23008KT 9999 SCT033 36/24 Q1009=',
    wdir: '230', wspd: 8, visib: '6+',
  })

  assert.deepEqual(parsed.observation.weather, [])
  assert.equal(parsed.observation.display.weather, '')
})

test('NOAA trend forecast weather is not parsed as present weather', () => {
  const parsed = noaaMetarParser.parse({
    icaoId: 'RJBB',
    rawOb: 'METAR RJBB 291430Z 27010KT 9999 FEW020 BKN100 31/26 Q1007 TEMPO TS=',
    wdir: '270', wspd: 10, visib: '6+',
  })

  assert.deepEqual(parsed.observation.weather, [])
  assert.equal(parsed.observation.display.weather, '')
})
