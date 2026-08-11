import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMonitoringSnapshot,
  detectMonitoringSnapshotChanges,
} from './monitoringApi.js'

test('monitoring polling refreshes every independently published weather graphic', () => {
  const saved = buildMonitoringSnapshot({
    wissdomMeta: { tm: '202608120000', content_hash: 'wissdom-old' },
    qpfMeta: { tm: '202608120000', content_hash: 'qpf-old' },
    rainviewerMeta: { tm: '1786447200000' },
    convectiveMeta: { tm: '202608120000', content_hash: 'convective-old' },
  })
  const changes = detectMonitoringSnapshotChanges({
    wissdomMeta: { tm: '202608120000', hash: 'wissdom-new' },
    qpfMeta: { tm: '202608120000', hash: 'qpf-new' },
    rainviewerMeta: { tm: '1786447800000' },
    convectiveMeta: { tm: '202608120000', hash: 'convective-new' },
  }, saved)

  assert.equal(changes.wissdomMeta, true)
  assert.equal(changes.qpfMeta, true)
  assert.equal(changes.rainviewerMeta, true)
  assert.equal(changes.convectiveMeta, true)
})
