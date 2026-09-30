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
          <iwxxm:temperature><iwxxm:AerodromeAirTemperatureForecast>
            <iwxxm:maximumAirTemperature uom="Cel">25</iwxxm:maximumAirTemperature>
            <iwxxm:maximumAirTemperatureTime><gml:TimeInstant><gml:timePosition>2026-08-23T15:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:maximumAirTemperatureTime>
            <iwxxm:minimumAirTemperature uom="Cel">-3</iwxxm:minimumAirTemperature>
            <iwxxm:minimumAirTemperatureTime><gml:TimeInstant><gml:timePosition>2026-08-24T00:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:minimumAirTemperatureTime>
          </iwxxm:AerodromeAirTemperatureForecast></iwxxm:temperature>
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
  assert.match(buildTafTac(taf), /TX25\/2315Z TNM03\/2400Z/)
})

// 17Z 발표 30시간 TAF(1718/1900)는 TN TX TN 세 기온군을 temperature 블록 두 개로 싣는다.
// 블록이 둘이면 예전에는 배열을 못 읽어 기온이 모두 빠졌다.
test('IWXXM temperature 블록이 둘이면 TN TX TN을 시각 순서로 모두 읽는다', () => {
  const block = (max, maxTime, min, minTime) => `
    <iwxxm:temperature><iwxxm:AerodromeAirTemperatureForecast>
      <iwxxm:maximumAirTemperature uom="Cel">${max}</iwxxm:maximumAirTemperature>
      <iwxxm:maximumAirTemperatureTime><gml:TimeInstant><gml:timePosition>${maxTime}</gml:timePosition></gml:TimeInstant></iwxxm:maximumAirTemperatureTime>
      <iwxxm:minimumAirTemperature uom="Cel">${min}</iwxxm:minimumAirTemperature>
      <iwxxm:minimumAirTemperatureTime><gml:TimeInstant><gml:timePosition>${minTime}</gml:timePosition></gml:TimeInstant></iwxxm:minimumAirTemperatureTime>
    </iwxxm:AerodromeAirTemperatureForecast></iwxxm:temperature>`
  const taf = parse(`
    <response><body><items><item>
      <icaoCode>RKSI</icaoCode>
      <taf><iwxxm:TAF>
        <iwxxm:issueTime><gml:TimeInstant><gml:timePosition>2026-09-27T17:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:issueTime>
        <iwxxm:validPeriod><gml:TimePeriod><gml:beginPosition>2026-09-27T18:00:00Z</gml:beginPosition><gml:endPosition>2026-09-29T00:00:00Z</gml:endPosition></gml:TimePeriod></iwxxm:validPeriod>
        <iwxxm:baseForecast><iwxxm:MeteorologicalAerodromeForecast>
          ${block(25, '2026-09-28T06:00:00Z', 18, '2026-09-27T21:00:00Z')}
          ${block(25, '2026-09-28T06:00:00Z', 17, '2026-09-28T21:00:00Z')}
        </iwxxm:MeteorologicalAerodromeForecast></iwxxm:baseForecast>
      </iwxxm:TAF></taf>
    </item></items></body></response>
  `)

  assert.deepEqual(taf.header.temperatures.groups.map(({ type, value }) => `${type}${value}`), ['min18', 'max25', 'min17'])
  assert.equal(taf.header.temperatures.max.value, 25)
  assert.equal(taf.header.temperatures.min.value, 18)
  assert.match(buildTafTac(taf), /TN18\/2721Z TX25\/2806Z TN17\/2821Z/)
})
