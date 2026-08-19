import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

test('signage weekly forecast reuses the hourly icon band background and icon shadow', () => {
  assert.match(css, /\.ghs-iconband\s*\{\s*fill:\s*#f2eee6;/)
  assert.match(css, /\.ground-weekly-table\s*\[data-weekly-period\]\s*\{[^}]*background:\s*#f2eee6;/)
  assert.match(css, /\.ground-weekly-table\s*\[data-weekly-period\]\.is-precip\s*\{\s*background:\s*rgba\(186,230,253,\.72\);/)
  assert.match(css, /\[data-hourly-icon\]\s*\{[^}]*filter:\s*drop-shadow\(0 3px 6px rgba\(0, 0, 0, 0\.16\)\);/)
  assert.match(css, /\.ground-weekly-icon\.weather-icon-wrapper\s*\{[^}]*filter:\s*drop-shadow\(0 3px 6px rgba\(0, 0, 0, 0\.16\)\);/)
})
