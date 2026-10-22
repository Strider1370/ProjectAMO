import test from 'node:test'
import assert from 'node:assert/strict'
import {
  profileHeightPx, profileOpenFor, formatBand, frameTag, modelChip, readBriefingView, readDockState, rowEmptyText,
  segmentTitle, sourceChips, hazardSwatchStyle, hazardChipStyle, frameShortTag, summaryCallout, writeBriefingView, writeDockState, DEFAULT_DOCK,
  hazardLineColor, TYPHOON_LINE_COLOR, selectionDetail, frameAdvisoryId, focusTarget, layerToastText, pickRibbonTarget,
} from './mapBriefingModel.js'
import { GKTG_BANDS } from '../../../../../shared/gktg.js'
import { ACI_BANDS } from '../../../../../shared/aci.js'
import { ICING_PRESENTATION } from '../../../shared/weather/cloudIcingPresentation.js'

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) } }
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

test('remembers the chosen briefing view and dock state, falling back when storage fails', () => {
  const storage = memory()
  assert.equal(readBriefingView(storage), 'map')
  writeBriefingView('document', storage)
  assert.equal(readBriefingView(storage), 'document')
  assert.equal(readBriefingView(broken), 'map')
  writeDockState({ ribbonOpen: false, profileOpen: true, collapsed: true }, storage)
  assert.deepEqual(readDockState(storage), { ribbonOpen: false, profileOpen: true, collapsed: true })
  // 예전에 손잡이로 저장한 높이는 읽지 않는다(손잡이를 뺐으므로).
  storage.setItem('projectamo.briefingDock', JSON.stringify({ profileHeightPx: 600 }))
  assert.deepEqual(readDockState(storage), DEFAULT_DOCK)
  assert.deepEqual(readDockState(broken), DEFAULT_DOCK)
})

test('profile starts folded on low screens until the user chooses', () => {
  assert.equal(profileOpenFor(DEFAULT_DOCK, 1080), true)
  assert.equal(profileOpenFor(DEFAULT_DOCK, 768), false)
  assert.equal(profileOpenFor({ ...DEFAULT_DOCK, profileOpen: true }, 768), true)
})

test('profile height leaves room for the chart and keeps the dock under half the screen', () => {
  assert.equal(profileHeightPx(1080), 324)
  assert.equal(profileHeightPx(1000), 300)
  assert.equal(profileHeightPx(900), 280)
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

test('model segment tooltip carries level, altitude and route instead of bar text', () => {
  assert.equal(segmentTitle('난류', { level: 'SEV', phase: 'cruise', altitudeFt: { from: 25000, to: 25000 }, from: 'BOPTA', to: 'DALSU', startNm: 42, endNm: 180 }), '수치예보 난류 SEV · FL250 · BOPTA→DALSU 42–180NM')
  assert.equal(segmentTitle('대류', { level: 'MOD', altitudeFt: null, startNm: 10, endNm: 20 }), '수치예보 대류 MOD · 전 고도 · 10–20NM')
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

test('ribbon swatches reuse the vertical-profile legend colors', () => {
  assert.deepEqual(hazardSwatchStyle('turbulence', 'MOD'), { backgroundColor: 'rgba(255, 204, 0, 0.6)' })
  assert.deepEqual(hazardSwatchStyle('turbulence', 'SEV'), { backgroundColor: 'rgba(255, 41, 0, 0.6)' })
  assert.ok(hazardSwatchStyle('icing', 'SEV').backgroundImage.includes('radial-gradient'))
  assert.deepEqual(hazardSwatchStyle('convection', 'MOD'), { backgroundColor: '#fb923c' })
  assert.deepEqual(hazardSwatchStyle('typhoon', 'SEV'), {})
})

test('chips use a flat fill with readable text and narrow frames get a short tag', () => {
  const icing = hazardChipStyle('icing', 'SEV')
  assert.equal(icing.backgroundImage, undefined)
  assert.equal(icing.color, '#ffffff')
  assert.equal(hazardChipStyle('turbulence', 'MOD').color, '#1f2937')
  assert.equal(frameShortTag({ source: 'SIGMET', code: 'EMBD_TS' }), 'SIG 차폐뇌우')
  assert.equal(frameShortTag({ source: 'TYPHOON', code: 'TC' }), '태풍')
})

test('summary does not claim no hazard when part of the route has no model data', () => {
  const callout = summaryCallout({ status: 'clear', unavailable: [], partial: ['turbulence'] })
  assert.deepEqual([callout.tone, callout.title], ['unknown', '확인된 구간에서 MOD 이상 위험 없음'])
})

test('경로 위 색 띠 색은 위험 막대와 같은 원천(GKTG·착빙·대류), 태풍은 보라', () => {
  assert.equal(hazardLineColor('turbulence', 'SEV'), `rgba(${GKTG_BANDS[3].rgba.slice(0, 3).join(', ')}, 1)`)
  assert.equal(hazardLineColor('icing', 'MOD'), ICING_PRESENTATION[2].fillColor)
  assert.equal(hazardLineColor('convection', 'SEV'), ACI_BANDS[3].color)
  assert.equal(hazardLineColor('typhoon', 'TC'), TYPHOON_LINE_COLOR)
  assert.equal(hazardLineColor('turbulence', 'LGT'), null)
})

const descentSegment = { level: 'MOD', startNm: 300, endNm: 318, from: 'TOD', to: 'RKPC', passFrom: '2026-10-20T12:20:00Z', passTo: '2026-10-20T12:24:00Z', altitudeFt: { from: 4000, to: 2000 }, phase: 'descent' }
const sigmetFrame = { source: 'SIGMET', sourceId: 'RKSI-C01-2026-10-20T111700Z', code: 'SEV_TURB', label: 'SEV TURB', bandFt: { lowFt: 16000, highFt: 30000 }, mine: true, startNm: 40, endNm: 120, from: 'BOPTA', to: 'SOLEN', passFrom: '2026-10-20T11:40:00Z', passTo: '2026-10-20T11:52:00Z', validFrom: '2026-10-20T11:17:00Z', validTo: '2026-10-20T13:00:00Z' }

test('팝오버: 머리 = 강도·현상·출처, 본문 = 통과·구간·고도, 강하 구간은 고도 슬라이더 안내, 아래 = 자료 시각·근거', () => {
  const detail = selectionDetail({ row: { key: 'turbulence', label: '난류' }, kind: 'model', item: descentSegment }, {
    runs: { ktg: { tmfc: '2026102000', validTime: '2026-10-20T12:00:00Z' } }, formatTime: (iso) => iso.slice(11, 16), tzLabel: 'UTC',
  })
  assert.equal(detail.title, '난류')
  assert.equal(detail.level, 'MOD')
  assert.equal(detail.sourceChip, 'KIM GKTG 모델')
  assert.equal(detail.when, '12:20–12:24 UTC · 4분')
  assert.equal(detail.route, 'TOD → RKPC')
  assert.equal(detail.altitude, '4,000ft→2,000ft 강하')
  assert.equal(detail.mine, true)
  assert.equal(detail.note, '이 위험은 4,000–2,000ft · 고도 슬라이더로 확인')
  assert.equal(detail.source, '10/20 00Z 회차 · 유효 12:00 UTC')
  assert.equal(detail.basis, '300–318NM · 통과 시각은 바람 미반영')
})

test('팝오버: SIGMET 틀은 발표 고도대·내 고도 여부·유효 시각, 순항 모델 위험에는 고도 안내가 없다', () => {
  const frame = selectionDetail({ row: { key: 'turbulence', label: '난류' }, kind: 'frame', item: sigmetFrame }, { formatTime: (iso) => iso.slice(11, 16) })
  assert.equal(frame.title, '심한 난기류')
  assert.equal(frame.sourceChip, 'SIGMET')
  assert.equal(frame.altitude, 'FL160–300')
  assert.equal(frame.source, '유효 11:17–13:00')
  assert.equal(selectionDetail({ row: { key: 'turbulence', label: '난류' }, kind: 'frame', item: { ...sigmetFrame, mine: false } }).mine, false)
  const cruise = selectionDetail({ row: { key: 'turbulence', label: '난류' }, kind: 'model', item: { ...descentSegment, altitudeFt: { from: 25000, to: 25000 }, phase: 'cruise' } })
  assert.equal(cruise.altitude, 'FL250 순항')
  assert.equal(cruise.note, null)
})

test('발표 id: SIGMET 틀은 원본 id로 단면 상자·지도 면과 잇고, 태풍은 잇지 않는다', () => {
  assert.equal(frameAdvisoryId(sigmetFrame), 'RKSI-C01-2026-10-20T111700Z')
  assert.equal(frameAdvisoryId({ source: 'TYPHOON', sourceId: '2026-21-3' }), null)
})

test('"이 구간으로": 모델은 구간 가운데 고도·시각, 내 고도 발표는 순항고도, 다른 고도 발표는 고도대 가운데', () => {
  assert.deepEqual(focusTarget({ kind: 'model', item: descentSegment }), { timeMs: Date.parse('2026-10-20T12:22:00Z'), altitudeFt: 3000 })
  assert.equal(focusTarget({ kind: 'frame', item: sigmetFrame }, { cruiseAltitudeFt: 25000 }).altitudeFt, 25000)
  assert.equal(focusTarget({ kind: 'frame', item: { ...sigmetFrame, mine: false } }, { cruiseAltitudeFt: 9000 }).altitudeFt, 23000)
  assert.equal(focusTarget({ kind: 'model', item: { ...descentSegment, altitudeFt: null, phase: null } }).altitudeFt, null)
  assert.equal(focusTarget({ kind: 'model', item: { ...descentSegment, altitudeFt: { from: 19200, to: 25000 }, phase: 'cruise' } }, { cruiseAltitudeFt: 25000 }).altitudeFt, 25000)
})

test('켠 레이어 안내: KIM 기압면 레이어만 고도를 붙이고, 구름·착빙 묶음은 이름 하나로', () => {
  assert.deepEqual(layerToastText(['turbulence'], { levelLabel: 'FL250', timeLabel: '21:00 KST' }), { layers: '난류(KIM GKTG)', detail: 'FL250 · 21:00 KST' })
  assert.deepEqual(layerToastText(['cloudIcing', 'icing'], { levelLabel: 'FL240', timeLabel: '21:00 KST' }), { layers: '구름·착빙(KIM)', detail: 'FL240 · 21:00 KST' })
  assert.deepEqual(layerToastText(['sigmet'], { levelLabel: 'FL250', timeLabel: '21:00 KST' }), { layers: 'SIGMET(국내)', detail: '21:00 KST' })
  assert.equal(layerToastText([]), null)
})

test('틀이 모델 막대를 덮어도 가운데는 모델, 테두리·이름표는 틀, 모델이 없는 곳은 틀', () => {
  const row = { model: [{ startNm: 27, endNm: 171 }], frames: [{ startNm: 73, endNm: 222 }] }
  assert.deepEqual(pickRibbonTarget(row, 100), { kind: 'model', index: 0 })
  assert.deepEqual(pickRibbonTarget(row, 100, { edge: true }), { kind: 'frame', index: 0 })
  assert.deepEqual(pickRibbonTarget(row, 100, { tagFrameIndex: 0 }), { kind: 'frame', index: 0 })
  assert.deepEqual(pickRibbonTarget(row, 200), { kind: 'frame', index: 0 })
  assert.deepEqual(pickRibbonTarget(row, 40, { edge: true }), { kind: 'model', index: 0 })
  assert.equal(pickRibbonTarget(row, 300), null)
})
