import { test } from 'node:test'
import assert from 'node:assert/strict'
import config from '../src/config.js'

import {
  buildImpgRequest,
  parseImpgResult,
  parseKmaKstTm,
} from '../src/lib/kma-radar-graphics.js'
import { coverageBounds, latLonToProjected, projectedToLatLon } from '../src/lib/kma-graphics-projection.js'

const wissdomFixture = {
  meta: { errCd: '000' },
  data: {
    result: {
      dateTime: '2026.08.04.20:50',
      title: 'WISSDOM 1524 m',
      url: '/data/BUFD/RDR/IMG/RDR_WIS_NQC_202608042050.png',
      bar: '/data/BUFD/RDR/IMG/RDR_WIS_legend320.png',
      // 실제 KMA 응답값 — 이 범위가 시각 정합의 기준이라 환산 결과가 기준 상자와 정확히 같아야 한다.
      imageCoverageStartProjX: -386001.375,
      imageCoverageStartProjY: 4757139,
      imageCoverageEndProjX: 521047.21875,
      imageCoverageEndProjY: 3799247,
    },
  },
}

test('exposes radar graphics configuration through the default collector config', () => {
  assert.equal(config.api.radar_graphics_url, 'https://apihub.kma.go.kr/api/typ03/cgi/rdr')
  assert.deepEqual(config.radar_graphics.wissdom_heights_m, [305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048])
})

test('parses compact KMA KST timestamps at the source boundary', () => {
  assert.deepEqual(parseKmaKstTm('202307201700'), {
    tm: '202307201700',
    timeMs: Date.UTC(2023, 6, 20, 8, 0),
  })
  assert.equal(parseKmaKstTm('20230720170'), null)
  assert.equal(parseKmaKstTm('202302300700'), null)
})

test('parses an image descriptor without exposing a credential', () => {
  const wissdom = parseImpgResult(wissdomFixture, { product: 'wissdom', requestedTm: '202608042050' })
  assert.equal(wissdom.validTimeMs, wissdom.timeMs)
  assert.equal(wissdom.imagePath.startsWith('/data/'), true)
  assert.equal(wissdom.imagePath.includes('authKey'), false)
  // 상자는 응답이 알려준 렌더 범위를 실제 투영 수식으로 환산한 값이어야 한다.
  assert.deepEqual(wissdom.bounds, coverageBounds(wissdom.projectedBounds))
})

test('상자는 그림이 실제로 덮는 땅에서 나온다', () => {
  const wissdom = parseImpgResult(wissdomFixture, { product: 'wissdom', requestedTm: '202608042050' })
  const [[wSouth, wWest], [wNorth, wEast]] = wissdom.bounds
  // 예전에는 전체 격자 상자(북 43.57°, 서 118.83°)에 붙였다. 실제 렌더 범위는
  // 그보다 한참 좁아서, 그렇게 붙이면 강릉 기준 350 km까지 밀렸다.
  assert.ok(wNorth < 40, '북쪽 끝이 전체 격자 상자보다 훨씬 아래다')
  assert.ok(wWest > 121, '서쪽 끝이 전체 격자 상자보다 훨씬 오른쪽이다')
  // 인천 FIR 주요 공항은 모두 그림 안에 들어와야 한다.
  for (const [lat, lon] of [[33.51, 126.49], [37.46, 126.44], [35.18, 128.94], [37.75, 128.94]]) {
    assert.ok(lat > wSouth && lat < wNorth && lon > wWest && lon < wEast, `${lat},${lon}이 WISSDOM 범위 안`)
  }
})

test('투영 왕복이 원래 위경도로 돌아온다', () => {
  for (const [lat, lon] of [[33.51, 126.49], [37.46, 126.44], [38.0, 126.0]]) {
    const [back, backLon] = projectedToLatLon(...latLonToProjected(lat, lon))
    assert.ok(Math.abs(back - lat) < 1e-6 && Math.abs(backLon - lon) < 1e-6)
  }
})



test('환산 결과가 한반도 밖으로 나가는 응답은 프레임째 버린다', () => {
  const wrong = {
    ...wissdomFixture,
    data: { result: { ...wissdomFixture.data.result, imageCoverageStartProjX: 12345.5, imageCoverageStartProjY: 45678.5, imageCoverageEndProjX: 22345.5, imageCoverageEndProjY: 55678.5 } },
  }
  assert.equal(parseImpgResult(wrong, { product: 'wissdom', requestedTm: '202608042050' }), null)
})

test('parses a sanitized real-shape WISSDOM descriptor', () => {
  const wissdom = parseImpgResult(wissdomFixture, {
    product: 'wissdom',
    requestedTm: '202608042050',
  })

  assert.equal(wissdom.tm, '202608042050')
  assert.equal(wissdom.imagePath, '/data/BUFD/RDR/IMG/RDR_WIS_NQC_202608042050.png')
  assert.deepEqual(wissdom.projectedBounds, [-386001.375, 4757139, 521047.21875, 3799247])
})

test('rejects error, unsafe, malformed, and unbounded graphics responses', () => {
  assert.equal(parseImpgResult({ ...wissdomFixture, meta: { errCd: '999' } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, meta: {} }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, url: 'https://example.invalid/wis.png' } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, url: '/data/wis.png?token=x' } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, bar: '/data/wis_legend.png#part' } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, url: '/data/authkey-wis.png' } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, imageCoverageEndProjY: 'bad' } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, imageCoverageEndProjY: '' } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, imageCoverageEndProjY: null } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, imageCoverageEndProjX: wissdomFixture.data.result.imageCoverageStartProjX } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
  assert.equal(parseImpgResult({ ...wissdomFixture, data: { result: { ...wissdomFixture.data.result, dateTime: 'invalid' } } }, { product: 'wissdom', requestedTm: '202608042050' }), null)
})

test('builds product requests as URLSearchParams without an authentication value', () => {
  const wissdom = buildImpgRequest('wissdom', { tm: '202307201700', heightM: 1524 })
  assert.equal(wissdom instanceof URLSearchParams, true)
  assert.deepEqual(Object.fromEntries(['PROJ', 'tm', 'data1', 'data2', 'dataDtlCd', 'ht'].map((key) => [key, wissdom.get(key)])), {
    PROJ: 'LCC', tm: '202307201700', data1: 'r01', data2: 'rdr_wis_nqc', dataDtlCd: 'rdr_rdr_wis_nqc_0', ht: '1524',
  })
  assert.equal(wissdom.has('authKey'), false)
})

test('renders graphics at the configured zoom level and rejects unusable ones', () => {
  // ZOOMLVL is the only parameter that scales the rendered raster; the geographic coverage
  // KMA reports back is identical at every level, so this is resolution alone.
  assert.equal(buildImpgRequest('wissdom', { tm: '202307201700', heightM: 1524 }).get('ZOOMLVL'), '13')
  assert.equal(buildImpgRequest('wissdom', { tm: '202307201700', heightM: 1524, zoomLevel: 14 }).get('ZOOMLVL'), '14')
  assert.throws(() => buildImpgRequest('wissdom', { tm: '202307201700', heightM: 1524, zoomLevel: 0 }), /Invalid zoom level/)
})

test('rejects unsupported WISSDOM heights', () => {
  assert.throws(() => buildImpgRequest('wissdom', { tm: '202307201700', heightM: 1400 }), /Invalid WISSDOM height/)
})
