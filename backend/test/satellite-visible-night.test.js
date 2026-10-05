import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { solarElevationDeg, maxSolarElevationDeg } from '../src/lib/solar-elevation.js'
import { processSatelliteVisible } from '../src/processors/satellite-visible-processor.js'
import { KO_DISPLAY_GRID } from '../src/lib/satellite-ko-grid.js'

const SEOUL = [37.57, 126.98]

test('solar elevation matches known Seoul values', () => {
  // 하지 정오(KST 12:30 무렵 남중) 약 75.9°, 자정은 지평선 아래 깊이.
  assert.ok(Math.abs(solarElevationDeg(Date.UTC(2026, 5, 21, 3, 30), ...SEOUL) - 75.9) < 0.6)
  assert.ok(solarElevationDeg(Date.UTC(2026, 9, 4, 15, 0), ...SEOUL) < -40)
  // 10월 초 서울 일몰(KST 18:10 무렵) 직후는 0° 근처.
  assert.ok(Math.abs(solarElevationDeg(Date.UTC(2026, 9, 4, 9, 10), ...SEOUL)) < 1.5)
})

function visibleDeps(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-visible-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const calls = []
  return {
    root, calls,
    deps: {
      root,
      config: { api: { radar_satellite_auth_key: 'radar-key' }, storage: { base_path: root }, satellite: { url: 'https://apihub.example/GK2A/LE1B', delay_minutes: 0, max_frames: 19 } },
      fetchNc: async (url) => { calls.push(url); return { status: 404 } },
    },
  }
}

test('a frame with the sun below -6° over the whole display area is recorded as night without downloading', async (t) => {
  const { deps, calls, root } = visibleDeps(t)
  // 2026-10-04 15:00 UTC = 자정 KST
  const result = await processSatelliteVisible({ now: new Date(Date.UTC(2026, 9, 4, 15, 0)), deps })
  assert.equal(result.reason, 'night')
  assert.deepEqual(calls, [])
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'satellite/visible/visible_meta.json'), 'utf8'))
  assert.deepEqual(meta.processedTms, ['202610050000'])
  assert.equal((await processSatelliteVisible({ now: new Date(Date.UTC(2026, 9, 4, 15, 0)), deps })).reason, 'already-collected')
})

test('daytime and twilight frames are still requested', async (t) => {
  const { deps, calls } = visibleDeps(t)
  await processSatelliteVisible({ now: new Date(Date.UTC(2026, 9, 4, 3, 0)), deps })
  assert.equal(calls.length, 1)
  // 서울 일몰 직후라도 영역 서쪽 끝(114°E)에는 아직 해가 남아 있어 받는다.
  const dusk = Date.UTC(2026, 9, 4, 9, 30)
  assert.ok(maxSolarElevationDeg(dusk, KO_DISPLAY_GRID.bounds) > -6)
  await processSatelliteVisible({ now: new Date(dusk), deps })
  assert.equal(calls.length, 2)
})
