import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRouteSuggestions } from './routeAutocomplete.js'

const sid = { id: 'SID1', airport: 'RKSS', name: 'BULTI2U', enrouteFix: 'BULTI', runways: ['14L'] }
const otherSid = { id: 'SID2', airport: 'RKSS', name: 'BEDES1A', enrouteFix: 'BEDES', runways: ['14L'] }
const star = { id: 'STAR1', airport: 'RKPC', name: 'DOTOL2P', startFix: 'DOTOL', enrouteFix: 'DOTOL' }
const airport = (text) => ({ text, kind: 'airport' })
const fix = (text) => ({ text, kind: 'fix' })
const airway = (text) => ({ text, kind: 'airway' })
const settings = { flightRule: 'IFR', departure: 'RKSS', arrival: 'RKPC', sidOptions: [sid, otherSid], starOptions: [star], lookups: { navpoints: { BULTI: {}, BEDES: {}, DOTOL: {} }, routes: { Y711: { sequence: ['BULTI', 'BEDES', 'DOTOL'], allowedDirection: 'sequence' } } } }
const groups = (args) => buildRouteSuggestions({ ...settings, ...args })

test('ranks matching SID and STAR by their actual adjacent fix and keeps other kinds', () => {
  const result = groups({ query: 'B', tokens: [airport('RKSS'), fix('BULTI'), airport('RKPC')], at: 1 })
  assert.equal(result[0].items[0].name, 'BULTI2U')
  assert.equal(result[0].items[0].connection, 'BULTI')
  assert.equal(result[1].items[0].name, 'BEDES1A')
  assert.equal(result[2].items[0].kind, 'FIX')
  const arrival = groups({ query: 'DO', tokens: [airport('RKSS'), fix('DOTOL'), airport('RKPC')], at: 2 })
  assert.equal(arrival[0].items[0].name, 'DOTOL2P')
  assert.equal(arrival[0].items[0].connection, 'DOTOL')
})

test('confirms a known airway sequence in the correct direction only', () => {
  const tokens = [airport('RKSS'), airway('Y711'), fix('DOTOL'), airport('RKPC')]
  const result = groups({ query: 'BUL', tokens, at: 1 })
  assert.equal(result[0].items[0].connection, 'BULTI')
  const reversed = { ...settings.lookups, routes: { Y711: { sequence: ['BULTI', 'BEDES', 'DOTOL'], allowedDirection: 'reverse' } } }
  const noMatch = groups({ query: 'BUL', tokens, at: 1, lookups: reversed })
  assert.equal(noMatch[0].items[0].connection, null)
  assert.match(noMatch[0].label, /^출발절차/)
})

test('an adjacent selected procedure prioritizes its fix, without inventing a match in the middle', () => {
  const result = groups({ query: 'B', tokens: [airport('RKSS'), { text: 'BULTI2U', kind: 'procedure' }, airport('RKPC')], at: 2 })
  assert.equal(result[0].items[0].name, 'BULTI')
  assert.equal(result[0].items[0].connection, 'BULTI')
  const middle = groups({ query: 'B', tokens: [airport('RKSS'), fix('BULTI'), fix('DOTOL'), airport('RKPC')], at: 2 })
  assert.ok(middle.every((group) => !/절차/.test(group.label)))
  assert.ok(groups({ query: 'B', flightRule: 'VFR', tokens: [airport('RKSS'), airport('RKPC')], at: 1 }).every((group) => !/절차|항로/.test(group.label)))
})

test('invalid or missing airway data is never reported as a connection', () => {
  const tokens = [airport('RKSS'), airway('Y711'), fix('DOTOL'), airport('RKPC')]
  for (const route of [undefined, { sequence: ['BULTI', 'DOTOL'], allowedDirection: 'conditional' }, { sequence: ['BULTI', 'DOTOL'], allowedDirection: 'sequence', segmentRules: [{ from: 'BULTI', to: 'DOTOL', allowedDirection: 'reverse' }] }]) {
    const result = groups({ query: 'BUL', tokens, at: 1, lookups: { ...settings.lookups, routes: { Y711: route } } })
    assert.equal(result[0].items[0].connection, null)
  }
})
