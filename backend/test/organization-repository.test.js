import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createDb } from '../src/db/index.js'
import {
  applyBriefingRun,
  createBriefing,
  createFlight,
  createOrganization,
  endBriefingRun,
  getBriefingRun,
  getFlight,
  mutateFlightAnnotations,
  putMember,
  saveBriefingRunCandidate,
  startBriefingRun,
  updateFlight,
} from '../src/organizations/repository.js'

function user(db, name, status = 'active') {
  return Number(db.prepare('INSERT INTO users (username,password_hash,status,created_at) VALUES (?,?,?,?)')
    .run(name, 'x', status, new Date().toISOString()).lastInsertRowid)
}

function setup() {
  const db = createDb(':memory:')
  const admin = user(db, 'admin')
  const member = user(db, 'member')
  const organization = createOrganization(db, { name: '운항기관', adminUserId: admin, actorUserId: admin })
  putMember(db, organization.id, member, { role: 'member', status: 'active' })
  return { db, admin, member, organization }
}

function flightInput(assignedUserId) {
  return {
    name: 'AMO101', assignedUserId, etd: '2026-09-10T10:00:00Z', eta: '2026-09-10T12:00:00Z',
    snapshot: { version: 3, routeGeometry: { type: 'LineString', coordinates: [[126, 37], [129, 35]] } },
    profileRequest: { plannedCruiseAltitudeFt: 18000 }, blocks: [], materialRefs: [],
  }
}

test('flight revisions are immutable and stale writers receive a conflict', () => {
  const { db, admin, member, organization } = setup()
  try {
    const first = createFlight(db, organization.id, flightInput(member), admin)
    assert.equal(first.createdBy, admin)
    const second = updateFlight(db, organization.id, first.id, { ...flightInput(member), name: 'AMO101 revised', expectedVersion: 1 }, admin)
    assert.equal(second.version, 2)
    assert.equal(getFlight(db, organization.id, first.id, 1).name, 'AMO101')
    assert.equal(getFlight(db, organization.id, first.id, 1).createdBy, admin)
    assert.equal(getFlight(db, organization.id, first.id).name, 'AMO101 revised')
    assert.throws(() => updateFlight(db, organization.id, first.id,
      { expectedVersion: 2, createdBy: member }, admin), /invalid_input/)
    assert.throws(() => updateFlight(db, organization.id, first.id, { ...flightInput(member), expectedVersion: 1 }, admin), /version_conflict/)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM organization_flight_versions WHERE flight_id=?').get(first.id).n, 2)
  } finally { db.close() }
})

test('a briefing run pins referenced flight versions and only its starter may apply it', () => {
  const { db, admin, member, organization } = setup()
  try {
    const flight = createFlight(db, organization.id, flightInput(member), admin)
    const briefing = createBriefing(db, organization.id, { name: '합동 1차', flightIds: [flight.id], blocks: [] }, admin)
    const run = startBriefingRun(db, organization.id, briefing.id, { expectedVersion: 1 }, admin)
    updateFlight(db, organization.id, flight.id, { ...flightInput(member), name: 'later edit', expectedVersion: 1 }, admin)
    assert.equal(run.pinnedSnapshot.flights[0].version, 1)
    assert.equal(run.pinnedSnapshot.flights[0].name, 'AMO101')
    const bundle = { bundleId: 'bundle-1', flight: { id: flight.id }, flightRevision: 1, briefing: { stable: true } }
    saveBriefingRunCandidate(db, organization.id, briefing.id, run.id, bundle, admin)
    assert.throws(() => applyBriefingRun(db, organization.id, briefing.id, run.id,
      { expectedRunVersion: 1, flightId: flight.id, bundleId: 'bundle-1' }, member), /run_owner_required/)
    const applied = applyBriefingRun(db, organization.id, briefing.id, run.id,
      { expectedRunVersion: 1, flightId: flight.id, bundleId: 'bundle-1' }, admin)
    assert.equal(applied.activeFlightId, flight.id)
    assert.deepEqual(applied.appliedSnapshot, bundle)
    assert.deepEqual(getBriefingRun(db, organization.id, briefing.id, run.id).appliedSnapshot, bundle)
    assert.throws(() => applyBriefingRun(db, organization.id, briefing.id, run.id,
      { expectedRunVersion: 2, flightId: flight.id, bundleId: 'invented', appliedSnapshot: {} }, admin), /candidate_not_found/)
  } finally { db.close() }
})

test('organization membership cannot deactivate the final active organization admin', () => {
  const { db, admin, organization } = setup()
  try {
    assert.throws(() => putMember(db, organization.id, admin,
      { role: 'member', status: 'active', expectedVersion: 1 }), /last_organization_admin/)
  } finally { db.close() }
})

test('briefing run append-only history preserves applications for multiple flights and termination', () => {
  const { db, admin, member, organization } = setup()
  try {
    const first = createFlight(db, organization.id, flightInput(member), admin)
    const second = createFlight(db, organization.id, { ...flightInput(member), name: 'AMO102' }, admin)
    const briefing = createBriefing(db, organization.id, { name: '합동 발표', flightIds: [first.id, second.id], blocks: [] }, admin)
    let run = startBriefingRun(db, organization.id, briefing.id, { expectedVersion: 1 }, admin)
    for (const [flight, bundleId] of [[first, 'bundle-a'], [second, 'bundle-b']]) {
      saveBriefingRunCandidate(db, organization.id, briefing.id, run.id,
        { bundleId, flight: { id: flight.id }, flightRevision: 1, briefing: { name: flight.name } }, admin)
      run = applyBriefingRun(db, organization.id, briefing.id, run.id,
        { expectedRunVersion: run.version, flightId: flight.id, bundleId }, admin)
    }
    run = endBriefingRun(db, organization.id, briefing.id, run.id, { expectedRunVersion: run.version }, admin)
    assert.equal(run.status, 'ended')
    assert.deepEqual(run.appliedBundles.map((item) => item.bundleId), ['bundle-a', 'bundle-b'])
    assert.deepEqual(run.applicationHistory.map((item) => item.bundleId), ['bundle-a', 'bundle-b'])
    assert.equal(run.terminationRecord.kind, 'ended')
    assert.deepEqual(run.events.map((event) => event.kind), ['applied', 'applied', 'ended'])
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM organization_briefing_run_events WHERE run_id=?').get(run.id).n, 3)
    assert.throws(() => db.prepare('UPDATE organization_briefing_run_events SET payload=? WHERE run_id=? AND sequence=1').run('{}', run.id),
      /immutable_organization_run_event/)
  } finally { db.close() }
})

test('annotation PATCH explicit null converts a map shape into text-only content', () => {
  const { db, admin, member, organization } = setup()
  try {
    let flight = createFlight(db, organization.id, flightInput(member), admin)
    flight = mutateFlightAnnotations(db, organization.id, flight.id, { expectedVersion: 1, title: '지도 메모',
      shapeType: 'Point', geometry: { type: 'Point', coordinates: [126.5, 37.5] } }, member)
    const annotationId = flight.annotations[0].id
    flight = mutateFlightAnnotations(db, organization.id, flight.id, { expectedVersion: 2, title: '글 메모',
      shapeType: null, geometry: null }, member, annotationId)
    assert.equal(flight.annotations[0].shapeType, null)
    assert.equal(flight.annotations[0].geometry, null)
  } finally { db.close() }
})
