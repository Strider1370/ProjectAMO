import { test } from 'node:test'
import assert from 'node:assert/strict'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

import { createDb } from '../src/db/index.js'
import { sampleOnce, readMetrics, currentResources } from '../src/admin/metrics.js'

test('sampleOnce writes a row; readMetrics returns it with peak', () => {
  const db = createDb(':memory:')
  sampleOnce(db)
  const out = readMetrics(db, '24h')
  assert.ok(out.series.length >= 1)
  assert.ok(Number.isFinite(out.peakCpu.cpu_pct))
  const cur = currentResources()
  assert.ok(cur.memTotal > 0)
})

test('자원 DTO는 loadavg의 host-visible 논리 코어 기준과 root/data filesystem validity를 명시한다', () => {
  const osModule = { loadavg: () => [3, 0, 0], cpus: () => [{}, {}], totalmem: () => 1000, freemem: () => 250 }
  const fsModule = { statfsSync: (target) => {
    if (target === '/data') throw new Error('unmounted')
    return { blocks: 100, bfree: 40, bsize: 10 }
  } }
  const resources = currentResources({ osModule, fsModule, rootPath: '/', dataPath: '/data' })
  assert.equal(resources.cpuPct, 100)
  assert.deepEqual(resources.metricContract.cpu, {
    value: 100, unit: 'percent_of_logical_cpu_count_capped_100', metric: 'one_minute_load_average_normalized_by_logical_cpu_count',
    scope: 'node_os_visible_host_or_container_namespace', loadAverage1m: 3, logicalCpuCount: 2, cappedAt100: true, validity: 'available',
  })
  assert.deepEqual(resources.metricContract.filesystems.root, { path: '/', validity: 'available', usedBytes: 600, totalBytes: 1000, role: 'root_filesystem' })
  assert.deepEqual(resources.metricContract.filesystems.data, { path: '/data', validity: 'unknown', usedBytes: null, totalBytes: null, role: 'configured_data_path_filesystem' })
})

test('metrics 기간 DTO는 UTC 기준 range와 7일 보관을 구조화한다', () => {
  const db = createDb(':memory:')
  const now = Date.parse('2026-08-10T10:00:00Z')
  const out = readMetrics(db, '7d', { now, current: () => ({}) })
  assert.deepEqual(out.time.requestedRange, { id: '7d', durationMs: 604800000, from: '2026-08-03T10:00:00.000Z', to: '2026-08-10T10:00:00.000Z' })
  assert.equal(out.time.timestampStandard, 'UTC_ISO_8601')
  assert.equal(out.time.retention.durationMs, 604800000)
  assert.equal(out.time.dataFilesystemHistory, 'not_collected')
})

test('sampleOnce records the backend process memory split into rss, heap and external', () => {
  const db = createDb(':memory:')
  sampleOnce(db, { memoryUsage: () => ({ rss: 300e6, heapUsed: 90e6, heapTotal: 120e6, external: 150e6 }) })
  const [row] = readMetrics(db, '24h').series
  assert.deepEqual([row.proc_rss, row.proc_heap_used, row.proc_heap_total, row.proc_external], [300e6, 90e6, 120e6, 150e6])
})

test('an existing metrics table gains the process memory columns on startup', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-metrics-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'old.db')
  const old = new Database(file)
  old.exec('CREATE TABLE metrics (ts TEXT NOT NULL, cpu_pct REAL, mem_used INTEGER, mem_total INTEGER, disk_used INTEGER, disk_total INTEGER)')
  old.close()
  const db = createDb(file)
  t.after(() => db.close())
  const cols = db.prepare('PRAGMA table_info(metrics)').all().map((c) => c.name)
  for (const col of ['proc_rss', 'proc_heap_used', 'proc_heap_total', 'proc_external']) assert.ok(cols.includes(col), col)
})
