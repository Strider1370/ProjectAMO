import test from 'node:test'
import assert from 'node:assert/strict'

import { MET_LAYERS } from '../weather-overlays/lib/weatherOverlayLayers.js'
import { AVIATION_WFS_LAYERS } from '../aviation-layers/aviationWfsLayers.js'
import { BASEMAP_OPTIONS } from './mapConfig.js'
import {
  MET_ACTIONS, TRAFFIC_ACTIONS, AVIATION_ACTIONS, BASEMAP_ACTIONS,
  buildSearchCatalog, matchSearch,
} from './layerActions.js'

// 커버리지: 토글 가능한 모든 레이어/베이스맵 id가 레지스트리에 등록돼 있어야 한다.
// (레이어 추가/ id 변경 후 등록을 깜빡하면 여기서 깨진다.)
test('every MET layer is registered', () => {
  const ids = new Set(MET_ACTIONS.map((a) => a.id))
  for (const l of MET_LAYERS) assert.ok(ids.has(l.id), `MET 레이어 미등록: ${l.id}`)
})

test('every aviation layer is registered', () => {
  const ids = new Set(AVIATION_ACTIONS.map((a) => a.id))
  for (const l of AVIATION_WFS_LAYERS) assert.ok(ids.has(l.id), `항공 레이어 미등록: ${l.id}`)
})

test('every basemap is registered', () => {
  const ids = new Set(BASEMAP_ACTIONS.map((a) => a.id))
  for (const o of BASEMAP_OPTIONS) assert.ok(ids.has(o.id), `베이스맵 미등록: ${o.id}`)
})

test('ADS-B는 기상이 아니라 항적 액션이다', () => {
  assert.equal(MET_ACTIONS.some((a) => a.id === 'adsb'), false)
  const adsb = TRAFFIC_ACTIONS.find((a) => a.id === 'adsb')
  assert.ok(adsb, '항적 액션 미등록: adsb')
  assert.equal(adsb.type, 'traffic')
  assert.equal(adsb.panelId, 'traffic')
})

test('"항공기"로 검색하면 항적 액션이 나온다', () => {
  const hits = matchSearch(ALL(), '항공기')
  assert.equal(hits[0].id, 'adsb')
  assert.equal(hits[0].type, 'traffic')
})

test('모든 action 라벨이 비어있지 않다', () => {
  for (const a of [...MET_ACTIONS, ...TRAFFIC_ACTIONS, ...AVIATION_ACTIONS, ...BASEMAP_ACTIONS])
    assert.ok(a.label && a.label.length > 0, `라벨 없음: ${a.type}/${a.id}`)
})

test('한글 별칭으로 레이어를 찾는다 — 레이더 → radar', () => {
  const hits = matchSearch(ALL(), '레이더')
  assert.equal(hits[0].id, 'radar')
  assert.equal(hits[0].type, 'met')
})

test('"위성"은 위성영상(기상)과 위성 지도(베이스맵)를 모두 반환', () => {
  const hits = matchSearch(ALL(), '위성')
  const satMet = hits.find((h) => h.type === 'met' && h.id === 'satellite')
  const satBase = hits.find((h) => h.type === 'basemap' && h.id === 'satellite')
  assert.ok(satMet, '위성영상(기상) 누락')
  assert.ok(satBase, '위성 지도(베이스맵) 누락')
})

test('공항을 ICAO·한글명으로 찾는다', () => {
  const airports = [{ icao: 'RKSI', nameKo: '인천' }, { icao: 'RKSS', nameKo: '김포' }]
  const catalog = buildSearchCatalog(airports)
  assert.equal(matchSearch(catalog, '인천')[0].id, 'RKSI')
  assert.equal(matchSearch(catalog, 'rkss')[0].id, 'RKSS')
})

test('빈 질의는 빈 결과', () => {
  assert.deepEqual(matchSearch(ALL(), '   '), [])
})

function ALL() { return buildSearchCatalog([]) }
