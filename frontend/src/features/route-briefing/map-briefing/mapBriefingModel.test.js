import test from 'node:test'
import assert from 'node:assert/strict'
import {
  profileHeightPx, profileOpenFor, formatBand, frameTag, modelChip, readBriefingView, readDockState, rowEmptyText,
  segmentText, sourceChips, summaryCallout, writeBriefingView, writeDockState, DEFAULT_DOCK,
} from './mapBriefingModel.js'

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) } }
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

test('remembers the chosen briefing view and dock state, falling back when storage fails', () => {
  const storage = memory()
  assert.equal(readBriefingView(storage), 'map')
  writeBriefingView('document', storage)
  assert.equal(readBriefingView(storage), 'document')
  assert.equal(readBriefingView(broken), 'map')
  writeDockState({ ribbonOpen: false, profileOpen: true, profileHeightPx: 300 }, storage)
  assert.deepEqual(readDockState(storage), { ribbonOpen: false, profileOpen: true, profileHeightPx: 300 })
  assert.deepEqual(readDockState(broken), DEFAULT_DOCK)
})

test('profile starts folded on low screens until the user chooses', () => {
  assert.equal(profileOpenFor(DEFAULT_DOCK, 1080), true)
  assert.equal(profileOpenFor(DEFAULT_DOCK, 768), false)
  assert.equal(profileOpenFor({ ...DEFAULT_DOCK, profileOpen: true }, 768), true)
})

test('profile height leaves room for the chart and keeps the dock under half the screen', () => {
  assert.equal(profileHeightPx(DEFAULT_DOCK, 1080), 324)
  assert.equal(profileHeightPx(DEFAULT_DOCK, 1000), 300)
  assert.equal(profileHeightPx(DEFAULT_DOCK, 900), 280)
  assert.equal(profileHeightPx({ ...DEFAULT_DOCK, profileHeightPx: 300 }, 1080), 300)
  // 위험 막대 + 단면이 화면 50%를 넘지 않는다(1080 → 단면 최대 410).
  assert.equal(profileHeightPx({ ...DEFAULT_DOCK, profileHeightPx: 900 }, 1080), 410)
  assert.equal(profileHeightPx({ ...DEFAULT_DOCK, profileHeightPx: 50 }, 1080), 160)
})

const row = (extra) => ({ key: 'turbulence', label: '난류', status: 'found', model: [], frames: [], ...extra })

test('model chip shows the strongest model level, none, or short unavailable text', () => {
  assert.equal(modelChip(row({ model: [{ level: 'MOD' }, { level: 'SEV' }] })).text, 'SEV')
  assert.equal(modelChip(row({ status: 'none' })).text, '없음')
  // 라벨 열이 좁아 "확인 불가"가 세로로 꺾이던 것 → 짧게, 긴 설명은 title.
  assert.deepEqual([modelChip(row({ status: 'unavailable' })).text, modelChip(row({ status: 'unavailable' })).title], ['불가', '모델 자료 없음 · 확인 불가'])
  assert.equal(modelChip(row({ status: null })), null)
})

test('source chips are one per source, solid when any frame is at my altitude', () => {
  const frames = [{ source: 'SIGMET', mine: false }, { source: 'SIGMET', mine: true }, { source: 'AIRMET', mine: false }]
  assert.deepEqual(sourceChips(row({ frames })), [{ text: 'SIG', mine: true }, { text: 'AIR', mine: false }])
})

test('frame tags and bands read like the mockup', () => {
  assert.equal(formatBand({ lowFt: 14000, highFt: 20000 }), 'FL140–200')
  assert.equal(formatBand({ lowFt: 0, highFt: 10000 }), 'SFC–10,000ft')
  assert.equal(formatBand({ lowFt: 0, highFt: 32000 }), 'SFC–FL320')
  assert.equal(formatBand({ lowFt: 25000, highFt: 32000 }), 'FL250–320')
  assert.equal(frameTag({ source: 'SIGMET', code: 'SEV_ICE', bandFt: { lowFt: 25000, highFt: 32000 }, mine: false }), 'SIGMET 심한 착빙 · FL250–320 · 다른 고도')
  assert.equal(frameTag({ source: 'TYPHOON', label: '태풍 강풍 반경', mine: true }), '태풍 태풍 강풍 반경 · 전 고도 · 내 고도')
})

test('segment text drops to the level when narrow and says 전 고도 for convection', () => {
  assert.equal(segmentText({ level: 'SEV', phase: 'cruise', altitudeFt: { from: 25000, to: 25000 } }, 40), 'SEV · FL250')
  assert.equal(segmentText({ level: 'MOD', phase: 'descent', altitudeFt: { from: 4000, to: 2000 } }, 10), 'MOD · 4,000ft→2,000ft')
  assert.equal(segmentText({ level: 'MOD', phase: null, altitudeFt: null }, 10), 'MOD · 전 고도')
  assert.equal(segmentText({ level: 'MOD' }, 3), 'MOD')
  assert.equal(segmentText({ level: 'MOD' }, 1), '')
})

test('empty row text separates none from unavailable', () => {
  assert.equal(rowEmptyText(row({ status: 'none' })), '모델 MOD 이상 없음')
  assert.equal(rowEmptyText(row({ status: 'unavailable' })), '단면 자료 없음 · 확인 불가')
  assert.equal(rowEmptyText(row({ model: [{}] })), null)
})

test('summary callout names phase, strength, phenomenon and minutes', () => {
  const hhmm = (iso) => iso.slice(11, 16)
  const hazard = summaryCallout({ status: 'hazard', top: { kind: 'model', level: 'SEV', label: '난류', phase: 'cruise', from: 'BOPTA', to: 'DALSU', startNm: 42, endNm: 180, passFrom: '2026-10-20T00:51:00Z', passTo: '2026-10-20T01:09:00Z' } }, hhmm)
  assert.deepEqual(hazard, { tone: 'sev', badge: 'SEV', title: '순항 중 심한 난류 18분', detail: 'BOPTA→DALSU · 00:51–01:09' })
  assert.equal(summaryCallout({ status: 'clear', unavailable: [] }).title, '내 고도에서 MOD 이상 위험 없음')
  assert.equal(summaryCallout({ status: 'unknown', unavailable: ['turbulence'] }).title, '난류·착빙 확인 불가')
  assert.equal(summaryCallout(null).tone, 'unknown')
})
