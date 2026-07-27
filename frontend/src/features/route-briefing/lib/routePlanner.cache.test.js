import assert from 'node:assert/strict'
import test from 'node:test'

// navdata 캐시는 모듈 수준 상태라 케이스마다 새 인스턴스가 필요하다.
// ESM 모듈 캐시는 쿼리까지 포함한 URL로 구분되므로 ?case=N으로 갈라 쓴다.
let caseId = 0
function freshPlanner() {
  caseId += 1
  return import(`./routePlanner.js?case=${caseId}`)
}

const AIRPORTS = { RKSI: { icao: 'RKSI', lon: 126.45, lat: 37.46 } }
const ENROUTE = { points: {}, segments: [], routes: {} }

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200 })
}

// 파일별 응답을 돌려주는 fetch 대역. 호출 횟수를 URL별로 센다.
function stubFetch({ fail = false, delayMs = 0 } = {}) {
  const calls = new Map()
  const fn = async (url) => {
    const name = String(url).split('/').at(-1)
    calls.set(name, (calls.get(name) ?? 0) + 1)
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (fail) throw new TypeError('network down')
    if (name === 'airports.json') return jsonResponse(AIRPORTS)
    if (name === 'enroute.json') return jsonResponse(ENROUTE)
    return new Response('', { status: 404 }) // 해외 파일은 선택 사항
  }
  fn.calls = calls
  return fn
}

async function withFetch(stub, run) {
  const original = global.fetch
  global.fetch = stub
  try {
    return await run()
  } finally {
    global.fetch = original
  }
}

test('loadNavdata: 동시에 여러 번 불러도 파일은 한 번만 받는다', async () => {
  const { loadNavdata } = await freshPlanner()
  const stub = stubFetch({ delayMs: 20 }) // 받는 도중에 뒤 호출이 들어오도록

  const results = await withFetch(stub, () => Promise.all([
    loadNavdata(), loadNavdata(), loadNavdata(), loadNavdata(),
  ]))

  assert.equal(stub.calls.get('airports.json'), 1, 'airports.json은 1회만 받아야 한다')
  assert.equal(stub.calls.get('enroute.json'), 1, 'enroute.json은 1회만 받아야 한다')
  assert.equal(stub.calls.get('route-segments-overseas.json'), 1)
  // 넷 다 같은 결과를 받아간다
  for (const r of results) assert.equal(r, results[0])
})

test('loadNavdata: 실패한 뒤 다시 부르면 재시도한다 (실패를 캐시하지 않는다)', async () => {
  const { loadNavdata } = await freshPlanner()

  const failing = stubFetch({ fail: true })
  await withFetch(failing, async () => {
    await assert.rejects(loadNavdata(), '실패는 부르는 쪽에 그대로 전달돼야 한다')
  })

  // 네트워크가 돌아온 뒤 — 재시도되지 않으면 새로고침 전까지 경로 브리핑이 영영 안 된다
  const working = stubFetch()
  const navdata = await withFetch(working, () => loadNavdata())

  assert.ok(navdata.airports.RKSI, '복구 후에는 정상 로드돼야 한다')
  assert.equal(working.calls.get('airports.json'), 1, '실제로 다시 받아야 한다')
})

test('loadNavdata: 성공한 뒤에는 다시 받지 않는다', async () => {
  const { loadNavdata } = await freshPlanner()
  const stub = stubFetch()

  await withFetch(stub, async () => {
    await loadNavdata()
    await loadNavdata()
  })

  assert.equal(stub.calls.get('airports.json'), 1)
})

test('loadOverseasAirports: 실패하면 {}를 주되 다음에 재시도한다', async () => {
  const { loadOverseasAirports } = await freshPlanner()

  const failing = stubFetch({ fail: true })
  const empty = await withFetch(failing, () => loadOverseasAirports())
  assert.deepEqual(empty, {}, '실패 시 계약대로 빈 객체를 준다(예외를 던지지 않는다)')

  const working = async () => jsonResponse({ KLAX: { icao: 'KLAX' } })
  const recovered = await withFetch(working, () => loadOverseasAirports())
  assert.ok(recovered.KLAX, '복구 후에는 실제 데이터를 받아야 한다')
})

test('loadOverseasAirports: 동시 호출은 한 번만 받는다', async () => {
  const { loadOverseasAirports } = await freshPlanner()
  let calls = 0
  const stub = async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return jsonResponse({ KLAX: { icao: 'KLAX' } })
  }

  await withFetch(stub, () => Promise.all([
    loadOverseasAirports(), loadOverseasAirports(), loadOverseasAirports(),
  ]))

  assert.equal(calls, 1)
})
