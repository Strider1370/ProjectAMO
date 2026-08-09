// 레이더/위성 키의 일일 5GB 한도를 태운 "받아놓고 저장하지 않아 매 주기 다시 받는" 경로를 막는다.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { processSatelliteVisible } from '../src/processors/satellite-visible-processor.js'
import { needsFogRefetch } from '../src/processors/satellite-processor.js'

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'amo-sat-'))

// 밤 프레임(균일한 어두운 잡음)을 흉내낸다. 실제 운영 01:50 프레임이 평균 21·최대 27이었다.
const nightGrid = () => ({
  data: new Uint16Array(4).fill(200),
  attrs: { width: 2, height: 2, pixelSize: 2000, ulEasting: -1000000, ulNorthing: 1000000 },
})

function depsFor(dataRoot, counter) {
  return {
    root: dataRoot,
    config: {
      api: { radar_satellite_auth_key: 'test-key' },
      satellite: { url: 'https://example.invalid/GK2A/LE1B', delay_minutes: 20, timeout_ms: 1000 },
      storage: { base_path: dataRoot },
    },
    fetchNc: async () => { counter.calls += 1; return Buffer.from('not-really-netcdf') },
    parseNc: async () => nightGrid(),
  }
}

test('a night frame is downloaded once, not on every collection cycle', async () => {
  const dataRoot = root(), counter = { calls: 0 }
  const deps = depsFor(dataRoot, counter)
  const now = new Date('2026-08-09T16:55:00Z') // KST 01:55 — 밤

  const first = await processSatelliteVisible({ now, deps })
  assert.equal(first.reason, 'night', '밤 프레임은 저장하지 않는다')
  assert.equal(counter.calls, 1)

  // 같은 관측시각을 겨냥한 다음 주기. 저장된 그림이 없어도 다시 받아서는 안 된다.
  const second = await processSatelliteVisible({ now: new Date(now.getTime() + 60_000), deps })
  assert.equal(second.reason, 'already-collected')
  assert.equal(counter.calls, 1, '같은 시각의 VI006를 두 번 내려받으면 안 된다')

  // 다음 관측시각이 오면 다시 받는다 — 상한이 수집 자체를 멈춰서는 안 된다.
  await processSatelliteVisible({ now: new Date(now.getTime() + 10 * 60_000), deps })
  assert.equal(counter.calls, 2)
})

test('FOG-less frames stop being re-fetched once the attempt cap is reached', () => {
  assert.equal(needsFogRefetch({ fogPixelCount: 12 }), false, 'FOG가 있으면 다시 받지 않는다')
  assert.equal(needsFogRefetch({ fogPixelCount: null }), true, '첫 실패는 다시 시도한다')
  assert.equal(needsFogRefetch({ fogPixelCount: null, fogAttempts: 1 }), true)
  assert.equal(needsFogRefetch({ fogPixelCount: null, fogAttempts: 2 }), false, '상한에 닿으면 포기한다')
  assert.equal(needsFogRefetch(undefined), false)
})
