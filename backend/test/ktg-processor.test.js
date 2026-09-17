import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import config from '../src/config.js'
import { buildKtgUrl, process as processKtg, selectKtgRunCredential } from '../src/processors/ktg-processor.js'
import { KTG_ALT_LEVELS_FT, KTG_FORECAST_HOURS } from '../src/processors/ktg-model.js'
import {
  isKtgHfComplete,
  readKtgHfCompletion,
  readKtgIndex,
  readKtgLatest,
  resolveKtgGridPath,
  writeKtgCoords,
  writeKtgGrid,
  writeKtgIndex,
  writeKtgLatest,
} from '../src/processors/ktg-store.js'

function writeUsableKtgHf(root, { tmfc, hf, altLevelsFt = KTG_ALT_LEVELS_FT }) {
  writeKtgCoords({ root, tmfc, hf, coords: {
    type: 'ktg_coords', ny: 1, nx: 1, lat: [37], lon: [126],
  } })
  for (const altFt of altLevelsFt) {
    writeKtgGrid({ root, grid: {
      type: 'ktg_grid', tmfc, hf, altFt, validTime: '2026-09-10T06:00:00.000Z',
      grid: { ny: 1, nx: 1 }, ktg: [0.4], fetched_at: '2026-09-10T00:00:00.000Z',
    } })
  }
}

function parsedKtgHf() {
  return {
    nz: 1,
    ny: 1,
    nx: 1,
    lat: new Float32Array([37]),
    lon: new Float32Array([126]),
    alt: new Float32Array([1000]),
    ktg: new Float32Array([0.4]),
  }
}

test('KTG only collects source-supported +6, +9, and +12 forecast hours', () => {
  assert.deepEqual(KTG_FORECAST_HOURS, [6, 9, 12])
  assert.deepEqual(config.ktg.forecast_hours, [6, 9, 12])
})

test('buildKtgUrl puts the selected run credential in the request', () => {
  const url = new URL(buildKtgUrl({ tmfc: '2026081818', ef: 6, credential: 'aviation-key' }))
  assert.equal(url.searchParams.get('tmfc'), '2026081818')
  assert.equal(url.searchParams.get('ef'), '06')
  assert.equal(url.searchParams.get('authKey'), 'aviation-key')
})

test('KTG selects the aviation credential only for 18Z and rejects an unsafe fallback', () => {
  const originalKim = config.api.kim_nwp_auth_key
  const originalAviation = config.api.auth_key
  try {
    config.api.kim_nwp_auth_key = 'kim-key'
    config.api.auth_key = 'aviation-key'
    assert.equal(selectKtgRunCredential('2026081812'), 'kim-key')
    assert.equal(selectKtgRunCredential('2026081818'), 'aviation-key')

    config.api.auth_key = 'kim-key'
    assert.throws(() => selectKtgRunCredential('2026081818'), { code: 'kim_18z_aviation_credential_unavailable' })
  } finally {
    config.api.kim_nwp_auth_key = originalKim
    config.api.auth_key = originalAviation
  }
})

test('KTG completion rejects coords-only, missing, corrupt, and partial legacy grids', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'projectamo-ktg-completion-'))
  const tmfc = '2026091000'
  const hf = 6
  try {
    writeKtgCoords({ root, tmfc, hf, coords: { type: 'ktg_coords', ny: 1, nx: 1, lat: [37], lon: [126] } })
    assert.equal(isKtgHfComplete({ root, tmfc, hf }), false, 'coords-only is incomplete')

    writeKtgGrid({ root, grid: {
      type: 'ktg_grid', tmfc, hf, altFt: KTG_ALT_LEVELS_FT[0], grid: { ny: 1, nx: 1 }, ktg: [0.4],
    } })
    writeKtgIndex(root, { tmfc, hf, altLevelsFt: [KTG_ALT_LEVELS_FT[0]] })
    assert.equal(isKtgHfComplete({ root, tmfc, hf }), false, 'a partial altitude set is incomplete even with a partial index')

    writeUsableKtgHf(root, { tmfc, hf })
    assert.equal(isKtgHfComplete({ root, tmfc, hf }), true, 'complete legacy data has no marker requirement')

    fs.writeFileSync(resolveKtgGridPath({ root, tmfc, hf, altFt: 3000 }), '{not json', 'utf8')
    assert.equal(isKtgHfComplete({ root, tmfc, hf }), false, 'a corrupt grid is incomplete')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('KTG retries an incomplete hour, publishes only after all grids, then skips the completed retry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'projectamo-ktg-retry-'))
  const tmfc = '2026091000'
  const hf = 6
  let fetches = 0
  try {
    // Represents a process interrupted after its first grid write: no marker.
    writeUsableKtgHf(root, { tmfc, hf, altLevelsFt: [1000] })
    assert.equal(isKtgHfComplete({ root, tmfc, hf }), false)

    const options = {
      root,
      candidates: [tmfc],
      forecastHours: [hf],
      single: false,
      nowMs: () => Date.parse('2026-09-10T01:00:00.000Z'),
      fetchFile: async () => { fetches += 1; return Buffer.from('fixture') },
      parseFile: parsedKtgHf,
    }
    const collected = await processKtg(options)
    assert.equal(fetches, 1)
    assert.equal(collected.hours, 1)
    assert.equal(isKtgHfComplete({ root, tmfc, hf }), true)
    assert.deepEqual(readKtgHfCompletion({ root, tmfc, hf }).altLevelsFt, [1000])

    const retried = await processKtg(options)
    assert.equal(retried.reason, 'already_collected')
    assert.equal(fetches, 1, 'the completion marker prevents an unnecessary third download')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('KTG keeps the existing legacy index/latest when an incomplete newer candidate cannot be retried', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'projectamo-ktg-last-good-'))
  const oldTmfc = '2026091000'
  const newTmfc = '2026091006'
  const hf = 6
  try {
    writeUsableKtgHf(root, { tmfc: oldTmfc, hf })
    const index = {
      type: 'ktg_index', tmfc: oldTmfc, hf, validTime: '2026-09-10T06:00:00.000Z',
      hours: [{ hf, validTime: '2026-09-10T06:00:00.000Z' }], altLevelsFt: KTG_ALT_LEVELS_FT,
    }
    const latest = { type: 'ktg_latest', tmfc: oldTmfc, hf, validTime: '2026-09-10T06:00:00.000Z' }
    writeKtgIndex(root, index)
    writeKtgLatest(root, latest)

    await assert.rejects(() => processKtg({
      root, candidates: [newTmfc], forecastHours: [hf], single: false,
      fetchFile: async () => { throw new Error('upstream unavailable') }, parseFile: parsedKtgHf,
    }), /no valid candidate/)

    assert.deepEqual(readKtgIndex(root), index)
    assert.deepEqual(readKtgLatest(root), latest)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('KTG recognizes a complete legacy hour without re-downloading it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'projectamo-ktg-legacy-'))
  const tmfc = '2026091000'
  const hf = 6
  try {
    writeUsableKtgHf(root, { tmfc, hf })
    writeKtgIndex(root, { tmfc, hf, hours: [{ hf }], altLevelsFt: KTG_ALT_LEVELS_FT })
    writeKtgLatest(root, { tmfc, hf })

    const result = await processKtg({
      root, candidates: [tmfc], forecastHours: [hf], single: false,
      fetchFile: async () => { throw new Error('complete legacy data must not download') }, parseFile: parsedKtgHf,
    })
    assert.equal(result.reason, 'already_collected')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
