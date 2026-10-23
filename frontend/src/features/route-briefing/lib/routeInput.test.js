import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRouteTokens, fieldChangesFromTokens, flagMisplacedAirports, placeEndpoint, procedureTokenText, readEndpoints } from './routeInput.js'
import { TOKEN_KINDS } from './routeTokens.js'

const AIRPORTS = ['RKSI', 'RKSS', 'RKPC', 'RKPK']
const isAirport = (value) => AIRPORTS.includes(value)
const SID = { id: 'sid-1', name: 'BOPTA2Y', enrouteFix: 'BOPTA', runways: ['34L'] }
const STAR = { id: 'star-1', name: 'DOTOL2P', enrouteFix: 'DOTOL', startFix: 'DOTOL', runways: ['07'] }
const SID_TEXT = '34L.BOPTA2Y.BOPTA'
const STAR_TEXT = '07.DOTOL2P.DOTOL'

test('procedure pills use the full runway.procedure.fix form, falling back to the name', () => {
  assert.equal(procedureTokenText(SID), SID_TEXT)
  assert.equal(procedureTokenText({ id: 'x', name: 'OSPOT2T' }), 'OSPOT2T')
  assert.equal(procedureTokenText(null), null)
})

test('a full list is departure, SID, en-route, STAR, arrival', () => {
  assert.deepEqual(buildRouteTokens({ departure: 'RKSI', sid: SID, enroute: ['BOPTA', 'Z51', 'MOXID'], star: STAR, arrival: 'RKPC' }),
    ['RKSI', SID_TEXT, 'BOPTA', 'Z51', 'MOXID', STAR_TEXT, 'RKPC'])
  assert.deepEqual(buildRouteTokens({ departure: 'RKSI', arrival: 'RKPC' }), ['RKSI', 'RKPC'])
})

test('a lone airport pill is the arrival only when the arrival field says so', () => {
  assert.deepEqual(readEndpoints(['RKPC'], isAirport, { arrival: 'RKPC' }), { departure: null, arrival: 'RKPC' })
  assert.deepEqual(readEndpoints(['RKSI'], isAirport, { departure: 'RKSI' }), { departure: 'RKSI', arrival: null })
  assert.deepEqual(readEndpoints(['RKSI', 'BOPTA', 'RKPC'], isAirport, {}), { departure: 'RKSI', arrival: 'RKPC' })
})

test('picking the arrival first, then the departure, keeps both', () => {
  let texts = placeEndpoint([], 'arrival', 'RKPC', { isAirport, current: {} })
  assert.deepEqual(texts, ['RKPC'])
  texts = placeEndpoint(texts, 'departure', 'RKSI', { isAirport, current: { arrival: 'RKPC' } })
  assert.deepEqual(texts, ['RKSI', 'RKPC'])
})

test('changing the arrival drops its STAR and keeps the SID', () => {
  const texts = ['RKSS', SID_TEXT, 'BOPTA', STAR_TEXT, 'RKPK']
  const next = placeEndpoint(texts, 'arrival', 'RKPC', { isAirport, current: { departure: 'RKSS', arrival: 'RKPK' }, ownedProcedures: [STAR] })
  assert.deepEqual(next, ['RKSS', SID_TEXT, 'BOPTA', 'RKPC'])
})

test('changing the arrival never drops a SID that sits next to it', () => {
  const texts = ['RKSS', SID_TEXT, 'RKPK']
  const next = placeEndpoint(texts, 'arrival', 'RKPC', { isAirport, current: { departure: 'RKSS', arrival: 'RKPK' }, ownedProcedures: [STAR] })
  assert.deepEqual(next, ['RKSS', SID_TEXT, 'RKPC'])
})

test('changing the departure drops its SID', () => {
  const next = placeEndpoint(['RKSS', SID_TEXT], 'departure', 'RKPK', { isAirport, current: { departure: 'RKSS' }, ownedProcedures: [SID] })
  assert.deepEqual(next, ['RKPK'])
})

test('clearing an endpoint removes the airport and its procedure', () => {
  const next = placeEndpoint(['RKSS', SID_TEXT, 'BOPTA', STAR_TEXT, 'RKPK'], 'arrival', '', { isAirport, current: { departure: 'RKSS', arrival: 'RKPK' }, ownedProcedures: [STAR] })
  assert.deepEqual(next, ['RKSS', SID_TEXT, 'BOPTA'])
})

test('choosing the airport that is already there changes nothing', () => {
  const texts = ['RKSS', SID_TEXT, 'RKPK']
  assert.equal(placeEndpoint(texts, 'departure', 'RKSS', { isAirport, current: { departure: 'RKSS', arrival: 'RKPK' }, ownedProcedures: [SID] }), texts)
})

test('an airport in the middle of an IFR route is an error; VFR may pass over airports', () => {
  const tokens = [
    { kind: TOKEN_KINDS.AIRPORT, text: 'RKSI' },
    { kind: TOKEN_KINDS.FIX, text: 'NULDI' },
    { kind: TOKEN_KINDS.AIRPORT, text: 'RKPK' },
    { kind: TOKEN_KINDS.AIRPORT, text: 'RKPC' },
  ]
  const flagged = flagMisplacedAirports(tokens, 'IFR')
  assert.equal(flagged[2].kind, TOKEN_KINDS.ERROR)
  assert.match(flagged[2].reason, /양 끝/)
  assert.equal(flagged[0].kind, TOKEN_KINDS.AIRPORT)
  assert.equal(flagged[3].kind, TOKEN_KINDS.AIRPORT)
  assert.equal(flagMisplacedAirports(tokens, 'VFR'), tokens)
})

test('a fix typed after the arrival airport does not make the arrival an error', () => {
  const tokens = [
    { kind: TOKEN_KINDS.AIRPORT, text: 'RKSS' },
    { kind: TOKEN_KINDS.AIRPORT, text: 'RKPK' },
    { kind: TOKEN_KINDS.FIX, text: 'SEL' },
  ]
  assert.deepEqual(flagMisplacedAirports(tokens, 'IFR'), tokens)
})

const tok = (kind, text) => ({ kind, text })
const A = (text) => tok(TOKEN_KINDS.AIRPORT, text)
const P = (text) => tok(TOKEN_KINDS.PROCEDURE, text)
const F = (text) => tok(TOKEN_KINDS.FIX, text)

test('pills set the airport fields, but an empty end never clears a field', () => {
  assert.deepEqual(fieldChangesFromTokens({ tokens: [A('RKSI'), F('BOPTA'), A('RKPC')], current: {} }).airports,
    { departureAirport: 'RKSI', arrivalAirport: 'RKPC' })
  assert.deepEqual(fieldChangesFromTokens({ tokens: [A('RKSI')], current: { departure: 'RKSI', arrival: 'RKPC' } }).airports, {})
  // 도착만 고른 상태: 알약 하나가 도착이다 — 출발 칸을 채우지 않는다.
  assert.deepEqual(fieldChangesFromTokens({ tokens: [A('RKPC')], current: { arrival: 'RKPC' } }).airports, {})
})

test('a typed procedure pill selects it; an unchanged field is left alone', () => {
  const changes = fieldChangesFromTokens({ tokens: [A('RKSI'), P(SID_TEXT)], current: { departure: 'RKSI' }, sidOptions: [SID] })
  assert.equal(changes.sid, SID)
  assert.equal('star' in changes, false)
  const same = fieldChangesFromTokens({ tokens: [A('RKSI'), P(SID_TEXT)], current: { departure: 'RKSI', sid: SID }, sidOptions: [SID] })
  assert.equal('sid' in same, false)
})

test('a procedure pill that was there and is gone clears its field', () => {
  const changes = fieldChangesFromTokens({
    tokens: [A('RKSI'), P(SID_TEXT), F('BOPTA'), A('RKPC')], previousProcedureTexts: [SID_TEXT, STAR_TEXT],
    current: { departure: 'RKSI', arrival: 'RKPC', sid: SID, star: STAR }, sidOptions: [SID], starOptions: [STAR],
  })
  assert.equal(changes.star, null)
  assert.equal('sid' in changes, false)
})

test('a selected procedure whose pill has not arrived yet is kept', () => {
  // 자동 생성: 칸이 먼저 바뀌고 알약은 다음 렌더에 들어온다.
  const changes = fieldChangesFromTokens({ tokens: [A('RKSI'), A('RKPC')], previousProcedureTexts: [],
    current: { departure: 'RKSI', arrival: 'RKPC', sid: SID, star: STAR }, sidOptions: [SID], starOptions: [STAR] })
  assert.equal('sid' in changes, false)
  assert.equal('star' in changes, false)
})
