import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readKimExpandedProgress } from '../src/admin/kim-expanded-progress.js'

const temporary = (t) => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-expanded-progress-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root }
const lines = (rows) => `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
const at = (minute) => new Date(Date.UTC(2026, 9, 9, 11, 15 + minute)).toISOString()

function seed(root, tmfc, events, { monitor = [], lockPid = null } = {}) {
  const runDir = path.join(root, 'kim_nwp_ea', 'runs', `KIMG_NE57_${tmfc}`)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), lines(events))
  if (monitor.length) fs.writeFileSync(path.join(runDir, 'monitor.jsonl'), lines(monitor))
  if (lockPid) fs.writeFileSync(path.join(root, 'kim_nwp_ea', `run-${tmfc.slice(-2)}.lock`), JSON.stringify({ pid: lockPid, tmfc }))
}

test('a running cycle reports collect and compute percentages, an ETA from the compute pace, and the latest memory', (t) => {
  const root = temporary(t)
  seed(root, '2026100900', [{ at: at(-300), type: 'expanded_started', hours: 29 }, { at: at(-200), type: 'expanded_published', planned: 29, published: true, publishedHours: 29 }])
  seed(root, '2026100906', [
    { at: at(0), type: 'expanded_started', hours: 33 },
    { at: at(4), type: 'expanded_hour_collected', hf: 0, ok: true },
    { at: at(8), type: 'expanded_hour_collected', hf: 1, ok: true },
    { at: at(8), type: 'expanded_hour_computed', hf: 0, kim_gktg: 'ok', kim_tropopause: 'ok' },
    { at: at(12), type: 'expanded_hour_collected', hf: 2, ok: false },
    { at: at(12), type: 'expanded_hour_computed', hf: 1, kim_gktg: 'failed', kim_tropopause: 'ok' },
  ], { lockPid: process.pid, monitor: [
    { at: at(-1), availableMiB: 100 },
    { at: at(5), availableMiB: 400, swapUsedMiB: 200 },
    { at: at(11), availableMiB: 650, swapUsedMiB: 210 },
  ] })
  const now = Date.parse(at(12))
  const progress = readKimExpandedProgress(root, { now })
  assert.equal(progress.tmfc, '2026100906')
  assert.equal(progress.state, 'running')
  assert.deepEqual([progress.planned, progress.collected, progress.computed, progress.collectedPct, progress.computedPct], [33, 2, 1, 6, 3])
  assert.equal(progress.lastCollectedHour, 1)
  // 12분에 계산 2건(성공 1) → 건당 6분, 남은 32시각 → 192분 뒤.
  assert.equal(progress.etaAt, new Date(now + 192 * 60_000).toISOString())
  assert.equal(progress.korea, null)
  assert.deepEqual(progress.memory, { at: at(11), availableMiB: 650, swapUsedMiB: 210, minAvailableMiB: 400 })
})

test('a finished cycle shows its outcome, and a cycle without an end or a live process is interrupted', (t) => {
  const root = temporary(t)
  seed(root, '2026100906', [
    { at: at(0), type: 'expanded_started', hours: 33 },
    { at: at(4), type: 'expanded_hour_collected', hf: 0, ok: true },
    { at: at(5), type: 'expanded_korea_crop', saved: true, grids: 286 },
    { at: at(9), type: 'expanded_hour_computed', hf: 0, kim_gktg: 'ok', kim_tropopause: 'ok' },
    { at: at(10), type: 'expanded_not_published', planned: 33, published: false, stopReason: 'memory_reserve', publishedHours: 0 },
  ])
  const done = readKimExpandedProgress(root, { now: Date.parse(at(20)) })
  assert.equal(done.state, 'not_published')
  assert.equal(done.stopReason, 'memory_reserve')
  assert.equal(done.etaAt, null)
  assert.deepEqual(done.korea, { at: at(5), saved: true, reason: null })

  const other = temporary(t)
  seed(other, '2026100900', [{ at: at(0), type: 'expanded_started', hours: 29 }], { lockPid: 2 ** 22 + 12345 })
  assert.equal(readKimExpandedProgress(other).state, 'interrupted')
  assert.equal(readKimExpandedProgress(temporary(t)), null)
})
