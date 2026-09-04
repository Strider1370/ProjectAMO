import { test } from 'node:test'
import assert from 'node:assert/strict'

import { successMessage } from '../src/satellite/worker-protocol.js'
import { createUsageMeter } from '../src/satellite/usage-meter.js'
import { EventEmitter } from 'node:events'

// fork된 자식 흉내 — 메시지 하나 보내고 정상 종료한다.
function fakeChild(message) {
  const child = new EventEmitter()
  child.send = () => {
    setImmediate(() => {
      child.emit('message', message)
      setImmediate(() => child.emit('exit', 0, null))
    })
  }
  child.kill = () => {}
  child.removeListener = child.removeListener.bind(child)
  return child
}

const work = (over = {}) => ({ result: { type: 'satellite', saved: true }, followUps: [], ...over })

test('successMessage: 워커가 잰 사용량을 실어 나른다', () => {
  const msg = successMessage(work({ apiHubUsage: [{ endpoint: 'satellite_ir', bytes: 1234, status: 200 }] }))
  assert.deepEqual(msg.result.apiHubUsage, [{ endpoint: 'satellite_ir', bytes: 1234, status: 200 }])
})

test('successMessage: 사용량이 없으면 필드를 만들지 않는다 — 옛 메시지와 그대로 호환된다', () => {
  assert.equal(Object.hasOwn(successMessage(work()).result, 'apiHubUsage'), false)
  assert.equal(Object.hasOwn(successMessage(work({ apiHubUsage: [] })).result, 'apiHubUsage'), false)
})

test('successMessage: 망가진 사용량은 거부한다 — 엉터리 숫자가 예산 집계에 들어가면 안 된다', () => {
  const bad = [
    [{ endpoint: '', bytes: 1, status: 200 }],
    [{ endpoint: 'satellite_ir', bytes: -1, status: 200 }],
    [{ endpoint: 'satellite_ir', bytes: 'x', status: 200 }],
    [{ endpoint: 'satellite_ir', bytes: 1, status: 'ok' }],
    [{ endpoint: 'satellite_ir', bytes: 1 }],
    'not-an-array',
  ]
  for (const apiHubUsage of bad) {
    assert.throws(() => successMessage(work({ apiHubUsage })), /invalid satellite worker api hub usage/)
  }
})

// ── 워커 안에서 재는 쪽 ──

test('usage-meter: apihub 호출만 재고 나머지는 그대로 흘려보낸다', async () => {
  const calls = []
  const fetchImpl = async (url) => { calls.push(String(url)); return new Response(new ArrayBuffer(64), { status: 200 }) }
  let time = 100
  const meter = createUsageMeter({ fetchImpl, now: () => time++ })

  await meter.fetch('https://apihub.kma.go.kr/api/typ01/url/sat/GK2A/LE1B/IR105/KO/data?date=1&authKey=K')
  await meter.fetch('https://example.com/other')

  assert.equal(calls.length, 2, '두 호출 모두 실제로 나간다')
  assert.deepEqual(meter.take(), [{ endpoint: 'satellite_ir', bytes: 64, status: 200, durationMs: 1 }])
})

test('usage-meter: 가시 채널과 안개는 따로 센다', async () => {
  const fetchImpl = async () => new Response(new ArrayBuffer(8), { status: 200 })
  const meter = createUsageMeter({ fetchImpl, now: () => 1 })
  await meter.fetch('https://apihub.kma.go.kr/x/GK2A/LE1B/VI006/KO/data?date=1&authKey=K')
  await meter.fetch('https://apihub.kma.go.kr/x/GK2A/LE2/FOG/KO/data?date=1&authKey=K')
  assert.deepEqual(meter.take().map((u) => u.endpoint), ['satellite_visible', 'satellite_fog'])
})

test('usage-meter: 실패한 호출도 센다 — 바이트는 이미 나갔다', async () => {
  const fetchImpl = async () => new Response(new ArrayBuffer(16), { status: 500 })
  const meter = createUsageMeter({ fetchImpl, now: () => 1 })
  await meter.fetch('https://apihub.kma.go.kr/x/GK2A/LE1B/IR105/KO/data?date=1&authKey=K')
  assert.deepEqual(meter.take(), [{ endpoint: 'satellite_ir', bytes: 16, status: 500, durationMs: 0 }])
})

test('usage-meter: take()는 비우고 준다 — 같은 사용량을 두 번 세면 예산이 부풀려진다', async () => {
  const fetchImpl = async () => new Response(new ArrayBuffer(4), { status: 200 })
  const meter = createUsageMeter({ fetchImpl, now: () => 1 })
  await meter.fetch('https://apihub.kma.go.kr/x/GK2A/LE1B/IR105/KO/data?date=1&authKey=K')
  assert.equal(meter.take().length, 1)
  assert.deepEqual(meter.take(), [])
})

test('usage-meter: 응답 본문은 그대로 읽을 수 있어야 한다 — 재느라 소비하면 수집이 깨진다', async () => {
  const fetchImpl = async () => new Response(new TextEncoder().encode('hello'), { status: 200 })
  const meter = createUsageMeter({ fetchImpl, now: () => 1 })
  const res = await meter.fetch('https://apihub.kma.go.kr/x/GK2A/LE1B/IR105/KO/data?date=1&authKey=K')
  assert.equal(await res.text(), 'hello')
})

// ── 부모가 받아 장부에 적는 쪽 ──

test('runSatelliteWorker: 워커가 보고한 사용량을 부모가 장부에 적는다', async () => {
  const { runSatelliteWorker } = await import('../src/satellite/worker-runner.js')
  const recorded = []
  const executions = []
  const child = fakeChild({
    ok: true,
    result: {
      result: { type: 'satellite', saved: true },
      followUps: [],
      apiHubUsage: [
        { endpoint: 'satellite_ir', bytes: 2048, status: 200, durationMs: 20 },
        { endpoint: 'satellite_fog', bytes: 512, status: 404, durationMs: 30 },
      ],
    },
  })
  const work = await runSatelliteWorker(
    { kind: 'satellite', mode: 'current', now: new Date().toISOString() },
    { forkImpl: () => child, recordUsage: (entry) => recorded.push(entry), recordExecution: (entry) => executions.push(entry) },
  )
  assert.equal(work.result.type, 'satellite')
  assert.deepEqual(recorded, [
    { endpoint: 'satellite_ir', bytes: 2048, status: 200, durationMs: 20 },
    { endpoint: 'satellite_fog', bytes: 512, status: 404, durationMs: 30 },
  ])
  assert.deepEqual(executions, recorded)
})

test('runSatelliteWorker: 사용량이 없으면 아무것도 적지 않는다', async () => {
  const { runSatelliteWorker } = await import('../src/satellite/worker-runner.js')
  const recorded = []
  const child = fakeChild({ ok: true, result: { result: { type: 'satellite', saved: false }, followUps: [] } })
  await runSatelliteWorker(
    { kind: 'satellite', mode: 'current', now: new Date().toISOString() },
    { forkImpl: () => child, recordUsage: (entry) => recorded.push(entry) },
  )
  assert.deepEqual(recorded, [])
})
