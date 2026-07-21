import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMetarTac, buildMetarTacPresentation } from '../src/serializers/metar-tac.js'

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
      weather: [{ raw: 'BR', descriptor: null, phenomena: ['BR'] }],
      display: { wind: '32012G22KT', visibility: '3000', weather: 'BR', clouds: 'BKN008 OVC015', temperature: 'M03/M05', qnh: 'Q1027' },
    },
    cavok_flag: false,
  }
  assert.equal(buildMetarTac(m), 'METAR RKSS 052130Z 32012G22KT 3000 BR BKN008 OVC015 M03/M05 Q1027')
})

test('normalizes a 10 km visibility value to the ICAO 9999 token', () => {
  const metar = {
    header: { icao: 'RKTU', report_type: 'METAR', observation_time: '2026-07-21T11:00:00Z' },
    observation: {
      wind: { raw: '25007KT' }, rvr: [], wind_shear: null, weather: [],
      display: { wind: '25007KT', visibility: '10000', weather: '', clouds: 'BKN025', temperature: '27/24', qnh: 'Q1007' },
    },
    cavok_flag: false,
  }

  assert.equal(buildMetarTac(metar), 'METAR RKTU 211100Z 25007KT 9999 BKN025 27/24 Q1007')
})

test('SPECI + RVR + windshear', () => {
  const m = {
    header: { icao: 'RKPC', report_type: 'SPECI', observation_time: '2026-03-03T05:00:00Z' },
    observation: {
      wind: { raw: '02015KT' },
      rvr: [{ runway: '31', mean: 550, operator: 'BELOW', tendency: 'DOWNWARD' }],
      wind_shear: { runway: '31' },
      weather: [{ raw: '+SN', descriptor: null, phenomena: ['SN'] }],
      display: { wind: '02015KT', visibility: '0600', weather: '+SN', clouds: 'OVC003', temperature: 'M01/M02', qnh: 'Q0995' },
    },
    cavok_flag: false,
  }
  assert.equal(
    buildMetarTac(m),
    'SPECI RKPC 030500Z 02015KT 0600 R31/M0550D +SN OVC003 M01/M02 Q0995 WS R31',
  )
})

test('presentation assigns roles to whole TAC tokens', () => {
  const presentation = buildMetarTacPresentation({
    header: { icao: 'RKJB', report_type: 'SPECI', observation_time: '2026-07-18T14:20:00Z' },
    observation: { wind: { raw: '28003KT' }, rvr: [{ runway: '19', mean: 300, tendency: 'NO_CHANGE' }], wind_shear: null, weather: [{ raw: 'RA', descriptor: null, phenomena: ['RA'] }], display: { wind: '28003KT', visibility: '800', weather: 'RA', clouds: '', temperature: '25/25', qnh: 'Q1002' } }, cavok_flag: false,
  })
  const tokens = presentation.display_lines[0].tokens
  assert.equal(presentation.text, 'SPECI RKJB 181420Z 28003KT 800 R19/0300N RA 25/25 Q1002')
  assert.equal(tokens.find((token) => token.text === '28003KT').role, 'wind')
  assert.equal(tokens.find((token) => token.text === '800').role, 'visibility')
  assert.equal(tokens.find((token) => token.text === 'R19/0300N').role, 'rvr')
  assert.equal(tokens.find((token) => token.text === 'RA').role, 'weather-precip')
})

test('invalid legacy weather is omitted from reconstructed TAC', () => {
  const tac = buildMetarTac({
    header: { icao: 'RKJB', report_type: 'METAR', observation_time: '2026-07-18T15:00:00Z' },
    observation: { wind: { raw: '20002KT' }, weather: [{ raw: 'NULL', descriptor: null, phenomena: [] }], rvr: [], wind_shear: null, display: { wind: '20002KT', visibility: '3600', weather: 'NULL', clouds: '', temperature: '25/25', qnh: 'Q1002' } }, cavok_flag: false,
  })
  assert.equal(tac, 'METAR RKJB 181500Z 20002KT 3600 25/25 Q1002')
})

test('cumulonimbus cloud receives its own risk role', () => {
  const presentation = buildMetarTacPresentation({
    header: { icao: 'RKJJ', report_type: 'METAR', observation_time: '2026-07-18T15:00:00Z' },
    observation: { wind: { raw: '01006KT' }, weather: [], rvr: [], wind_shear: null, display: { wind: '01006KT', visibility: '9999', weather: '', clouds: 'FEW030CB', temperature: '26/26', qnh: 'Q1002' } }, cavok_flag: false,
  })
  assert.equal(presentation.display_lines[0].tokens.find((token) => token.text === 'FEW030CB').role, 'cloud-cb')
})

test('빈/불완전 입력 → null', () => {
  assert.equal(buildMetarTac(null), null)
  assert.equal(buildMetarTac({ header: {} }), null)
})
