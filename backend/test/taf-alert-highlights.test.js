import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTafAlertSegments } from '../src/airport-alerts/taf-highlights.js'

const rules = {
  visibility: { enabled: true, threshold: 5000 }, ceiling: { enabled: true, threshold: 1000 },
  wind: { enabled: true, threshold: 25 }, gust: { enabled: true, threshold: 30 },
  temperature: { enabled: true, threshold: 30, direction: 'above' },
  fzra: { enabled: true }, windshear: { enabled: true },
}
const hits = (text, criteria = rules) => buildTafAlertSegments(text, criteria).filter((segment) => segment.metrics)
const report = (body) => `TAF AMD RKSS 171100Z 1712/1818 ${body}`

test('NEW·AMD의 각 변화군에서 기준에 해당하는 토큰만 강조하고 원문을 보존한다', () => {
  for (const prefix of ['TAF', 'TAF AMD']) {
    const text = `${prefix} RKSS 171100Z 1712/1818 27025G30KT 5000 SCT005 TX30/1805Z\n  TEMPO 1714/1718 3000 -RA BKN009\nBECMG 1720/1722 9999 OVC010=`
    const segments = buildTafAlertSegments(text, rules)
    assert.equal(segments.map((segment) => segment.text).join(''), text)
    assert.deepEqual(segments.filter((segment) => segment.metrics).map((segment) => segment.text),
      ['27025G30KT', 'TX30/1805Z', '3000', 'BKN009'])
    assert.deepEqual(segments.find((segment) => segment.text === '27025G30KT').metrics.map((metric) => metric.key), ['wind', 'gust'])
  }
})

test('발표·유효시각·풍향·RVR·RMK의 숫자를 시정으로 색칠하지 않는다', () => {
  const text = report('28003KT 9999 R19/0300N SCT005 RMK 0300 BKN001 TX35/1805Z 27030KT FZRA')
  assert.deepEqual(hits(text), [])
})

test('비활성 기준은 제외하고 시정·운고는 미만, 풍속·돌풍은 이상으로 판정한다', () => {
  assert.deepEqual(hits(report('27024G29KT 5000 BKN010')), [])
  assert.deepEqual(hits(report('27025G30KT 4999 VV009'), {}).map((segment) => segment.text), [])
  assert.deepEqual(hits(report('27025G30KT 4999 VV009')).map((segment) => segment.text), ['27025G30KT', '4999', 'VV009'])
})

test('단위가 다른 해외 TAF와 혼합분수 시정을 판정한다', () => {
  const text = report('27013G16MPS 1 1/2SM BKN008CB\nTEMPO 1714/1718 27047G60KMH M1/4SM OVC009TCU')
  assert.deepEqual(hits(text).map((segment) => segment.text),
    ['27013G16MPS', '1 1/2SM', 'BKN008CB', '27047G60KMH', 'M1/4SM', 'OVC009TCU'])
  assert.equal(hits(text).find((segment) => segment.text === '1 1/2SM').metrics[0].value, 2414)
  assert.deepEqual(hits(report('27003KT P6SM CAVOK 9999'), { ...rules, visibility: { enabled: true, threshold: 20000 } }), [])
})

test('기온 방향·어는 비·저층 급변풍도 활성 기준에 따라 판정한다', () => {
  const text = report('27010KT 9999 TNM05/1721Z TX03/1805Z -FZRA WS020/18040KT')
  const segments = hits(text, { ...rules, temperature: { enabled: true, threshold: 0, direction: 'below' } })
  assert.deepEqual(segments.map((segment) => segment.text), ['TNM05/1721Z', '-FZRA', 'WS020/18040KT'])
  assert.deepEqual(segments.map((segment) => segment.metrics[0].key), ['temperature', 'fzra', 'windshear'])
})

test('판정 결과는 당시 기준을 보존하고 빈 본문을 허용한다', () => {
  const currentRules = structuredClone(rules)
  const segments = buildTafAlertSegments(report('3000'), currentRules)
  currentRules.visibility.threshold = 1500
  assert.equal(segments.find((segment) => segment.metrics).metrics[0].threshold, 5000)
  assert.deepEqual(buildTafAlertSegments(null, rules), [])
})
