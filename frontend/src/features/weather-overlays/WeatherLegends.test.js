import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, 'WeatherLegends.jsx'), 'utf8')
const css = fs.readFileSync(path.join(here, '../map/MapView.css'), 'utf8')

test('radar legend temporarily hides the motion toggle', () => {
  assert.match(source, /const radarMotionEnabled = false/)
  assert.match(source, /radarMotionEnabled && radarLegendVisible/)
  assert.match(css, /\.map-view-wrapper \.map-right-legends > \* \{[\s\S]*?pointer-events:\s*auto/)
})
