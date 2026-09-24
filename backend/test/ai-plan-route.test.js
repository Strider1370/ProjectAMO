import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { createLocalRuntime } from '../src/ai/local-runtime.js'
import { createFileRoutePlanningProvider } from '../src/briefing/route-planning-provider.js'
import { createNavdataProvider } from '../../shared/route-planning/navdataProvider.js'
import { BriefingOutputSchema } from '../src/ai/briefing-contracts.js'
import { createConversationStore } from '../src/ai/conversation-store.js'
import { createChatRunner } from '../src/ai/chat-runner.js'
import { createWorkerExecutor } from '../src/ai/worker-executor.js'

const baseline = JSON.parse(await readFile(new URL('../../shared/fixtures/route-planning-baseline.json', import.meta.url)))
const now = () => Date.parse('2026-09-23T11:46:00Z')
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const complete = { departure: '김포', arrival: '제주', flightRule: 'IFR', cruiseAltitude: { value: 310, unit: 'FL' },
  departureLocal: '2026-09-23T21:03', tasKt: 450 }
const makeRuntime = (options = {}) => createLocalRuntime({ dataRoot: '/nonexistent-ai-planning-test', now,
  planningOptions: { servedNavdataRoot: null }, readSnapshot: () => ({ snapshot: null }), ...options })

test('plan_route asks for every missing condition without defaults, planner I/O or geometry', async () => {
  let reads = 0
  const runtime = makeRuntime({ createPlanningProvider: () => { reads++; throw new Error('unexpected') } })
  const value = await runtime.call('plan_route', { departure: '김포', arrival: '제주' }, 'alice')
  assert.equal(value.data.planningState, 'input_required')
  assert.deepEqual(value.data.missingFields, ['flightRule', 'cruiseAltitudeFt', 'etd', 'tasKt'])
  assert.deepEqual(value.data.suppliedFields, { departureAirport: 'RKSS', arrivalAirport: 'RKPC' })
  assert.equal(value.data.defaultsApplied, false)
  assert.equal(value.reference.contextRef, undefined)
  assert.equal(reads, 0)
  BriefingOutputSchema.parse(value)
})

test('ambiguous airports and unsupported constraints block the whole plan, not a reduced substitute', async () => {
  let reads = 0
  const runtime = makeRuntime({ createPlanningProvider: () => { reads++; throw new Error('unexpected') } })
  for (const [patch, code] of [
    [{ departure: '서울' }, 'AMBIGUOUS_AIRPORT'], [{ arrival: 'RJTT' }, 'AIRPORT_NOT_FOUND'],
    [{ flightRule: 'VFR' }, 'FLIGHT_RULE_UNSUPPORTED'], [{ arrival: '김포' }, 'SAME_ROUTE_ENDPOINTS_UNSUPPORTED'],
    [{ unsupportedConditions: ['BULTI 경유'] }, 'UNSUPPORTED_ROUTE_CONDITIONS'],
    [{ cruiseAltitude: { value: 700, unit: 'FL' } }, 'INVALID_ROUTE_ALTITUDE'],
    [{ departureLocal: '2026-02-30T21:03' }, 'INVALID_LOCAL_TIME'],
    [{ arrivalLocal: '2026-09-23T20:00' }, 'INVALID_ROUTE_TIME_WINDOW'],
  ]) {
    const value = await runtime.call('plan_route', { ...complete, ...patch }, 'alice')
    assert.equal(value.data.planningState, 'blocked', JSON.stringify(value))
    assert.ok(value.issues.some((issue) => issue.code === code), JSON.stringify(value.issues))
    assert.equal(value.reference.contextRef, undefined)
  }
  assert.equal(reads, 0)
  for (const patch of [{ routeGeometry: {} }, { tasKt: 0 }, { path: '/secret' }, { fixture_id: 'x' },
    { departureUtc: '2026-09-23T12:03:00Z' }]) {
    assert.equal((await runtime.call('plan_route', { ...complete, ...patch }, 'alice')).error.code, 'INVALID_TOOL_INPUT')
  }
})

test('four real plans produce owner-bound contexts and the exact baseline geometry/editor for stored briefings', async () => {
  const provider = await createFileRoutePlanningProvider({ servedNavdataRoot: null })
  for (const { input, expected } of baseline.cases) {
    const runtime = makeRuntime({ createPlanningProvider: async () => provider,
      readSnapshot: (kind) => ({ snapshot: kind === 'metar' ? input.metarData : null }) })
    const planned = await runtime.call('plan_route', { ...complete, departure: input.routeForm.departureAirport,
      arrival: input.routeForm.arrivalAirport }, 'alice')
    assert.equal(planned.data?.planningState, 'planned', JSON.stringify(planned))
    assert.equal(planned.data.routeText, expected.routeString)
    assert.equal(planned.data.flight.etd, '2026-09-23T12:03:00.000Z')
    assert.equal(planned.data.flight.eta, expected.eta)
    assert.equal(planned.data.flight.cruiseAltitudeFt, 31000)
    assert.equal(planned.data.distanceNm, expected.totalDistanceNm)
    assert.equal(planned.data.assumptions.operationalClearance, false)
    assert.equal(planned.data.assumptions.routeTypeDefaulted, true)
    assert.equal(planned.data.weatherAssessed, false)
    assert.equal(planned.data.procedures.length, 3)
    assert.ok(Buffer.byteLength(JSON.stringify(planned)) < 5000)
    assert.equal(JSON.stringify(planned).includes('coordinates'), false)
    BriefingOutputSchema.parse(planned)
    const args = { context_ref: planned.reference.contextRef }
    assert.equal((await runtime.call('get_route_briefing', args, 'bob')).error.code, 'REFERENCE_NOT_FOUND')
    const briefing = await runtime.call('get_route_briefing', args, 'alice')
    assert.equal(briefing.status, 'partial', JSON.stringify(briefing))
    assert.equal(briefing.reference.navdataSnapshotId, provider.snapshotId)
    assert.equal(briefing.data.routePlan.assumptions.etaBasis, 'existing-route-distance-over-tas')
    assert.ok(briefing.issues.some((issue) => issue.code === 'MODEL_TIME_COVERAGE_UNVERIFIED'))
    const stored = runtime.getResult(briefing.reference.briefingRef, 'alice')
    assert.equal(hash(stored.plan.editor), expected.editorHash)
    assert.equal(hash(stored.request.routeGeometry), expected.geometryHash)
    assert.equal(stored.request.eta, planned.data.flight.eta)
    assert.equal(stored.plan.publicationId, expected.publicationId)
    const sourceById = new Map(provider.readJson('enroute.json').segments.map((segment) => [segment.id, segment]))
    assert.deepEqual(stored.plan.sourceSegments, [...new Set(stored.request.routeModel.enRouteSegments
      .filter((segment) => segment.kind === 'airway').map((segment) => segment.id))].map((id) => sourceById.get(id)))
    assert.ok(stored.plan.sourceSegments.length > 0)
    assert.equal(JSON.stringify(planned).includes('sourceSegments'), false)
    assert.equal(runtime.getResult(briefing.reference.briefingRef, 'bob').error.code, 'REFERENCE_NOT_FOUND')
    runtime.clearOwner('alice')
    assert.equal((await runtime.call('get_route_briefing', args, 'alice')).error.code, 'REFERENCE_NOT_FOUND')
  }
})

test('UTC display and explicit ETA are honored; missing winds and reference expiration stay explicit', async () => {
  let time = now()
  const runtime = makeRuntime({ now: () => time })
  const planned = await runtime.call('plan_route', { ...complete, departureLocal: '2026-09-23T12:03', displayTimezone: 'UTC',
    arrivalLocal: '2026-09-23T14:00', routeType: 'ALL' }, 'alice')
  assert.equal(planned.data.flight.etd, '2026-09-23T12:03:00.000Z')
  assert.equal(planned.data.flight.eta, '2026-09-23T14:00:00.000Z')
  assert.equal(planned.data.assumptions.etaBasis, 'user-specified')
  assert.equal(planned.data.assumptions.routeTypeDefaulted, false)
  assert.deepEqual(planned.data.assumptions.missingWindAirports, ['RKSS', 'RKPC'])
  assert.equal(planned.sources[1].status, 'missing')
  time += 15 * 60_000 + 1
  assert.equal((await runtime.call('get_route_briefing', { context_ref: planned.reference.contextRef }, 'alice')).error.code, 'REFERENCE_EXPIRED')
})

test('planning startup failure leaves other tools usable, retries capture and pins the successful provider', async () => {
  let attempts = 0
  const runtime = makeRuntime({ createPlanningProvider: async () => {
    if (++attempts < 3) throw Object.assign(new Error('private path'), { code: 'NAVDATA_BUILD_MISMATCH' })
    return createFileRoutePlanningProvider({ servedNavdataRoot: null })
  } })
  await assert.rejects(runtime.initializePlanning(), { code: 'NAVDATA_BUILD_MISMATCH' })
  const failed = await runtime.call('plan_route', complete, 'alice')
  assert.equal(failed.error.code, 'NAVDATA_BUILD_MISMATCH')
  assert.match(failed.error.message, /빌드/)
  assert.equal(JSON.stringify(failed).includes('private path'), false)
  assert.notEqual((await runtime.call('get_airport_weather', { airports: ['RKSS'],
    window: { start: '2026-09-23T12:00:00Z', end: '2026-09-23T13:00:00Z' } }, 'alice')).error?.code, 'NAVDATA_BUILD_MISMATCH')
  assert.equal((await runtime.call('plan_route', complete, 'alice')).data.planningState, 'planned')
  assert.equal((await runtime.call('plan_route', complete, 'alice')).data.planningState, 'planned')
  assert.equal(attempts, 3)
})

test('missing procedures, disconnected graph, invalid wind and fixture-only mode fail explicitly', async () => {
  const provider = await createFileRoutePlanningProvider({ servedNavdataRoot: null })
  const missing = makeRuntime({ createPlanningProvider: async () => ({ ...provider, getProcedures: async () => [] }) })
  assert.equal((await missing.call('plan_route', complete, 'alice')).error.code, 'PROCEDURE_DATA_UNAVAILABLE')
  const disconnected = createNavdataProvider({ readJson: (name) => {
    const value = provider.readJson(name)
    return name === 'enroute.json' ? { ...value, segments: [] } : value
  } })
  const broken = makeRuntime({ createPlanningProvider: async () => disconnected })
  const failed = await broken.call('plan_route', complete, 'alice')
  assert.equal(failed.status, 'error')
  assert.equal(failed.reference.contextRef, undefined)
  const invalid = makeRuntime({ createPlanningProvider: async () => provider,
    readSnapshot: () => ({ snapshot: { airports: { RKSS: { observation: { wind: { direction: 900 } } } } } }) })
  assert.deepEqual((await invalid.call('plan_route', complete, 'alice')).data.assumptions.missingWindAirports, ['RKSS', 'RKPC'])
  const fixture = JSON.parse(await readFile(new URL('../fixtures/ai/gimpo-jeju.json', import.meta.url)))
  assert.equal((await makeRuntime({ fixture }).call('plan_route', complete, 'alice')).error.code, 'LIVE_CONTEXT_UNAVAILABLE_IN_FIXTURE')
})

test('worker initializes a live planner and carries the generated context through real briefing execution', async (t) => {
  const executor = createWorkerExecutor({ dataRoot: '/nonexistent-ai-planning-test', planningOptions: { servedNavdataRoot: null } })
  t.after(() => executor.close())
  const planned = await executor.call('plan_route', complete, 'alice')
  assert.equal(planned.data?.planningState, 'planned', JSON.stringify(planned))
  const args = { context_ref: planned.reference.contextRef }
  assert.equal((await executor.call('get_route_briefing', args, 'bob')).error.code, 'REFERENCE_NOT_FOUND')
  const briefing = await executor.call('get_route_briefing', args, 'alice')
  assert.equal(briefing.status, 'partial')
  const stored = await executor.getResult(briefing.reference.briefingRef, 'alice')
  assert.equal(stored.plan.flight.etd, planned.data.flight.etd)
  assert.deepEqual(stored.plan.editor.routeForm.departureAirport, 'RKSS')
})

test('chat can plan then brief in three calls, retains the generated flight without replacing screen context', async () => {
  const runtime = makeRuntime()
  const conversations = createConversationStore({ now })
  const created = conversations.create('alice')
  const seen = [], executed = []
  const call = (name, args) => ({ toolCalls: [{ id: randomUUID(), name, arguments: args }] })
  const run = createChatRunner({ now, conversations, executor: { async call(name, args, owner) {
    executed.push({ name, args }); return runtime.call(name, args, owner)
  } }, provider: { async complete(input) {
    seen.push(structuredClone({ ...input, signal: undefined }))
    if (seen.length === 1) return call('plan_route', { ...complete, displayTimezone: 'UTC' })
    if (seen.length === 2 || seen.length === 4) return call('get_route_briefing', { context_ref: input.context.confirmedSlots.plannedRoute.value.contextRef })
    return { text: '계산된 경로의 브리핑입니다. 자료 미확인 범위가 있습니다.' }
  } } })
  const request = { conversationId: created.conversationId, revision: 0, requestId: randomUUID(), message: '김포 제주 IFR FL310 TAS450 9월23일21시3분 경로와 브리핑',
    displayTimezone: 'Asia/Seoul', context: { airport: 'RKSI', contextRef: null, revision: null } }
  const response = await run(request, 'alice')
  assert.equal(response.status, 'completed')
  assert.equal(response.modelCalls, 3)
  assert.equal(response.toolCalls, 2)
  assert.equal(executed[0].args.displayTimezone, 'Asia/Seoul')
  assert.equal(response.cards[0].result.data.flight.etd, '2026-09-23T12:03:00.000Z')
  assert.equal(seen[0].tools.some((t) => t.name === 'get_route_briefing'), false)
  assert.equal(seen[1].tools.some((t) => t.name === 'get_route_briefing'), true)
  assert.deepEqual(seen[2].tools, [])
  assert.deepEqual(response.context, request.context)
  const followup = await run({ ...request, revision: 1, requestId: randomUUID(), message: '이 경로 다시 브리핑' }, 'alice')
  assert.equal(followup.status, 'completed')
  assert.equal(executed[2].args.context_ref, executed[1].args.context_ref)
  assert.equal(seen[3].context.confirmedSlots.plannedRoute.value.flight.departureAirport, 'RKSS')
})

test('incomplete chat planning keeps all supplied conditions without exposing a fake route reference', async () => {
  const conversations = createConversationStore({ now })
  const created = conversations.create('alice'), seen = []
  const run = createChatRunner({ now, conversations, executor: makeRuntime(), provider: { async complete(input) {
    seen.push(input)
    return seen.length === 1 ? { toolCalls: [{ id: randomUUID(), name: 'plan_route', arguments: { departure: '김포', arrival: '제주' } }] }
      : { text: '비행규칙, 출발 일시, 고도와 TAS를 알려주세요.' }
  } } })
  const response = await run({ conversationId: created.conversationId, revision: 0, requestId: randomUUID(), message: '김포 제주 경로 만들어' }, 'alice')
  assert.equal(response.status, 'completed')
  assert.equal(response.cards[0].result.data.planningState, 'input_required')
  assert.equal(seen[1].tools.some((t) => t.name === 'get_route_briefing'), false)
  assert.deepEqual(seen[1].context.references, [])
  assert.equal(seen[1].context.confirmedSlots.pendingRoute.value.input.departure, '김포')
})

test('newly planned context cannot be replaced with the old screen context or unrelated weather tools', async () => {
  const runtime = makeRuntime()
  const conversations = createConversationStore({ now })
  const created = conversations.create('alice')
  const executed = [], seen = []
  let plannedContext
  const run = createChatRunner({ now, conversations, executor: { async call(name, args, owner) {
    executed.push({ name, args })
    return runtime.call(name, args, owner)
  } }, provider: { async complete(input) {
    seen.push(structuredClone({ ...input, signal: undefined }))
    if (seen.length === 1) return { toolCalls: [{ id: 'plan', name: 'plan_route', arguments: complete }] }
    if (seen.length === 2) {
      plannedContext = input.context.confirmedSlots.plannedRoute.value.contextRef
      assert.deepEqual(input.tools.map((tool) => tool.name), ['get_route_briefing'])
      // Even hallucinated calls not offered in tools must be rejected server-side.
      return { toolCalls: [
        { id: 'old', name: 'get_route_briefing', arguments: { context_ref: 'old-screen' } },
        { id: 'unrelated', name: 'get_airport_weather', arguments: { airports: ['RKSS'], hoursFromNow: 1 } },
      ] }
    }
    assert.deepEqual(input.tools, [])
    const feedback = input.messages.filter((message) => message.role === 'tool').slice(-2).map((message) => JSON.parse(message.content))
    assert.equal(feedback[0].error.code, 'PLANNED_CONTEXT_REQUIRED')
    assert.equal(feedback[0].reference.contextRef, plannedContext)
    assert.equal(feedback[1].error.code, 'UNKNOWN_TOOL')
    return { toolCalls: [{ id: 'right', name: 'get_route_briefing', arguments: { context_ref: plannedContext } }] }
  } } })
  const response = await run({ conversationId: created.conversationId, revision: 0, requestId: randomUUID(),
    message: '새 경로 브리핑', context: { airport: null, contextRef: 'old-screen', revision: 'old' } }, 'alice')
  assert.deepEqual(executed.map((item) => item.name), ['plan_route'])
  assert.equal(response.cards.length, 1)
  // The last call is answer-only. Even the right tool must not execute after
  // two earlier rounds consumed the tool-eligible part of the request budget.
  assert.equal(response.status, 'partial')
  assert.equal(response.error, 'MODEL_CALL_LIMIT')
})
