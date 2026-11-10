import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSatelliteNcUrl, satelliteOperationId, SATELLITE_NC_PATH } from './satellite-api.js'

test('new satellite downloads distinguish L1B channels and L2 products using UTC tm', () => {
  for (const [level, element, area, id] of [['l1b', 'IR105', 'ko', 'satellite_ir'], ['l1b', 'VI006', 'ko', 'satellite_visible'], ['l2', 'FOG', 'ko', 'satellite_fog'], ['l2', 'CTPS', 'ela', 'satellite_ctps']]) {
    const url = new URL(buildSatelliteNcUrl({ level, element, area, tm: '202611100300', key: 'a&b', map: area === 'ela' ? 'GE' : undefined }))
    assert.equal(url.pathname, SATELLITE_NC_PATH)
    assert.equal(url.searchParams.get('tm'), '202611100300')
    assert.equal(url.searchParams.get('authKey'), 'a&b')
    assert.equal(url.searchParams.has('date'), false)
    assert.equal(url.searchParams.get(level === 'l1b' ? 'chn' : 'data'), element.toLowerCase())
    assert.equal(satelliteOperationId(url), id)
  }
  assert.throws(() => buildSatelliteNcUrl({ level: 'l2', element: 'ctps', tm: 'bad' }), /timestamp/)
  assert.equal(satelliteOperationId(new URL('https://apihub.kma.go.kr/api/typ01/url/sat_file_nc_down.php?lvl=l2&data=ci')), null)
})
