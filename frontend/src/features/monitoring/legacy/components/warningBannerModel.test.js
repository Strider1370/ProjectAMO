import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWarningEntries, warningBannerLabel } from './warningBannerModel.js'

test('지상 모드는 공항경보 뒤에 기상청 폭염·한파 특보를 같은 순환 목록에 넣는다', () => {
  const entries = buildWarningEntries({
    dashboardMode: 'ground',
    airportWarnings: [{ wrng_type_key: 'WIND_SHEAR' }],
    kmaWarnings: [{ phenomenon: 'HEAT_WAVE', levelLabel: '경보' }],
  })

  assert.deepEqual(entries.map((entry) => entry.source), ['airport', 'kma'])
  assert.equal(warningBannerLabel(entries, 'ground'), '기상경보·특보')
})

test('운항 모드는 기상청 특보를 표시하지 않는다', () => {
  const entries = buildWarningEntries({ dashboardMode: 'ops', airportWarnings: [], kmaWarnings: [{ phenomenon: 'COLD_WAVE' }] })
  assert.deepEqual(entries, [])
})
