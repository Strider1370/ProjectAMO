import assert from 'node:assert/strict'
import net from 'node:net'
import test from 'node:test'

test('collector runtime disables network family autoselection', async () => {
  net.setDefaultAutoSelectFamily(true)
  await import(`../src/index.js?network-family-test=${Date.now()}`)
  assert.equal(net.getDefaultAutoSelectFamily(), false)
})
