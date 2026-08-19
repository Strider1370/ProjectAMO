import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('App code-splits the monitoring route', () => {
  const source = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8')
  assert.match(source, /lazy\s*\(\s*\(\)\s*=>\s*import\('\.\.\/features\/monitoring\/MonitoringPage\.jsx'\)/)
})

test('monitoring route provides auth context to its MapView', () => {
  const source = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8')
  assert.match(source, /window\.location\.pathname === '\/monitoring'[\s\S]*?<AuthProvider><MonitoringPage \/><\/AuthProvider>/)
})
