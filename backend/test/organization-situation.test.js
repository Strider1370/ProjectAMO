import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLightningCoverage } from '../src/processors/lightning-processor.js'
import { createDb } from '../src/db/index.js'
import { createInterest, createOrganization, listAlerts, updateAlertState } from '../src/organizations/repository.js'
import { evaluateAndStoreOrganizationSituation, evaluateOrganizationSituation, lightningCoverageStatus } from '../src/organizations/situation.js'

function shiftTm(base, minutes) {
  const raw = String(base)
  const utc = Date.UTC(+raw.slice(0, 4), +raw.slice(4, 6) - 1, +raw.slice(6, 8), +raw.slice(8, 10) - 9, +raw.slice(10, 12))
  const d = new Date(utc + minutes * 60_000 + 9 * 3_600_000)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`
}

test('lightning coverage confirms zero only when every requested UTC window succeeded', () => {
  const baseTm = '202609101900'
  const all = Array.from({ length: 48 }, (_, index) => shiftTm(baseTm, -(47 - index) * 5))
  const complete = buildLightningCoverage({ baseTm, successfulTms: all })
  assert.equal(complete.status, 'complete')
  assert.match(complete.successfulWindows[0].from, /Z$/)
  assert.deepEqual(lightningCoverageStatus(complete, Date.parse(complete.to) - 30 * 60_000, Date.parse(complete.to)).status, 'complete')
  const partial = buildLightningCoverage({ baseTm, successfulTms: all.slice(-3), failedTms: [all.at(-4)] })
  assert.equal(partial.status, 'partial')
  assert.equal(partial.failedWindows.length, 1)
})

test('the shared organization situation evaluator distinguishes observed strikes from unknown coverage', () => {
  const nowMs = Date.parse('2026-09-10T10:00:00Z')
  const interest = { id: 1, kind: 'airport', name: '인천', icao: 'RKSI', lightningRadiusKm: 10, lightningWindowMinutes: 30 }
  const weather = {
    lightning: { fetched_at: '2026-09-10T09:58:00Z', nationwide: { strikes: [
      { time: '2026-09-10T09:50:00Z', lon: 126.44, lat: 37.46 },
    ] } },
    warning: { fetched_at: '2026-09-10T09:58:00Z', airports: { RKSI: { warnings: [{
      wrng_type_key: 'WIND', issued: '2026-09-10T09:00:00Z', valid_start: '2026-09-10T09:30:00Z', valid_end: '2026-09-10T11:00:00Z',
    }] } } },
  }
  const situation = evaluateOrganizationSituation({ interests: [interest], weather, nowMs,
    airports: [{ icao: 'RKSI', lon: 126.4407, lat: 37.4602 }] })
  assert.equal(situation.airports[0].lightning.count, 1)
  assert.equal(situation.airports[0].lightning.coverageStatus, 'unknown')
  assert.ok(situation.events.some((item) => item.kind === 'lightning' && item.sourceComplete === false))
  assert.ok(situation.events.some((item) => item.kind === 'airport_warning'))
})

test('SIGMET and AIRMET require both validity and real geometry intersection', () => {
  const now = '2026-09-10T10:00:00Z'
  const area = { type: 'Polygon', coordinates: [[[126, 36], [128, 36], [128, 38], [126, 38], [126, 36]]] }
  const inside = { type: 'Polygon', coordinates: [[[127, 37], [129, 37], [129, 39], [127, 39], [127, 37]]] }
  const outside = { type: 'Polygon', coordinates: [[[130, 40], [131, 40], [131, 41], [130, 41], [130, 40]]] }
  const situation = evaluateOrganizationSituation({ nowMs: Date.parse(now), interests: [{ id: 2, kind: 'region', name: '중부', geometry: area }], weather: {
    sigmet: { fetched_at: now, items: [{ id: 'S1', valid_from: '2026-09-10T09:00:00Z', valid_to: '2026-09-10T11:00:00Z', geometry: inside }] },
    airmet: { fetched_at: now, items: [{ id: 'A1', valid_from: '2026-09-10T09:00:00Z', valid_to: '2026-09-10T11:00:00Z', geometry: outside }] },
  } })
  assert.deepEqual(situation.events.filter((item) => ['sigmet', 'airmet'].includes(item.kind)).map((item) => item.kind), ['sigmet'])
})

test('alert persistence de-duplicates events, marks post-ack changes, and does not resolve from missing sources', async () => {
  const db = createDb(':memory:')
  const createdAt = '2026-09-10T09:00:00Z'
  const userId = Number(db.prepare('INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)').run('admin', 'x', createdAt).lastInsertRowid)
  const organization = createOrganization(db, { name: '기관', adminUserId: userId, actorUserId: userId })
  createInterest(db, organization.id, { kind: 'airport', name: '인천', icao: 'RKSI' }, userId)
  const warning = (message) => ({ fetched_at: '2026-09-10T10:00:00Z', airports: { RKSI: { warnings: [{
    wrng_type_key: 'WIND', issued: '2026-09-10T09:00:00Z', valid_start: '2026-09-10T09:30:00Z', valid_end: '2026-09-10T12:00:00Z', raw_message: message,
  }] } } })
  const dependencies = (time, value) => ({ airports: [{ icao: 'RKSI', lon: 126.4407, lat: 37.4602 }],
    readWeatherSnapshot: () => ({ effectiveNowMs: Date.parse(time), weather: value === undefined ? {} : { warning: value } }) })
  try {
    await evaluateAndStoreOrganizationSituation(db, organization.id, dependencies('2026-09-10T10:00:00Z', warning('first')))
    await evaluateAndStoreOrganizationSituation(db, organization.id, dependencies('2026-09-10T10:01:00Z', warning('first')))
    let [alert] = listAlerts(db, organization.id, userId)
    assert.equal(alert.version, 1)
    alert = updateAlertState(db, organization.id, alert.id, userId, { expectedVersion: 1, acknowledged: true })
    await evaluateAndStoreOrganizationSituation(db, organization.id, dependencies('2026-09-10T10:02:00Z', warning('changed')))
    ;[alert] = listAlerts(db, organization.id, userId)
    assert.equal(alert.version, 3)
    assert.equal(alert.changedSinceAcknowledgement, true)
    await evaluateAndStoreOrganizationSituation(db, organization.id, dependencies('2026-09-10T10:03:00Z', undefined))
    assert.equal(listAlerts(db, organization.id, userId).length, 1)
    await evaluateAndStoreOrganizationSituation(db, organization.id, dependencies('2026-09-10T10:04:00Z', { fetched_at: '2026-09-10T10:04:00Z', airports: {} }))
    assert.equal(listAlerts(db, organization.id, userId).length, 0)
  } finally { db.close() }
})
