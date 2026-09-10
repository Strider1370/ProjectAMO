// Opt-in HTTP verification against locally collected real weather. Writes only artifacts.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { createDb } from '../backend/src/db/index.js'
import { createUser } from '../backend/src/db/users.js'
import { organizationFlightFixture } from '../frontend/verification/organization-fixture.mjs'
import { organizationTestPdf } from './lib/organization-test-pdf.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifactRoot = path.join(root, 'artifacts/organization-lounge')
const instance = fs.mkdtempSync(path.join(artifactRoot, 'live-http-'))
const dataRoot = path.join(instance, 'data')
fs.mkdirSync(dataRoot)
const sourceRoot = path.join(root, 'backend/data')
for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !entry.name.startsWith('.') && !['backups', 'organization-files', 'snapshots'].includes(entry.name)) {
    fs.symlinkSync(path.join(sourceRoot, entry.name), path.join(dataRoot, entry.name), 'dir')
  }
}
const password = crypto.randomBytes(20).toString('hex')
const db = createDb(path.join(dataRoot, 'projectamo.db'))
const admin = createUser(db, { username: 'lounge_admin', password, role: 'admin', displayName: '기관 검증 관리자' })
const pilot = createUser(db, { username: 'lounge_pilot', password, displayName: '기관 검증 조종사' })
const outsider = createUser(db, { username: 'lounge_outsider', password })
db.close()
const port = Number(process.env.ORGANIZATION_VERIFY_PORT || 3109)
const origin = `http://127.0.0.1:${port}`
const log = fs.openSync(path.join(instance, 'server.log'), 'w')
const child = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'backend'), env: {
  ...process.env, DATA_PATH: dataRoot, ORGANIZATION_FILES_PATH: path.join(instance, 'private'),
  FRONTEND_ORIGIN: 'http://127.0.0.1:5189', BACKEND_PORT: String(port), DISABLE_COLLECTION: '1', AUTO_ADMIN_LOGIN: '', NODE_ENV: 'development',
  SESSION_SECRET: crypto.randomBytes(32).toString('hex'), DB_BACKUP_DISABLED: '1',
}, stdio: ['ignore', log, log] })
const result = { verifiedAt: new Date().toISOString(), evidence: 'latest-collected-real-weather-with-isolated-test-accounts', instance, checks: [] }
function record(name, detail = {}) { result.checks.push({ name, ...detail }) }
async function request(cookie, url, { method = 'GET', body, expected = 200, headers = {} } = {}) {
  const response = await fetch(`${origin}${url}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body == null ? undefined : JSON.stringify(body) })
  const value = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(value)}`)
  return { value, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
try {
  for (let attempt = 0; ; attempt++) {
    try { await request(null, '/api/health'); break } catch (error) { if (attempt >= 100 || child.exitCode != null) throw error; await delay(100) }
  }
  const adminCookie = (await request(null, '/api/auth/login', { method: 'POST', body: { username: admin.username, password } })).cookie
  const pilotCookie = (await request(null, '/api/auth/login', { method: 'POST', body: { username: pilot.username, password } })).cookie
  const outsiderCookie = (await request(null, '/api/auth/login', { method: 'POST', body: { username: outsider.username, password } })).cookie
  const { organization } = (await request(adminCookie, '/api/admin/organizations', { method: 'POST', expected: 201, body: { name: '실제자료 기관 검증', adminUserId: admin.id } })).value
  const prefix = `/api/organizations/${organization.id}`
  await request(adminCookie, `${prefix}/members/${pilot.id}`, { method: 'PUT', body: { role: 'member', status: 'active' } })
  const snapshot = structuredClone(organizationFlightFixture.snapshot)
  snapshot.kind = 'route'
  snapshot.profileRequest = { flightRule: 'VFR', plannedCruiseAltitudeFt: 3500, vfrWaypoints: [], procedureContext: {} }
  snapshot.etd = '2026-09-10T12:00:00.000Z'; snapshot.eta = '2026-09-10T12:30:00.000Z'
  await request(adminCookie, '/api/me/routes', { method: 'POST', expected: 201, body: { name: '광주–여수 저장 경로', snapshot } })
  const { flight } = (await request(adminCookie, `${prefix}/flights`, { method: 'POST', expected: 201, body: {
    name: '광주–여수 실제자료 확인', assignedUserId: pilot.id, snapshot, profileRequest: snapshot.profileRequest,
    etd: snapshot.etd, eta: snapshot.eta, blocks: [], annotations: [], materialRefs: [],
  } })).value
  const read = (await request(pilotCookie, `${prefix}/flights/${flight.id}`)).value.flight
  assert.deepEqual(read.snapshot.routeGeometry, snapshot.routeGeometry)
  record('administrator-saves-other-pilot-reads', { organizationId: organization.id, flightId: flight.id, version: read.version })
  await request(outsiderCookie, `${prefix}/flights/${flight.id}`, { expected: 403 })
  await request(null, `${prefix}/flights/${flight.id}`, { expected: 401 })
  await request(pilotCookie, `${prefix}/flights/${flight.id}`, { method: 'PATCH', body: { expectedVersion: 1, name: 'forbidden' }, expected: 403 })
  record('nonmember-anonymous-member-planning-permissions-enforced')
  const bundle = (await request(pilotCookie, `${prefix}/flights/${flight.id}/weather-briefing`, { method: 'POST', body: { flightVersion: 1, overrides: {} } })).value
  assert.ok(bundle.bundleId)
  assert.ok(bundle.briefing)
  fs.writeFileSync(path.join(instance, 'bundle.json'), JSON.stringify(bundle, null, 2))
  record('real-organization-weather-briefing', { bundleId: bundle.bundleId, componentStatus: bundle.componentStatus, provenance: bundle.provenance, mapDataSelection: bundle.mapDataSelection })
  for (const type of ['metar', 'taf', 'warning', 'sigmet', 'airmet']) {
    const payload = (await request(pilotCookie, `/api/${type}`)).value
    record(`source-${type}`, { fetchedAt: payload?.fetched_at, count: Object.keys(payload?.airports ?? {}).length || payload?.items?.length || 0 })
  }
  const { interest } = (await request(adminCookie, `${prefix}/interests`, { method: 'POST', expected: 201, body: { name: '남부 비행구역', kind: 'region', geometry: { type: 'Polygon', coordinates: [[[125,33],[130,33],[130,38],[125,38],[125,33]]] } } })).value
  const situation = (await request(pilotCookie, `${prefix}/situation`)).value.situation
  fs.writeFileSync(path.join(instance, 'situation.json'), JSON.stringify(situation, null, 2))
  record('real-advisory-area-intersection', { interestId: interest.id, events: situation.events, sourceStatus: situation.sourceStatus })
  const pdf = organizationTestPdf()
  async function uploadMaterial(name, mime, bytes, id = null, expectedVersion = null) {
    const response = await fetch(`${origin}${prefix}/materials${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', headers: {
      Cookie: adminCookie, Origin: origin, 'Content-Type': mime, 'x-file-name': encodeURIComponent(name), 'x-material-title': encodeURIComponent(name), ...(expectedVersion ? { 'x-expected-version': String(expectedVersion) } : {}),
    }, body: bytes })
    const payload = await response.json()
    assert.equal(response.status, id ? 200 : 201, JSON.stringify(payload))
    return payload.material
  }
  const pdfMaterial = await uploadMaterial('검증용 두 쪽 문서.pdf', 'application/pdf', pdf)
  assert.equal(pdfMaterial.metadata.pages, 2)
  await uploadMaterial('검증용 두 쪽 문서.pdf', 'application/pdf', organizationTestPdf('Replacement version'), pdfMaterial.id, 1)
  const kmlMaterial = await uploadMaterial('실제 NOTAM 좌표 자료.kml', 'application/vnd.google-earth.kml+xml', fs.readFileSync(path.join(root, 'backend/test/fixtures/notam-sample.kml')))
  assert.ok(kmlMaterial.metadata.geojson.features.length)
  const immutableUrl = `${origin}${prefix}/materials/${pdfMaterial.id}/versions/1/original`
  const original = await fetch(immutableUrl, { headers: { Cookie: pilotCookie, Range: 'bytes=0-7' } })
  assert.equal(original.status, 206)
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), pdf.subarray(0, 8))
  assert.equal((await fetch(immutableUrl, { headers: { Cookie: outsiderCookie } })).status, 403)
  assert.equal((await fetch(immutableUrl)).status, 401)
  await request(adminCookie, `${prefix}/notices`, { method: 'POST', expected: 201, body: { title: '운항 전 확인', body: '실제 기상과 기관 비행을 함께 확인합니다.', blocks: [] } })
  const { briefing: joint } = (await request(adminCookie, `${prefix}/briefings`, { method: 'POST', expected: 201, body: {
    name: '실제자료 합동 브리핑', scheduledAt: snapshot.etd, flightIds: [flight.id], materialRefs: [{ id: pdfMaterial.id, version: 1 }],
    blocks: [{ kind: 'speaker-notes', flightId: flight.id, body: '고도와 유효시각을 확인하고 자료 누락 구간은 별도로 판단합니다.' }],
  } })).value
  record('private-pdf-range-immutable-replacement-and-kml', { evidence: 'synthetic-two-page-PDF-and-repository-real-KML', pdfId: pdfMaterial.id, kmlId: kmlMaterial.id, jointId: joint.id })
  if (process.env.ORGANIZATION_VERIFY_BROWSER === '1') {
    const { verifyOrganizationBrowser } = await import('./lib/organization-browser-verification.mjs')
    result.browser = await verifyOrganizationBrowser({ root, instance, origin, admin, pilot, password, orgId: organization.id, flightId: flight.id, jointId: joint.id, pdfId: pdfMaterial.id, kmlId: kmlMaterial.id })
  }
  result.status = 'passed'
} catch (error) { result.status = 'failed'; result.error = error.stack; process.exitCode = 1 }
finally {
  child.kill('SIGTERM')
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)])
  if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL')
  fs.closeSync(log)
  fs.writeFileSync(path.join(artifactRoot, 'live-http-result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ status: result.status, checks: result.checks.length, instance, error: result.error?.split('\n')[0] }))
}
