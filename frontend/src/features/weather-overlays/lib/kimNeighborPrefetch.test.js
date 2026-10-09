import test from 'node:test'
import assert from 'node:assert/strict'

import { kimNeighborSelections, prefetchKimNeighbors, resetKimNeighborPrefetch } from './kimNeighborPrefetch.js'

const INDEX = {
  latestRun: '2026100906',
  times: [{ hf: 0 }, { hf: 1 }, { hf: 2 }, { hf: 24 }, { hf: 27 }],
  levels: [{ id: '10m' }, { id: '850hPa' }, { id: '700hPa' }, { id: '500hPa' }],
}
const anything = () => true
const selection = { domain: 'ea', tmfc: '2026100906', hf: 1, level: '700hPa' }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function fakeFetch() {
  const calls = []
  const fetchImpl = async (url, options) => { calls.push({ url, priority: options?.priority }); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } }
  return { calls, fetchImpl }
}

test('neighbours are the next and previous forecast hour and the levels above and below that exist', () => {
  assert.deepEqual(kimNeighborSelections({ index: INDEX, selection, canRequest: anything }).map(({ hf, level }) => `${hf}/${level}`),
    ['2/700hPa', '0/700hPa', '1/500hPa', '1/850hPa'])
  // 24h 다음은 3시간 간격 27h. 마지막 시각·맨 위 고도에서는 그쪽 이웃이 없다.
  assert.deepEqual(kimNeighborSelections({ index: INDEX, selection: { ...selection, hf: 27, level: '500hPa' }, canRequest: anything }).map(({ hf, level }) => `${hf}/${level}`),
    ['24/500hPa', '27/700hPa'])
  // 없는 장(예: 구름 레이어의 10 m)은 고르지 않는다.
  assert.deepEqual(kimNeighborSelections({ index: INDEX, selection: { ...selection, level: '850hPa' }, canRequest: (_, c) => c.level !== '10m' }).map(({ hf, level }) => `${hf}/${level}`),
    ['2/850hPa', '0/850hPa', '1/700hPa'])
})

test('prefetch fetches the binary files one by one at low priority, replaces a layer queue on the next move and never refetches', async () => {
  resetKimNeighborPrefetch()
  const { calls, fetchImpl } = fakeFetch()
  const urls = prefetchKimNeighbors({ type: 'icing', index: INDEX, selection, canRequest: anything, fetchImpl })
  assert.equal(urls.length, 4)
  assert.match(urls[0], /^\/data\/kim_nwp_ea\/runs\/KIMG_NE57_2026100906\/derived\/map-bin\/icing-below-ground-v1\/700hPa\/hf002\.bin\.gz$/)
  await flush(); await flush(); await flush(); await flush(); await flush()
  assert.deepEqual(calls.map((call) => call.url), urls)
  assert.ok(calls.every((call) => call.priority === 'low'))
  // 이미 받은 이웃(+2h)은 다시 받지 않는다.
  const again = prefetchKimNeighbors({ type: 'icing', index: INDEX, selection: { ...selection, hf: 2 }, canRequest: anything, fetchImpl })
  assert.ok(!again.some((url) => url.includes('hf001.bin.gz') && url.includes('/700hPa/')))
  assert.ok(again.some((url) => url.includes('/hf024.bin.gz')))
})

test('GKTG neighbours use their own revision in the file name; pinned selections and save-data are skipped', () => {
  resetKimNeighborPrefetch()
  const { fetchImpl } = fakeFetch()
  const revisionFor = (candidate) => (candidate.hf === 2 ? 'abc123' : candidate.hf === 1 && candidate.level === '700hPa' ? 'cur999' : null)
  const urls = prefetchKimNeighbors({ type: 'gktg', index: INDEX, selection, canRequest: anything, revisionFor, fetchImpl })
  assert.deepEqual(urls, ['/data/kim_nwp_ea/runs/KIMG_NE57_2026100906/derived/map-bin/gktg-abc123-below-ground-v2-q3/700hPa/hf002.bin.gz'])
  assert.deepEqual(prefetchKimNeighbors({ type: 'icing', index: INDEX, selection: { ...selection, revision: 'pinned' }, canRequest: anything, fetchImpl }), [])
  const saved = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', { value: { connection: { saveData: true } }, configurable: true })
  try {
    assert.deepEqual(prefetchKimNeighbors({ type: 'temp', index: INDEX, selection, canRequest: anything, fetchImpl }), [])
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true })
  }
})
