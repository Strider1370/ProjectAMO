import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { createDemoInstance } from '../src/dev/demo-instance.js'

function fakeChild() {
  const child = new EventEmitter()
  child.pid = 4242
  child.exitCode = null
  child.signalCode = null
  child.killed = []
  child.kill = (signal) => { child.killed.push(signal); child.exitCode = 0; child.emit('exit', 0, signal) }
  return child
}

function harness({ ready = true, memory = [2e9], aborted = [] } = {}) {
  const calls = []
  const children = []
  const memoryQueue = [...memory]
  const instance = createDemoInstance({
    basePath: '/live',
    activePath: '/live/.demo-active',
    port: 3002,
    views: {
      activateDemo: (name) => { calls.push(`view:${name}`); return { referenceTime: '2026-10-18T02:13:56.997Z' } },
      activateLive: () => calls.push('view:live'),
    },
    inspect: (_root, name) => ({ ready, blockers: ready ? [] : ['radar:short_history:3/36'], name }),
    launch: ({ port, activePath }) => { calls.push(`launch:${port}:${activePath}`); const child = fakeChild(); children.push(child); return child },
    waitHealthy: async () => calls.push('healthy'),
    memAvailable: () => (memoryQueue.length > 1 ? memoryQueue.shift() : memoryQueue[0]),
    minAvailableBytes: 500,
    abortExpanded: () => { calls.push('abort-expanded'); return aborted },
    pauseExpanded: (reason) => calls.push(`pause:${reason}`),
    resumeExpanded: () => calls.push('resume'),
    memoryWaitMs: 10_000,
    sleep: async () => {},
  })
  return { instance, calls, children }
}

test('starting the demo backend pauses and aborts expanded KIM, points the demo view at the snapshot, and waits until it answers', async () => {
  const { instance, calls } = harness({ aborted: ['kim_expanded_06'] })
  const started = await instance.start('snapshot-1')
  assert.deepEqual(calls, ['pause:demo_instance_running', 'abort-expanded', 'view:snapshot-1', 'launch:3002:/live/.demo-active', 'healthy'])
  assert.equal(started.running, true)
  assert.deepEqual(started.abortedExpanded, ['kim_expanded_06'])
  assert.equal(instance.status().referenceTime, '2026-10-18T02:13:56.997Z')
  await assert.rejects(instance.start('snapshot-1'), (error) => error.code === 'demo_instance_running')

  await instance.stop()
  assert.equal(instance.status().running, false)
  assert.deepEqual(calls.slice(-2), ['view:live', 'resume'])
})

test('a snapshot that is not ready or too little memory leaves expanded KIM and the view as they were', async () => {
  const notReady = harness({ ready: false })
  await assert.rejects(notReady.instance.start('snapshot-1'), (error) => error.code === 'snapshot_not_ready' && error.report.blockers.length === 1)
  assert.deepEqual(notReady.calls, [])

  // 확대 회차를 끊은 뒤 메모리가 돌아오기를 기다리다 끝내 모자라면 띄우지 않는다.
  const low = harness({ memory: [100, 200, 300], aborted: ['kim_expanded_00'] })
  await assert.rejects(low.instance.start('snapshot-1'), (error) => error.code === 'demo_instance_low_memory' && error.required === 500)
  assert.equal(low.calls.some((call) => call.startsWith('launch')), false)
  assert.deepEqual(low.calls.slice(-2), ['view:live', 'resume'])

  // 메모리가 돌아오면 띄운다.
  const recovers = harness({ memory: [100, 900], aborted: ['kim_expanded_00'] })
  assert.equal((await recovers.instance.start('snapshot-1')).running, true)
})

test('if the demo backend exits on its own, expanded KIM is allowed again and the view returns to live', async () => {
  const { instance, calls, children } = harness()
  await instance.start('snapshot-1')
  children[0].exitCode = 1
  children[0].emit('exit', 1, null)
  assert.equal(instance.status().running, false)
  assert.equal(instance.status().lastExit.code, 1)
  assert.deepEqual(calls.slice(-2), ['view:live', 'resume'])
})

test('admin routes: the main backend starts the demo backend and sets this browser\'s demo cookie; the demo backend can only clear it', async () => {
  const { default: express } = await import('express')
  const { default: cookieParser } = await import('cookie-parser')
  const { default: session } = await import('express-session')
  const { createDb } = await import('../src/db/index.js')
  const { createUser } = await import('../src/db/users.js')
  const { sessionMiddleware } = await import('../src/auth/session.js')
  const { createAuthRouter } = await import('../src/auth/router.js')
  const { createAdminRouter } = await import('../src/admin/router.js')
  const db = createDb(':memory:')
  createUser(db, { username: 'boss', password: 'password1', role: 'admin' })
  let running = false
  const fakeInstance = {
    status: () => ({ running, name: running ? 'snapshot-1' : null }),
    start: async (name) => { running = true; return { running, name, abortedExpanded: [] } },
    stop: async () => { running = false; return { running } },
  }
  const serve = async (isDemoBackend) => {
    const app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use(sessionMiddleware({ db, secret: 'test-secret-000000000000000000000000000000', store: new session.MemoryStore() }))
    app.use('/api/auth', createAuthRouter({ db }))
    app.use('/api/admin', createAdminRouter({ db, demoInstance: fakeInstance, isDemoBackend }))
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    const url = (pathname) => `http://127.0.0.1:${server.address().port}${pathname}`
    const login = await fetch(url('/api/auth/login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'password1' }) })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const post = (pathname, body) => fetch(url(pathname), { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const get = (pathname) => fetch(url(pathname), { headers: { cookie } }).then((r) => r.json())
    return { server, post, get }
  }
  const main = await serve(false)
  const demo = await serve(true)
  try {
    assert.equal((await main.post('/api/admin/demo-view', { on: true })).status, 409)
    assert.equal((await main.post('/api/admin/demo-instance/start', { name: '../x' })).status, 400)
    assert.equal((await (await main.post('/api/admin/demo-instance/start', { name: 'snapshot-1' })).json()).running, true)
    const on = await main.post('/api/admin/demo-view', { on: true })
    assert.match(on.headers.get('set-cookie'), /^projectamo_demo=1;.*Max-Age=43200.*HttpOnly.*SameSite=Lax/)
    const off = await main.post('/api/admin/demo-view', { on: false })
    assert.match(off.headers.get('set-cookie'), /^projectamo_demo=;.*Expires=Thu, 01 Jan 1970/)

    assert.deepEqual(await demo.get('/api/admin/demo-instance'), { role: 'demo' })
    assert.equal((await demo.post('/api/admin/demo-instance/stop', {})).status, 409)
    assert.match((await demo.post('/api/admin/demo-view', { on: false })).headers.get('set-cookie'), /^projectamo_demo=;/)

    assert.equal((await (await main.post('/api/admin/demo-instance/stop', {})).json()).running, false)
    assert.equal((await main.get('/api/admin/demo-instance')).role, 'main')
  } finally {
    main.server.close()
    demo.server.close()
  }
})
