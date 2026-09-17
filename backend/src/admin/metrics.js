import os from 'node:os'
import fs from 'node:fs'

import config from '../config.js'

// 관리자 콘솔: 시스템 리소스 시계열. 60초 샘플, 7일 보관.
const WINDOW = { '1h': 3600e3, '24h': 86400e3, '7d': 604800e3 }
const RETAIN_MS = WINDOW['7d']
const DISK_PATH = process.platform === 'win32' ? 'C:\\' : '/'

function filesystemUsage(targetPath, { fsModule = fs } = {}) {
  try {
    const s = fsModule.statfsSync(targetPath)
    const totalBytes = Number(s.blocks) * Number(s.bsize)
    const usedBytes = (Number(s.blocks) - Number(s.bfree)) * Number(s.bsize)
    if (!Number.isFinite(totalBytes) || !Number.isFinite(usedBytes)) throw new Error('invalid_statfs_result')
    return { path: targetPath, validity: 'available', usedBytes, totalBytes }
  } catch {
    // 0/0은 용량 0이 아니라 측정 불가다. 호환 숫자 필드는 아래에서 유지하지만,
    // 새 DTO 소비자는 validity를 반드시 확인한다.
    return { path: targetPath, validity: 'unknown', usedBytes: null, totalBytes: null }
  }
}

export function currentResources({
  osModule = os,
  fsModule = fs,
  rootPath = DISK_PATH,
  dataPath = config.storage.base_path,
} = {}) {
  const loadAverage1m = Number(osModule.loadavg()[0])
  const logicalCpuCount = osModule.cpus().length
  const cpuPct = logicalCpuCount > 0 && Number.isFinite(loadAverage1m)
    ? Math.min(100, Math.round((loadAverage1m / logicalCpuCount) * 100)) : 0
  const memTotal = osModule.totalmem(); const memUsed = memTotal - osModule.freemem()
  const root = filesystemUsage(rootPath, { fsModule })
  const data = filesystemUsage(dataPath, { fsModule })
  return {
    // Legacy root-filesystem fields. New clients should read filesystems.root.
    cpuPct, memUsed, memTotal,
    diskUsed: root.usedBytes ?? 0,
    diskTotal: root.totalBytes ?? 0,
    metricContract: {
      cpu: {
        value: cpuPct,
        unit: 'percent_of_logical_cpu_count_capped_100',
        metric: 'one_minute_load_average_normalized_by_logical_cpu_count',
        scope: 'node_os_visible_host_or_container_namespace',
        loadAverage1m,
        logicalCpuCount,
        cappedAt100: true,
        validity: logicalCpuCount > 0 && Number.isFinite(loadAverage1m) ? 'available' : 'unknown',
      },
      filesystems: {
        root: { ...root, role: 'root_filesystem' },
        data: { ...data, role: 'configured_data_path_filesystem' },
      },
    },
  }
}

export function sampleOnce(db) {
  const r = currentResources(); const now = new Date().toISOString()
  db.prepare('INSERT INTO metrics (ts,cpu_pct,mem_used,mem_total,disk_used,disk_total) VALUES (?,?,?,?,?,?)')
    .run(now, r.cpuPct, r.memUsed, r.memTotal, r.diskUsed, r.diskTotal)
  db.prepare('DELETE FROM metrics WHERE ts < ?').run(new Date(Date.now() - RETAIN_MS).toISOString())
}

export function readMetrics(db, range = '24h', { now = Date.now(), current = currentResources } = {}) {
  const selectedRange = WINDOW[range] ? range : '24h'
  const durationMs = WINDOW[selectedRange]
  const since = new Date(now - durationMs).toISOString()
  const series = db.prepare('SELECT ts,cpu_pct,mem_used,mem_total,disk_used,disk_total FROM metrics WHERE ts >= ? ORDER BY ts').all(since)
  const peakCpu = series.reduce((m, r) => (r.cpu_pct > (m?.cpu_pct ?? -1) ? r : m), series[0] ?? { cpu_pct: 0 })
  return {
    range: selectedRange,
    series,
    peakCpu,
    current: current(),
    time: {
      generatedAt: new Date(now).toISOString(),
      timestampStandard: 'UTC_ISO_8601',
      requestedRange: { id: selectedRange, durationMs, from: since, to: new Date(now).toISOString() },
      retention: { durationMs: RETAIN_MS, sampleIntervalMs: 60_000, basis: 'rolling_utc_elapsed_time' },
      seriesFilesystem: 'root_filesystem',
      // configured data volume is current-only until its own historical series is collected.
      dataFilesystemHistory: 'not_collected',
    },
  }
}

export function startSampler(db, intervalMs = 60000) {
  sampleOnce(db)
  const t = setInterval(() => { try { sampleOnce(db) } catch { /* noop */ } }, intervalMs)
  t.unref?.()
  return () => clearInterval(t)
}

export default { currentResources, sampleOnce, readMetrics, startSampler }
