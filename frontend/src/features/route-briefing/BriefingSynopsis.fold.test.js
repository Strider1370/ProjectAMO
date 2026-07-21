import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./BriefingSynopsis.jsx', import.meta.url), 'utf8')

test('keeps sample weather charts collapsed by default', () => {
  assert.match(source, /<details className="bv-syn-fold">/)
  assert.match(source, /<summary className="bv-syn-fold-summary">/)
})
