import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpenAIProvider } from '../src/ai/providers/openai.js'
import { chatToolDefinitions } from '../src/ai/tool-registry.js'
import { strictParameters, decodeOptionalNulls } from '../src/ai/providers/strict-schema.js'

test('Responses adapter uses server-only auth, stateless request, bounded tools and usage', async () => {
  const requests = []
  const output = [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque', summary: [] },
    { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather_advisories', arguments: '{}' }]
  const provider = createOpenAIProvider({ apiKey: 'unit-test-key', model: 'test-model', fetchImpl: async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) })
    return Response.json({ status: 'completed', output, usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 15 } })
  } })
  const input = { instructions: 'facts only', context: { serverTime: 'now' }, messages: [{ role: 'user', content: '질문' }], tools: chatToolDefinitions(), maxOutputTokens: 1600 }
  const result = await provider.complete(input)
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses')
  assert.equal(requests[0].headers.Authorization, 'Bearer unit-test-key')
  assert.equal(requests[0].body.store, false)
  assert.equal(requests[0].body.parallel_tool_calls, false)
  assert.deepEqual(requests[0].body.tools.map((tool) => tool.name), [
    'request_ui_action',
    'list_my_flight_alerts', 'prepare_flight_alert',
    'search_my_routes', 'get_my_saved_route',
    'plan_route', 'prepare_route_settings', 'get_airport_weather', 'get_weather_advisories',
    'get_route_briefing', 'get_briefing_detail', 'compare_route_altitudes',
  ])
  assert.equal(requests[0].body.tools.every((tool) => tool.strict), true)
  const ui = requests[0].body.tools.find((tool) => tool.name === 'request_ui_action')
  assert.deepEqual(ui.parameters.properties.action.enum, ['open_airport', 'enable_weather_layer'])
  assert.equal(requests[0].body.text.format.strict, true)
  assert.equal(JSON.stringify(requests[0].body).includes('unit-test-key'), false)
  assert.deepEqual(result.usage, { inputTokens: 100, cachedInputTokens: 40, outputTokens: 15 })
  await provider.complete({ ...input, messages: [...input.messages,
    { role: 'assistant', content: '', providerItems: result.providerItems },
    { role: 'tool', toolCallId: 'call_1', content: '{"status":"partial"}' },
  ] })
  assert.deepEqual(requests[1].body.input.slice(2, 4), output)
  assert.equal(requests[1].body.input.at(-1).type, 'function_call_output')
})

test('strict transport represents optional inputs as nullable; decoder never drops unknown fields', () => {
  const original = { type: 'object', required: ['name'], properties: { name: { type: 'string' },
    count: { type: 'integer', default: 10 }, nested: { type: 'object', properties: { at: { type: 'string' } } } } }
  const strict = strictParameters(original)
  assert.deepEqual(strict.required, ['name', 'count', 'nested'])
  assert.equal(strict.additionalProperties, false)
  assert.equal(strict.properties.nested.anyOf[0].additionalProperties, false)
  assert.equal(strict.properties.count.anyOf[0].default, undefined)
  assert.deepEqual(decodeOptionalNulls({ name: null, count: null, nested: { at: null }, evil: null }, original), { name: null, nested: {}, evil: null })
})

test('structured answer parsing rejects malformed text; refusal and incomplete remain explicit', async () => {
  const replies = [
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":"확인했어요."}' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":"x","extra":"bad"}' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: '응답할 수 없어요.' }] }] },
    { status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":' }] }] },
  ]
  const provider = createOpenAIProvider({ apiKey: 'test', model: 'test', fetchImpl: async () => Response.json(replies.shift()) })
  const input = { instructions: '', messages: [], tools: [], context: {} }
  assert.equal((await provider.complete(input)).text, '확인했어요.')
  await assert.rejects(provider.complete(input), { message: 'INVALID_OPENAI_ANSWER' })
  assert.equal((await provider.complete(input)).text, '응답할 수 없어요.')
  assert.equal((await provider.complete(input)).incomplete, true)
})

test('provider fails closed when unconfigured, aborted, oversized or HTTP error without body leaks', async () => {
  assert.equal(createOpenAIProvider({}), null)
  const failure = createOpenAIProvider({ apiKey: 'secret', model: 'test', fetchImpl: async () => new Response('secret error body', { status: 429 }) })
  await assert.rejects(failure.complete({ messages: [], tools: [], context: {} }), { message: 'OPENAI_REQUEST_FAILED', httpStatus: 429 })
  const big = createOpenAIProvider({ apiKey: 'secret', model: 'test', fetchImpl: async () => new Response('x'.repeat(512 * 1024 + 1)) })
  await assert.rejects(big.complete({ messages: [], tools: [], context: {} }), { message: 'PROVIDER_RESPONSE_TOO_LARGE' })
  const controller = new AbortController()
  controller.abort()
  const cancelled = createOpenAIProvider({ apiKey: 'secret', model: 'test', fetchImpl: async (_url, { signal }) => { signal.throwIfAborted() } })
  await assert.rejects(cancelled.complete({ messages: [], tools: [], context: {}, signal: controller.signal }), { name: 'AbortError' })
})

test('incomplete diagnostics preserve token exhaustion and bounded reasoning counts without private text', async () => {
  const replies = [
    { reason: 'max_output_tokens', reasoning: 1500 },
    { reason: 'secret arbitrary reason', reasoning: 1601 },
  ]
  const provider = createOpenAIProvider({ apiKey: 'test', model: 'test', fetchImpl: async () => {
    const value = replies.shift()
    return Response.json({ status: 'incomplete', incomplete_details: { reason: value.reason }, output: [],
      usage: { input_tokens: 100, output_tokens: 1600, output_tokens_details: { reasoning_tokens: value.reasoning } } })
  } })
  const input = { messages: [], tools: [], context: {}, maxOutputTokens: 1600 }
  const limited = await provider.complete(input)
  assert.equal(limited.incomplete, true)
  assert.deepEqual(limited.diagnostics, { incompleteReason: 'max_output_tokens', reasoningTokens: 1500 })
  assert.equal(limited.text, '')
  assert.deepEqual((await provider.complete(input)).diagnostics, { incompleteReason: null, reasoningTokens: null })
})
