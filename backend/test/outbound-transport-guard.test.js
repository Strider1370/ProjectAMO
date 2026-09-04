import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return entry.name.endsWith('.js') ? [target] : []
  })
}

test('only the observable request seam owns outbound transports', () => {
  const files = [...sourceFiles(path.join(root, 'src')), path.join(root, 'server.js')]
  const violations = []
  for (const file of files) {
    if (file.endsWith(path.join('lib', 'request-observability.js'))) continue
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    if (/(^|[^.\w])fetch\s*\(|\bhttps?\.request\s*\(|\bhttps?\.get\s*\(/m.test(source)) violations.push(path.relative(root, file))
  }
  assert.deepEqual(violations, [])
})
