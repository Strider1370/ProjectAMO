import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createApiHubUsage } from '../src/api-hub-usage.js'

async function withUsage(keys, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'projectamo-api-hub-'))
  try {
    await run(createApiHubUsage({ root, keys }), root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('aggregates categories that share one key and resets at KST midnight', async () => {
  await withUsage({ aviation: 'same-key', radar_satellite: 'same-key', kim_nwp: 'kim-key' }, async (usage) => {
    const beforeMidnight = Date.parse('2026-08-09T14:59:59Z')
    await usage.record('same-key', { bytes: 125, status: 200, endpoint: 'metar', now: beforeMidnight })
    await usage.record('same-key', { bytes: 75, status: 200, endpoint: 'radar_echo', now: beforeMidnight })

    const before = usage.snapshot({ now: beforeMidnight })
    assert.equal(before.keys.find((key) => key.category === 'aviation').bytes, 200)
    assert.equal(before.keys.find((key) => key.category === 'radar_satellite').bytes, 200)
    assert.equal(before.keys.find((key) => key.category === 'aviation').dayKst, '2026-08-09')

    const after = usage.snapshot({ now: Date.parse('2026-08-09T15:00:00Z') })
    assert.equal(after.keys.find((key) => key.category === 'aviation').bytes, 0)
    assert.equal(after.keys.find((key) => key.category === 'aviation').dayKst, '2026-08-10')
  })
})

test('blocks at the five-percent margin before another request and never persists a secret', async () => {
  await withUsage({ aviation: 'private-key', radar_satellite: '', kim_nwp: '' }, async (usage, root) => {
    await usage.record('private-key', { bytes: 4_750_000_000, status: 200, endpoint: 'metar' })
    assert.throws(() => usage.assertAllowed('private-key'), { code: 'api_hub_budget_blocked' })
    assert.equal(usage.snapshot().keys[0].blockedReason, 'daily_budget')
    assert.doesNotMatch(await readFile(path.join(root, 'api-hub-usage.json'), 'utf8'), /private-key/)
  })
})

test('blocks a key immediately when KMA returns 403', async () => {
  await withUsage({ aviation: 'aviation-key', radar_satellite: '', kim_nwp: '' }, async (usage) => {
    await usage.record('aviation-key', { bytes: 12, status: 403, endpoint: 'metar' })
    assert.equal(usage.snapshot().keys[0].blockedReason, 'upstream_403')
    assert.throws(() => usage.assertAllowed('aviation-key'), { code: 'api_hub_budget_blocked' })
  })
})

test('attributes aviation-key KIM grid and KTG usage to the aviation category', async () => {
  await withUsage({ aviation: 'aviation-key', radar_satellite: 'radar-key', kim_nwp: 'kim-key' }, async (usage) => {
    await usage.record('aviation-key', { bytes: 120, status: 200, endpoint: 'kim_grid' })
    await usage.record('aviation-key', { bytes: 80, status: 200, endpoint: 'ktg' })

    const snapshot = usage.snapshot()
    const aviation = snapshot.keys.find((key) => key.category === 'aviation')
    const kim = snapshot.keys.find((key) => key.category === 'kim_nwp')
    assert.deepEqual(aviation.endpoints.map(({ label, bytes }) => [label, bytes]), [['KIM 격자', 120], ['KTG 격자', 80]])
    assert.equal(kim.bytes, 0)
  })
})

test('rejects a fourth credential and unknown endpoint without retaining query text', async () => {
  await withUsage({ aviation: 'aviation-key', radar_satellite: 'radar-key', kim_nwp: 'kim-key' }, async (usage, root) => {
    assert.throws(() => usage.assertAllowed('fourth-key'), { code: 'unknown_api_hub_credential' })
    await assert.rejects(() => usage.record('aviation-key', {
      bytes: 1,
      status: 200,
      endpoint: 'https://apihub.kma.go.kr/x?authKey=private-key',
    }), { code: 'unknown_api_hub_endpoint' })
    assert.equal(usage.snapshot().keys[0].endpoints.length, 0)
    const persisted = await readFile(path.join(root, 'api-hub-usage.json'), 'utf8').catch(() => '')
    assert.doesNotMatch(persisted, /authKey|private-key/)
  })
})

test('returns API endpoints sorted by received bytes after restart recovery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'projectamo-api-hub-'))
  try {
    const keys = { aviation: 'aviation-key', radar_satellite: '', kim_nwp: '' }
    const usage = createApiHubUsage({ root, keys })
    await usage.record('aviation-key', { bytes: 25, status: 200, endpoint: 'metar' })
    await usage.record('aviation-key', { bytes: 100, status: 200, endpoint: 'taf' })
    const recovered = createApiHubUsage({ root, keys })
    assert.deepEqual(recovered.snapshot().keys[0].endpoints.map(({ label, bytes }) => [label, bytes]), [['TAF', 100], ['METAR', 25]])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
