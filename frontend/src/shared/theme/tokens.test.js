import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CSS_VARS } from './tokens.js'

// tokens.css(:root)와 tokens.js(CSS_VARS)가 1:1로 일치하는지 강제 (드리프트 가드).
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
const parsed = {}
for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) parsed[m[1]] = m[2].trim()

test('tokens.css matches CSS_VARS in tokens.js exactly', () => {
  assert.deepEqual(parsed, CSS_VARS)
})

test('terminal signage scale keeps the approved physical-display values', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(CSS_VARS).filter(([name]) => name.startsWith('--signage-'))), {
    '--signage-title': '40px', '--signage-destination': '64px', '--signage-code': '34px',
    '--signage-flight': '48px', '--signage-primary': '56px', '--signage-temperature': '60px',
    '--signage-arrival': '40px', '--signage-clock': '36px', '--signage-status': '30px',
    '--signage-body': '28px', '--signage-label': '26px', '--signage-caption': '24px',
    '--signage-footer': '22px', '--signage-safe-x': '40px', '--signage-safe-y': '24px',
  })
})
