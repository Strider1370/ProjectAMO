import { test } from 'node:test'
import assert from 'node:assert/strict'

import { attachPrevious } from '../src/processors/taf-previous.js'

const slot = (time, vis) => ({
  time,
  wind: { speed: 10 },
  visibility: { value: vis, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  display: { wind: '27010KT' },
})

const taf = (issued, vis, status = 'NORMAL') => ({
  header: {
    icao: 'RKSI',
    issued,
    valid_start: '2026-07-28T12:00:00Z',
    valid_end: '2026-07-29T18:00:00Z',
    report_status: status,
  },
  base: {},
  change_groups: [],
  timeline: [slot('2026-07-28T13:00:00Z', vis)],
})

test('캐시가 없으면 previous가 붙지 않는다 (최초 실행)', () => {
  const out = attachPrevious({ RKSI: taf('2026-07-28T12:00:00Z', 9999) }, null)
  assert.equal(out.RKSI.previous, undefined)
})

test('issued가 바뀌면 직전 것이 previous로 옮겨간다', () => {
  const cached = { RKSI: taf('2026-07-28T06:00:00Z', 9999) }
  const next = { RKSI: taf('2026-07-28T12:00:00Z', 1200) }
  const out = attachPrevious(next, cached)

  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T06:00:00Z')
  assert.equal(out.RKSI.previous.timeline.length, 1)
  assert.equal(out.RKSI.previous.timeline[0].visibility.value, 9999)
})

test('issued가 같으면 previous를 건드리지 않는다 — 같은 TAF 재수신', () => {
  const first = attachPrevious(
    { RKSI: taf('2026-07-28T12:00:00Z', 1200) },
    { RKSI: taf('2026-07-28T06:00:00Z', 9999) }
  )
  // 같은 issued로 한 번 더 받는다
  const second = attachPrevious({ RKSI: taf('2026-07-28T12:00:00Z', 1200) }, first)

  assert.equal(second.RKSI.previous.header.issued, '2026-07-28T06:00:00Z',
    '재수신에 previous가 덮이면 비교 기준이 사라진다')
})

test('previous에는 직전 발표를 원문·변화군·표시 문자열까지 그대로 담고, 그 안의 previous는 뺀다', () => {
  const cached = { ...taf('2026-07-28T06:00:00Z', 9999), previous: { header: { issued: '2026-07-28T00:00:00Z' }, timeline: [] } }
  cached.header.raw_text = 'TAF RKSI 280500Z 2806/2912 27010KT 9999 BKN030'
  cached.change_groups = [{ type: 'TEMPO', start: '2026-07-28T15:00:00Z', end: '2026-07-28T18:00:00Z', vis: 4000 }]
  const out = attachPrevious({ RKSI: taf('2026-07-28T12:00:00Z', 1200) }, { RKSI: cached })
  const previous = out.RKSI.previous
  assert.equal(previous.header.raw_text, 'TAF RKSI 280500Z 2806/2912 27010KT 9999 BKN030')
  assert.equal(previous.header.icao, 'RKSI')
  assert.equal(previous.change_groups.length, 1)
  assert.deepEqual(previous.timeline[0].display, { wind: '27010KT' })
  assert.equal(previous.previous, undefined, '세대가 줄줄이 쌓이지 않는다')
})

test('취소 통보는 취소 직전의 마지막 정상 TAF를 previous로 들고 간다', () => {
  // 정상 A(06시) → 정상 B(12시, previous=A) → 취소 C
  const cached = {
    RKSI: {
      ...taf('2026-07-28T12:00:00Z', 1200),
      previous: { header: { issued: '2026-07-28T06:00:00Z' }, timeline: [] },
    },
  }
  const next = { RKSI: taf('2026-07-28T14:00:00Z', 9999, 'CANCELLATION') }
  const out = attachPrevious(next, cached)

  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T12:00:00Z',
    '취소 직전의 마지막 정상 TAF(B)를 건너뛰면 다음 발표가 한 세대 낡은 것과 비교된다')
})

test('취소 다음의 정상 TAF는 취소 직전의 마지막 정상 TAF와 비교된다', () => {
  // 위 테스트가 만든 상태: 취소 문서가 previous=B를 들고 있다
  const cancelled = {
    RKSI: {
      ...taf('2026-07-28T14:00:00Z', 9999, 'CANCELLATION'),
      timeline: [],
      previous: { header: { issued: '2026-07-28T12:00:00Z' }, timeline: [] },
    },
  }
  const out = attachPrevious({ RKSI: taf('2026-07-28T18:00:00Z', 800) }, cancelled)

  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T12:00:00Z',
    '취소 통보 자체를 비교 기준으로 삼으면 안 되고, 그 직전 정상 TAF여야 한다')
})

test('취소가 연달아 와도 마지막 정상 TAF를 잃지 않는다', () => {
  const cancelled = {
    RKSI: {
      ...taf('2026-07-28T14:00:00Z', 9999, 'CANCELLATION'),
      timeline: [],
      previous: { header: { issued: '2026-07-28T12:00:00Z' }, timeline: [] },
    },
  }
  const out = attachPrevious({ RKSI: taf('2026-07-28T15:00:00Z', 9999, 'CANCELLATION') }, cancelled)
  assert.equal(out.RKSI.previous.header.issued, '2026-07-28T12:00:00Z')
})

test('입력 객체를 제자리에서 변형하지 않는다', () => {
  const next = { RKSI: taf('2026-07-28T12:00:00Z', 1200) }
  attachPrevious(next, { RKSI: taf('2026-07-28T06:00:00Z', 9999) })
  assert.equal(next.RKSI.previous, undefined)
})

test('null·빈 입력에서 터지지 않는다', () => {
  assert.deepEqual(attachPrevious(null, null), {})
  assert.deepEqual(attachPrevious({}, {}), {})
})
