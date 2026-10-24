import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { airportAlertBody, airportAlertTitle, metarHeadline, routeSigmetBody, routeSigmetTitle } from '../src/user-alerts/content.js'
import { PHENOMENON_KO } from '../src/user-alerts/phenomenon.js'

test('METAR push title names what happened first, then values against thresholds', () => {
  const payload = { observedAt: '2026-10-24T05:00:00Z', metrics: [
    { key: 'visibility', label: '시정', value: 1200, unit: 'm', threshold: 1600, direction: 'below' },
    { key: 'ceiling', label: '운고', value: 400, unit: 'ft', threshold: 500, direction: 'below' },
  ] }
  assert.equal(airportAlertTitle({ kind: 'metar', payload }, 'RKPC'), 'RKPC 시정·운고 기준 미달')
  assert.equal(airportAlertBody({ kind: 'metar', payload }), '시정 1200m (기준 1600m 미만) · 운고 400ft (기준 500ft 미만) · 14:00 KST 관측')
  assert.equal(metarHeadline([{ label: '풍속', direction: 'above' }]), '풍속 기준 초과')
  assert.equal(metarHeadline([{ label: '시정', direction: 'below' }, { label: '풍속', direction: 'above' }]), '시정·풍속 기준 도달')
  assert.equal(metarHeadline([{ label: '급변풍', direction: 'event' }]), '급변풍 보고')
})

test('TAF push is "TAF AMD 발표" with the report text as the body', () => {
  const payload = { reportType: 'AMD', text: 'TAF AMD RKSI 240520Z 2406/2512 27012KT 6000 BR' }
  assert.equal(airportAlertTitle({ kind: 'taf', payload }, 'RKSI'), 'RKSI TAF AMD 발표')
  assert.equal(airportAlertBody({ kind: 'taf', payload }), payload.text)
})

test('route SIGMET push shows the Korean name with the abbreviation, band, segment and validity', () => {
  const payload = { routeName: 'RKSI→RKPC', phenomenonCode: 'SEV_ICE', phenomenon: 'Severe Icing',
    altitudeBandFt: { lowFt: 20000, highFt: 28000 }, altitudeStatus: 'matched', intersectFromNm: 104.6, intersectToNm: 171.2,
    validFrom: '2026-10-24T04:00:00Z', validTo: '2026-10-24T08:00:00Z' }
  assert.equal(routeSigmetTitle(payload), 'SIGMET 심한 착빙 SEV ICE · RKSI→RKPC')
  assert.equal(routeSigmetBody(payload), 'FL200–FL280 내 고도 포함 · 105–171NM 구간 · 유효 13:00–17:00 KST')
})

test('backend phenomenon names match the frontend table', () => {
  const frontend = readFileSync(new URL('../../frontend/src/shared/weather/phenomenonKo.js', import.meta.url), 'utf8')
  for (const [code, name] of Object.entries(PHENOMENON_KO)) assert.match(frontend, new RegExp(`${code}: '${name}'`))
  const codes = [...frontend.matchAll(/^\s+([A-Z_]+): '/gm)].map((m) => m[1])
  assert.deepEqual(codes.sort(), Object.keys(PHENOMENON_KO).sort())
})
