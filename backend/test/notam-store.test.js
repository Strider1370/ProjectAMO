import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// store.save()는 config.storage.base_path에 실제 파일을 쓴다. 기본값이 backend/data라서
// 격리 없이 부르면 테스트가 돌 때마다 운영 스냅샷(latest.json)이 items:[]로 덮이고,
// rotateFiles가 진짜 NOTAM 파일까지 밀어낸다 — 앱에서 NOTAM이 통째로 사라진다.
// config는 import 시점에 base_path를 확정하므로 DATA_PATH를 먼저 세우고 동적 import한다.
// (node --test는 파일당 별도 프로세스라 다른 테스트의 config 캐시와 섞이지 않는다.)
process.env.DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-notam-store-'))
const config = (await import('../src/config.js')).default
const store = (await import('../src/store.js')).default

test('config.notam exists with 24h horizon', () => {
  assert.equal(config.notam.horizon_hours, 24)
  assert.ok(Array.isArray(config.notam.fir_codes))
  assert.ok(config.notam.fir_codes.includes('RKRR'))
  assert.equal(typeof config.schedule.notam_interval, 'string')
})

test("store.save('notam') does not throw (type registered)", () => {
  assert.doesNotThrow(() => store.save('notam', { fetched_at: new Date().toISOString(), horizon_hours: 24, items: [] }))
})

// 위 저장이 저장소 디렉터리를 건드리지 않는지 못 박는다 — 격리가 풀리면 여기서 먼저 터진다.
test('the save lands in an isolated data path, never the repository data directory', () => {
  store.save('notam', { fetched_at: new Date().toISOString(), horizon_hours: 24, items: [] })
  assert.ok(
    config.storage.base_path.startsWith(os.tmpdir()),
    `테스트가 실제 데이터 디렉터리에 쓰고 있다: ${config.storage.base_path}`,
  )
  assert.ok(fs.existsSync(path.join(config.storage.base_path, 'notam', 'latest.json')))
})
