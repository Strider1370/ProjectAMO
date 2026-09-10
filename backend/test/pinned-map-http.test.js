import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { writeKtgGrid, writeKtgCoords, writeKtgLatest, writeKtgIndex } from '../src/processors/ktg-store.js'

test('HTTP exact KTG selection and public persistence protection', async () => {
  fs.mkdirSync('artifacts', { recursive: true })
  const root = fs.mkdtempSync(path.resolve('artifacts/organization-http-'))
  const selection = { tmfc: '2026090900', hf: 6, altFt: 3000 }
  writeKtgCoords({ root, ...selection, coords: { ny: 2, nx: 2, lat: [34, 35, 34, 35], lon: [126, 126, 127, 127] } })
  writeKtgGrid({ root, grid: { ...selection, validTime: '2026-09-09T06:00:00Z', ktg: [0, 1, 0, 1] } })
  writeKtgLatest(root, { tmfc: '2026091000', hf: 9, validTime: '2026-09-10T09:00:00Z' })
  writeKtgIndex(root, { hours: [{ hf: 9, validTime: '2026-09-10T09:00:00Z' }] })
  fs.writeFileSync(path.join(root, 'projectamo.db'), 'fixture-private-data')
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root
  const { app } = await import('../server.js')
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const url = `${base}/api/ktg/grid?tmfc=${selection.tmfc}&hf=6&altFt=3000`
    const response = await fetch(url)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.run.tmfc, selection.tmfc)
    assert.equal(result.run.hf, 6)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await fetch(`${url}&revision=incorrect`)).status, 410)
    assert.equal((await fetch(url.replace('hf=6', 'hf=7'))).status, 410)
    assert.equal((await fetch(`${base}/data/projectamo.db`)).status, 404)
    assert.equal((await fetch(`${base}/data/backups/example.db`)).status, 404)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(root, { recursive: true, force: true })
  }
})
