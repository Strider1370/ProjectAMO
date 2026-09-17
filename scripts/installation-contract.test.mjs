import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('clean Linux install is pinned to the Node and npm contract for root, backend, and frontend', async () => {
  const requiredNode = (await read('.nvmrc')).trim()
  assert.match(requiredNode, /^\d+\.\d+\.\d+$/)

  for (const relativePath of ['package.json', 'backend/package.json', 'frontend/package.json']) {
    const manifest = JSON.parse(await read(relativePath))
    assert.equal(manifest.packageManager, 'npm@10.9.8', `${relativePath} package manager`)
    assert.match(manifest.engines.node, new RegExp(requiredNode.replaceAll('.', '\\.')), `${relativePath} Node range`)
  }

  const bootstrap = await read('scripts/bootstrap-linux.sh')
  assert.match(bootstrap, /^npm ci$/m)
  assert.match(bootstrap, /^npm --prefix frontend ci$/m)
  assert.match(bootstrap, /^npm --prefix backend ci$/m)
  assert.match(bootstrap, /npm run install:browsers:chromium/)
  assert.doesNotMatch(bootstrap, /destination-weather-comparison/)
})

test('optional prototype, WebKit, and GIS commands stay outside the default bootstrap', async () => {
  const rootManifest = JSON.parse(await read('package.json'))
  assert.equal(rootManifest.scripts['install:browsers:chromium'], 'npx --prefix frontend playwright install --with-deps chromium')
  assert.equal(rootManifest.scripts['install:browsers:webkit'], 'npx --prefix frontend playwright install --with-deps webkit')
  assert.equal(rootManifest.scripts['install:prototype'], 'npm --prefix prototypes/destination-weather-comparison ci')

  const policy = await read('docs/policies/verification/root-checks.md')
  assert.match(policy, /npm run install:browsers:webkit/)
  assert.match(policy, /python3 -m venv \.artifacts\/gis-venv/)
})
