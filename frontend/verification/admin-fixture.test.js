import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('admin fixture import does not open or create the contract database', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-admin-fixture-'))
  const dataPath = path.join(root, 'data')
  const previous = process.env.DATA_PATH
  process.env.DATA_PATH = dataPath
  try {
    await import(`./admin-fixture.mjs?discovery=${Date.now()}`)
    assert.equal(fs.existsSync(dataPath), false)
  } finally {
    if (previous === undefined) delete process.env.DATA_PATH
    else process.env.DATA_PATH = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
})
