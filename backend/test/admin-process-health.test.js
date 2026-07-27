import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { recordBoot, processHealth } from '../src/admin/process-health.js'

function tmpBase() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'process-health-'))
}

test('recordBoot: 첫 실행은 bootCount=1, 같은 폴더로 다시 부르면 누적된다(재시작 흉내)', () => {
  const base = tmpBase()
  const first = recordBoot(base)
  assert.equal(first.bootCount, 1)
  const second = recordBoot(base)
  assert.equal(second.bootCount, 2)
  assert.equal(second.firstBootAt, first.firstBootAt, '최초 부팅 시각은 유지')
})

test('processHealth: 가동시간·힙 메모리가 유한한 양수로 나온다', () => {
  recordBoot(tmpBase())
  const h = processHealth()
  assert.ok(h.uptimeSec >= 0)
  assert.ok(h.heapUsed > 0)
  assert.ok(h.heapTotal >= h.heapUsed)
})
