import assert from 'node:assert/strict'
import test from 'node:test'
import { weeklyRows } from './terminalWeeklyForecast.js'

const days = [
  { date: '20260804', dayOfWeek: '화', am: { icon: 'sun' }, pm: { icon: 'sun' }, tempMin: 26, tempMax: 32 },
  { date: '20260805', dayOfWeek: '수', am: { icon: 'rain' }, pm: { icon: 'cloud' }, tempMin: 25, tempMax: 29 },
  { date: '20260806', dayOfWeek: '목', am: { icon: 'cloud' }, pm: { icon: 'sun' }, tempMin: 26, tempMax: 30 },
  { date: '20260807', dayOfWeek: '금', am: { icon: 'sun' }, pm: { icon: 'sun' }, tempMin: 27, tempMax: 33 },
  { date: '20260808', dayOfWeek: '토', am: { icon: 'sun' }, pm: { icon: 'sun' }, tempMin: 28, tempMax: 34 },
  { date: '20260809', dayOfWeek: '일', am: { icon: 'cloud' }, pm: { icon: 'cloud' }, tempMin: 27, tempMax: 31 },
]

test('오늘은 빼고 내일부터 다섯 줄을 만든다', () => {
  // 오늘은 왼쪽 시간별에 이미 다 들어 있다. 넣으면 같은 값을 두 번 보여주게 된다.
  const rows = weeklyRows(days, '20260804')
  assert.equal(rows.length, 5)
  assert.deepEqual(rows.map((row) => row.dayOfWeek), ['수', '목', '금', '토', '일'])
})

test('날짜를 월/일로 줄인다', () => {
  assert.equal(weeklyRows(days, '20260804')[0].monthDay, '8/5')
})

test('오전·오후 아이콘과 최저·최고기온을 짝지어 넘긴다', () => {
  const [first] = weeklyRows(days, '20260804')
  assert.equal(first.amIcon, 'rain')
  assert.equal(first.pmIcon, 'cloud')
  assert.equal(first.tempMin, 25)
  assert.equal(first.tempMax, 29)
})

test('자료가 모자라면 빈 줄로 자리를 채운다', () => {
  // 줄 수가 도시마다 달라지면 전환 중 아래 요소를 밀어 글자가 겹친다.
  const rows = weeklyRows(days.slice(0, 3), '20260804')
  assert.equal(rows.length, 5)
  assert.equal(rows[2].empty, true)
  assert.equal(rows[0].empty, false)
})

test('자료가 없어도 다섯 줄을 준다', () => {
  const rows = weeklyRows(null, '20260804')
  assert.equal(rows.length, 5)
  assert.ok(rows.every((row) => row.empty))
})

test('국내 주간예보처럼 날짜에 대시가 섞여 와도 오늘 이후 줄을 그대로 뽑는다', () => {
  // ground-forecast-processor.js는 forecast[].date를 `2026-08-04`처럼 대시를 섞어 준다.
  // 시간별(hourly[].date)·해외 daily[].date는 `20260804`라 형식이 다르다.
  const dashedDays = [
    { date: '2026-08-04', dayOfWeek: '화', am: { icon: 'sun' }, pm: { icon: 'sun' }, tempMin: 26, tempMax: 32 },
    { date: '2026-08-05', dayOfWeek: '수', am: { icon: 'rain' }, pm: { icon: 'cloud' }, tempMin: 25, tempMax: 29 },
  ]
  const rows = weeklyRows(dashedDays, '20260804')
  assert.equal(rows[0].empty, false)
  assert.equal(rows[0].dayOfWeek, '수')
  assert.equal(rows[0].monthDay, '8/5')
})
