import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import express from 'express'
import sharp from 'sharp'

import { createDb } from '../src/db/index.js'
import { createBriefing, createFlight, createOrganization, putMember, updateBriefing, updateFlight } from '../src/organizations/repository.js'
import { createOrganizationRouter } from '../src/organizations/router.js'
import { organizationTestPdf } from '../../scripts/lib/organization-test-pdf.mjs'

function user(db, username) {
  return Number(db.prepare('INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)')
    .run(username, 'x', new Date().toISOString()).lastInsertRowid)
}

function listen(app) {
  return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
}

test('organization HTTP routes re-check active membership, enforce Origin, and authorize every private Range request', async () => {
  const db = createDb(':memory:')
  const filesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-org-files-'))
  const admin = user(db, 'admin')
  const other = user(db, 'other')
  const first = createOrganization(db, { name: '첫 기관', adminUserId: admin, actorUserId: admin })
  const second = createOrganization(db, { name: '둘 기관', adminUserId: other, actorUserId: other })
  putMember(db, first.id, other, { role: 'member', status: 'active' })
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.session = { userId: Number(req.get('x-user-id')), role: 'pilot' }; next() })
  app.use('/api/organizations', createOrganizationRouter({ db, filesPath }))
  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}`
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  try {
    let response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { 'x-user-id': String(admin), 'content-type': 'image/png', 'x-file-name': 'pixel.png', 'x-material-title': encodeURIComponent('픽셀') }, body: png,
    })
    assert.equal(response.status, 403)

    response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'image/png', 'x-file-name': 'pixel.png', 'x-material-title': encodeURIComponent('픽셀') }, body: png,
    })
    assert.equal(response.status, 201)
    const material = (await response.json()).material
    const original = `${base}/api/organizations/${first.id}/materials/${material.id}/versions/1/original`
    response = await fetch(original, { headers: { 'x-user-id': String(admin), range: 'bytes=0-7' } })
    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-range'), `bytes 0-7/${png.length}`)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png.subarray(0, 8))

    const replacement = await sharp(png).resize(2, 1).png().toBuffer()
    response = await fetch(`${base}/api/organizations/${first.id}/materials/${material.id}`, {
      method: 'PATCH', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'image/png',
        'x-file-name': 'replacement.png', 'x-material-title': encodeURIComponent('픽셀 교체'), 'x-expected-version': '1' }, body: replacement,
    })
    assert.equal(response.status, 200)
    const replaced = (await response.json()).material
    assert.equal(replaced.version, 2)
    response = await fetch(`${base}/api/organizations/${first.id}/materials/${material.id}/versions/2/original`, {
      headers: { 'x-user-id': String(admin) },
    })
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), replacement)
    response = await fetch(original, { headers: { 'x-user-id': String(admin) } })
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)

    response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'document', title: '검증', blocks: [{ kind: 'link', text: '위험', url: 'javascript:alert(1)' }] }),
    })
    assert.equal(response.status, 400)

    response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'document', title: '작성 블록', blocks: [
        { kind: 'heading', text: '현장 참고' }, { kind: 'image', materialId: material.id, materialVersion: 1 },
      ] }),
    })
    assert.equal(response.status, 201)
    assert.equal((await response.json()).material.blocks[1].materialVersion, 1)

    response = await fetch(`${base}/api/organizations/${second.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(other), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'document', title: '타기관 참조',
        blocks: [{ kind: 'image', materialId: material.id, materialVersion: 1 }] }),
    })
    assert.equal(response.status, 400)

    const routeSnapshot = { version: 3, routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } }
    response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'route', title: '저장 경로', metadata: { snapshot: routeSnapshot } }),
    })
    assert.equal(response.status, 201)
    response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'route', title: '잘못된 경로', metadata: { snapshot: { version: 3 } } }),
    })
    assert.equal(response.status, 400)

    const pdf = organizationTestPdf()
    response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'application/pdf',
        'x-file-name': 'briefing.pdf', 'x-material-title': encodeURIComponent('실제 PDF') }, body: pdf,
    })
    assert.equal(response.status, 201)
    assert.equal((await response.json()).material.metadata.pages, 2)

    const kml = Buffer.from('<?xml version="1.0"?><kml><Placemark><name>A</name><Point><coordinates>126.4,37.4,0</coordinates></Point></Placemark></kml>')
    response = await fetch(`${base}/api/organizations/${first.id}/materials`, {
      method: 'POST', headers: { origin: base, 'x-user-id': String(admin), 'content-type': 'application/vnd.google-earth.kml+xml',
        'x-file-name': 'point.kml', 'x-material-title': 'point' }, body: kml,
    })
    assert.equal(response.status, 201)
    const mapMaterial = (await response.json()).material
    assert.equal(mapMaterial.metadata.featureCount, 1)
    assert.deepEqual(mapMaterial.metadata.geojson.features[0].geometry.coordinates, [126.4, 37.4, 0])

    response = await fetch(`${base}/api/organizations/${second.id}/materials/${material.id}/versions/1/original`, {
      headers: { 'x-user-id': String(other), range: 'bytes=0-7' },
    })
    assert.equal(response.status, 404)

    db.prepare("UPDATE organization_members SET status='inactive' WHERE organization_id=? AND user_id=?").run(first.id, other)
    response = await fetch(`${base}/api/organizations/${first.id}/materials`, { headers: { 'x-user-id': String(other) } })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    fs.rmSync(filesPath, { recursive: true, force: true })
  }
})

test('members share only their server-owned saved routes as independent organization flights and may edit their own plans', async () => {
  const db = createDb(':memory:')
  const filesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-org-share-'))
  const admin = user(db, 'share-admin')
  const planner = user(db, 'share-planner')
  const member = user(db, 'share-member')
  const outsider = user(db, 'share-outsider')
  const organization = createOrganization(db, { name: '공유 기관', adminUserId: admin, actorUserId: admin })
  const otherOrganization = createOrganization(db, { name: '다른 기관', adminUserId: outsider, actorUserId: outsider })
  putMember(db, organization.id, planner, { role: 'planner', status: 'active' })
  putMember(db, organization.id, member, { role: 'member', status: 'active' })

  const geometry = { type: 'LineString', coordinates: [[126.8, 35.1], [127.6, 34.8]] }
  const routeSnapshot = {
    version: 3,
    kind: 'route',
    base: { routeForm: { departureAirport: 'RKJJ', arrivalAirport: 'RKJY' }, procedureIds: { sid: 'SID1', star: 'STAR1', iapKey: 'IAP1' } },
    routeGeometry: geometry,
    profileRequest: { routeGeometry: geometry, routeModel: { legs: [{ id: 'leg-1' }] } },
    nwpTimeSelection: { baseTime: '2026-09-10T00:00:00Z', waypointOverrides: [{ waypointId: 'W1', offsetHours: 3 }] },
  }
  const briefingSnapshot = {
    ...routeSnapshot,
    kind: 'briefing',
    etd: '2026-09-11T01:00:00Z',
    eta: '2026-09-11T02:00:00Z',
    cruiseAltitudeFt: 8500,
    profileRequest: { ...routeSnapshot.profileRequest, plannedCruiseAltitudeFt: 8500 },
  }
  const insertRoute = (owner, name, snapshot) => Number(db.prepare(`INSERT INTO routes
    (user_id,name,payload,created_at,updated_at) VALUES (?,?,?,?,?)`)
    .run(owner, name, JSON.stringify(snapshot), new Date().toISOString(), new Date().toISOString()).lastInsertRowid)
  const routeId = insertRoute(member, '내 저장 경로', routeSnapshot)
  const briefingId = insertRoute(member, '내 저장 브리핑', briefingSnapshot)
  const plannerRouteId = insertRoute(planner, '타인 저장 경로', routeSnapshot)

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const userId = Number(req.get('x-user-id'))
    req.session = userId ? { userId, role: 'pilot' } : {}
    next()
  })
  app.use('/api/organizations', createOrganizationRouter({ db, filesPath }))
  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = (userId) => ({ origin: base, ...(userId ? { 'x-user-id': String(userId) } : {}), 'content-type': 'application/json' })
  const share = (orgId, userId, body) => fetch(`${base}/api/organizations/${orgId}/flights/share`, {
    method: 'POST', headers: headers(userId), body: JSON.stringify(body),
  })
  const patchFlight = (userId, flightId, body) => fetch(`${base}/api/organizations/${organization.id}/flights/${flightId}`, {
    method: 'PATCH', headers: headers(userId), body: JSON.stringify(body),
  })
  try {
    let response = await share(organization.id, null, { savedRouteId: routeId })
    assert.equal(response.status, 401)
    response = await share(organization.id, member, { savedRouteId: 'r-local-only' })
    assert.equal(response.status, 400)
    response = await share(organization.id, member, { savedRouteId: plannerRouteId })
    assert.equal(response.status, 404)
    response = await share(otherOrganization.id, member, { savedRouteId: routeId })
    assert.equal(response.status, 403)

    for (const [body, field] of [
      [{ savedRouteId: routeId }, 'etd'],
      [{ savedRouteId: routeId, etd: '2026-09-10T01:00:00Z' }, 'eta'],
      [{ savedRouteId: routeId, etd: '2026-09-10T01:00:00Z', eta: '2026-09-10T02:00:00Z' }, 'cruiseAltitudeFt'],
    ]) {
      response = await share(organization.id, member, body)
      assert.equal(response.status, 400)
      assert.equal((await response.json()).details.field, field)
    }

    response = await share(organization.id, member, {
      savedRouteId: routeId,
      name: '회원 공유 비행',
      etd: '2026-09-10T01:00:00Z',
      eta: '2026-09-10T02:00:00Z',
      cruiseAltitudeFt: 9500,
    })
    assert.equal(response.status, 201)
    let flight = (await response.json()).flight
    assert.equal(flight.createdBy, member)
    assert.equal(flight.assignedUserId, member)
    assert.equal(flight.snapshot.kind, 'route')
    assert.deepEqual(flight.snapshot.routeGeometry, geometry)
    assert.deepEqual(flight.snapshot.base.procedureIds, routeSnapshot.base.procedureIds)
    assert.deepEqual(flight.snapshot.nwpTimeSelection, routeSnapshot.nwpTimeSelection)
    assert.deepEqual(flight.profileRequest.routeModel, routeSnapshot.profileRequest.routeModel)
    assert.equal(flight.profileRequest.plannedCruiseAltitudeFt, 9500)

    response = await fetch(`${base}/api/organizations/${organization.id}/flights`, { headers: { 'x-user-id': String(planner) } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).flights.some((item) => item.id === flight.id && item.createdBy === member), true)

    db.prepare('UPDATE routes SET payload=? WHERE id=? AND user_id=?')
      .run(JSON.stringify({ ...routeSnapshot, routeGeometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] } }), routeId, member)
    response = await fetch(`${base}/api/organizations/${organization.id}/flights/${flight.id}`, { headers: { 'x-user-id': String(admin) } })
    assert.deepEqual((await response.json()).flight.snapshot.routeGeometry, geometry)

    response = await patchFlight(member, flight.id, { expectedVersion: 1, name: '회원 수정 비행' })
    assert.equal(response.status, 200)
    flight = (await response.json()).flight
    assert.equal(flight.version, 2)
    assert.equal(flight.name, '회원 수정 비행')
    assert.equal(flight.createdBy, member)
    response = await patchFlight(member, flight.id, { expectedVersion: 2, assignedUserId: planner })
    assert.equal(response.status, 403)
    response = await patchFlight(member, flight.id, { expectedVersion: 2, createdBy: admin })
    assert.equal(response.status, 400)

    response = await patchFlight(planner, flight.id, { expectedVersion: 2, assignedUserId: planner })
    assert.equal(response.status, 200)
    flight = (await response.json()).flight
    assert.equal(flight.version, 3)
    assert.equal(flight.assignedUserId, planner)
    assert.equal(flight.createdBy, member)
    response = await fetch(`${base}/api/organizations/${organization.id}/flights/${flight.id}?version=1`, { headers: { 'x-user-id': String(admin) } })
    const originalVersion = (await response.json()).flight
    assert.equal(originalVersion.name, '회원 공유 비행')
    assert.equal(originalVersion.assignedUserId, planner, 'assignment is current flight state, not versioned content')
    assert.deepEqual(originalVersion.snapshot.routeGeometry, geometry)
    assert.equal(originalVersion.createdBy, member)

    response = await patchFlight(member, flight.id, { expectedVersion: 3, assignedUserId: member })
    assert.equal(response.status, 403, 'creator cannot undo an administrator assignment')
    response = await patchFlight(member, flight.id, { expectedVersion: 3, name: '재배정 후 작성자 수정' })
    assert.equal(response.status, 200)
    flight = (await response.json()).flight
    assert.equal(flight.assignedUserId, planner)
    response = await fetch(`${base}/api/organizations/${organization.id}/flights/${flight.id}/annotations`, {
      method: 'POST', headers: headers(member), body: JSON.stringify({ expectedVersion: flight.version,
        title: '작성자 주의사항', description: '담당자 변경 뒤에도 작성 가능' }),
    })
    assert.equal(response.status, 201)

    response = await share(organization.id, member, { savedRouteId: briefingId })
    assert.equal(response.status, 201)
    const sharedBriefing = (await response.json()).flight
    assert.equal(sharedBriefing.snapshot.kind, 'briefing')
    assert.equal(sharedBriefing.etd, new Date(briefingSnapshot.etd).toISOString())
    assert.equal(sharedBriefing.profileRequest.plannedCruiseAltitudeFt, 8500)

    response = await fetch(`${base}/api/organizations/${organization.id}/flights`, {
      method: 'POST', headers: headers(member), body: JSON.stringify({}),
    })
    assert.equal(response.status, 403)
    response = await fetch(`${base}/api/organizations/${organization.id}/flights`, {
      method: 'POST', headers: headers(planner), body: JSON.stringify({
        name: '플래너 등록', assignedUserId: member, etd: briefingSnapshot.etd, eta: briefingSnapshot.eta,
        snapshot: briefingSnapshot, profileRequest: briefingSnapshot.profileRequest,
      }),
    })
    assert.equal(response.status, 201)

    db.prepare("UPDATE organization_members SET status='inactive' WHERE organization_id=? AND user_id=?").run(organization.id, member)
    response = await share(organization.id, member, { savedRouteId: briefingId })
    assert.equal(response.status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    fs.rmSync(filesPath, { recursive: true, force: true })
  }
})

test('presentation HTTP routes only apply a server-stored candidate for the pinned flight revision', async () => {
  const db = createDb(':memory:')
  const filesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-org-run-'))
  const admin = user(db, 'run-admin')
  const member = user(db, 'run-member')
  const organization = createOrganization(db, { name: '발표 기관', adminUserId: admin, actorUserId: admin })
  putMember(db, organization.id, member, { role: 'member', status: 'active' })
  const flight = createFlight(db, organization.id, {
    name: 'RUN1', assignedUserId: member, etd: '2026-09-10T10:00:00Z', eta: '2026-09-10T11:00:00Z',
    snapshot: { version: 3, routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } },
    profileRequest: { plannedCruiseAltitudeFt: 10000 }, blocks: [], annotations: [], materialRefs: [],
  }, admin)
  const briefing = createBriefing(db, organization.id, { name: '발표', flightIds: [flight.id], materialRefs: [], blocks: [] }, admin)
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.session = { userId: Number(req.get('x-user-id')), role: 'pilot' }; next() })
  app.use('/api/organizations', createOrganizationRouter({ db, filesPath, briefingDependencies: {
    terrainSampler: {}, buildVerticalProfile: () => ({ flightPlan: {} }), loadRouteCrossSection: () => ({ available: false }),
    composeBriefing: () => ({ weather: 'pinned' }), readWeatherSnapshot: () => ({ dataRoot: filesPath, weather: {},
      contextRevision: 'r1', effectiveNowMs: Date.parse('2026-09-10T09:00:00Z') }),
  } }))
  const server = await listen(app)
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = (userId) => ({ origin: base, 'x-user-id': String(userId), 'content-type': 'application/json' })
  const send = (url, userId, body) => fetch(`${base}${url}`, { method: 'POST', headers: headers(userId), body: JSON.stringify(body) })
  try {
    let response = await fetch(`${base}/api/organizations/${organization.id}/flights/${flight.id}`, {
      method: 'PATCH', headers: headers(member), body: JSON.stringify({ expectedVersion: 1, materialRefs: [] }),
    })
    assert.equal(response.status, 200)
    response = await fetch(`${base}/api/organizations/${organization.id}/flights/${flight.id}`, {
      method: 'PATCH', headers: headers(member), body: JSON.stringify({ expectedVersion: 2, name: '권한 밖 변경' }),
    })
    assert.equal(response.status, 403)
    response = await send(`/api/organizations/${organization.id}/briefings/${briefing.id}/runs`, admin, { expectedVersion: 1 })
    assert.equal(response.status, 201)
    let run = (await response.json()).run
    assert.deepEqual(run.flightRefs, [{ id: flight.id, version: 1 }])
    response = await send(`/api/organizations/${organization.id}/briefings/${briefing.id}/runs/${run.id}/candidates`, member,
      { flightId: flight.id, flightVersion: 1 })
    assert.equal(response.status, 403)
    response = await send(`/api/organizations/${organization.id}/briefings/${briefing.id}/runs/${run.id}/candidates`, admin,
      { flightId: flight.id, flightVersion: 1 })
    assert.equal(response.status, 201)
    const bundle = (await response.json()).bundle
    response = await send(`/api/organizations/${organization.id}/briefings/${briefing.id}/runs/${run.id}/apply`, admin,
      { expectedRunVersion: 1, flightId: flight.id, bundleId: 'invented' })
    assert.equal(response.status, 409)
    response = await send(`/api/organizations/${organization.id}/briefings/${briefing.id}/runs/${run.id}/apply`, admin,
      { expectedRunVersion: 1, flightId: flight.id, bundleId: bundle.bundleId, appliedSnapshot: { injected: true } })
    assert.equal(response.status, 200)
    run = (await response.json()).run
    assert.equal(run.appliedSnapshot.bundleId, bundle.bundleId)
    assert.equal(run.appliedSnapshot.injected, undefined)

    updateFlight(db, organization.id, flight.id, { expectedVersion: 2, name: 'RUN1 revised' }, admin)
    updateBriefing(db, organization.id, briefing.id, { expectedVersion: 1, flightIds: [flight.id],
      blocks: [{ kind: 'speaker-notes', flightId: flight.id, body: '최신 기관 메모' }] }, admin)
    response = await send(`/api/organizations/${organization.id}/briefings/${briefing.id}/runs/${run.id}/candidates`, admin,
      { flightId: flight.id, flightVersion: 1, refreshOrganization: true })
    assert.equal(response.status, 201)
    const refreshed = (await response.json()).bundle
    assert.equal(refreshed.flight.version, 3)
    assert.equal(refreshed.organizationSnapshot.briefing.version, 2)
    assert.equal(refreshed.linkedContent.briefingBlocks[0].body, '최신 기관 메모')
    response = await send(`/api/organizations/${organization.id}/briefings/${briefing.id}/runs/${run.id}/apply`, admin,
      { expectedRunVersion: 2, flightId: flight.id, bundleId: refreshed.bundleId })
    assert.equal(response.status, 200)
    run = (await response.json()).run
    assert.deepEqual(run.flightRefs, [{ id: flight.id, version: 3 }])
    assert.equal(run.briefingVersion, 2)
    assert.equal(run.applicationHistory.length, 2)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    fs.rmSync(filesPath, { recursive: true, force: true })
  }
})
