import { test } from 'node:test'
import assert from 'node:assert/strict'

import { submitFeedback } from './feedbackApi.js'

const reply = (status, body) => ({ ok: status < 300, status, json: async () => body })

test('submitFeedback sends the text first, then each photo with the upload token', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (url === '/api/feedback') return reply(201, { id: 7, uploadToken: 'tok' })
    return calls.length === 3 ? reply(415, { error: 'unsupported_image' }) : reply(201, { count: 1 })
  }
  const images = [new Blob(['a'], { type: 'image/jpeg' }), new Blob(['b'], { type: 'image/jpeg' })]
  const result = await submitFeedback({ kind: 'error', message: '값이 틀림', images, context: { airport: 'RKSI' } }, { fetchImpl })

  assert.deepEqual(JSON.parse(calls[0].init.body), { kind: 'error', message: '값이 틀림', imageCount: 2, context: { airport: 'RKSI' } })
  assert.equal(calls[1].url, '/api/feedback/7/images')
  assert.equal(calls[1].init.headers['X-Feedback-Upload'], 'tok')
  assert.deepEqual(result, { id: 7, failedImages: 1 })
})

test('submitFeedback reports the server error when the text is rejected', async () => {
  const fetchImpl = async () => reply(429, { error: 'too_many_requests' })
  await assert.rejects(submitFeedback({ kind: 'error', message: 'x' }, { fetchImpl }), /too_many_requests/)
})
