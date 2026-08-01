import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildCaptureCommand, createManifest, safePathComponent } from './terminal-signage-capture.mjs'

const source = readFileSync(new URL('./terminal-signage-capture.mjs', import.meta.url), 'utf8')

test('captures both terminal signage views at the approved desktop viewport', () => {
  assert.match(source, /\/terminal\?autoplay=0/)
  assert.match(source, /\/terminal\?view=rail&autoplay=0/)
  assert.match(source, /width:\s*1920,\s*height:\s*1080/)
  assert.match(source, /document\.fonts\.ready/)
  assert.match(source, /getByRole\('heading', \{ name: '출발 항공편 · 도착지 날씨' \}\)/)
  assert.match(source, /01-board\.png/)
  assert.match(source, /02-rail\.png/)
  assert.match(source, /expectedView: '1안'/)
  assert.match(source, /expectedView: '3안'/)
  assert.match(source, /expectedRoot: '\[data-testid="option-one"\]'/)
  assert.match(source, /expectedRoot: '\[data-testid="option-three"\]'/)
  assert.match(source, /getByRole\('button', \{ name: route\.expectedView \}\)/)
  assert.match(source, /classList\.contains\('is-active'\)/)
  assert.match(source, /getAttribute\('aria-pressed'\) === 'true'/)
  assert.doesNotMatch(source, /networkidle/)
  for (const field of ['capturedAt', 'commit', 'routes', 'viewport', 'browser', 'command', 'screenshots', 'activeView', 'activeMotion']) {
    assert.match(source, new RegExp(`\\b${field}\\b`))
  }
  assert.match(buildCaptureCommand('terminal-signage', 'before'), /SCREENSHOT_PHASE=terminal-signage.*SCREENSHOT_LABEL=before/)
})

test('records actual phase and only completed screenshots, including partial failures', () => {
  const manifest = createManifest({ capturedAt: '2026-01-01T00:00:00.000Z', commit: 'abc', browser: 'test', phase: 'after', label: 'after' })
  assert.match(manifest.command, /SCREENSHOT_PHASE=after.*SCREENSHOT_LABEL=after/)
  assert.deepEqual(manifest.screenshots, [])
  manifest.screenshots.push('01-board.png')
  manifest.status = 'failed'
  manifest.error = { message: 'rail capture failed' }
  assert.deepEqual(manifest.screenshots, ['01-board.png'])
  assert.equal(manifest.status, 'failed')
  assert.equal(manifest.error.message, 'rail capture failed')
  assert.deepEqual(manifest.activeView, [])
  assert.deepEqual(manifest.activeMotion, [])
})

test('rejects phase and label traversal before output directory creation', () => {
  assert.equal(safePathComponent('terminal-signage', 'phase'), 'terminal-signage')
  assert.throws(() => safePathComponent('../outside', 'phase'), /safe path component/)
  assert.throws(() => safePathComponent('before/after', 'label'), /safe path component/)
})
