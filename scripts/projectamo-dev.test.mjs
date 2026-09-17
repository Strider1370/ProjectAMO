import assert from 'node:assert/strict'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { cleanupTestDataPath, prepareTestDataPath, waitForStartedProcess, waitForUrl, withServers } from './projectamo-dev.mjs'

function started(name) {
  return { name, child: { pid: 100, exitCode: null, signalCode: null } }
}

test('readiness requires the launcher-owned child to survive an HTTP success', async () => {
  const occupiedBackendPort = {
    name: 'backend',
    child: { pid: 101, exitCode: 1, signalCode: null },
  }

  await assert.rejects(
    waitForUrl('http://fixture.invalid/api/health', 'backend', occupiedBackendPort, {
      fetchImpl: async () => new Response('', { status: 200 }),
      timeoutMs: 1,
    }),
    /backend process exited before readiness \(exit code 1\)/,
  )
})

test('own startup signal is required before probing a possibly occupied port', async () => {
  const failedLauncherChild = {
    name: 'backend',
    child: { pid: 102, exitCode: null, signalCode: null },
    ready: Promise.reject(new Error('backend process exited before its own startup signal')),
  }

  await assert.rejects(waitForStartedProcess(failedLauncherChild), /own startup signal/)
})

test('cleanup receives only launcher-owned fixture children, never a pre-existing server', async () => {
  const backend = started('backend')
  const frontend = started('frontend')
  const humanServer = { name: 'human-owned-server', child: { pid: 999, exitCode: null, signalCode: null } }
  const stopped = []

  await withServers(async () => {}, {
    startServersFn: async () => ({ backend, frontend }),
    waitForStartedProcessFn: async (entry) => {
      assert.ok(entry === backend || entry === frontend)
    },
    waitForUrlFn: async (_url, _label, entry) => {
      assert.ok(entry === backend || entry === frontend)
    },
    stopProcessFn: (entry) => stopped.push(entry),
  })

  assert.deepEqual(stopped, [frontend, backend])
  assert.ok(!stopped.includes(humanServer))
})

test('dev:test creates and removes only its unique ignored data path when DATA_PATH is absent', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'projectamo-dev-test-'))
  const env = {}
  try {
    const testData = await prepareTestDataPath(env, { directory })
    assert.equal(testData.ownsDataPath, true)
    assert.equal(env.DATA_PATH, testData.dataPath)
    assert.match(testData.dataPath, new RegExp(`^${directory.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}${path.sep}run-`))
    await writeFile(path.join(testData.dataPath, 'projectamo.db'), 'isolated fixture')
    assert.equal(await cleanupTestDataPath(testData), true)
    await assert.rejects(access(testData.dataPath))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('dev:test preserves a caller-owned DATA_PATH and never removes it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'projectamo-dev-user-data-'))
  const env = { DATA_PATH: directory }
  try {
    const testData = await prepareTestDataPath(env)
    assert.deepEqual(testData, { dataPath: directory, ownsDataPath: false })
    await writeFile(path.join(directory, 'projectamo.db'), 'caller fixture')
    assert.equal(await cleanupTestDataPath(testData), false)
    await access(path.join(directory, 'projectamo.db'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
