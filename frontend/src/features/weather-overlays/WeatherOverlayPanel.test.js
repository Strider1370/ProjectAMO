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
