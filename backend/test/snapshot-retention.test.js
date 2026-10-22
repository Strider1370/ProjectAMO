import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// store를 읽으면 config가 base_path를 확정하므로 격리된 DATA_PATH를 먼저 세운다(notam-store.test.js와 같은 이유).
process.env.DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-retention-'))
const config = (await import('../src/config.js')).default
const { snapshotsToDelete } = await import('../src/store.js')

const at = (iso) => `METAR_${iso.replace(/[-:.]/g, '').replace('Z', '')}Z.json` // 2026-10-20T11:30:00.000Z → METAR_20261020T113000000Z.json
const NOW = Date.parse('2026-10-20T12:00:00.000Z')

test('METAR·TAF는 저장 시각으로 보관(METAR 6시간·TAF 30시간), 개수 상한은 안전판', () => {
  assert.equal(config.storage.max_age_hours_by_type.metar, 6)
  assert.equal(config.storage.max_age_hours_by_type.taf, 30)
  assert.equal(config.storage.max_age_hours_by_type.metar_overseas, 6)
  assert.equal(config.storage.max_age_hours_by_type.taf_overseas, 30)
  assert.ok(config.storage.max_files_by_type.metar >= 6 * 12, '5분마다 바뀌어도 6시간을 덮어야 한다')
})

test('보관 시간보다 오래된 것은 지우되 가장 최근 minKeep개는 남긴다', () => {
  const names = ['2026-10-20T11:55:00.000Z', '2026-10-20T09:00:00.000Z', '2026-10-20T05:59:00.000Z', '2026-10-20T01:00:00.000Z'].map(at)
  assert.deepEqual(snapshotsToDelete(names, { maxCount: 100, maxAgeMs: 6 * 3600_000, minKeep: 1, nowMs: NOW }), [at('2026-10-20T05:59:00.000Z'), at('2026-10-20T01:00:00.000Z')])
  // 수집이 멈춰 모두 오래됐어도 최근 minKeep개는 남는다.
  assert.deepEqual(snapshotsToDelete(names, { maxCount: 100, maxAgeMs: 3600_000, minKeep: 3, nowMs: NOW }), [at('2026-10-20T01:00:00.000Z')])
})

test('보관 시간이 없는 종류는 지금처럼 개수로만, 시각을 읽을 수 없는 이름은 시간으로 지우지 않는다', () => {
  const names = ['A_20261020T110000000Z.json', 'A_20261020T100000000Z.json', 'A_20261020T090000000Z.json']
  assert.deepEqual(snapshotsToDelete(names, { maxCount: 2, nowMs: NOW }), ['A_20261020T090000000Z.json'])
  assert.deepEqual(snapshotsToDelete(['weird.json'], { maxCount: 10, maxAgeMs: 1, nowMs: NOW }), [])
})
