import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collectThresholds, riskOf } from './taf-risk.js'

const TRIGGERS = {
  taf_adverse_weather: { enabled: true, params: { vis_threshold: 3000, phenomena: ['TS', 'FG'] } },
  low_ceiling: { enabled: true, params: { threshold: 500, amounts: ['BKN', 'OVC'] } },
  high_wind: { enabled: true, params: { speed_threshold: 25, gust_threshold: 35 } },
}
const T = collectThresholds(TRIGGERS)

const slot = (over) => ({
  time: '2026-07-28T13:00:00Z',
  wind: { speed: 10 },
  visibility: { value: 9999, cavok: false },
  weather: [],
  clouds: [{ amount: 'BKN', base: 3000 }],
  ...over,
})

test('임계값을 기존 트리거에서 그대로 읽어온다', () => {
  assert.equal(T.visThreshold, 3000)
  assert.deepEqual(T.phenomena, ['TS', 'FG'])
  assert.equal(T.ceilingThreshold, 500)
  assert.deepEqual(T.ceilingAmounts, ['BKN', 'OVC'])
  assert.equal(T.windSpeed, 25)
  assert.equal(T.windGust, 35)
})

test('아무것도 나쁘지 않으면 빈 객체', () => {
  assert.deepEqual(riskOf(slot(), T), {})
})

test('시정이 임계값 미만이면 위험', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: 1200, cavok: false } }), T), { visibility: 1200 })
})

test('시정이 임계값과 같으면 위험이 아니다', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: 3000, cavok: false } }), T), {})
})

test('CAVOK은 위험이 아니다', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: null, cavok: true } }), T), {})
})

test('지정 기상현상이 있으면 위험', () => {
  const s = slot({ weather: [{ raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] }] })
  assert.deepEqual(riskOf(s, T), { weather: 'TSRA' })
})

test('지정하지 않은 기상현상은 위험이 아니다', () => {
  const s = slot({ weather: [{ raw: '-RA', descriptor: '', phenomena: ['RA'] }] })
  assert.deepEqual(riskOf(s, T), {})
})

test('일치하는 기상현상이 여럿이면 전부 담는다', () => {
  // 첫 하나만 남기면 [FG] → [FG, TSRA] 변화에서 TS 신규 등장을 놓친다.
  const s = slot({
    weather: [
      { raw: 'FG', descriptor: '', phenomena: ['FG'] },
      { raw: 'TSRA', descriptor: 'TS', phenomena: ['RA'] },
    ],
  })
  assert.match(riskOf(s, T).weather, /FG/)
  assert.match(riskOf(s, T).weather, /TS/)
})

test('BKN/OVC 중 최저 운저가 임계값 미만이면 위험', () => {
  const s = slot({ clouds: [{ amount: 'BKN', base: 800 }, { amount: 'OVC', base: 300 }] })
  assert.deepEqual(riskOf(s, T), { ceiling: 300 })
})

test('FEW/SCT는 운고 판정에서 세지 않는다', () => {
  const s = slot({ clouds: [{ amount: 'FEW', base: 100 }, { amount: 'SCT', base: 200 }] })
  assert.deepEqual(riskOf(s, T), {})
})

test('NSC(구름 없음)는 위험이 아니다', () => {
  assert.deepEqual(riskOf(slot({ clouds: [] }), T), {})
})

test('풍속이 임계값 이상이면 위험', () => {
  assert.deepEqual(riskOf(slot({ wind: { speed: 30 } }), T), { wind: 30 })
})

test('거스트가 임계값 이상이면 위험이고 거스트 값을 쓴다', () => {
  assert.deepEqual(riskOf(slot({ wind: { speed: 12, gust: 40 } }), T), { wind: 40 })
})

test('값이 비어 있는 칸은 판정에서 제외한다 — 0으로 읽지 않는다', () => {
  const s = slot({ visibility: { value: null, cavok: false }, wind: {}, clouds: null })
  assert.deepEqual(riskOf(s, T), {})
})

test('여러 요소가 동시에 나쁘면 모두 담는다', () => {
  const s = slot({
    visibility: { value: 800, cavok: false },
    wind: { speed: 12, gust: 40 },
    clouds: [{ amount: 'OVC', base: 200 }],
    weather: [{ raw: 'FG', descriptor: '', phenomena: ['FG'] }],
  })
  assert.deepEqual(riskOf(s, T), { visibility: 800, weather: 'FG', ceiling: 200, wind: 40 })
})

test('설정이 비어도 터지지 않는다', () => {
  assert.deepEqual(riskOf(slot({ visibility: { value: 100, cavok: false } }), collectThresholds({})), {})
})
