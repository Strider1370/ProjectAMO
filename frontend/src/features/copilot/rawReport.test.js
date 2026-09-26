import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenHighlightClass, rawReports } from './rawReport.js'

test('report tokens use the airport-panel thresholds', () => {
  assert.equal(tokenHighlightClass({ text: '1500', role: 'visibility' }, 'RKTU'), 'ap-metar-tac-hl ap-metar-tac-hl--level-ifr')
  assert.equal(tokenHighlightClass({ text: '9999', role: 'visibility' }, 'RKTU'), null)
  assert.equal(tokenHighlightClass({ text: 'BKN005', role: 'ceiling' }, 'RKTU'), 'ap-metar-tac-hl ap-metar-tac-hl--level-ifr')
  assert.equal(tokenHighlightClass({ text: 'BKN030', role: 'ceiling' }, 'RKTU'), null)
  assert.equal(tokenHighlightClass({ text: '01035G45KT', role: 'wind' }, 'RKPC'), 'ap-metar-tac-hl ap-metar-tac-hl--wind')
  assert.equal(tokenHighlightClass({ text: '24004KT', role: 'wind' }, 'RKPC'), null)
  assert.equal(tokenHighlightClass({ text: 'TSRA', role: 'weather-special' }, 'RKSS'), 'ap-metar-tac-hl ap-metar-tac-hl--special')
  assert.equal(tokenHighlightClass({ text: 'FEW015CB', role: 'cloud-cb' }, 'RKSS'), 'ap-metar-tac-hl ap-metar-tac-hl--special')
  assert.equal(tokenHighlightClass({ text: '-RA', role: 'weather-precip' }, 'RKSS'), 'ap-metar-tac-hl ap-metar-tac-hl--precip')
})

test('raw reports list METAR then TAF per airport and skip missing text', () => {
  const line = (...texts) => texts.map((text) => ({ text, role: /^\d{6}Z$/.test(text) ? 'time' : 'plain' }))
  const reports = rawReports({ data: { airports: [
    { icao: 'RKTU', metar: { rawLines: [line('METAR', 'RKTU', '261600Z', 'CAVOK')] }, taf: { rawLines: [line('TAF', 'AMD', 'RKTU', '261608Z', '2616/2718'), line('BECMG', '2618/2619')] } },
    { icao: 'RKSS', metar: { rawLines: null }, taf: null },
  ] } })
  assert.deepEqual(reports.map((r) => [r.icao, r.title, r.lines.length]), [['RKTU', 'METAR RKTU 261600Z', 1], ['RKTU', 'TAF AMD RKTU 261608Z', 2]])
})
