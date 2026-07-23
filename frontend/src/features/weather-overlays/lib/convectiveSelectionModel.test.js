import test from 'node:test'
import assert from 'node:assert/strict'
import { canApplyConvectiveResponse, makeConvectiveRequestKey } from './convectiveSelectionModel.js'

test('convective response applies only for its live request token and key', () => {
  const key = makeConvectiveRequestKey({ tm: '202607231200', lat: 37.5, lon: 127, minFl: 'all' })
  assert.equal(canApplyConvectiveResponse({ requestToken: 2, currentToken: 2, requestKey: key, currentKey: key, aborted: false }), true)
  assert.equal(canApplyConvectiveResponse({ requestToken: 1, currentToken: 2, requestKey: key, currentKey: key, aborted: false }), false)
  assert.equal(canApplyConvectiveResponse({ requestToken: 2, currentToken: 2, requestKey: key, currentKey: key, aborted: true }), false)
})