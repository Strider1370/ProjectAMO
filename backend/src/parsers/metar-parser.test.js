import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from './metar-parser.js'
import { buildMetarTac } from '../serializers/metar-tac.js'

// trendForecast 블록은 WMO 공식 IWXXM 예제(wmo-im/iwxxm metar-A3-1.xml)의 실제 구조를 그대로 사용.
// KMA 응답에서 아직 실제로 관측된 적은 없어 방어적 파싱이지만, 스키마 정확성은 공식 예제로 검증한다.
function wrapMetar(innerXml) {
  return `<response><body><items><item><icaoCode>RKSI</icaoCode><metarMsg><iwxxm:METAR xmlns:iwxxm="http://icao.int/iwxxm/2023-1" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:aixm="http://www.aixm.aero/schema/5.1.1" xmlns:xlink="http://www.w3.org/1999/xlink">
<iwxxm:issueTime><gml:TimeInstant><gml:timePosition>2026-07-22T07:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:issueTime>
<iwxxm:aerodrome><aixm:AirportHeliport><aixm:timeSlice><aixm:AirportHeliportTimeSlice><aixm:designator>RKSI</aixm:designator></aixm:AirportHeliportTimeSlice></aixm:timeSlice></aixm:AirportHeliport></iwxxm:aerodrome>
<iwxxm:observationTime><gml:TimeInstant><gml:timePosition>2026-07-22T07:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:observationTime>
<iwxxm:observation><iwxxm:MeteorologicalAerodromeObservation>
<iwxxm:airTemperature uom="Cel">20</iwxxm:airTemperature>
<iwxxm:dewpointTemperature uom="Cel">18</iwxxm:dewpointTemperature>
<iwxxm:qnh uom="hPa">1013</iwxxm:qnh>
<iwxxm:surfaceWind><iwxxm:AerodromeSurfaceWind><iwxxm:meanWindDirection uom="deg">100</iwxxm:meanWindDirection><iwxxm:meanWindSpeed uom="[kn_i]">5</iwxxm:meanWindSpeed></iwxxm:AerodromeSurfaceWind></iwxxm:surfaceWind>
<iwxxm:visibility><iwxxm:AerodromeHorizontalVisibility><iwxxm:prevailingVisibility uom="m">9999</iwxxm:prevailingVisibility></iwxxm:AerodromeHorizontalVisibility></iwxxm:visibility>
</iwxxm:MeteorologicalAerodromeObservation></iwxxm:observation>
${innerXml}
</iwxxm:METAR></metarMsg></item></items></body></response>`
}

describe('parseTrendForecast (경향예보, WMO 공식 예제 기반)', () => {
  it('BECOMING + UNTIL(기간) + 시정 → "BECMG TL1700 0800"', () => {
    const xml = wrapMetar(`<iwxxm:trendForecast><iwxxm:MeteorologicalAerodromeTrendForecast changeIndicator="BECOMING">
<iwxxm:phenomenonTime><gml:TimePeriod><gml:beginPosition>2026-07-22T16:30:00Z</gml:beginPosition><gml:endPosition>2026-07-22T17:00:00Z</gml:endPosition></gml:TimePeriod></iwxxm:phenomenonTime>
<iwxxm:timeIndicator>UNTIL</iwxxm:timeIndicator>
<iwxxm:prevailingVisibility uom="m">800</iwxxm:prevailingVisibility>
</iwxxm:MeteorologicalAerodromeTrendForecast></iwxxm:trendForecast>`)
    const parsed = parse(xml)
    assert.deepEqual(parsed.trend, ['BECMG TL1700 800'])
  })

  it('BECOMING + AT(시각) + 10000m → 9999로 정규화, "BECMG AT1800 9999"', () => {
    const xml = wrapMetar(`<iwxxm:trendForecast><iwxxm:MeteorologicalAerodromeTrendForecast changeIndicator="BECOMING">
<iwxxm:phenomenonTime><gml:TimeInstant><gml:timePosition>2026-07-22T18:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:phenomenonTime>
<iwxxm:timeIndicator>AT</iwxxm:timeIndicator>
<iwxxm:prevailingVisibility uom="m">10000</iwxxm:prevailingVisibility>
<iwxxm:prevailingVisibilityOperator>ABOVE</iwxxm:prevailingVisibilityOperator>
</iwxxm:MeteorologicalAerodromeTrendForecast></iwxxm:trendForecast>`)
    const parsed = parse(xml)
    assert.deepEqual(parsed.trend, ['BECMG AT1800 9999'])
  })

  it('CAVOK 경향예보 → "TEMPO CAVOK"', () => {
    const xml = wrapMetar(`<iwxxm:trendForecast><iwxxm:MeteorologicalAerodromeTrendForecast changeIndicator="TEMPORARY_FLUCTUATIONS" cloudAndVisibilityOK="true">
<iwxxm:phenomenonTime><gml:TimeInstant><gml:timePosition>2026-07-22T09:00:00Z</gml:timePosition></gml:TimeInstant></iwxxm:phenomenonTime>
</iwxxm:MeteorologicalAerodromeTrendForecast></iwxxm:trendForecast>`)
    const parsed = parse(xml)
    assert.deepEqual(parsed.trend, ['TEMPO CAVOK'])
  })

  it('trendForecast 요소가 없으면(NOSIG 상당) 빈 배열', () => {
    const parsed = parse(wrapMetar(''))
    assert.deepEqual(parsed.trend, [])
  })
})

describe('급변풍 파싱에서 METAR 재구성까지', () => {
  function observationWithShear(shear) {
    return wrapMetar('').replace('</iwxxm:MeteorologicalAerodromeObservation>', `${shear}</iwxxm:MeteorologicalAerodromeObservation>`)
  }

  it('모든 활주로 급변풍을 원문 끝에 유지한다', () => {
    const report = parse(observationWithShear('<iwxxm:windShear><iwxxm:AerodromeWindShear allRunways="true"/></iwxxm:windShear>'))
    assert.deepEqual(report.observation.wind_shear, { all_runways: true, runways: null })
    assert.ok(buildMetarTac(report).endsWith('WS ALL RWY'))
  })

  it('중첩된 특정 활주로와 좌우 구분을 유지한다', () => {
    const report = parse(observationWithShear(`<iwxxm:windShear><iwxxm:AerodromeWindShear allRunways="false">
      <iwxxm:runway><aixm:RunwayDirection><aixm:timeSlice><aixm:RunwayDirectionTimeSlice><aixm:designator>06L</aixm:designator></aixm:RunwayDirectionTimeSlice></aixm:timeSlice></aixm:RunwayDirection></iwxxm:runway>
      <iwxxm:runway><aixm:RunwayDirection><aixm:timeSlice><aixm:RunwayDirectionTimeSlice><aixm:designator>24R</aixm:designator></aixm:RunwayDirectionTimeSlice></aixm:timeSlice></aixm:RunwayDirection></iwxxm:runway>
    </iwxxm:AerodromeWindShear></iwxxm:windShear>`))
    assert.deepEqual(report.observation.wind_shear, { all_runways: false, runways: ['06L', '24R'] })
    assert.ok(buildMetarTac(report).endsWith('WS R06L WS R24R'))
  })

  it('직접 들어온 활주로 번호도 처리한다', () => {
    const report = parse(observationWithShear('<iwxxm:windShear><iwxxm:AerodromeWindShear allRunways="false"><iwxxm:runway>6</iwxxm:runway></iwxxm:AerodromeWindShear></iwxxm:windShear>'))
    assert.deepEqual(report.observation.wind_shear.runways, ['06'])
    assert.ok(buildMetarTac(report).endsWith('WS R06'))
  })
})
