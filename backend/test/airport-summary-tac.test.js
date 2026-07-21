import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeAirport } from '../src/briefing/airport-summary.js'

test('briefing airport summary preserves the METAR TAC tokens used by the airport panel', () => {
  const metar = {
    header: { icao: 'RKSI', report_type: 'METAR', observation_time: '2026-07-21T11:30:00Z', raw_text: 'METAR RKSI 211130Z 23006KT 9000 BR BKN004 24/24 Q1007', tac: { display_lines: [{ tokens: [{ text: 'BKN004', role: 'ceiling' }] }] } },
    observation: { visibility: { value: 9000 }, wind: { direction: 230, speed: 6 }, clouds: [{ amount: 'BKN', base: 400 }], display: { wind: '23006KT', clouds: 'BKN004', temperature: '24/24', qnh: 'Q1007' } },
  }

  const summary = summarizeAirport('departure', metar)

  assert.equal(summary.metar.header.tac.display_lines[0].tokens[0].role, 'ceiling')
  assert.equal(summary.metar.header.raw_text, metar.header.raw_text)
})
