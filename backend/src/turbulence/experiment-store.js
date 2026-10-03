import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

const REVISION = /^[a-f0-9]{20}$/
const rootDir = (root) => path.join(root, 'kim_turbulence_experiment')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

export function readExperimentIndex(root, revision) {
  if (revision && !REVISION.test(revision)) throw new Error('Invalid revision')
  const file = revision
    ? path.join(rootDir(root), 'runs', revision, 'index.json')
    : path.join(rootDir(root), 'index.json')
  return fs.existsSync(file) ? readJson(file) : null
}

export function publishExperiment(root, stage) {
  const index = readJson(path.join(stage, 'index.json'))
  if (!REVISION.test(index.revision) || !index.times?.length || !index.levels?.length || !index.diagnostics?.length) {
    throw new Error('Incomplete experiment manifest')
  }
  for (const time of index.times) for (const level of index.levels) for (const diagnostic of index.diagnostics) {
    if (!Number.isInteger(time.hf) || !/^\d{3,4}hPa$/.test(level.id) || !/^[a-z0-9_]+$/.test(diagnostic.id)) {
      throw new Error('Invalid experiment selection')
    }
    const field = readJson(path.join(stage, `hf${String(time.hf).padStart(3, '0')}`, level.id, `${diagnostic.id}.json`))
    if (field.revision !== index.revision || field.tmfc !== index.tmfc || field.hf !== time.hf
      || field.level?.id !== level.id || field.diagnostic?.id !== diagnostic.id
      || field.validTime !== time.validTime || field.values?.length !== index.grid.nx * index.grid.ny) {
      throw new Error('Incomplete or mismatched experiment field')
    }
  }
  const runs = path.join(rootDir(root), 'runs')
  fs.mkdirSync(runs, { recursive: true })
  const target = path.join(runs, index.revision)
  if (fs.existsSync(target)) fs.rmSync(stage, { recursive: true })
  else fs.renameSync(stage, target)
  const tmp = path.join(rootDir(root), `index.${process.pid}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(index))
  fs.renameSync(tmp, path.join(rootDir(root), 'index.json'))
  return index
}

export function createTurbulenceExperimentRouter(root) {
  const router = express.Router()
  router.get('/', (req, res) => {
    const index = readExperimentIndex(root)
    res.set('Cache-Control', 'no-store')
    if (!index) return res.status(404).json({ error: '난류 시험 자료가 없습니다.' })
    return res.json(index)
  })
  router.get('/field', (req, res) => {
    const { revision, level, diagnostic, hf } = req.query
    if (typeof revision !== 'string' || !REVISION.test(revision)
      || typeof level !== 'string' || !/^\d{3,4}hPa$/.test(level)
      || typeof diagnostic !== 'string' || !/^[a-z0-9_]+$/.test(diagnostic)
      || typeof hf !== 'string' || !/^\d{1,3}$/.test(hf)) {
      return res.status(400).json({ error: 'Invalid experiment selection' })
    }
    const index = readExperimentIndex(root, revision)
    if (!index || !index.times.some((t) => t.hf === Number(hf))
      || !index.levels.some((l) => l.id === level) || !index.diagnostics.some((d) => d.id === diagnostic)) {
      return res.status(404).json({ error: 'Requested experiment field is unavailable' })
    }
    const file = path.join(rootDir(root), 'runs', revision, `hf${hf.padStart(3, '0')}`, level, `${diagnostic}.json`)
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Requested experiment field is unavailable' })
    res.set('Cache-Control', 'private, max-age=3600, immutable')
    return res.sendFile(path.resolve(file))
  })
  return router
}
