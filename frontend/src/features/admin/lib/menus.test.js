import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MENUS, menuBadges, menusIn, topSignals } from './menus.js'

test('메뉴 구성 — 로그는 아직 없다', () => {
  assert.deepEqual(MENUS.map((m) => m.id), ['overview', 'data', 'server', 'api', 'users', 'accounts', 'alerts'])
  assert.equal(MENUS.some((m) => m.id === 'logs'), false, '로그는 3단계다')
})

test('메뉴는 운영과 이용 두 묶음으로 나뉜다', () => {
  assert.equal(menusIn('ops').length, 4)
  assert.equal(menusIn('usage').length, 3) // 이용자·계정 관리·알림 감시
  assert.equal(menusIn('ops').length + menusIn('usage').length, MENUS.length)
})

test('멈춘 자료가 있으면 자료 신호가 빨강, 지연만 있으면 노랑', () => {
  const bad = topSignals({ health: { counts: { stopped: 2, never: 0, late: 0 }, rows: [] } })
  assert.equal(bad.find((s) => s.id === 'data').tone, 'bad')
  assert.equal(bad.find((s) => s.id === 'data').count, 2)

  const warn = topSignals({ health: { counts: { stopped: 0, never: 0, late: 3 }, rows: [] } })
  assert.equal(warn.find((s) => s.id === 'data').tone, 'warn')
})

test('한 번도 수집 안 된 자료도 멈춤과 같이 센다', () => {
  const signals = topSignals({ health: { counts: { stopped: 1, never: 2, late: 0 }, rows: [] } })
  assert.equal(signals.find((s) => s.id === 'data').count, 3)
})

test('실패한 API 작업은 상단 신호와 API 메뉴 배지로 바로 보인다', () => {
  const health = { counts: { stopped: 0, never: 0, late: 0 }, rows: [], apiProblems: [{ id: 'metar' }, { id: 'taf' }] }
  const api = topSignals({ health }).find((signal) => signal.id === 'api')
  assert.deepEqual(api, { id: 'api', label: 'API', tone: 'bad', count: 2 })
  assert.equal(menuBadges({ health, pending: [] }).api, 2)
})

test('watchdog가 감지한 미실행 수집기는 수집 신호에 나타난다', () => {
  const health = { counts: { stopped: 0, never: 0, late: 0 }, rows: [], collectorExecution: [{ type: 'ground_forecast', outcome: 'missed', isProblem: true }] }
  const collect = topSignals({ health }).find((signal) => signal.id === 'collect')
  assert.deepEqual(collect, { id: 'collect', label: '수집', tone: 'warn', count: 1 })
})

test('재시작이 잦으면 서버 신호가 노랑으로 바뀐다', () => {
  const calm = topSignals({ health: null, server: { process: { bootCount: 3 } } })
  assert.equal(calm.find((s) => s.id === 'server').tone, 'ok')
  const noisy = topSignals({ health: null, server: { process: { bootCount: 26 } } })
  assert.equal(noisy.find((s) => s.id === 'server').tone, 'warn')
})

test('자료가 아직 없어도 신호 넷은 항상 나온다', () => {
  const signals = topSignals({})
  assert.equal(signals.length, 4)
  assert.ok(signals.every((s) => s.label && s.tone))
})

test('배지는 이상 건수와 승인 대기 건수를 센다', () => {
  const badges = menuBadges({
    health: { counts: { stopped: 2, never: 0, late: 1 } },
    pending: [{ id: 1 }, { id: 2 }],
  })
  assert.equal(badges.overview, 3)
  assert.equal(badges.data, 2)
  assert.equal(badges.api, 0)
  assert.equal(badges.accounts, 2)
})

test('이상이 없으면 배지가 0이라 달리지 않는다', () => {
  const badges = menuBadges({ health: { counts: { stopped: 0, never: 0, late: 0 } }, pending: [] })
  assert.equal(badges.overview, 0)
  assert.equal(badges.data, 0)
  assert.equal(badges.api, 0)
  assert.equal(badges.accounts, 0)
})
