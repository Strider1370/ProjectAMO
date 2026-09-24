import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMcpHttpApp } from '../src/ai/mcp.js'
import { createWorkerExecutor } from '../src/ai/worker-executor.js'
import { createLocalRuntime } from '../src/ai/local-runtime.js'

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/ai/gimpo-jeju.json', import.meta.url)))
async function start(options = {}) {
  const runtime = createLocalRuntime({ dataRoot: '/nonexistent-ai-mcp-fixture', fixture })
  const mcp = createMcpHttpApp({ executor: runtime, fixture, ...options })
  const server = http.createServer(mcp.app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`)
  return { url, async close() { await mcp.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)) } }
}
async function connect(url) {
  const client = new Client({ name: 'projectamo-test', version: '1' })
  const transport = new StreamableHTTPClientTransport(url)
  await client.connect(transport)
  return { client, transport }
}
function rawPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.end(body)
  })
}

test('HTTP SDK initialization, schemas, real tools, follow-up, errors and session isolation', async () => {
  const events = []
  const server = await start({ audit: (e) => events.push(e) })
  const a = await connect(server.url)
  const b = await connect(server.url)
  try {
    const tools = await a.client.listTools()
    assert.deepEqual(tools.tools.map((t) => t.name), ['get_airport_weather', 'get_weather_advisories', 'get_route_briefing', 'get_briefing_detail', 'compare_route_altitudes'])
    assert.ok(tools.tools.every((t) => t.annotations.readOnlyHint && t.outputSchema))
    const advisory = await a.client.callTool({ name: 'get_weather_advisories', arguments: {} })
    assert.equal(advisory.isError, true)
    assert.equal(JSON.parse(advisory.content[0].text).error.code, 'DATA_UNAVAILABLE')
    const route = await a.client.callTool({ name: 'get_route_briefing', arguments: { fixture_id: fixture.id } })
    assert.equal(route.isError, undefined)
    assert.equal(route.structuredContent.status, 'partial')
    const ref = route.structuredContent.reference.briefingRef
    const args = { briefing_ref: ref, section: 'provenance' }
    const detail = await a.client.callTool({ name: 'get_briefing_detail', arguments: args })
    assert.equal(detail.structuredContent.reference.resultHash, route.structuredContent.reference.resultHash)
    const denied = await b.client.callTool({ name: 'get_briefing_detail', arguments: args })
    assert.equal(denied.isError, true)
    assert.equal(JSON.parse(denied.content[0].text).error.code, 'REFERENCE_NOT_FOUND')
    const comparison = await a.client.callTool({ name: 'compare_route_altitudes', arguments: { briefing_ref: ref, altitudes_ft: [31000, 33000] } })
    assert.equal(comparison.structuredContent.reference.parentResultHash, route.structuredContent.reference.resultHash)
    assert.deepEqual(comparison.structuredContent.data.rows.map((row) => row.status), ['input_only', 'input_only'])
    const foreignComparison = await b.client.callTool({ name: 'compare_route_altitudes', arguments: { briefing_ref: ref, altitudes_ft: [31000, 33000] } })
    assert.equal(foreignComparison.isError, true)
    const bad = await a.client.callTool({ name: 'get_route_briefing', arguments: { fixture_id: '../../secret' } })
    assert.equal(bad.isError, true)
    const unknown = await a.client.callTool({ name: 'unknown_tool', arguments: {} })
    assert.equal(unknown.isError, true)
    const ambiguous = await a.client.callTool({ name: 'get_airport_weather', arguments: {
      airports: ['서울'], window: { start: fixture.request.etd, end: fixture.request.eta },
    } })
    assert.equal(ambiguous.isError, true)
    assert.equal(JSON.parse(ambiguous.content[0].text).error.code, 'AMBIGUOUS_AIRPORT')
    assert.ok(events.some((e) => e.tool === 'get_route_briefing' && e.bytes > 0))
    assert.ok(events.every((e) => !('input' in e)))
  } finally { await a.client.close(); await b.client.close(); await server.close() }
})

test('HTTP rejects foreign Host/Origin, oversized JSON and uninitialized calls', async () => {
  const server = await start()
  try {
    for (const [headers, body, status] of [
      [{ Host: 'evil.example' }, '{}', 403],
      [{ Origin: 'https://evil.example' }, '{}', 403],
      [{}, JSON.stringify({ huge: 'x'.repeat(17 * 1024) }), 413],
      [{}, '{}', 400],
      [{}, '[]', 400],
      [{}, '{bad', 400],
    ]) {
      assert.equal(await rawPost(server.url, headers, body), status)
    }
  } finally { await server.close() }
})

test('live MCP exposes general route planning without fixture IDs and isolates generated contexts by session', async () => {
  const executor = createWorkerExecutor({ dataRoot: '/nonexistent-ai-mcp-live', planningOptions: { servedNavdataRoot: null } })
  const server = await start({ executor, fixture: null })
  const a = await connect(server.url), b = await connect(server.url)
  try {
    const tools = (await a.client.listTools()).tools
    assert.ok(tools.some((tool) => tool.name === 'plan_route' && tool.annotations.readOnlyHint))
    assert.equal(tools.find((tool) => tool.name === 'get_route_briefing').inputSchema.properties.fixture_id, undefined)
    const missing = await a.client.callTool({ name: 'plan_route', arguments: { departure: '김포', arrival: '제주' } })
    assert.equal(missing.structuredContent.data.planningState, 'input_required')
    assert.deepEqual(missing.structuredContent.data.missingFields, ['flightRule', 'cruiseAltitudeFt', 'etd', 'tasKt'])
    const planned = await a.client.callTool({ name: 'plan_route', arguments: {
      departure: '김포', arrival: '제주', flightRule: 'IFR', cruiseAltitude: { value: 310, unit: 'FL' },
      departureLocal: '2026-09-23T21:03', tasKt: 450,
    } })
    assert.equal(planned.structuredContent?.data.planningState, 'planned', JSON.stringify(planned))
    const args = { context_ref: planned.structuredContent.reference.contextRef }
    const denied = await b.client.callTool({ name: 'get_route_briefing', arguments: args })
    assert.equal(denied.isError, true)
    assert.equal(JSON.parse(denied.content[0].text).error.code, 'REFERENCE_NOT_FOUND')
    const briefing = await a.client.callTool({ name: 'get_route_briefing', arguments: args })
    assert.equal(briefing.structuredContent.status, 'partial')
    assert.equal(briefing.structuredContent.reference.contextRef, args.context_ref)
    assert.equal(briefing.structuredContent.data.routePlan.flight.departureAirport, 'RKSS')
    assert.equal(briefing.structuredContent.data.flight.etd, '2026-09-23T12:03:00.000Z')
  } finally { await a.client.close(); await b.client.close(); await server.close() }
})

test('HTTP request rate and session count are bounded', async () => {
  const server = await start({ maxRequestsPerMinute: 2 })
  try {
    for (let i = 0; i < 2; i++) await fetch(server.url)
    assert.equal((await fetch(server.url)).status, 429)
  } finally { await server.close() }
  const one = await start({ maxSessions: 1 })
  const first = await connect(one.url)
  try { await assert.rejects(() => connect(one.url), /Session limit exceeded/) }
  finally { await first.client.close(); await one.close() }
})

test('expired MCP session cannot be used to access stored results', async () => {
  let time = Date.now()
  const server = await start({ now: () => time, sessionTtlMs: 1000 })
  const session = await connect(server.url)
  try {
    const id = session.transport.sessionId
    assert.ok(id)
    time += 1001
    const response = await fetch(server.url, { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'mcp-session-id': id,
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }) })
    assert.equal(response.status, 404)
  } finally { await session.client.close(); await server.close() }
})

test('worker enforces concurrency and a hard deadline, then remains usable', async () => {
  const executor = createWorkerExecutor({ dataRoot: '/nonexistent-ai-mcp-fixture', fixture }, { timeoutMs: 1, maxPending: 1 })
  try {
    const pending = executor.call('get_route_briefing', { fixture_id: fixture.id }, 'test')
    assert.equal((await executor.call('get_route_briefing', { fixture_id: fixture.id }, 'test')).error.code, 'BUSY')
    assert.equal((await pending).error.code, 'TIMEOUT')
  } finally { await executor.close() }
  const usable = createWorkerExecutor({ dataRoot: '/nonexistent-ai-mcp-fixture', fixture })
  try {
    const [result, second] = await Promise.all([
      usable.call('get_route_briefing', { fixture_id: fixture.id }, 'test'),
      usable.call('get_route_briefing', { fixture_id: fixture.id }, 'test'),
    ])
    assert.equal(result.status, 'partial')
    assert.equal(second.status, 'partial')
    const controller = new AbortController()
    controller.abort()
    assert.equal((await usable.call('get_route_briefing', { fixture_id: fixture.id }, 'test', controller.signal)).error.code, 'CANCELLED')
  } finally { await usable.close() }
})
