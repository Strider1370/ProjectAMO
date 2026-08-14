import assert from 'node:assert/strict'
import test from 'node:test'
import { TOKEN_COLORS, TOKEN_KINDS, classifyToken, classifyTokens, errorCount, procedureTokenForms } from './routeTokens.js'

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

test('procedure token forms are built from parts, not from the human label', () => {
  const forms = procedureTokenForms([
    { id: 'BULT2Q', name: 'BULTI TWO QUEBEC', runways: ['32L', '32R'], enrouteFix: 'BULTI', label: 'BULT2Q (RWY 32L, 32R)' },
  ])
  assert.ok(forms.includes('32L.BULT2Q.BULTI'))
  assert.ok(forms.includes('32R.BULT2Q.BULTI'))
  assert.ok(forms.includes('BULT2Q'), '활주로를 빼고 치는 경우도 받아야 한다')
  assert.ok(!forms.some((form) => form.includes('(')), '사람이 읽는 이름은 대조에 쓰지 않는다')
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

test('a coordinate outside the valid range is an error, not a coordinate', () => {
  // parseCoordinateToken은 범위를 벗어나면 throw한다. 그것이 판정기를 통과하면 안 된다.
  const token = classifyToken('N9921.4E12712.8', lookups)
  assert.equal(token.kind, TOKEN_KINDS.ERROR)
})
