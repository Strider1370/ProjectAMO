import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { computeEtaIso } from './lib/etaCalc.js'

const hook = readFileSync(new URL('./useRouteBriefing.js', import.meta.url), 'utf8')
const panel = readFileSync(new URL('./RouteBriefingPanel.jsx', import.meta.url), 'utf8')

// ETA가 값이 있다는 이유만으로 굳으면, ETD를 미뤘을 때 도착이 출발보다 빨라진다.
// 그 뒤집힌 시간창은 서버에서 NOTAM·SIGMET을 조용히 걸러낸다 — 그래서 사용자가 직접
// 고친 경우에만 고정한다.
test('ETA is only pinned when the user edited it', () => {
  assert.match(hook, /etaUserEdited/)
  // 경로 검색·재계산 경로는 전부 사용자 고정 여부를 먼저 확인해야 한다.
  assert.doesNotMatch(hook, /const (search|next)Eta = eta \|\| computeEtaIso/)
  assert.match(hook, /\(etaUserEdited && eta\) \|\| computeEtaIso/)
  // ETD·TAS·거리가 바뀌면 고정 전에는 다시 계산된다.
  assert.match(hook, /\[etaUserEdited, etd, tasKt, plannedEtaDistanceNm\]/)
  // 되돌리기는 고정 자체를 풀어야 이후 변경을 따라간다.
  assert.match(hook, /clearEtaOverride = \(\) => \{ setEtaUserEdited\(false\)/)
  assert.match(panel, /clearEtaOverride\(\)/)
  assert.doesNotMatch(panel, /if \(autoEta\) setEta\(autoEta\)/)
  // 뒤집힌 시간은 입력 단계에서 눈에 보여야 한다.
  assert.match(panel, /etaBeforeEtd/)
})

// ETD를 미루면 ETA도 같은 만큼 밀린다 — 계산 자체가 ETD를 기준으로 삼는지 확인.
test('computeEtaIso moves the arrival with the departure', () => {
  const early = computeEtaIso('2026-08-26T09:00:00Z', 300, 300)
  const late = computeEtaIso('2026-08-26T14:00:00Z', 300, 300)
  assert.equal(early, '2026-08-26T10:00:00Z')
  assert.equal(late, '2026-08-26T15:00:00Z')
  assert.ok(Date.parse(late) > Date.parse('2026-08-26T14:00:00Z'), '도착은 언제나 출발보다 뒤')
})
