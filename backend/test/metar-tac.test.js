import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMetarTac } from '../src/serializers/metar-tac.js'

// 실데이터 RKSI (CAVOK)
const rksi = {
  header: { icao: 'RKSI', report_type: 'METAR', observation_time: '2026-07-12T18:00:00Z' },
  observation: {
    wind: { raw: '15004KT' },
    rvr: [],
    wind_shear: null,
    display: { wind: '15004KT', visibility: '9999', weather: '', clouds: 'NSC', temperature: '27/25', qnh: 'Q1010' },
  },
  cavok_flag: true,
}

test('CAVOK METAR → CAVOK 토큰 (9999 NSC 대신)', () => {
  assert.equal(buildMetarTac(rksi), 'METAR RKSI 121800Z 15004KT CAVOK 27/25 Q1010')
})

test('비CAVOK: 시정+기상+구름 + 음수기온', () => {
  const m = {
    header: { icao: 'RKSS', report_type: 'METAR', observation_time: '2026-01-05T21:30:00Z' },
    observation: {
      wind: { raw: '32012G22KT' }, rvr: [], wind_shear: null,
      display: { wind: '32012G22KT', visibility: '3000', weather: 'BR', clouds: 'BKN008 OVC015', temperature: 'M03/M05', qnh: 'Q1027' },
    },
    cavok_flag: false,
  }
  assert.equal(buildMetarTac(m), 'METAR RKSS 052130Z 32012G22KT 3000 BR BKN008 OVC015 M03/M05 Q1027')
})

test('SPECI + RVR + windshear', () => {
  const m = {
    header: { icao: 'RKPC', report_type: 'SPECI', observation_time: '2026-03-03T05:00:00Z' },
    observation: {
      wind: { raw: '02015KT' },
      rvr: [{ runway: '31', mean: 550, operator: 'BELOW', tendency: 'DOWNWARD' }],
      wind_shear: { runway: '31' },
      display: { wind: '02015KT', visibility: '0600', weather: '+SN', clouds: 'OVC003', temperature: 'M01/M02', qnh: 'Q0995' },
    },
    cavok_flag: false,
  }
  assert.equal(
    buildMetarTac(m),
    'SPECI RKPC 030500Z 02015KT 0600 R31/M0550D +SN OVC003 M01/M02 Q0995 WS R31',
  )
})

test('빈/불완전 입력 → null', () => {
  assert.equal(buildMetarTac(null), null)
  assert.equal(buildMetarTac({ header: {} }), null)
})
