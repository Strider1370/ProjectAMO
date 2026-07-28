import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('live publication cannot replace the active demo cache', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-store-view-'))
  process.env.DATA_PATH = root
  try {
    const live = { type: 'sigmet', fetched_at: '2026-07-28T10:00:00.000Z', items: [{ id: 'live' }] }
    const demo = { type: 'sigmet', fetched_at: '2026-07-22T10:00:00.000Z', items: [{ id: 'demo' }] }
    fs.mkdirSync(path.join(root, 'sigmet'), { recursive: true })
    fs.writeFileSync(path.join(root, 'sigmet', 'latest.json'), JSON.stringify(live))
    const snapshot = path.join(root, 'snapshots', 'demo')
    fs.mkdirSync(path.join(snapshot, 'sigmet'), { recursive: true })
    fs.writeFileSync(path.join(snapshot, 'sigmet', 'latest.json'), JSON.stringify(demo))
    fs.writeFileSync(path.join(snapshot, 'meta.json'), JSON.stringify({
      referenceTime: '2026-07-22T10:00:00.000Z',
    }))

    const [{ dataView }, storeModule] = await Promise.all([
      import('../src/dev/data-view.js'),
      import('../src/store.js'),
    ])
    const store = storeModule.default
    dataView.ensure()
    store.initLiveFromFiles(root)
    dataView.activateDemo('demo')
    store.initActiveFromFiles(path.join(root, '.active-data'))

    store.save('sigmet', {
      type: 'sigmet',
      fetched_at: '2026-07-28T10:05:00.000Z',
      items: [{ id: 'live-new' }],
    })

    assert.equal(store.getCached('sigmet').items[0].id, 'demo')
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'sigmet', 'latest.json'))).items[0].id, 'live-new')
  } finally {
    delete process.env.DATA_PATH
    fs.rmSync(root, { recursive: true, force: true })
  }
})
