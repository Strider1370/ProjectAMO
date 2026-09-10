import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readExactKtgMapGrid, readExactWeatherFrame, describeWeatherFrame } from '../src/briefing/pinned-map-resources.js'
import { writeKtgCoords, writeKtgGrid, writeKtgLatest, writeKtgIndex } from '../src/processors/ktg-store.js'

test('explicit KTG run uses stored run, rejects replaced/deleted resources, never latest fallback', () => {
  fs.mkdirSync('artifacts', { recursive: true })
  const root = fs.mkdtempSync(path.resolve('artifacts/pinned-ktg-'))
  try {
    const coords = { ny: 2, nx: 2, lat: [34, 35, 34, 35], lon: [126, 126, 127, 127] }
    const selected = { tmfc: '2026090900', hf: 6, altFt: 3000 }
    const grid = { ...selected, validTime: '2026-09-09T06:00:00Z', ktg: [0, 0.1, 0.2, 0.3] }
    writeKtgCoords({ root, ...selected, coords })
    writeKtgGrid({ root, grid })
    writeKtgLatest(root, { tmfc: '2026091000', hf: 0 })
    writeKtgIndex(root, { tmfc: '2026091000', hours: [{ hf: 0 }] })
    const first = readExactKtgMapGrid(root, selected)
    assert.equal(first.status, 200)
    assert.equal(first.data.run.tmfc, selected.tmfc)
    assert.equal(first.data.run.validTime, grid.validTime)
    assert.equal(readExactKtgMapGrid(root, { ...selected, hf: 7 }).status, 410)
    assert.equal(readExactKtgMapGrid(root, { ...selected, tmfc: '../../secret' }).status, 400)
    writeKtgGrid({ root, grid: { ...grid, ktg: [1, 1, 1, 1] } })
    assert.equal(readExactKtgMapGrid(root, { ...selected, revision: first.data.revision }).error, 'map_revision_expired')
    fs.rmSync(path.join(root, 'ktg', 'runs', selected.tmfc), { recursive: true })
    assert.equal(readExactKtgMapGrid(root, selected).error, 'map_resource_expired')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('frame byte revisions detect same-time replacement and preserve KST frame time', () => {
  fs.mkdirSync('artifacts', { recursive: true })
  const root = fs.mkdtempSync(path.resolve('artifacts/pinned-frame-'))
  try {
    fs.mkdirSync(path.join(root, 'satellite'))
    const name = 'sat_korea_202609102100.webp'
    const file = path.join(root, 'satellite', name)
    fs.writeFileSync(file, 'fixture-image-bytes-1')
    const meta = { latest: { tm: '202609102100', path: `/data/satellite/${name}`, bounds: [[30, 120], [40, 130]] } }
    const descriptor = describeWeatherFrame(root, 'satellite', meta, Date.parse('2026-09-10T12:10:00Z'))
    assert.equal(descriptor.status, 'available')
    assert.equal(descriptor.validTime, '2026-09-10T12:00:00.000Z')
    assert.equal(readExactWeatherFrame(root, { kind: 'satellite', name, revision: descriptor.revision }).status, 200)
    fs.writeFileSync(file, 'fixture-image-bytes-2')
    assert.equal(readExactWeatherFrame(root, { kind: 'satellite', name, revision: descriptor.revision }).status, 410)
    assert.equal(describeWeatherFrame(root, 'satellite', meta, Date.parse('2026-09-10T14:00:00Z')).reason, 'frame_stale')
    assert.equal(readExactWeatherFrame(root, { kind: 'satellite', name: '../../projectamo.db' }).status, 400)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
