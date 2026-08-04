import assert from 'node:assert/strict'
import test from 'node:test'
import { threeDayStrip, isPrecipHighlighted, dayCycleStrip } from './terminalForecastStrip.js'

// 기준 시각부터 1시간 간격으로 hours칸을 만든다. 국내(rainProb) 모양이다.
function hourlySlots(startDate, startHour, hours) {
  const slots = []
  for (let index = 0; index < hours; index += 1) {
    const at = new Date(Date.UTC(
      Number(startDate.slice(0, 4)),
      Number(startDate.slice(4, 6)) - 1,
      Number(startDate.slice(6, 8)),
      startHour + index,
    ))
    const pad = (value) => String(value).padStart(2, '0')
    slots.push({
      date: `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`,
      time: `${pad(at.getUTCHours())}00`,
      temp: 20 + (index % 5),
      rainProb: 10,
      icon: 'sun',
    })
  }
  return slots
}

// 특정 날짜만 6시간 간격(00·06·12·18시)으로 만든다. met.no가 사흘째부터 이렇게 준다.
function sixHourlySlotsForDate(dateString) {
  return [0, 6, 12, 18].map((hour) => {
    const pad = (value) => String(value).padStart(2, '0')
    return {
      date: dateString,
      time: `${pad(hour)}00`,
      temp: 18,
      precipitation: 0.1,
      icon: 'cloud',
    }
  })
}

test('오늘은 3시간 간격으로 최대 네 칸이다', () => {
  const strip = threeDayStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  const today = strip.filter((cell) => cell.group === 'today')
  assert.deepEqual(today.map((cell) => cell.label), ['15시', '18시', '21시', '24시'])
})

test('내일과 모레는 오전·오후 두 칸씩이다', () => {
  // 해외(met.no)처럼 시간별이 사흘치 있으면 시간별에서 바로 뽑는다. 밤 칸은 주간예보에
  // 없는 구간이라 더는 만들지 않는다.
  const strip = threeDayStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  assert.deepEqual(
    strip.filter((cell) => cell.group === 'tomorrow').map((cell) => cell.label),
    ['오전', '오후'],
  )
  assert.deepEqual(
    strip.filter((cell) => cell.group === 'dayAfter').map((cell) => cell.label),
    ['오전', '오후'],
  )
})

test('국내처럼 시간별이 오늘치뿐이면 주간예보로 내일·모레를 채운다', () => {
  // 기상청 동네예보 시간별은 실측 25칸 안팎(오늘 자정까지)뿐이라, 내일 09시·15시 같은
  // 칸은 시간별에 아예 없다. 13시부터 23시까지 11칸만 만들어 그 경계를 그대로 재현한다.
  const hourly = hourlySlots('20260804', 13, 11)
  const days = [
    { date: '2026-08-04', am: { icon: 'sun', rainProb: 0 }, pm: { icon: 'partly', rainProb: 10 }, tempMin: 24, tempMax: 30 },
    { date: '2026-08-05', am: { icon: 'cloud', rainProb: 20 }, pm: { icon: 'sun', rainProb: 30 }, tempMin: 25, tempMax: 31 },
    { date: '2026-08-06', am: { icon: 'rain', rainProb: 70 }, pm: { icon: 'shower', rainProb: 40 }, tempMin: 23, tempMax: 27 },
  ]
  const strip = threeDayStrip(hourly, { date: '20260804', hour: 13 }, days)

  const tomorrow = strip.filter((cell) => cell.group === 'tomorrow')
  assert.deepEqual(tomorrow.map((cell) => cell.label), ['오전', '오후'])
  // 오전=최저기온, 오후=최고기온과 짝짓는다.
  assert.deepEqual(tomorrow.map((cell) => cell.temp), [25, 31])
  assert.deepEqual(tomorrow.map((cell) => cell.icon), ['cloud', 'sun'])
  assert.deepEqual(tomorrow.map((cell) => cell.precipValue), [20, 30])

  const dayAfter = strip.filter((cell) => cell.group === 'dayAfter')
  assert.deepEqual(dayAfter.map((cell) => cell.label), ['오전', '오후'])
  assert.deepEqual(dayAfter.map((cell) => cell.temp), [23, 27])
})

test('주간예보에도 그 날짜가 없으면 칸을 만들지 않는다', () => {
  const hourly = hourlySlots('20260804', 13, 11)
  const strip = threeDayStrip(hourly, { date: '20260804', hour: 13 }, [])
  assert.deepEqual(strip.filter((cell) => cell.group === 'tomorrow'), [])
  assert.deepEqual(strip.filter((cell) => cell.group === 'dayAfter'), [])
})

test('밤 늦은 시간에는 오늘 칸이 줄어든다', () => {
  const strip = threeDayStrip(hourlySlots('20260804', 22, 60), { date: '20260804', hour: 22 })
  const today = strip.filter((cell) => cell.group === 'today')
  assert.deepEqual(today.map((cell) => cell.label), ['24시'])
})

test('국내는 강수확률, 해외는 강수량으로 읽는다', () => {
  const domestic = threeDayStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  assert.equal(domestic[0].precipKind, 'prob')

  const overseas = hourlySlots('20260804', 13, 72).map((slot) => {
    const { rainProb, ...rest } = slot
    return { ...rest, precipitation: 0.4 }
  })
  const strip = threeDayStrip(overseas, { date: '20260804', hour: 13 })
  assert.equal(strip[0].precipKind, 'amount')
  assert.equal(strip[0].precipValue, 0.4)
})

test('강수확률 60% 이상이면 강조한다', () => {
  assert.equal(isPrecipHighlighted({ precipKind: 'prob', precipValue: 60 }), true)
  assert.equal(isPrecipHighlighted({ precipKind: 'prob', precipValue: 59 }), false)
  assert.equal(isPrecipHighlighted({ precipKind: 'amount', precipValue: 0.2 }), true)
  assert.equal(isPrecipHighlighted({ precipKind: 'amount', precipValue: 0 }), false)
})

test('예보가 없으면 빈 배열을 준다', () => {
  assert.deepEqual(threeDayStrip([], { date: '20260804', hour: 13 }), [])
  assert.deepEqual(threeDayStrip(null, { date: '20260804', hour: 13 }), [])
})

test('6시간 간격 자료만 있는 날도 오전·오후 두 칸이 나온다', () => {
  // met.no는 사흘째(모레)부터 09·15시가 아예 없을 수 있다.
  // 그 시간대 범위 안에서 가장 가까운 칸(06·12시)으로 대신 채워야 한다.
  const today = hourlySlots('20260804', 13, 26) // 오늘·내일은 1시간 간격 자료
  const dayAfter = sixHourlySlotsForDate('20260806') // 모레만 6시간 간격
  const strip = threeDayStrip([...today, ...dayAfter], { date: '20260804', hour: 13 })

  const dayAfterCells = strip.filter((cell) => cell.group === 'dayAfter')
  assert.deepEqual(dayAfterCells.map((cell) => cell.label), ['오전', '오후'])
  // 09시가 없으니 06~12시 범위에서 가장 가까운 06시 칸을 쓴다. 마찬가지로 오후는 12시.
  assert.equal(dayAfterCells[0].precipValue, 0.1)
  assert.equal(dayAfterCells[0].precipKind, 'amount')
})

test('앞으로 24시간을 3시간 간격 여덟 칸으로 잇는다', () => {
  const strip = dayCycleStrip(hourlySlots('20260804', 13, 72), { date: '20260804', hour: 13 })
  assert.deepEqual(
    strip.map((cell) => cell.label),
    ['15시', '18시', '21시', '0시', '3시', '6시', '9시', '12시'],
  )
})

test('자정을 구분선 없이 그냥 넘어간다', () => {
  // 3안은 날짜를 나누지 않는다. 기온 곡선이 끊기지 않아야 하루의 오르내림이 보인다.
  const strip = dayCycleStrip(hourlySlots('20260804', 22, 40), { date: '20260804', hour: 22 })
  assert.equal(strip.length, 8)
  assert.equal(strip[0].label, '0시')
})

test('예보가 모자라면 있는 칸까지만 준다', () => {
  const strip = dayCycleStrip(hourlySlots('20260804', 13, 10), { date: '20260804', hour: 13 })
  assert.equal(strip.length, 3)
})
