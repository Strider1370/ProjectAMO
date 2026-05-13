import test from 'node:test'
import assert from 'node:assert/strict'
import { getPlaybackDelayMs } from './weatherTimeline.js'

test('getPlaybackDelayMs converts playback speed to interval delay', () => {
  assert.equal(getPlaybackDelayMs(0.5), 1600)
  assert.equal(getPlaybackDelayMs(1), 800)
  assert.equal(getPlaybackDelayMs(2), 400)
  assert.equal(getPlaybackDelayMs(4), 200)
})
