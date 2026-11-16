import test from 'node:test'
import assert from 'node:assert/strict'
import { belowHorizonRanges, moonMonth, moonNight, moonPhaseLabel, moonPhasesForMonth } from './moon-info.js'
import { nightSummary } from './illuminance.js'

const lat = 37.46
const lon = 126.44

test('달 정보는 기존 밤 기준 밝은 면을 유지하고 일몰부터 일출까지 고도를 제공한다', () => {
  const noon = new Date('2026-11-16T03:00:00Z')
  const actual = moonNight(noon, lat, lon)
  const previous = nightSummary(noon, lat, lon)
  assert.equal(actual.fraction, previous.fraction)
  assert.equal(Math.round(actual.fraction * 100), 42)
  assert.equal(actual.samples[0].t, actual.sunset)
  assert.equal(actual.samples.at(-1).t, actual.sunrise)
  assert.equal(actual.chartSamples[0].t, actual.chartStart)
  assert.equal(actual.chartSamples.at(-1).t, actual.chartEnd)
  assert.ok(actual.chartStart < actual.sunset && actual.sunrise < actual.chartEnd)
  assert.ok(actual.samples.every(({ altitude }) => Number.isFinite(altitude) && altitude >= -90 && altitude <= 90))
  assert.ok(actual.peak.altitude >= Math.max(...actual.samples.map(({ altitude }) => altitude)))
  assert.ok(actual.peak.t >= actual.sunset && actual.peak.t <= actual.sunrise)
  assert.ok(actual.calendarMoonrise >= Date.parse('2026-11-15T15:00:00Z') && actual.calendarMoonrise < Date.parse('2026-11-16T15:00:00Z'))
  assert.ok(actual.calendarMoonset >= Date.parse('2026-11-15T15:00:00Z') && actual.calendarMoonset < Date.parse('2026-11-16T15:00:00Z'))
  assert.equal(moonPhaseLabel(actual.phase), '상현달 무렵')
  for (const event of [actual.moonrise, actual.moonset]) {
    assert.ok(event == null || (event >= actual.sunset && event <= actual.sunrise))
  }
})

test('지평선 아래 음영은 고도가 0도를 지나는 시각에서 시작하고 끝난다', () => {
  assert.deepEqual(belowHorizonRanges([{ t: 0, altitude: -10 }, { t: 10, altitude: 10 }, { t: 20, altitude: -10 }]), [[0, 5], [15, 20]])
  assert.deepEqual(belowHorizonRanges([{ t: 0, altitude: 1 }, { t: 10, altitude: 2 }]), [])
  assert.deepEqual(belowHorizonRanges([{ t: 0, altitude: -1 }, { t: 10, altitude: -2 }]), [[0, 10]])
  assert.deepEqual(belowHorizonRanges([{ t: 0, altitude: -1, visibilityAltitude: 1 }, { t: 10, altitude: -2, visibilityAltitude: -1 }]), [[5, 10]])
})

test('달력은 각 날짜의 밤에 대응하는 비율을 제공한다', () => {
  const month = moonMonth(2026, 10, lat, lon)
  assert.equal(month.length, 30)
  assert.equal(Math.round(month[15].fraction * 100), 42)
  assert.equal(Math.round(month[23].fraction * 100), 100)
  assert.deepEqual(month.filter(n => n.moonless).map(n => n.day), [5, 6, 7, 8, 9, 10, 11, 12, 13])
})

test('주요 달 위상은 KST 날짜에 표시하고 천문력 시각과 2분 이내로 맞는다', () => {
  // USNO 2026년 11월 달 위상(UTC, 분 단위).
  const expected = [
    [2, '하현', '2026-11-01T20:28:00Z'],
    [9, '삭', '2026-11-09T07:02:00Z'],
    [17, '상현', '2026-11-17T11:48:00Z'],
    [24, '보름', '2026-11-24T14:53:00Z'],
  ]
  const phases = moonPhasesForMonth(2026, 10)
  for (const [day, name, time] of expected) {
    const event = phases.get(day)?.find(item => item.name === name)
    assert.ok(event, `${day}일 ${name}`)
    assert.ok(Math.abs(event.time - Date.parse(time)) < 120_000, `${day}일 ${name} 시각`)
  }
})
