import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EXECUTION_WORD, STATUS_TONE, STATUS_WORD, attentionItems, executionProblems, formatAge, formatBytes,
  formatInterval, formatMs, formatRate, levelTone, percent, trendGroups,
} from './adminFormat.js'

test('formatAge는 사람이 읽는 경과 시간을 만든다', () => {
  assert.equal(formatAge(30_000), '방금')
  assert.equal(formatAge(6 * 60_000), '6분')
  assert.equal(formatAge(2 * 3_600_000), '2시간')
  assert.equal(formatAge(64 * 86_400_000), '64일')
  assert.equal(formatAge(NaN), '—')
  assert.equal(formatAge(-5), '—')
})

test('formatInterval은 분과 시간을 가려 쓴다', () => {
  assert.equal(formatInterval(5 * 60_000), '5분')
  assert.equal(formatInterval(6 * 3_600_000), '6시간')
  assert.equal(formatInterval(12.5 * 3_600_000), '12.5시간')
})

test('formatRate는 자료 없음(null)과 전부 실패(0)를 다르게 적는다', () => {
  assert.equal(formatRate(null), '—')
  assert.equal(formatRate(0), '0%')
  assert.equal(formatRate(0.58), '58%')
  assert.equal(formatRate(1), '100%')
})

test('formatMs는 초와 밀리초를 가려 쓴다', () => {
  assert.equal(formatMs(null), '—')
  assert.equal(formatMs(4200), '4.2초')
  assert.equal(formatMs(940), '940 ms')
})

test('formatBytes는 단위를 올린다', () => {
  assert.equal(formatBytes(4 * 1024 ** 3), '4.0 GB')
  assert.equal(formatBytes(512 * 1024 ** 2), '512.0 MB')
  assert.equal(formatBytes(NaN), '—')
})

test('percent는 0으로 나누지 않는다', () => {
  assert.equal(percent(1, 2), 50)
  assert.equal(percent(5, 0), 0)
})

test('모든 상태에 글자와 색조가 있다 — 색만으로 뜻을 전하지 않는다', () => {
  for (const status of ['ok', 'late', 'stopped', 'never', 'quiet']) {
    assert.ok(STATUS_WORD[status], `${status} 글자 없음`)
    assert.ok(STATUS_TONE[status], `${status} 색조 없음`)
  }
})

test('실행 문제는 현재 실패와 미실행만 고른다', () => {
  const entries = [
    { type: 'ground_forecast', outcome: 'missed', isProblem: true },
    { type: 'metar', outcome: 'succeeded', lastIssue: { outcome: 'failed' }, isProblem: false },
    { type: 'taf', outcome: 'skipped', isProblem: false },
  ]
  assert.deepEqual(executionProblems(entries).map((entry) => entry.type), ['ground_forecast'])
  assert.equal(EXECUTION_WORD.missed, '미실행')
})

test('attentionItems는 멈춤·지연만 심각한 순으로 고른다', () => {
  const items = attentionItems([
    { key: 'a', label: 'A', status: 'late' },
    { key: 'b', label: 'B', status: 'ok' },
    { key: 'c', label: 'C', status: 'stopped' },
    { key: 'd', label: 'D', status: 'quiet' },
    { key: 'e', label: 'E', status: 'never' },
  ])
  assert.deepEqual(items.map((i) => i.key), ['c', 'e', 'a'])
})

test('attentionItems는 이상이 없으면 빈 배열이다', () => {
  assert.deepEqual(attentionItems([{ key: 'a', status: 'ok' }, { key: 'b', status: 'quiet' }]), [])
  assert.deepEqual(attentionItems(), [])
})

test('trendGroups는 세 계열을 날짜별 한 묶음으로 모은다', () => {
  const out = trendGroups({
    visits: [{ period: '2026-08-09', n: 15 }, { period: '2026-08-10', n: 11 }],
    newVisitors: [{ period: '2026-08-10', n: 2 }],
    signups: [],
  })
  assert.deepEqual(out, [
    { label: '2026-08-09', values: [15, 0, 0] },
    { label: '2026-08-10', values: [11, 2, 0] },
  ])
})

test('trendGroups는 자료가 없으면 빈 배열이다', () => {
  assert.deepEqual(trendGroups(null), [])
})

test('levelTone은 70·90을 경계로 나눈다', () => {
  assert.equal(levelTone(69), 'ok')
  assert.equal(levelTone(70), 'warn')
  assert.equal(levelTone(89), 'warn')
  assert.equal(levelTone(90), 'bad')
})
