import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('./useRouteBriefing.js', import.meta.url), 'utf8')

test('switching route designs preserves the previous route draft', () => {
  const selectRouteDesign = source.match(/function selectRouteDesign\(id\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''
  assert.doesNotMatch(selectRouteDesign, /draftEditor:\s*null/)
  assert.match(selectRouteDesign, /pendingEdit:\s*null/)
})
