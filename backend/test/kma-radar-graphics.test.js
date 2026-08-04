import { test } from 'node:test'
import assert from 'node:assert/strict'
import config from '../src/config.js'

import {
  buildImpgRequest,
  parseImpgResult,
  parseKmaKstTm,
  visualAlignmentBounds,
} from '../src/lib/kma-radar-graphics.js'

const qpfFixture = {
  meta: { errCd: '000' },
  data: {
    result: {
      dateTime: '2023.07.20.17:00',
      title: 'MAPLE QPF (+60분) mm/h',
      url: '/data/BUFD/RDR/IMG/qpf.png',
      bar: '/data/BUFD/RDR/IMG/qpf_legend.png',
      imageCoverageStartProjX: 12345.5,
      imageCoverageStartProjY: 45678.5,
      imageCoverageEndProjX: 22345.5,
      imageCoverageEndProjY: 55678.5,
    },
  },
}

const wissdomFixture = {
  meta: { errCd: '000' },
  data: {
    result: {
      dateTime: '2026.08.04.20:50',
      title: 'WISSDOM 1524 m',
      url: '/data/BUFD/RDR/IMG/RDR_WIS_NQC_202608042050.png',
      bar: '/data/BUFD/RDR/IMG/RDR_WIS_legend320.png',
      imageCoverageStartProjX: -576000,
      imageCoverageStartProjY: 3837000,
      imageCoverageEndProjX: 576000,
      imageCoverageEndProjY: 4800000,
    },
  },
}

test('exposes radar graphics configuration through the default collector config', () => {
  assert.equal(config.api.radar_graphics_url, 'https://apihub.kma.go.kr/api/typ03/cgi/rdr')
  assert.deepEqual(config.radar_graphics.wissdom_heights_m, [305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048])
  assert.deepEqual(config.radar_graphics.qpf_lead_minutes, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60])
})

test('parses compact KMA KST timestamps at the source boundary', () => {
  assert.deepEqual(parseKmaKstTm('202307201700'), {
    tm: '202307201700',
    timeMs: Date.UTC(2023, 6, 20, 8, 0),
  })
  assert.equal(parseKmaKstTm('20230720170'), null)
  assert.equal(parseKmaKstTm('202302300700'), null)
})

test('parses a valid QPF image descriptor without exposing a credential', () => {
  const qpf = parseImpgResult(qpfFixture, {
    product: 'qpf',
    requestedTm: '202307201700',
    leadMinutes: 60,
  })

  assert.equal(qpf.validTimeMs, Date.UTC(2023, 6, 20, 9, 0))
  assert.equal(qpf.leadMinutes, 60)
  assert.equal(qpf.imagePath.startsWith('/data/'), true)
  assert.equal(qpf.imagePath.includes('authKey'), false)
  assert.deepEqual(qpf.projectedBounds, [12345.5, 45678.5, 22345.5, 55678.5])
  assert.deepEqual(qpf.bounds, [
    [30.12520229746768, 118.82639855789549],
    [43.56590987094148, 133.58114159940212],
  ])
})

test('parses a sanitized real-shape WISSDOM descriptor', () => {
  const wissdom = parseImpgResult(wissdomFixture, {
    product: 'wissdom',
    requestedTm: '202608042050',
  })

  assert.equal(wissdom.tm, '202608042050')
  assert.equal(wissdom.imagePath, '/data/BUFD/RDR/IMG/RDR_WIS_NQC_202608042050.png')
  assert.deepEqual(wissdom.projectedBounds, [-576000, 3837000, 576000, 4800000])
})

test('uses the existing HSR nationwide renderer bounds as visual alignment', () => {
  const bounds = visualAlignmentBounds()
  assert.deepEqual(bounds, [
    [30.12520229746768, 118.82639855789549],
    [43.56590987094148, 133.58114159940212],
  ])
  const [[south, west], [north, east]] = bounds
  assert.equal([south, west, north, east].every(Number.isFinite), true)
  assert.equal(south < north, true)
  assert.equal(west < east, true)
})

test('rejects error, unsafe, malformed, and unbounded graphics responses', () => {
  assert.equal(parseImpgResult({ ...qpfFixture, meta: { errCd: '999' } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, meta: {} }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, url: 'https://example.invalid/qpf.png' } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, url: '/data/qpf.png?token=x' } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, bar: '/data/qpf_legend.png#part' } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, url: '/data/authkey-qpf.png' } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, imageCoverageEndProjY: 'bad' } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, imageCoverageEndProjY: '' } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, imageCoverageEndProjY: null } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, imageCoverageEndProjX: qpfFixture.data.result.imageCoverageStartProjX } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
  assert.equal(parseImpgResult({ ...qpfFixture, data: { result: { ...qpfFixture.data.result, dateTime: 'invalid' } } }, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 }), null)
})

test('builds product requests as URLSearchParams without an authentication value', () => {
  const wissdom = buildImpgRequest('wissdom', { tm: '202307201700', heightM: 1524 })
  assert.equal(wissdom instanceof URLSearchParams, true)
  assert.deepEqual(Object.fromEntries(['PROJ', 'tm', 'data1', 'data2', 'dataDtlCd', 'ht'].map((key) => [key, wissdom.get(key)])), {
    PROJ: 'LCC', tm: '202307201700', data1: 'r01', data2: 'rdr_wis_nqc', dataDtlCd: 'rdr_rdr_wis_nqc_0', ht: '1524',
  })

  const qpf = buildImpgRequest('qpf', { tm: '202307201700', leadMinutes: 60 })
  assert.deepEqual(Object.fromEntries(['PROJ', 'tm', 'data1', 'data2', 'dataDtlCd', 'qpf', 'ef'].map((key) => [key, qpf.get(key)])), {
    PROJ: 'LCC', tm: '202307201700', data1: 'r01', data2: 'rdr_qpf_ana1', dataDtlCd: 'rdr_rdr_qpf_ana1_0', qpf: 'M', ef: '60',
  })
  assert.equal(qpf.has('authKey'), false)
})

test('rejects unsupported WISSDOM heights and non-future QPF leads', () => {
  assert.throws(() => buildImpgRequest('wissdom', { tm: '202307201700', heightM: 1400 }), /Invalid WISSDOM height/)
  assert.throws(() => buildImpgRequest('qpf', { tm: '202307201700', leadMinutes: 0 }), /Invalid QPF lead time/)
  assert.throws(() => buildImpgRequest('qpf', { tm: '202307201700', leadMinutes: 65 }), /Invalid QPF lead time/)
})
