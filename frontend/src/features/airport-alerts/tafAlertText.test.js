import test from 'node:test'
import assert from 'node:assert/strict'
import { tafAlertSegments, tafHighlightDescription } from './tafAlertText.js'

test('강조 판정이 없거나 원문과 맞지 않는 이전 알림은 본문을 보존한다', () => {
  assert.deepEqual(tafAlertSegments({ text: 'TAF RKSS 3000' }), [{ text: 'TAF RKSS 3000' }])
  assert.deepEqual(tafAlertSegments({ text: 'TAF RKSS 5000', tacSegments: [{ text: '3000', metrics: [{}] }] }), [{ text: 'TAF RKSS 5000' }])
})

test('저장된 강조에 값과 당시 임계값을 설명한다', () => {
  const metric = { key: 'visibility', label: '시정', value: 3000, threshold: 5000, unit: 'm', direction: 'below' }
  const payload = { text: 'TAF RKSS 3000', tacSegments: [{ text: 'TAF RKSS ' }, { text: '3000', metrics: [metric] }] }
  assert.equal(tafAlertSegments(payload), payload.tacSegments)
  assert.equal(tafHighlightDescription([metric]), '시정 3000m · 기준 5000m 미만')
  assert.equal(tafHighlightDescription([{ ...metric, value: 402, qualifier: 'lessThan' }]), '시정 <402m · 기준 5000m 미만')
  assert.equal(tafHighlightDescription([{ label: '급변풍', direction: 'event' }]), '급변풍 예보')
})
