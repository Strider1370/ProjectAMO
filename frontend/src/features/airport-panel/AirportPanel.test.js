import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import airports from '../../../../shared/airports.js'
import { formatElevationFt } from './lib/formatters.js'

const source = readFileSync(new URL('./AirportPanel.jsx', import.meta.url), 'utf8')

test('AirportPanel calls hooks before returning for no selected airport', () => {
  const effectIndex = source.indexOf('useEffect(')
  const emptyReturnIndex = source.indexOf('if (!airport) return null')

  assert.ok(effectIndex >= 0)
  assert.ok(emptyReturnIndex >= 0)
  assert.ok(effectIndex < emptyReturnIndex)
})

test('domestic airports carry official elevation in feet', () => {
  const expectedElevationFt = {
    RKSI: 23,
    RKSS: 59,
    RKPC: 118,
    RKPK: 13,
    RKTU: 192,
    RKTN: 120,
    RKTH: 75,
    RKJB: 52,
    RKJJ: 49,
    RKJK: 29,
    RKJY: 52,
    RKNW: 330,
    RKPS: 26,
    RKPU: 43,
    RKNY: 240,
  }

  assert.deepEqual(
    Object.fromEntries(airports.map(({ icao, elevation_ft }) => [icao, elevation_ft])),
    expectedElevationFt,
  )
})

test('AirportPanel places the domestic operations strip in the lower-right header area', () => {
  const headerIndex = source.indexOf('<header className="airport-panel-head">')
  const stripIndex = source.indexOf('<AirportOperationsStrip', headerIndex)
  const headerEndIndex = source.indexOf('</header>', headerIndex)

  assert.ok(stripIndex > headerIndex)
  assert.ok(stripIndex < headerEndIndex)
  assert.match(source, /if \(airport\?\.overseas\) return null/)
})

test('formats missing airport elevation with the shared panel fallback', () => {
  assert.equal(formatElevationFt(23), '23 ft')
  assert.equal(formatElevationFt(undefined), '-')
})
