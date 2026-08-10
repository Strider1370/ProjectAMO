import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  diskWarning, immediateAlerts, longStopped, quotaWarnings,
  renderDailySummary, restartWarning, sourceOutages,
} from '../src/alerts/ops-rules.js'

const NOW = Date.parse('2026-08-11T00:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()

// 출처 하나에 자료 셋이 달린 최소 형태.
function health(statuses, { source = 'kma_nwp' } = {}) {
  const rows = statuses.map((status, i) => ({
    key: `p${i}`, label: `자료${i}`, status, lastSuccessAt: ago(3_600_000),
  }))
  return { rows, groups: { source: [{ id: source, label: '수치예보키', keys: rows.map((r) => r.key) }] } }
}

test('출처의 자료가 전부 멈추면 대규모 장애로 잡는다', () => {
  const out = sourceOutages(health(['stopped', 'stopped', 'never']))
  assert.equal(out.length, 1)
  assert.equal(out[0].subject, 'kma_nwp')
  assert.equal(out[0].count, 3)
})

test('한 종이라도 살아 있으면 보내지 않는다 — 개별 장애는 화면에서 본다', () => {
  assert.deepEqual(sourceOutages(health(['stopped', 'ok', 'stopped'])), [])
  assert.deepEqual(sourceOutages(health(['stopped', 'late'])), [], '지연은 살아 있는 것으로 친다')
})

test('쉬는 시간인 자료는 분모에서 뺀다', () => {
  // 쉬는 자료를 빼면 나머지가 전부 멈춤 → 장애다. 안 빼면 "전부"가 아니라 놓친다.
  assert.equal(sourceOutages(health(['stopped', 'quiet', 'stopped'])).length, 1)
  // 살아 있는 것이 섞이면 여전히 아니다.
  assert.equal(sourceOutages(health(['stopped', 'quiet', 'ok'])).length, 0)
})

test('전부 쉬는 시간이면 판정하지 않는다 — 야간에 매번 울리면 안 된다', () => {
  assert.deepEqual(sourceOutages(health(['quiet', 'quiet'])), [])
})

test('24시간 넘게 멈춘 자료만 요약 대상이다', () => {
  const rows = [
    { key: 'a', label: '에코탑', status: 'stopped', lastSuccessAt: ago(2 * 86_400_000) },
    { key: 'b', label: 'KIM', status: 'stopped', lastSuccessAt: ago(64 * 86_400_000) },
    { key: 'c', label: '레이더', status: 'stopped', lastSuccessAt: ago(3 * 3_600_000) },
    { key: 'd', label: 'METAR', status: 'ok', lastSuccessAt: ago(60_000) },
  ]
  const long = longStopped({ rows }, NOW)
  assert.deepEqual(long.map((r) => r.key), ['b', 'a'], '오래된 순')
})

test('KIM 지상바람 사건이 하루 요약으로 잡힌다 — 대규모 규칙만으로는 놓친다', () => {
  const rows = [
    { key: 'kim_nwp', label: 'KIM 격자', status: 'stopped', lastSuccessAt: ago(64 * 86_400_000) },
    { key: 'ktg', label: '난류(KTG)', status: 'ok', lastSuccessAt: ago(60_000) },
  ]
  const h = { rows, groups: { source: [{ id: 'kma_nwp', label: '수치예보키', keys: ['kim_nwp', 'ktg'] }] } }
  assert.deepEqual(sourceOutages(h), [], '한 종은 살아 있으니 대규모 아님')
  assert.equal(longStopped(h, NOW).length, 1, '하루 요약에는 잡혀야 한다')
})

test('하루 요약은 대상이 없으면 아무것도 보내지 않는다', () => {
  assert.equal(renderDailySummary([]), null)
})

test('하루 요약은 여러 개를 한 통으로 묶는다', () => {
  const rows = [
    { label: 'KIM 격자', stoppedForMs: 64 * 86_400_000 },
    { label: '에코탑', stoppedForMs: 2 * 86_400_000 },
    { label: 'A', stoppedForMs: 86_400_000 },
    { label: 'B', stoppedForMs: 86_400_000 },
  ]
  const msg = renderDailySummary(rows)
  assert.match(msg.title, /4종/)
  assert.match(msg.body, /외 1종/)
})

test('전송량 90% 넘은 열쇠만 경고한다', () => {
  const usage = { keys: [
    { category: 'aviation', label: '항공키', bytes: 4.6e9, limitBytes: 5e9, status: 'active' },
    { category: 'radar_satellite', label: '레이더키', bytes: 2e9, limitBytes: 5e9, status: 'active' },
    { category: 'kim_nwp', label: '수치키', bytes: 5e9, limitBytes: 5e9, status: 'unconfigured' },
  ] }
  const out = quotaWarnings(usage)
  assert.deepEqual(out.map((k) => k.subject), ['aviation'])
  assert.equal(out[0].usedPct, 92)
})

test('디스크는 7일 이하일 때만 경고한다', () => {
  assert.equal(diskWarning({ daysLeft: 41 }), null)
  assert.equal(diskWarning({ daysLeft: 5 }).daysLeft, 5)
  assert.equal(diskWarning(null), null, '예측이 없으면 조용하다')
})

test('재시작은 한 시간에 5회 이상일 때만 경고한다', () => {
  const boots = (n, spacingMs) => Array.from({ length: n }, (_, i) => new Date(NOW - i * spacingMs).toISOString())
  assert.equal(restartWarning(boots(4, 60_000), NOW), null)
  assert.equal(restartWarning(boots(6, 60_000), NOW).count, 6)
  assert.equal(restartWarning(boots(6, 3 * 3_600_000), NOW), null, '오래된 재시작은 창 밖이다')
})

test('immediateAlerts는 해당 없으면 빈 배열이다 — 조용한 날엔 한 통도 안 간다', () => {
  assert.deepEqual(immediateAlerts({ health: health(['ok', 'ok']), usage: { keys: [] }, forecast: { daysLeft: 41 }, recentBoots: [], now: NOW }), [])
})
