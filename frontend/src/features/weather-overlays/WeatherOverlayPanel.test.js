import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, 'WeatherOverlayPanel.jsx'), 'utf8')

test('Echo Top button is controlled by the Vite feature flag', () => {
  assert.match(source, /VITE_ECHO_TOP_ENABLED/)
  assert.match(source, /echoTopEnabled/)
  assert.ok(source.includes("filter((id) => echoTopEnabled || id !== 'echoTop')"))
})

test('surface chart wind display is one title button that names the other mode', () => {
  assert.match(source, /surfaceChart: '강수'/)
  assert.match(source, /surfaceChart: CloudRain/)
  assert.ok(source.includes("visibility.surfaceChartWind === 'flow' ? '바람깃' : '애니메이션'"))
  assert.ok(source.includes("group.id === 'nwp' && visibility.surfaceChart && ("))
  assert.ok(source.includes("onToggle('surfaceChartWind')"))
  assert.doesNotMatch(source, /surface-chart-controls/)
})
