import assert from 'node:assert/strict'
import test from 'node:test'
import { hasIncompletePollingData, mergePollingData } from './pollingData.js'

test('mergePollingData replaces keys with normal payloads', () => {
  const previous = { metar: { content_hash: 'old' } }
  const changed = { metar: { content_hash: 'new' } }
  assert.deepEqual(mergePollingData(previous, changed), { metar: { content_hash: 'new' } })
})

test('mergePollingData preserves previous values for undefined (failed) keys', () => {
  const previous = { metar: { content_hash: 'old' }, sigwxFrontMeta: { tmfc: 'old' } }
  const changed = { metar: undefined, sigwxFrontMeta: undefined }
  assert.deepEqual(mergePollingData(previous, changed), previous)
})

test('mergePollingData treats HTTP 200 JSON null as a normal empty response', () => {
  const previous = { warning: { content_hash: 'old' } }
  const changed = { warning: null }
  assert.deepEqual(mergePollingData(previous, changed), { warning: null })
})

test('hasIncompletePollingData is true when any key failed', () => {
  assert.equal(hasIncompletePollingData({ metar: undefined, taf: { content_hash: 'x' } }), true)
  assert.equal(hasIncompletePollingData({ metar: null, taf: { content_hash: 'x' } }), false)
})
