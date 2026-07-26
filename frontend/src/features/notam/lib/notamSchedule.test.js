import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNotamSchedule, isScheduleActiveAt } from '../../../../../shared/notam-schedule.js'
import { deriveNotamTime } from './notamViewModel.js'

// 표본은 전부 2026-07-25 라이브 NOTAM(aim.koca.go.kr) 실제 문자열과 그 B)/C)다.
// D)형식 311건을 전수조사해 나온 네 갈래를 각각 하나씩 덮는다.

const at = (iso) => Date.parse(iso)

// "1400-0000" — 날짜 없이 시간만. 유효기간 내내 매일 14:00~자정.
test('daily window with no dates repeats every day inside B)~C)', () => {
  const args = ['1400-0000', '2026-05-30T14:00:00Z', '2026-08-06T00:00:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2026-06-15T15:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-06-15T13:00:00Z')), false)
  // 14:00-0000은 자정에서 끝난다 — 밤을 넘겨 이어지지 않는다.
  assert.equal(isScheduleActiveAt(...args, at('2026-06-16T00:30:00Z')), false)
})

// D2117/26 (CATA 7H ACT) — 월 경계 + 날짜범위 + 하루 다중 구간.
test('day list spanning a month boundary resolves each date', () => {
  const text = 'JUL 24 0600-1100, 26 2300-2359, 27-30 0000-0100 2300-2359, 31 0000-0100, AUG 01 0000-0900'
  const args = [text, '2026-07-24T06:00:00Z', '2026-08-01T09:00:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2026-07-24T08:00:00Z')), true)
  // 25일은 D)에 없다 — B~C 안이지만 하루 종일 꺼져 있다. 이 구분이 D) 파싱의 존재 이유다.
  assert.equal(isScheduleActiveAt(...args, at('2026-07-25T08:00:00Z')), false)
  assert.equal(isScheduleActiveAt(...args, at('2026-07-28T00:30:00Z')), true)
  // 달을 넘긴 AUG 01도 해석돼야 한다(연도·월 복원).
  assert.equal(isScheduleActiveAt(...args, at('2026-08-01T05:00:00Z')), true)
})

// D2118/26 — "25 2130-26 0930" = 25일 21:30 → 26일 09:30. 날짜를 넘는 단일 구간.
test('cross-day window carries from one date to the next', () => {
  const text = 'JUL 25 2130-26 0930, 27 0330-0930 2130-2359, 28-31 0000-0930 2130-2359, AUG 01-23 0000-0930 2130-2359, 24 0000-0930'
  const args = [text, '2026-07-25T21:30:00Z', '2026-08-24T09:30:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2026-07-26T05:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-07-26T10:00:00Z')), false)
})

// C1149/26 — 월 이름마다 날짜를 나열하고 시간대는 공통.
test('month-scoped day lists apply the trailing time window to each day', () => {
  const text = 'JUL 06 13 20 27 0700-0830, AUG 03 10 17 24 31 0700-0830, SEP 07 14 21 28 0700-0830'
  const args = [text, '2026-07-06T07:00:00Z', '2026-09-28T08:30:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2026-07-13T07:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-07-14T07:30:00Z')), false)
  assert.equal(isScheduleActiveAt(...args, at('2026-09-21T08:00:00Z')), true)
})

// G3961/26 — 월 없이 날짜만, 하루에 네 구간.
test('bare day list with several windows a day', () => {
  const text = '25 0759-0804 0900-0903 0912-0936 1209-1211, 26 0755-0800 0856-0859 0908-0932 1205-1207, 27 0751-0756 0852-0855 0904-0928'
  const args = [text, '2026-07-25T07:59:00Z', '2026-07-27T09:28:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2026-07-25T09:01:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-07-25T09:05:00Z')), false)
})

// "DLY 0900-1700" = 매일 09:00~17:00. 삭제된 옛 파서가 이 접두사를 다루고 있었으니 실제로 오는 형태다.
test('DLY prefix means the same as a bare daily window', () => {
  const args = ['2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z']
  assert.equal(isScheduleActiveAt('DLY 0900-1700', ...args, at('2026-07-10T10:00:00Z')), true)
  assert.equal(isScheduleActiveAt('DLY 0900-1700', ...args, at('2026-07-10T18:00:00Z')), false)
  assert.deepEqual(parseNotamSchedule('DLY 0900-1700'), parseNotamSchedule('0900-1700'))
})

// E1154/26 — 날짜 넘김의 끝쪽에 월 이름이 붙는 형태(5/31 23:00 → 6/1 02:00).
// 뒤따르는 07·08은 5월이 아니라 6월이다 — 달을 넘긴 순간 기준 월도 함께 넘어가야 한다.
test('cross-day window can cross a month, and the sticky month follows it', () => {
  const text = 'MAY 31 2300-JUN 01 0200, 07 2300-08 0200, 14 2300-15 0200'
  const args = [text, '2026-05-31T23:00:00Z', '2026-07-01T00:00:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2026-05-31T23:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-06-01T01:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-06-01T03:00:00Z')), false)
  // 6월 7일 창 — 여기서 5월로 해석하면 날짜를 못 찾아 null(확인 필요)로 새어나간다.
  assert.equal(isScheduleActiveAt(...args, at('2026-06-07T23:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-06-08T01:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-06-10T01:00:00Z')), false)
})

// D)에는 연도가 없다. 날짜 해석은 B)부터 실제 달력을 앞으로 걸어가며 찾으므로 연도는 저절로 넘어간다 —
// 조용히 깨지기 쉬운 지점이라 못 박아둔다(수집 표본에 12~1월 NOTAM이 없어 실데이터 검증은 못 했다).
test('dates roll into the next year without a year in the text', () => {
  const named = ['DEC 28 0600-1100, JAN 05 0000-0900', '2026-12-28T06:00:00Z', '2027-01-15T09:00:00Z']
  assert.equal(isScheduleActiveAt(...named, at('2026-12-28T08:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...named, at('2027-01-05T05:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...named, at('2027-01-06T05:00:00Z')), false)

  // 월 이름 없이 날짜만 있어도 마찬가지 — 28일 다음의 05일은 이듬해 1월이다.
  const bare = ['28 0600-1100, 05 0000-0900', '2026-12-28T06:00:00Z', '2027-01-15T09:00:00Z']
  assert.equal(isScheduleActiveAt(...bare, at('2027-01-05T05:00:00Z')), true)

  const crossYear = ['DEC 31 2300-JAN 01 0200', '2026-12-31T23:00:00Z', '2027-01-10T00:00:00Z']
  assert.equal(isScheduleActiveAt(...crossYear, at('2026-12-31T23:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...crossYear, at('2027-01-01T01:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...crossYear, at('2027-01-01T03:00:00Z')), false)
})

// 실제 2025→2026 연말 NOTAM. "31 2330-JAN 01 0900"은 해를 넘는 날짜-넘김 구간이다.
test('E4215/25: a real year-end NOTAM crosses into the next year', () => {
  const text = 'DEC 24 2330-25 0900, 26 2330-2359, 27 0000-0900 2330-2359, 28 0000-0900, 31 2330-JAN 01 0900, 02 2330-2359, 03 0000-0900 2330-2359, 04 0000-0900'
  const args = [text, '2025-12-24T23:30:00Z', '2026-01-04T09:00:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2025-12-24T23:45:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2025-12-25T10:00:00Z')), false)
  // 12/31 23:30 → 1/1 09:00. 연도가 바뀌는 지점.
  assert.equal(isScheduleActiveAt(...args, at('2025-12-31T23:45:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-01-01T05:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-01-01T10:00:00Z')), false)
  assert.equal(isScheduleActiveAt(...args, at('2026-01-03T05:00:00Z')), true)
})

// 실제 D3542/25 — 12월·1월·2월에 걸쳐 날짜를 나열한다(약 두 달짜리 유효기간).
test('D3542/25: a real NOTAM spanning DEC, JAN and FEB resolves every month', () => {
  const text = 'DEC 20-21 27-28 0000-0100, JAN 03-04 10-11 17-18 24-25 31 0000-0100, FEB 01 07-08 14-15 0000-0100'
  const args = [text, '2025-12-20T00:00:00Z', '2026-02-15T01:00:00Z']
  assert.equal(isScheduleActiveAt(...args, at('2025-12-20T00:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2025-12-22T00:30:00Z')), false)
  assert.equal(isScheduleActiveAt(...args, at('2026-01-10T00:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-01-31T00:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-02-14T00:30:00Z')), true)
  assert.equal(isScheduleActiveAt(...args, at('2026-02-10T00:30:00Z')), false)
})

test('leap day resolves in a leap year and stays unknown in a common year', () => {
  const leap = ['FEB 29 0600-1100', '2028-02-25T00:00:00Z', '2028-03-05T00:00:00Z']
  assert.equal(isScheduleActiveAt(...leap, at('2028-02-29T08:00:00Z')), true)
  assert.equal(isScheduleActiveAt(...leap, at('2028-02-28T08:00:00Z')), false)
  // 평년엔 2월 29일이 없다 — 없는 날짜를 억지로 맞추지 말고 '확인 필요'로 남긴다.
  assert.equal(isScheduleActiveAt('FEB 29 0600-1100', '2027-02-25T00:00:00Z', '2027-03-05T00:00:00Z', at('2027-02-28T08:00:00Z')), null)
})

// 모르는 표기는 반드시 null — false(꺼짐)로 단정하면 켜진 구역에 들어가게 된다.
test('unknown notation returns null instead of guessing', () => {
  assert.equal(parseNotamSchedule('MON-FRI SR-SS'), null)
  assert.equal(isScheduleActiveAt('MON-FRI SR-SS', '2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z', at('2026-07-10T05:00:00Z')), null)
  assert.equal(isScheduleActiveAt('', '2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z', Date.now()), null)
  assert.equal(isScheduleActiveAt('H24', '2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z', Date.now()), null)
})

test('parseNotamSchedule keeps the month sticky until the next month name', () => {
  const groups = parseNotamSchedule('JUL 24 0600-1100, 26 2300-2359, AUG 01 0000-0900')
  assert.equal(groups.length, 3)
  assert.deepEqual(groups.map((g) => g.month), [7, 7, 8])
})

// deriveNotamTime 배선 — D)를 읽어 '발효 중'과 '시간대 외'를 가른다.
const CATA_7H = {
  id: 'D2117/26',
  valid_from: '2026-07-24T06:00:00Z',
  valid_to: '2026-08-01T09:00:00Z',
  schedule_text: 'JUL 24 0600-1100, 26 2300-2359, 27-30 0000-0100 2300-2359, 31 0000-0100, AUG 01 0000-0900',
}

test('deriveNotamTime: inside B)~C) but outside D) reads as not running', () => {
  assert.deepEqual(deriveNotamTime(CATA_7H, at('2026-07-24T08:00:00Z')), { state: 'active', note: '' })
  assert.deepEqual(deriveNotamTime(CATA_7H, at('2026-07-25T08:00:00Z')), { state: 'upcoming', note: 'D) 시간대 외' })
})

test('deriveNotamTime: unreadable D) stays conditional rather than claiming off', () => {
  const item = { ...CATA_7H, schedule_text: 'MON-FRI SR-SS' }
  assert.deepEqual(deriveNotamTime(item, at('2026-07-25T08:00:00Z')), { state: 'conditional', note: 'D) 시간 조건 확인' })
})

test('deriveNotamTime: no D) at all is simply active', () => {
  const { schedule_text: _drop, ...noSchedule } = CATA_7H
  assert.deepEqual(deriveNotamTime(noSchedule, at('2026-07-25T08:00:00Z')), { state: 'active', note: '' })
})

test('deriveNotamTime: outside B)~C) never consults D)', () => {
  assert.equal(deriveNotamTime(CATA_7H, at('2026-08-15T08:00:00Z')).state, 'upcoming')
})
