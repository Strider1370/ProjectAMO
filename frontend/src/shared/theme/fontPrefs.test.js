import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldLoadStoredFont } from './fontPrefs.js'

test('terminal route bypasses stored font preferences and their remote stylesheet requests', () => {
  assert.equal(shouldLoadStoredFont('/terminal'), false)
  assert.equal(shouldLoadStoredFont('/terminal/'), true)
  assert.equal(shouldLoadStoredFont('/terminal-help'), true)
  assert.equal(shouldLoadStoredFont('/'), true)
})
