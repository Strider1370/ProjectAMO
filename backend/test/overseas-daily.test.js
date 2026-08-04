import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOverseasDaily } from '../src/processors/overseas-daily.js'

// 하루치 칸을 만든다. rainHours에 든 시각만 비로 둔다.
function daySlots(date, { rainHours = [], temps = {} } = {}) {
  return Array.from({ length: 24 }, (unused, hour) => ({
    date,
    time: `${String(hour).padStart(2, '0')}00`,
    temp: temps[hour] ?? 25, // 25는 아래 최저·최고 테스트 값(21, 33) 사이라 기본값이 극값을 가리지 않는다
    precipitation: rainHours.includes(hour) ? 1.2 : 0,
    icon: rainHours.includes(hour) ? 'rain' : 'sun',
  }))
}

test('오전과 오후를 나눠 대표 날씨를 낸다', () => {
  const hourly = daySlots('20260805', { rainHours: [8] })
  const [day] = buildOverseasDaily(hourly, { days: 1 })
  assert.equal(day.am.icon, 'rain')
  assert.equal(day.pm.icon, 'sun')
})

test('한 칸만 비여도 그 구간은 비로 표시한다', () => {
  // 최빈값으로 뽑으면 6시간 중 1시간 비가 사라진다. 우산을 안 챙기게 되는 쪽 실수가 더 비싸다.
  const hourly = daySlots('20260805', { rainHours: [13] })
  const [day] = buildOverseasDaily(hourly, { days: 1 })
  assert.equal(day.pm.icon, 'rain')
})

test('하루 최저·최고기온은 그날 전체에서 뽑는다', () => {
  const hourly = daySlots('20260805', { temps: { 5: 21, 15: 33 } })
  const [day] = buildOverseasDaily(hourly, { days: 1 })
  assert.equal(day.tempMin, 21)
  assert.equal(day.tempMax, 33)
})

test('요일을 한국어로 붙인다', () => {
  const [day] = buildOverseasDaily(daySlots('20260805'), { days: 1 })
  assert.equal(day.dayOfWeek, '수')
})

test('현지 시차만큼 밀어서 오전·오후를 나눈다', () => {
  // 저장은 한국 시각이다. 베이징(-60분)에서 한국 12시는 현지 11시라 오전에 들어가야 한다.
  const hourly = daySlots('20260805', { rainHours: [12] })
  const [day] = buildOverseasDaily(hourly, { days: 1, offsetMinutes: -60 })
  assert.equal(day.am.icon, 'rain')
  assert.equal(day.pm.icon, 'sun')
})

test('자료가 없는 날은 만들지 않는다', () => {
  assert.deepEqual(buildOverseasDaily([], { days: 7 }), [])
})

test('6시간 간격으로만 자료가 있는 날도 오전·오후가 나온다', () => {
  // 픽스처 실측: 인덱스 61부터 6시간 간격(00·06·12·18시)만 온다. 성긴 하루도 am/pm이 null이면 안 된다.
  const hourly = [
    { date: '20260805', time: '0000', temp: 15, precipitation: 0, icon: 'sun' },
    { date: '20260805', time: '0600', temp: 18, precipitation: 0, icon: 'cloudy' },
    { date: '20260805', time: '1200', temp: 25, precipitation: 1.2, icon: 'rain' },
    { date: '20260805', time: '1800', temp: 20, precipitation: 0, icon: 'sun' },
  ]
  const [day] = buildOverseasDaily(hourly, { days: 1 })
  assert.equal(day.am.icon, 'cloudy')
  assert.equal(day.pm.icon, 'rain')
})
