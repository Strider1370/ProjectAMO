import test from 'node:test'
import assert from 'node:assert/strict'
import { recommendProcedures } from './recommendProcedures.js'

// 비동기 I/O는 주입 — 네트워크 없이 결정 로직만 검증한다.
const base = {
  routeForm: { departureAirport: 'RKSI', arrivalAirport: 'KLAX', entryFix: 'GUKDO', exitFix: '', routeType: 'RNAV' },
  sidOptions: [],
  starOptions: [],
  iapData: null,
  metarData: {},
  isFirInMode: true, // 출발은 FIR 진입(수동 entryFix) — 도착 해외 분기만 검증하려는 단순화
  isFirExitMode: false,
  effectiveRouteType: 'ALL',
  loadOverseasLinks: async () => ({ KLAX: { nearbyFixes: [{ fix: 'FIXA' }, { fix: 'FIXB' }] } }),
  buildBriefingRoute: async () => ({ totalDistanceNm: 400 }),
}

test('준비 안 됨(FIR 진입인데 entryFix 없음) → null', async () => {
  const best = await recommendProcedures({ ...base, routeForm: { ...base.routeForm, entryFix: '' } })
  assert.equal(best, null)
})

test('핵심: 총거리가 짧은 진입점을 고른다 (해외 반대편 fix 회귀 방지)', async () => {
  // FIXA는 목적지 반대편이라 총거리 500, FIXB는 300. 알고리즘은 방향을 총거리로 반영해 FIXB를 골라야 한다.
  const best = await recommendProcedures({
    ...base,
    buildBriefingRoute: async ({ exitFix }) => ({ totalDistanceNm: exitFix === 'FIXA' ? 500 : 300 }),
  })
  assert.equal(best.exitFix, 'FIXB')
})

test('모든 경로 구축 실패 → 첫 후보로 폴백(빈 화면 방지)', async () => {
  const best = await recommendProcedures({
    ...base,
    buildBriefingRoute: async () => { throw new Error('route build failed') },
  })
  assert.notEqual(best, null)
  assert.equal(best.exitFix, 'FIXA') // 첫 도착 후보
  assert.equal(best.entryFix, 'GUKDO') // 출발 entryFix 유지
})

test('후보 전멸(해외 출발인데 근접 fix 없음) → null', async () => {
  const best = await recommendProcedures({
    ...base,
    isFirInMode: false,
    routeForm: { ...base.routeForm, departureAirport: 'KJFK', entryFix: '' }, // 해외 출발
    loadOverseasLinks: async () => ({ KJFK: { nearbyFixes: [] }, KLAX: { nearbyFixes: [{ fix: 'FIXB' }] } }),
  })
  assert.equal(best, null)
})
