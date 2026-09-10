import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../assets/fonts/wanted-sans/1.0.3/', import.meta.url))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

test('vendored Wanted CSS, license and every referenced font match the pinned distribution', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
  assert.equal(manifest.version, '1.0.3')
  const css = fs.readFileSync(path.join(root, 'WantedSansVariable.css'))
  assert.equal(hash(css), manifest.cssSha256)
  const references = [...css.toString().matchAll(/url\(['"]?(?:\.\/)?([^)'"\s]+)['"]?\)/g)].map(match => match[1]).sort()
  assert.equal(references.length, 92)
  assert.deepEqual(references, manifest.files.map(file => file.path).sort())
  for (const file of manifest.files) {
    assert.match(file.path, /^woff2\/WantedSansVariable\.split\.\d+\.woff2$/)
    const bytes = fs.readFileSync(path.join(root, file.path))
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2')
    assert.equal(bytes.length, file.bytes)
    assert.equal(hash(bytes), file.sha256, file.path)
  }
  const license = fs.readFileSync(path.join(root, 'OFL.txt'))
  assert.equal(hash(license), manifest.licenseSha256)
  assert.deepEqual(fs.readFileSync(new URL('../../../public/licenses/wanted-sans-OFL-1.1.txt', import.meta.url)), license)
})
