import test from 'node:test'
import assert from 'node:assert/strict'

import { expandedProgressView } from './expandedProgress.js'

const running = { tmfc: '2026100906', cycle: '06', state: 'running', planned: 33, collected: 14, computed: 12, collectedPct: 42, computedPct: 36,
  lastCollectedHour: 13, stopReason: null, korea: null, memory: { availableMiB: 650, minAvailableMiB: 382, swapUsedMiB: 221 } }

test('describes a running 06 UTC cycle with both percentages, the Korea crop and memory', () => {
  const view = expandedProgressView(running)
  assert.equal(view.cycle, '10/09 06 UTC')
  assert.equal(view.stateWord, '받는 중')
  assert.equal(view.brief, '06 UTC 36%')
  assert.equal(view.collected, '14/33 (42%) · +13h까지')
  assert.equal(view.computed, '12/33 (36%)')
  assert.equal(view.korea, '아직(+0~12h가 모이면)')
  assert.equal(view.memory, '남은 650 MiB(최저 382) · 스왑 221 MiB')
})

test('names the stop reason of a finished cycle and leaves the Korea line out of 00 UTC', () => {
  const view = expandedProgressView({ ...running, cycle: '00', tmfc: '2026100900', state: 'not_published', stopReason: 'memory_reserve', korea: undefined, memory: null })
  assert.equal(view.tone, 'bad')
  assert.equal(view.brief, null)
  assert.equal(view.stop, '서버 메모리 부족으로 새 시각 중단')
  assert.equal(view.korea, null)
  assert.equal(expandedProgressView(null), null)
})
