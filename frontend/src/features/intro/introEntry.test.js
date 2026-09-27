import assert from 'node:assert/strict'
import test from 'node:test'
import { rememberDashboardEntry, shouldShowIntro } from './introEntry.js'

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('bare root shows intro until the visitor enters the dashboard', () => {
  const localStorage = storage()
  const sessionStorage = storage()
  const root = { pathname: '/', search: '', hash: '' }
  assert.equal(shouldShowIntro(root, localStorage, sessionStorage), true)

  rememberDashboardEntry({ localStorage, sessionStorage })
  assert.equal(shouldShowIntro(root, localStorage, sessionStorage), false)
  assert.equal(shouldShowIntro(root, localStorage, storage()), true)
})

test('do not show again persists across browser sessions', () => {
  const localStorage = storage()
  rememberDashboardEntry({ skipFuture: true, localStorage, sessionStorage: storage() })
  assert.equal(shouldShowIntro({ pathname: '/', search: '', hash: '' }, localStorage, storage()), false)
})

test('direct dashboard and feature links bypass intro', () => {
  const localStorage = storage()
  const sessionStorage = storage()
  for (const location of [
    { pathname: '/dashboard', search: '', hash: '' },
    { pathname: '/', search: '?flight=42', hash: '' },
    { pathname: '/', search: '?airport=RKSI', hash: '' },
    { pathname: '/', search: '', hash: '#map' },
  ]) {
    assert.equal(shouldShowIntro(location, localStorage, sessionStorage), false)
  }
})
