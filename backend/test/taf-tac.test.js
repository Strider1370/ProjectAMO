import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTafTac } from '../src/serializers/taf-tac.js'

// 실데이터 RKSI
const rksi = {
  header: { icao: 'RKSI', report_status: 'NORMAL', issued: '2026-07-12T17:00:00Z', valid_start: '2026-07-12T18:00:00Z', valid_end: '2026-07-14T00:00:00Z' },
  base: { wind: { raw: '16008KT' }, vis: 9999, wx: [], clouds: [], cavok_flag: true, nsc_flag: false },
  change_groups: [
    { type: 'BECMG', start: '2026-07-13T02:00:00Z', end: '2026-07-13T04:00:00Z', wind: { raw: '22010KT' }, vis: null, wx: null, clouds: null, cavok_flag: false, nsc_flag: false },
    { type: 'BECMG', start: '2026-07-13T15:00:00Z', end: '2026-07-13T17:00:00Z', wind: { raw: '16010KT' }, vis: 6000, wx: null, clouds: [{ raw: 'FEW010' }, { raw: 'BKN020' }], cavok_flag: false, nsc_flag: false },
  ],
}

test('RKSI TAF 재구성 (base CAVOK + BECMG 2개)', () => {
  assert.equal(
    buildTafTac(rksi),
    [
      'TAF RKSI 121700Z 1218/1400 16008KT CAVOK',
      'BECMG 1302/1304 22010KT',
      'BECMG 1315/1317 16010KT 6000 FEW010 BKN020',
    ].join('\n'),
  )
})

test('AMD + TEMPO + PROB30_TEMPO + 저시정/기상/NSC', () => {
  const t = {
    header: { icao: 'RKPC', report_status: 'AMENDMENT', issued: '2026-01-05T05:00:00Z', valid_start: '2026-01-05T06:00:00Z', valid_end: '2026-01-06T06:00:00Z' },
    base: { wind: { raw: '30015G25KT' }, vis: 9999, wx: [], clouds: [{ raw: 'SCT030' }], cavok_flag: false, nsc_flag: false },
    change_groups: [
      { type: 'TEMPO', start: '2026-01-05T06:00:00Z', end: '2026-01-05T12:00:00Z', wind: null, vis: 3000, wx: [{ raw: 'SHSN' }], clouds: [{ raw: 'BKN015' }], cavok_flag: false, nsc_flag: false },
      { type: 'PROB30_TEMPO', start: '2026-01-05T12:00:00Z', end: '2026-01-05T18:00:00Z', wind: null, vis: 800, wx: [{ raw: '+SHSN' }], clouds: null, cavok_flag: false, nsc_flag: false },
      { type: 'BECMG', start: '2026-01-06T00:00:00Z', end: '2026-01-06T02:00:00Z', wind: { raw: '27010KT' }, vis: 9999, wx: null, clouds: null, cavok_flag: false, nsc_flag: true },
    ],
  }
  assert.equal(
    buildTafTac(t),
    [
      'TAF AMD RKPC 050500Z 0506/0606 30015G25KT 9999 SCT030',
      'TEMPO 0506/0512 3000 SHSN BKN015',
      'PROB30 TEMPO 0512/0518 0800 +SHSN',
      'BECMG 0600/0602 27010KT 9999 NSC',
    ].join('\n'),
  )
})

test('빈 입력 → null', () => {
  assert.equal(buildTafTac(null), null)
})
