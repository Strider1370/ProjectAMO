import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('./useRouteBriefing.js', import.meta.url), 'utf8')

test('switching route designs preserves the previous route draft', () => {
  const selectRouteDesign = source.match(/function selectRouteDesign\(id\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''
  assert.doesNotMatch(selectRouteDesign, /draftEditor:\s*null/)
  assert.match(selectRouteDesign, /pendingEdit:\s*null/)
})

test('touch route drops retain their coordinate and confirmation apply commits the draft', () => {
  const handleDrop = source.match(/async function handleDesignWaypointDrop\([\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(handleDrop, /snapToNavpoint\s*===\s*false/)
  assert.match(handleDrop, /applySelectedDesignDraft\(\{ designId: design\.id, draft: proposed\.editor \}\)/)
})
