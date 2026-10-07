import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildKimNwpRunId,
  cleanupKimNwpRuns,
  listKimNwpRuns,
  readKimNwpGrid,
  readKimNwpIndex,
  readKimNwpManifest,
  resolveKimNwpGridPath,
  validateKimNwpSelection,
  writeKimNwpGrid,
  writeKimNwpIndex,
  writeKimNwpManifest,
} from '../src/processors/kim-nwp-store.js'

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-kim-nwp-'))
}

test('buildKimNwpRunId creates filesystem-safe run ids', () => {
  assert.equal(buildKimNwpRunId({ model: 'KIMG/NE57', tmfc: '2026051900' }), 'KIMG_NE57_2026051900')
})

test('resolveKimNwpGridPath groups grids by run, forecast hour, and level', () => {
  const root = tempRoot()
  assert.equal(
    resolveKimNwpGridPath({ root, model: 'KIMG/NE57', tmfc: '2026051900', hf: 3, levelId: '925hPa' }),
    path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026051900', 'normalized', 'hf003', '925hPa', 'grid.json'),
  )
})

test('validateKimNwpSelection rejects path traversal inputs', () => {
  assert.throws(
    () => validateKimNwpSelection({ tmfc: '2026051900', hf: 3, levelId: '../925hPa' }),
    /level/i,
  )
  assert.throws(
    () => validateKimNwpSelection({ tmfc: '../../bad', hf: 3, levelId: '925hPa' }),
    /tmfc/i,
  )
  assert.throws(
    () => validateKimNwpSelection({ tmfc: '2026051900', hf: 999, levelId: '925hPa' }),
    /forecast hour/i,
  )
})

test('writeKimNwpGrid writes one selected time level grid', () => {
  const root = tempRoot()
  const grid = {
    type: 'kim_nwp_grid',
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: { id: '925hPa' },
    variables: { u: { values: [1] }, v: { values: [2] } },
  }

  // JSON 파일 내용을 직접 확인한다. NC 저장은 kim-doc-store.test.js에서 본다.
  const savedFormat = process.env.KIM_STORE_FORMAT
  process.env.KIM_STORE_FORMAT = 'json'
  try {
    const filePath = writeKimNwpGrid({ root, grid })

    assert.equal(fs.existsSync(filePath), true)
    assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).type, 'kim_nwp_grid')
    assert.deepEqual(readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc: '2026051900', hf: 3, levelId: '925hPa' }), grid)
  } finally {
    if (savedFormat === undefined) delete process.env.KIM_STORE_FORMAT
    else process.env.KIM_STORE_FORMAT = savedFormat
  }
})

test('writeKimNwpIndex writes compact index without grid values', () => {
  const root = tempRoot()
  const index = {
    type: 'kim_nwp_index',
    model: 'KIMG/NE57',
    latestRun: '2026051900',
    availability: { '10m': { 0: { variables: ['u', 'v'], path: 'x/grid.json' } } },
  }

  writeKimNwpIndex(root, index)

  assert.deepEqual(readKimNwpIndex(root), index)
  assert.equal(fs.readFileSync(path.join(root, 'kim_nwp', 'index.json'), 'utf8').includes('"values"'), false)
})

test('writeKimNwpManifest writes a run-level usable manifest', () => {
  const root = tempRoot()
  const manifest = {
    type: 'kim_nwp_manifest',
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    runId: 'KIMG_NE57_2026051900',
    usable: true,
    grids: 12,
  }

  writeKimNwpManifest(root, manifest)

  assert.deepEqual(readKimNwpManifest(root, 'KIMG_NE57_2026051900'), manifest)
})

test('cleanupKimNwpRuns deletes old runs by run directory while preserving latestRunId', () => {
  const root = tempRoot()
  for (const runId of ['KIMG_NE57_2026051812', 'KIMG_NE57_2026051818', 'KIMG_NE57_2026051900']) {
    fs.mkdirSync(path.join(root, 'kim_nwp', 'runs', runId), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'kim_nwp', 'runs', runId, 'manifest.json'),
      JSON.stringify({ type: 'kim_nwp_manifest', runId, usable: true }),
      'utf8',
    )
  }

  cleanupKimNwpRuns({ root, maxRuns: 2, latestRunId: 'KIMG_NE57_2026051812' })

  assert.deepEqual(listKimNwpRuns(root), ['KIMG_NE57_2026051900', 'KIMG_NE57_2026051818', 'KIMG_NE57_2026051812'])
  assert.equal(fs.existsSync(path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026051812')), true)
})

test('cleanupKimNwpRuns keeps latest usable runs and removes failed run directories', () => {
  const root = tempRoot()
  for (const runId of ['KIMG_NE57_2026051818', 'KIMG_NE57_2026051900', 'KIMG_NE57_2026051906']) {
    fs.mkdirSync(path.join(root, 'kim_nwp', 'runs', runId), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'kim_nwp', 'runs', runId, 'manifest.json'),
      JSON.stringify({ type: 'kim_nwp_manifest', runId, usable: true }),
      'utf8',
    )
  }
  fs.mkdirSync(path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026051912', 'raw'), { recursive: true })

  cleanupKimNwpRuns({ root, maxRuns: 2, latestRunId: 'KIMG_NE57_2026051906' })

  assert.deepEqual(listKimNwpRuns(root), ['KIMG_NE57_2026051906', 'KIMG_NE57_2026051900'])
})

test('cleanupKimNwpRuns keeps previous complete run when latest run is partial', () => {
  const root = tempRoot()
  const manifests = [
    { runId: 'KIMG_NE57_2026051818', usable: true, complete: true },
    { runId: 'KIMG_NE57_2026051900', usable: true, complete: true },
    { runId: 'KIMG_NE57_2026051906', usable: true, complete: false },
  ]
  for (const manifest of manifests) {
    fs.mkdirSync(path.join(root, 'kim_nwp', 'runs', manifest.runId), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'kim_nwp', 'runs', manifest.runId, 'manifest.json'),
      JSON.stringify({ type: 'kim_nwp_manifest', ...manifest }),
      'utf8',
    )
  }

  cleanupKimNwpRuns({ root, maxRuns: 1, latestRunId: 'KIMG_NE57_2026051906' })

  assert.deepEqual(listKimNwpRuns(root), ['KIMG_NE57_2026051906', 'KIMG_NE57_2026051900'])
})
