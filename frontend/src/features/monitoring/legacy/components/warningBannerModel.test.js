import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWarningEntries, formatKmaWarningName, warningBannerLabel } from './warningBannerModel.js'

test('지상 모드는 공항경보 뒤에 기상청 폭염·한파 특보를 같은 순환 목록에 넣는다', () => {
  const entries = buildWarningEntries({
    dashboardMode: 'ground',
    airportWarnings: [{ wrng_type_key: 'WIND_SHEAR' }],
    kmaWarnings: [{ phenomenon: 'HEAT_WAVE', levelLabel: '경보' }],
  })

  assert.deepEqual(entries.map((entry) => entry.source), ['airport', 'kma'])
  assert.equal(warningBannerLabel(entries, 'ground'), '공항경보')
})

test('운항 모드는 기상청 특보를 표시하지 않는다', () => {
  const entries = buildWarningEntries({ dashboardMode: 'ops', airportWarnings: [], kmaWarnings: [{ phenomenon: 'COLD_WAVE' }] })
  assert.deepEqual(entries, [])
})

test('기상청 특보 이름은 종류와 등급만 표시한다', () => {
  assert.equal(formatKmaWarningName({ phenomenon: 'HEAT_WAVE', levelLabel: '중대경보' }), '폭염중대경보')
  assert.equal(formatKmaWarningName({ phenomenon: 'COLD_WAVE', levelLabel: '경보' }), '한파경보')
})

test('주의 등급은 정식 이름인 주의보로 적는다 — 폭염주의는 폭염경보와 헷갈린다', () => {
  assert.equal(formatKmaWarningName({ phenomenon: 'HEAT_WAVE', levelLabel: '주의' }), '폭염주의보')
  assert.equal(formatKmaWarningName({ phenomenon: 'COLD_WAVE', levelLabel: '주의' }), '한파주의보')
})

test('경보와 중대경보는 그대로 쓴다 — 그게 정식 이름이다', () => {
  assert.equal(formatKmaWarningName({ phenomenon: 'HEAT_WAVE', levelLabel: '경보' }), '폭염경보')
  assert.equal(formatKmaWarningName({ phenomenon: 'COLD_WAVE', levelLabel: '중대경보' }), '한파중대경보')
})
