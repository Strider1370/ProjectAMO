import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

test('SIGWX retention removes orphan zoom variants and preserves retained chart variants', async () => {
  const parent = new URL('../../artifacts/sigwx-render-tests/', import.meta.url)
  await fs.mkdir(parent, { recursive: true })
  const root = await fs.mkdtemp(path.join(parent.pathname, 'retention-'))
  const previous = process.env.DATA_PATH
  process.env.DATA_PATH = root
  try {
    const store = (await import('../src/store.js')).default
    const dir = path.join(root, 'sigwx_low')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'SIGWX_LOW_2026072205.json'), JSON.stringify({ tmfc: '2026072205' }))
    for (const tmfc of ['2026072205', '2026072105']) {
      for (const kind of ['fronts', 'clouds']) {
        for (const suffix of ['', '_standard', '_detail']) await fs.writeFile(path.join(dir, `${kind}_${tmfc}${suffix}.png`), 'fixture')
      }
    }
    store.save('sigwx_low', { type: 'sigwx_low', tmfc: '2026072211', items: [] })
    const files = await fs.readdir(dir)
    for (const suffix of ['', '_standard', '_detail']) {
      for (const kind of ['fronts', 'clouds']) {
        assert.ok(files.includes(`${kind}_2026072205${suffix}.png`))
        assert.ok(!files.includes(`${kind}_2026072105${suffix}.png`))
      }
    }
  } finally {
    if (previous === undefined) delete process.env.DATA_PATH
    else process.env.DATA_PATH = previous
    await fs.rm(root, { recursive: true, force: true })
  }
})
