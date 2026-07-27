import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readDiskUsage } from '../src/admin/disk-usage.js'

function tmpBase() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'disk-usage-'))
}

test('readDiskUsage: 폴더별 재귀 합산, 큰 폴더가 먼저 온다', () => {
  const base = tmpBase()
  fs.mkdirSync(path.join(base, 'radar', 'sub'), { recursive: true })
  fs.mkdirSync(path.join(base, 'notam'), { recursive: true })
  fs.writeFileSync(path.join(base, 'radar', 'a.png'), Buffer.alloc(1000))
  fs.writeFileSync(path.join(base, 'radar', 'sub', 'b.png'), Buffer.alloc(2000))
  fs.writeFileSync(path.join(base, 'notam', 'c.json'), Buffer.alloc(10))

  const rows = readDiskUsage(base, { force: true })
  assert.equal(rows[0].name, 'radar')
  assert.equal(rows[0].bytes, 3000)
  assert.equal(rows.find((r) => r.name === 'notam').bytes, 10)
})

test('readDiskUsage: TTL 안에서는 다시 안 재고 캐시를 돌려준다', () => {
  const base = tmpBase()
  fs.mkdirSync(path.join(base, 'a'), { recursive: true })
  fs.writeFileSync(path.join(base, 'a', 'x'), Buffer.alloc(5))

  const first = readDiskUsage(base, { force: true })
  fs.writeFileSync(path.join(base, 'a', 'y'), Buffer.alloc(50))
  const second = readDiskUsage(base) // force 없음 → 캐시
  assert.deepEqual(second, first, '캐시 기간 안이라 새 파일이 반영 안 됨')
})
