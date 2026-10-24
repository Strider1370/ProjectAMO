import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tab = readFileSync(new URL('./TafTab.jsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('./TafForecastTimeline.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./TafForecastTimeline.css', import.meta.url), 'utf8')

// 데스크톱 타임라인은 서버 해석(taf.forecast)으로 그리고, 배포 전 저장분처럼 없으면 기존 시각별 타임라인을 쓴다.
test('타임라인은 forecast가 있으면 새 화면, 없으면 기존 화면', () => {
  assert.match(tab, /const forecastView = view === 'timeline' \? buildTafForecastView\(taf, icao, nowMs\) : null/)
  assert.match(tab, /\{forecastView && <TafForecastTimeline view=\{forecastView\} tz=\{tz\} tempoMode=\{tempoMode\} \/>\}/)
  assert.match(tab, /view === 'timeline' && !forecastView &&/)
})

// 원문(TAC)은 타임라인·표 모두 기본 접힘. 좁은 칸에서 숨겨진 값은 원문을 펼치거나 칸 툴팁으로 본다.
test('원문은 기본으로 접어 둔다', () => {
  assert.match(tab, /<details className="ap-raw-fold">/)
})

// TEMPO라는 표시는 무채색이고, 색은 비행조건·기준 초과 값에만 쓴다.
test('TEMPO 칸·기둥·카드는 무채색 잉크로 그린다', () => {
  assert.match(css, /--tafx-ink: var\(--level-gray\)/)
  assert.doesNotMatch(css, /\.ap-tafx-(tempo|col|card)[^{]*\{[^}]*var\(--level-(amber|red)\)/)
  assert.match(timeline, /TEMPO가 가운데를 가르는 칸은 테두리로 한 구간임을 보여 준다/)
})
