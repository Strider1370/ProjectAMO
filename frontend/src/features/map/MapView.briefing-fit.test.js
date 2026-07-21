import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./MapView.jsx', import.meta.url), 'utf8')

test('briefing route fit waits for the lazy briefing panel to mount', () => {
  assert.match(source, /new MutationObserver\(/)
  assert.match(source, /querySelector\('\.briefing-view'\)/)
})
