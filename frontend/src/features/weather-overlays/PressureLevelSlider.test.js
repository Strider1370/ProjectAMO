import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, 'PressureLevelSlider.jsx'), 'utf8')
const css = fs.readFileSync(path.join(here, '../map/MapView.css'), 'utf8')

test('pressure slider keeps its labels out of the drag hit target', () => {
  assert.match(source, /aria-orientation="vertical"/)
  assert.match(source, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.match(css, /\.pressure-level-slider__track \* \{ pointer-events: none;[^}]*user-select: none;/)
})

test('pressure slider places the active FL and pressure label beside the thumb', () => {
  assert.match(source, /pressure-level-slider__value/)
  assert.match(source, /formatPressureFlightLevel\(active\.value\)/)
  assert.match(source, /\{active\.value\} hPa/)
  assert.match(css, /\.pressure-level-slider__value \{[\s\S]*?right: calc\(50% \+ 14px\)/)
})
