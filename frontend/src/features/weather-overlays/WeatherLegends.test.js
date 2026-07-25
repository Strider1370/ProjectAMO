import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { entriesLeftToRight } from './lib/legendOrder.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, 'WeatherLegends.jsx'), 'utf8')
const css = fs.readFileSync(path.join(here, '../map/MapView.css'), 'utf8')

test('radar legend temporarily hides the motion toggle', () => {
  assert.match(source, /const radarMotionEnabled = false/)
  assert.match(source, /radarMotionEnabled && radarLegendVisible/)
  assert.match(css, /\.map-view-wrapper \.map-right-legends > \* \{[\s\S]*?pointer-events:\s*auto/)
})

test('all hooks run before the no-visible-legend return', () => {
  const effect = source.indexOf('useEffect(() =>')
  const emptyReturn = source.indexOf('&& !ctpsLegendVisible) return null')
  assert.ok(effect >= 0)
  assert.ok(emptyReturn > effect)
})

test('horizontal legends preserve ascending ramps and reverse only descending sources', () => {
  const ascending = [{ label: 'weak' }, { label: 'strong' }]
  const descending = [{ label: 'strong' }, { label: 'weak' }]
  assert.deepEqual(entriesLeftToRight(ascending).map((entry) => entry.label), ['weak', 'strong'])
  assert.deepEqual(entriesLeftToRight(descending, true).map((entry) => entry.label), ['weak', 'strong'])
})
