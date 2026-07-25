import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, 'EchoTopCard.jsx'), 'utf8')

test('echo top card conditionally renders observation time when it exists', () => {
  assert.ok(source.includes('{value.observedAt && <span className="convective-overlay-card__time">'))
  assert.ok(source.includes('관측 {formatObservedAt(value.observedAt, tz)} {tz}'))
})

test('echo top card does not render time label when observedAt is missing', () => {
  // The conditional guard {value.observedAt && ...} prevents dangling "관측  KST" label
  assert.ok(source.includes('{value.observedAt &&'), 'must have conditional guard for observation time')
})
