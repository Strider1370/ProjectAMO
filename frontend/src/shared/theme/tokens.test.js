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
