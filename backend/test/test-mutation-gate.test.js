import assert from 'node:assert/strict'
import express from 'express'
import test from 'node:test'

import { createDevRouter } from '../src/dev/scenario.js'
import { isTestMutationApiEnabled, mountTestMutationApi } from '../src/dev/test-mutation-gate.js'
import { createHealthStatus } from '../src/health.js'

const enabled = (overrides = {}) => isTestMutationApiEnabled({
  NODE_ENV: 'development',
  DATA_PATH: '/tmp/projectamo-isolated-test-data',
  ENABLE_TEST_MUTATIONS: '1',
  ...overrides,
})

test('test mutation API requires non-production mode, exact flag, and explicit data path', () => {
  assert.equal(enabled(), true)
  assert.equal(enabled({ NODE_ENV: undefined }), true)
  assert.equal(enabled({ NODE_ENV: 'production' }), false)
  assert.equal(enabled({ NODE_ENV: 'test' }), false)
  assert.equal(enabled({ ENABLE_TEST_MUTATIONS: undefined }), false)
  assert.equal(enabled({ ENABLE_TEST_MUTATIONS: '0' }), false)
  assert.equal(enabled({ ENABLE_TEST_MUTATIONS: 'true' }), false)
  assert.equal(enabled({ DATA_PATH: '' }), false)
  assert.equal(enabled({ DATA_PATH: undefined }), false)
})

test('collection disable flag does not grant or revoke test mutation access', () => {
  assert.equal(enabled({ DISABLE_COLLECTION: undefined }), true)
  assert.equal(enabled({ DISABLE_COLLECTION: '0' }), true)
  assert.equal(enabled({ DISABLE_COLLECTION: '1' }), true)
  assert.equal(enabled({ ENABLE_TEST_MUTATIONS: '0', DISABLE_COLLECTION: '1' }), false)
})

test('health capability uses the exact mutation gate without exposing its execution inputs', () => {
  const enabledEnv = {
    NODE_ENV: 'development', DATA_PATH: '/tmp/projectamo-isolated-test-data', ENABLE_TEST_MUTATIONS: '1', DISABLE_COLLECTION: '1',
  }
  const enabledStatus = createHealthStatus(enabledEnv, 42)
  assert.deepEqual(enabledStatus, {
    ok: true,
    uptime: 42,
    testMode: true,
    capabilities: { testMutations: true },
  })
  assert.doesNotMatch(JSON.stringify(enabledStatus), /DATA_PATH|ENABLE_TEST_MUTATIONS|projectamo-isolated-test-data/)

  const disabledStatus = createHealthStatus({ ...enabledEnv, ENABLE_TEST_MUTATIONS: '0' }, 42)
  assert.equal(disabledStatus.capabilities.testMutations, false)
})

test('mount helper registers the dev router only when the full gate passes', () => {
  const mounts = []
  const app = { use: (...args) => mounts.push(args) }
  const router = { fixture: true }
  assert.equal(mountTestMutationApi(app, () => router, {
    NODE_ENV: 'development', DATA_PATH: '/tmp/isolated', ENABLE_TEST_MUTATIONS: '1', DISABLE_COLLECTION: '0',
  }), true)
  assert.deepEqual(mounts, [['/api/dev', router]])

  mounts.length = 0
  assert.equal(mountTestMutationApi(app, () => router, {
    NODE_ENV: 'production', DATA_PATH: '/tmp/isolated', ENABLE_TEST_MUTATIONS: '1', DISABLE_COLLECTION: '1',
  }), false)
  assert.deepEqual(mounts, [])
})

test('mounted test mutation API still requires an authenticated session', async () => {
  const app = express()
  app.use((req, _res, next) => {
    req.session = req.headers.authorization ? { userId: 1, role: 'pilot' } : {}
    next()
  })
  assert.equal(mountTestMutationApi(app, () => createDevRouter({ db: {} }), {
    NODE_ENV: 'development', DATA_PATH: '/tmp/isolated', ENABLE_TEST_MUTATIONS: '1',
  }), true)
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/dev/vitals`
    assert.equal((await fetch(url)).status, 401)
    assert.equal((await fetch(url, { headers: { authorization: 'fixture' } })).status, 200)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
