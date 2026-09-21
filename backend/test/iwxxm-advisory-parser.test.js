import test from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '../src/parsers/airmet-parser.js'

function airmetXml(sequenceNumber) {
  return `<response><body><items><item><airmetMsg><iwxxm:AIRMET reportStatus="NORMAL">
    <iwxxm:issueTime><gml:TimeInstant><gml:timePosition>2026-09-21T13:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:issueTime>
    <iwxxm:sequenceNumber>${sequenceNumber}</iwxxm:sequenceNumber>
  </iwxxm:AIRMET></airmetMsg></item></items></body></response>`
}

// fast-xml-parser 기본값은 "E01"을 지수 표기(E+01)로 보고 숫자 변환해 NaN을 만든다.
test('AIRMET E-series sequence numbers stay text instead of becoming NaN', () => {
  for (const sequence of ['E01', 'D01', 'E10']) {
    const [item] = parse(airmetXml(sequence))
    assert.equal(item.sequence_number, sequence)
  }
})
