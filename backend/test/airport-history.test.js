import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { airportHistory } from '../src/airport-history.js'

const NOW = Date.parse('2026-10-20T12:00:00Z')
function root() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-history-'))
  for (const type of ['metar', 'taf']) fs.mkdirSync(path.join(dir, type))
  return dir
}
const write = (dir, type, savedIso, airports) => {
  const name = `${type.toUpperCase()}_${savedIso.replace(/[-:]/g, '').replace('.', '')}.json` // 2026-10-20T11:30:00.000Z → …T113000000Z
  fs.writeFileSync(path.join(dir, type, name), JSON.stringify({ airports }))
}
const metar = (time, kind = 'METAR') => ({ header: { icao: 'RKPC', observation_time: time, report_type: kind }, observation: {} })

test('METAR: 최근 3시간만, 같은 관측은 하나로, SPECI도 따로, 최신순, 다른 공항·깨진 파일은 무시', () => {
  const dir = root()
  fs.writeFileSync(path.join(dir, 'metar', 'latest.json'), JSON.stringify({ airports: { RKPC: metar('2026-10-20T11:30:00Z') } }))
  write(dir, 'metar', '2026-10-20T11:31:00.000Z', { RKPC: metar('2026-10-20T11:30:00Z') })
  write(dir, 'metar', '2026-10-20T11:12:00.000Z', { RKPC: metar('2026-10-20T11:10:00Z', 'SPECI') })
  write(dir, 'metar', '2026-10-20T10:01:00.000Z', { RKPC: metar('2026-10-20T10:00:00Z'), RKSI: metar('2026-10-20T10:00:00Z') })
  write(dir, 'metar', '2026-10-20T08:31:00.000Z', { RKPC: metar('2026-10-20T08:30:00Z') }) // 3시간 밖
  fs.writeFileSync(path.join(dir, 'metar', 'METAR_20261020T093000000Z.json'), '{broken')
  const { items, range } = airportHistory({ root: dir, icao: 'RKPC', type: 'metar', nowMs: NOW })
  assert.deepEqual(range, { hours: 3 })
  assert.deepEqual(items.map((item) => [item.time, item.kind]), [
    ['2026-10-20T11:30:00Z', 'METAR'], ['2026-10-20T11:10:00Z', 'SPECI'], ['2026-10-20T10:00:00Z', 'METAR'],
  ])
})

test('TAF: 현재 + 직전 2개 발표, 보관 파일이 모자라면 응답에 붙은 직전 발표로 메운다', () => {
  const dir = root()
  const taf = (issued, status = 'NORMAL', previous = null) => ({ header: { icao: 'RKPC', issued, report_status: status }, timeline: [], ...(previous ? { previous } : {}) })
  fs.writeFileSync(path.join(dir, 'taf', 'latest.json'), JSON.stringify({ airports: { RKPC: taf('2026-10-20T11:00:00Z', 'NORMAL', { header: { issued: '2026-10-20T05:00:00Z' }, timeline: [] }) } }))
  write(dir, 'taf', '2026-10-20T08:20:00.000Z', { RKPC: taf('2026-10-20T08:15:00Z', 'AMENDMENT') })
  write(dir, 'taf', '2026-10-19T23:05:00.000Z', { RKPC: taf('2026-10-19T23:00:00Z') })
  const { items } = airportHistory({ root: dir, icao: 'RKPC', type: 'taf', nowMs: NOW })
  assert.deepEqual(items.map((item) => [item.time, item.kind]), [
    ['2026-10-20T11:00:00Z', 'TAF'], ['2026-10-20T08:15:00Z', 'AMD'], ['2026-10-20T05:00:00Z', 'TAF'],
  ])
  assert.equal(items[0].report.previous, undefined, '직전 발표는 따로 항목이 되고 현재 항목에서는 뺀다')
})

test('입력 검증: 공항 코드·종류', () => {
  assert.throws(() => airportHistory({ root: root(), icao: '../x', type: 'metar' }), /invalid_icao/)
  assert.throws(() => airportHistory({ root: root(), icao: 'RKPC', type: 'sigmet' }), /invalid_type/)
  assert.deepEqual(airportHistory({ root: path.join(os.tmpdir(), 'none-xyz'), icao: 'RKPC', type: 'metar', nowMs: NOW }).items, [])
})
