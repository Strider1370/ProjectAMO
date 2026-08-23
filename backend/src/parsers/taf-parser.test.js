import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parse } from './taf-parser.js'
import { buildTafTac } from '../serializers/taf-tac.js'

test('IWXXM no-significant-weather 변화군을 NSW TAC으로 재구성한다', () => {
  const taf = parse(`
    <response><body><items><item>
      <icaoCode>RKSI</icaoCode>
      <taf><iwxxm:TAF>
        <iwxxm:issueTime><gml:TimeInstant><gml:timePosition>2026-08-23T03:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:issueTime>
        <iwxxm:validPeriod><gml:TimePeriod><gml:beginPosition>2026-08-23T03:00:00Z</gml:beginPosition><gml:endPosition>2026-08-24T03:00:00Z</gml:endPosition></gml:TimePeriod></iwxxm:validPeriod>
        <iwxxm:baseForecast><iwxxm:MeteorologicalAerodromeForecast>
          <iwxxm:weather xlink:href="https://codes.example/RA"/>
        </iwxxm:MeteorologicalAerodromeForecast></iwxxm:baseForecast>
        <iwxxm:changeForecast><iwxxm:MeteorologicalAerodromeForecast changeIndicator="BECOMING">
          <iwxxm:phenomenonTime><gml:TimePeriod><gml:beginPosition>2026-08-23T09:00:00Z</gml:beginPosition><gml:endPosition>2026-08-23T11:00:00Z</gml:endPosition></gml:TimePeriod></iwxxm:phenomenonTime>
          <iwxxm:weather nilReason="nothingOfOperationalSignificance"/>
        </iwxxm:MeteorologicalAerodromeForecast></iwxxm:changeForecast>
      </iwxxm:TAF></taf>
    </item></items></body></response>
  `)

  assert.equal(taf.change_groups[0].nsw_flag, true)
  assert.match(buildTafTac(taf), /BECMG 2309\/2311 NSW/)
})
