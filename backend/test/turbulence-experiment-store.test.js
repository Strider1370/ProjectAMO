import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { createTurbulenceExperimentRouter, publishExperiment, readExperimentIndex } from '../src/turbulence/experiment-store.js'

function stage(root, revision, complete = true) {
  const folder = fs.mkdtempSync(path.join(root, 'stage-'))
  const index = { revision, tmfc: '2026091006', grid: { nx: 2, ny: 2 },
    times: [{ hf: 6, validTime: '2026-09-10T12:00:00.000Z' }], levels: [{ id: '500hPa' }], diagnostics: [{ id: 'gktg' }] }
  fs.writeFileSync(path.join(folder, 'index.json'), JSON.stringify(index))
  if (complete) {
    const fieldDir = path.join(folder, 'hf006/500hPa')
    fs.mkdirSync(fieldDir, { recursive: true })
    fs.writeFileSync(path.join(fieldDir, 'gktg.json'), JSON.stringify({ ...index, hf: 6, validTime: index.times[0].validTime,
      level: { id: '500hPa' }, diagnostic: { id: 'gktg' }, values: [0, .1, .2, null] }))
  }
  return folder
}

test('incomplete publication preserves the last complete pointer and exact revisions', async (t) => {
  const base = fileURLToPath(new URL('../../artifacts/turbulence-store-tests', import.meta.url))
  fs.mkdirSync(base, { recursive: true })
  const root = fs.mkdtempSync(path.join(base, 'case-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const revision = 'a'.repeat(20)
  publishExperiment(root, stage(root, revision))
  assert.throws(() => publishExperiment(root, stage(root, 'b'.repeat(20), false)))
  assert.equal(readExperimentIndex(root).revision, revision)
  assert.equal(readExperimentIndex(root, revision).revision, revision)
  assert.equal(readExperimentIndex(root, 'c'.repeat(20)), null)
  const app = express()
  app.use('/api/kim/turbulence-experiment', createTurbulenceExperimentRouter(root))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => server.close())
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}/api/kim/turbulence-experiment`
  assert.equal((await fetch(url)).status, 200)
  const exact = `${url}/field?revision=${revision}&hf=6&level=500hPa&diagnostic=gktg`
  const response = await fetch(exact)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /immutable/)
  assert.deepEqual((await response.json()).values, [0, .1, .2, null])
  assert.equal((await fetch(exact.replace('hf=6', 'hf=9'))).status, 404)
  assert.equal((await fetch(exact.replace(revision, 'c'.repeat(20)))).status, 404)
  assert.equal((await fetch(`${url}/field?revision=../../etc&hf=6&level=500hPa&diagnostic=gktg`)).status, 400)
})
