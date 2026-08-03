import test from 'node:test'
import assert from 'node:assert/strict'
import { legendStamps } from './flightCategoryLegend.js'

const sources = { kim: { run: '2026080106', hf: 0 }, stations: { asos: 4, amos: 1, tm: '202608012200' } }
const sourcedTimes = {
  visibility: { tm: '202608012350' },
  kim: { run: '2026080106', hf: 9, validTime: '2026-08-01T15:00:00.000Z' },
  stations: { asos: 4, amos: 1, tm: '202608012200' },
}

test('층마다 다른 시각을 준다', () => {
  // 시정 20분, 운고 하루 네 번, 지점 매시. 하나로 뭉치면 여섯 시간 묵은
  // 운고를 방금 것으로 착각한다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'Asia/Seoul')
  assert.notEqual(out.visibility, out.ceiling)
  assert.notEqual(out.ceiling, out.stations)
})

test('세 시각이 같은 시간대로 나온다', () => {
  // computed_at은 UTC, kim.run도 UTC, stations.tm은 KST다. 그대로 늘어놓으면
  // 9시간 어긋난 값이 나란히 보인다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'Asia/Seoul')
  assert.equal(out.visibility, '00:22')   // 15:22Z = 익일 00:22 KST
  assert.equal(out.ceiling, '15:00')      // 2026080106Z = 15:00 KST
  assert.equal(out.stations, '22:00')     // 이미 KST
})

test('KST 토큰도 Asia/Seoul과 같은 결과를 준다', () => {
  // 앱의 실제 tz 값은 'Asia/Seoul'이 아니라 문자열 'KST'다
  // (TimeZoneContext.jsx 기본값, SettingsModal.jsx 선택지). Intl에 그대로
  // 넘기면 RangeError로 죽는다 — 이 값이 실제로 프로덕션에서 쓰이는 값이다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'KST')
  assert.equal(out.visibility, '00:22')
  assert.equal(out.ceiling, '15:00')
  assert.equal(out.stations, '22:00')
})

test('모르는 tz 토큰도 던지지 않고 KST로 대체한다', () => {
  // localStorage의 time_zone 값은 오래되거나 손으로 고친 값일 수 있다
  // (MonitoringPage.jsx:112). Intl이 모르는 토큰을 만나 죽지 않아야 한다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'ZZZ')
  assert.equal(out.visibility, '00:22')
  assert.equal(out.ceiling, '15:00')
  assert.equal(out.stations, '22:00')
})

test('실제 IANA 지역/도시 존은 그대로 통과시킨다', () => {
  // 오늘은 설정에 KST/UTC 두 값뿐이지만, 나중에 실제 시간대가 추가되면
  // 여기서 KST로 뭉개는 게 조용히 틀린 시각을 보여주는 셈이라 더 나쁘다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'America/New_York')
  assert.equal(out.visibility, '11:22')
  assert.equal(out.ceiling, '02:00')
  assert.equal(out.stations, '09:00')
})

test("'/'가 있어도 실제 존이 아니면 던지지 않고 KST로 대체한다", () => {
  // '/'만 보고 IANA 존이라 믿으면 손으로 깨진 값('Foo/Bar')이 Intl의 RangeError를
  // 그대로 통과시켜 fcStamps useMemo까지 올라가고 지도 전체가 사라진다(da05f2e와 같은
  // 실패 형태). try/catch로 실제 유효성을 검증해야 한다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'Foo/Bar')
  assert.equal(out.visibility, '00:22')
  assert.equal(out.ceiling, '15:00')
  assert.equal(out.stations, '22:00')
})

test('자료를 한 번도 못 받았으면 자료 없음이다', () => {
  const out = legendStamps(null, false, null, 'Asia/Seoul')
  assert.equal(out.visibility, '자료 없음')
  assert.equal(out.ceiling, '자료 없음')
  assert.equal(out.stations, '자료 없음')
})

test('지점 수를 센다', () => {
  // 맑은 날 97곳 중 4곳뿐인 것이 정상이다. 숫자가 없으면 고장으로 오해한다.
  assert.equal(legendStamps(sources, true, null, 'Asia/Seoul').stationCount, 5)
})

test('시정은 요청한 관측 시각, 운고는 선택한 예보 유효시각을 표시한다', () => {
  const out = legendStamps(sourcedTimes, true, '2026-08-01T15:22:13.722Z', 'Asia/Seoul')
  assert.equal(out.visibility, '23:50')
  assert.equal(out.ceiling, '00:00')
  assert.equal(out.stations, '22:00')
})

test('실제 소스 시각도 UTC 설정에 맞춰 변환한다', () => {
  const out = legendStamps(sourcedTimes, true, '2026-08-01T15:22:13.722Z', 'UTC')
  assert.equal(out.visibility, '14:50')
  assert.equal(out.ceiling, '15:00')
  assert.equal(out.stations, '13:00')
})
