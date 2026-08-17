import assert from 'node:assert/strict'
import test from 'node:test'
import { TOKEN_COLORS, TOKEN_KINDS, classifyToken, classifyTokens, errorCount, findProcedureByToken, isProcedureText, procedureFixIds, procedureTokenForms } from './routeTokens.js'

const lookups = {
  airports: ['RKSS', 'RKPC'],
  navpoints: { DOTOL: { lat: 33.5, lon: 126.5 }, BULTI: { lat: 37.1, lon: 126.9 } },
  routes: { Y711: {}, Y697: {} },
  procedures: ['32L.BULT2Q.BULTI', 'DOTOL.DOTO2P', 'ILS Y RWY 07'],
}

test('classifies each token kind', () => {
  assert.equal(classifyToken('RKSS', lookups).kind, TOKEN_KINDS.AIRPORT)
  assert.equal(classifyToken('Y711', lookups).kind, TOKEN_KINDS.AIRWAY)
  assert.equal(classifyToken('DOTOL', lookups).kind, TOKEN_KINDS.FIX)
  assert.equal(classifyToken('DCT', lookups).kind, TOKEN_KINDS.DCT)
  assert.equal(classifyToken('32L.BULT2Q.BULTI', lookups).kind, TOKEN_KINDS.PROCEDURE)
  assert.equal(classifyToken('N3721.4E12712.8', lookups).kind, TOKEN_KINDS.COORDINATE)
})

test('lowercase input is accepted and normalized', () => {
  const token = classifyToken('rkss', lookups)
  assert.equal(token.kind, TOKEN_KINDS.AIRPORT)
  assert.equal(token.text, 'RKSS')
})

test('unknown tokens become errors with a kind-specific reason', () => {
  assert.equal(classifyToken('GONXA', lookups).reason, 'GONXA — 그런 지점이 없습니다')
  assert.equal(classifyToken('Y999', lookups).reason, 'Y999 — 그런 항공로가 없습니다')
  assert.equal(classifyToken('RKZZ', lookups).reason, 'RKZZ — 그런 공항이 없습니다')
})

test('counts errors across a token list', () => {
  const tokens = classifyTokens(['RKSS', 'GONXA', 'Y999', 'RKPC'], lookups)
  assert.equal(errorCount(tokens), 2)
  assert.equal(tokens[0].kind, TOKEN_KINDS.AIRPORT)
  assert.equal(tokens[3].kind, TOKEN_KINDS.AIRPORT)
})

test('empty and whitespace input yields no tokens', () => {
  assert.deepEqual(classifyTokens([], lookups), [])
  assert.deepEqual(classifyTokens(['', '   '], lookups), [])
})

// 실제 자료 모양: id는 내부 키, name이 조종사가 쓰는 이름, label은 사람이 읽는 표시.
const RKSI_SID = {
  id: 'RKSI-SID-BINIL3C',
  name: 'BINIL3C',
  runways: ['15L/R'],
  enrouteFix: 'BINIL',
  label: 'BINIL3C (RWY 15L/R)',
}

test('procedure forms use the name a pilot writes, not the internal id or the label', () => {
  const forms = procedureTokenForms([RKSI_SID])
  assert.ok(forms.includes('BINIL3C'), '절차 이름만 쳐도 받아야 한다')
  assert.ok(!forms.includes('RKSI-SID-BINIL3C'), '내부 키는 경로에 치는 글자가 아니다')
  assert.ok(!forms.some((form) => form.includes('(')), '사람이 읽는 표시는 대조에 쓰지 않는다')
})

test('paired runways split so each side can be written', () => {
  // 자료에는 '15L/R'로 묶여 있지만 경로에는 한 쪽만 쓴다.
  const forms = procedureTokenForms([RKSI_SID])
  assert.ok(forms.includes('15L.BINIL3C.BINIL'))
  assert.ok(forms.includes('15R.BINIL3C.BINIL'))
})

test('a typed procedure resolves back to its procedure for the picker', () => {
  assert.equal(findProcedureByToken('BINIL3C', [RKSI_SID])?.id, 'RKSI-SID-BINIL3C')
  assert.equal(findProcedureByToken('15L.BINIL3C.BINIL', [RKSI_SID])?.id, 'RKSI-SID-BINIL3C')
  assert.equal(findProcedureByToken('BOPTA2A', [RKSI_SID]), null)
  assert.equal(isProcedureText('BINIL3C', [RKSI_SID]), true)
  assert.equal(isProcedureText('ANDOL', [RKSI_SID]), false)
})

test('a procedure classifies as a procedure once its forms are known', () => {
  const withProcedure = { ...lookups, procedures: procedureTokenForms([RKSI_SID]) }
  assert.equal(classifyToken('BINIL3C', withProcedure).kind, TOKEN_KINDS.PROCEDURE)
  assert.equal(classifyToken('15L.BINIL3C.BINIL', withProcedure).kind, TOKEN_KINDS.PROCEDURE)
})

test('every token kind has a color, and only error and coordinate carry a border', () => {
  for (const kind of Object.values(TOKEN_KINDS)) {
    if (kind === TOKEN_KINDS.DCT) continue
    assert.ok(TOKEN_COLORS[kind], `${kind}에 색이 없습니다`)
    assert.match(TOKEN_COLORS[kind].fg, /^#[0-9a-f]{6}$/i)
  }
  // 색을 못 알아보는 경우에도 오류가 모양으로 구분되어야 한다.
  assert.ok(TOKEN_COLORS[TOKEN_KINDS.ERROR].border)
  assert.equal(TOKEN_COLORS[TOKEN_KINDS.AIRPORT].border, undefined)
})

test('red is reserved for errors', () => {
  const reds = Object.entries(TOKEN_COLORS)
    .filter(([, color]) => color.fg.toLowerCase() === '#c0291f')
    .map(([kind]) => kind)
  assert.deepEqual(reds, [TOKEN_KINDS.ERROR])
})

test('terminal-area fixes that live only in procedure data still classify as fixes', () => {
  // OSPAT은 enroute.json에 없다 — 절차 안에만 있다. 없다고 하면 정상 입력이 오류가 된다.
  const withProcedureFixes = { ...lookups, fixes: ['OSPAT'] }
  assert.equal(classifyToken('OSPAT', withProcedureFixes).kind, TOKEN_KINDS.FIX)
  assert.equal(classifyToken('OSPAT', lookups).kind, TOKEN_KINDS.ERROR)
})

test('an imported custom waypoint remains a coordinate token with its file coordinate', () => {
  const token = classifyToken('QD040', {
    ...lookups,
    userWaypoints: [{ id: 'imported-wp-1', name: 'QD040', lon: 126.692694, lat: 37.634167 }],
  })
  assert.deepEqual(token, {
    kind: TOKEN_KINDS.COORDINATE,
    text: 'QD040',
    coordinate: { lon: 126.692694, lat: 37.634167 },
  })
})

test('procedure fix ids are collected from every place a procedure names a fix', () => {
  const ids = procedureFixIds([
    {
      id: 'BULT2Q',
      enrouteFix: 'BULTI',
      startFix: 'OSPAT',
      fixes: [{ id: 'ospat' }, { id: 'KAMSO' }],
      displayPoints: [{ id: 'GONAX' }],
    },
  ])
  assert.ok(ids.includes('OSPAT'))
  assert.ok(ids.includes('KAMSO'))
  assert.ok(ids.includes('GONAX'))
  assert.ok(ids.includes('BULTI'))
  assert.equal(ids.filter((id) => id === 'OSPAT').length, 1, '중복은 한 번만')
})

test('a coordinate outside the valid range is an error, not a coordinate', () => {
  // parseCoordinateToken은 범위를 벗어나면 throw한다. 그것이 판정기를 통과하면 안 된다.
  const token = classifyToken('N9921.4E12712.8', lookups)
  assert.equal(token.kind, TOKEN_KINDS.ERROR)
})
