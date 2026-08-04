import assert from 'node:assert/strict'
import test from 'node:test'
import { hasIncompletePollingData, mergePollingData } from './pollingData.js'
import { loadChangedWeatherData } from '../api/weatherApi.js'

function installFetchRecorder() {
  const calls = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return { ok: true, json: async () => ({ tm: '202608041705' }) }
  }
  return { calls, restore: () => { globalThis.fetch = previousFetch } }
}

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

test('loadChangedWeatherData fetches only the changed graphics metadata', async () => {
  const recorder = installFetchRecorder()
  try {
    const wissdom = await loadChangedWeatherData({ wissdomMeta: true, qpfMeta: false })
    const qpf = await loadChangedWeatherData({ wissdomMeta: false, qpfMeta: true })

    assert.deepEqual(wissdom, { wissdomMeta: { tm: '202608041705' } })
    assert.deepEqual(qpf, { qpfMeta: { tm: '202608041705' } })
    assert.deepEqual(recorder.calls, [
      '/data/radar/wissdom/wissdom_meta.json',
      '/data/radar/qpf/qpf_meta.json',
    ])
  } finally {
    recorder.restore()
  }
})

test('mergePollingData retains known-good graphics metadata when its refresh fails', () => {
  const previous = {
    wissdomMeta: { type: 'WISSDOM', updatedAt: '2026-08-04T08:00:00Z' },
    qpfMeta: { type: 'QPF', updatedAt: '2026-08-04T08:00:00Z' },
  }
  const changed = { wissdomMeta: undefined, qpfMeta: { type: 'QPF', updatedAt: '2026-08-04T08:05:00Z' } }

  assert.deepEqual(mergePollingData(previous, changed), {
    wissdomMeta: previous.wissdomMeta,
    qpfMeta: changed.qpfMeta,
  })
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
