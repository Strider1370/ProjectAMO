// Real HTTP/browser member sharing verification. Accounts/data are isolated under artifacts.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { createDb } from '../backend/src/db/index.js'
import { createUser } from '../backend/src/db/users.js'
import { chromium, webkit } from '../frontend/node_modules/playwright/index.mjs'
import { expect } from '../frontend/node_modules/@playwright/test/index.mjs'
import { organizationFlightFixture } from '../frontend/verification/organization-fixture.mjs'
import { CURRENT_VERSION } from '../frontend/src/features/about/changelog.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const instance = fs.mkdtempSync(path.join(root, 'artifacts/organization-lounge/member-sharing-'))
const dataRoot = path.join(instance, 'data')
fs.mkdirSync(dataRoot)
for (const entry of fs.readdirSync(path.join(root, 'backend/data'), { withFileTypes: true })) {
  if (entry.isDirectory() && !entry.name.startsWith('.') && !['backups', 'organization-files', 'snapshots'].includes(entry.name)) fs.symlinkSync(path.join(root, 'backend/data', entry.name), path.join(dataRoot, entry.name), 'dir')
}
const db = createDb(path.join(dataRoot, 'projectamo.db'))
const password = crypto.randomBytes(20).toString('hex')
const admin = createUser(db, { username: 'share_admin', password, role: 'admin' })
const owner = createUser(db, { username: 'share_owner', password, displayName: '비행 작성자' })
const member = createUser(db, { username: 'share_reader', password, displayName: '기관 구성원' })
const outsider = createUser(db, { username: 'share_outsider', password })
db.close()
const origin = 'http://127.0.0.1:3119'
const frontendOrigin = 'http://127.0.0.1:5199'
const processes = []
const logs = []
function start(name, args, cwd, env) {
  const log = fs.openSync(path.join(instance, name + '.log'), 'w'); logs.push(log)
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', log, log] }); processes.push(child); return child
}
async function ready(url, child) {
  for (let n = 0; n < 150; n++) {
    try { if ((await fetch(url)).ok) return } catch {}
    assert.equal(child.exitCode, null, 'verification server stopped')
    await delay(100)
  }
  throw new Error('Server did not become ready: ' + url)
}
async function request(cookie, route, { method = 'GET', body, expected = 200 } = {}) {
  const response = await fetch(origin + route, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json(); assert.equal(response.status, expected, `${route}: ${JSON.stringify(result)}`)
  return { value: result, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
const result = { verifiedAt: new Date().toISOString(), instance, checks: [], captures: [], weatherSource: 'locally collected real weather; account/flight fixture' }
let browser
let currentPage
try {
  const server = start('server', ['server.js'], path.join(root, 'backend'), { DATA_PATH: dataRoot, ORGANIZATION_FILES_PATH: path.join(instance, 'private'), FRONTEND_ORIGIN: frontendOrigin, BACKEND_PORT: '3119', DISABLE_COLLECTION: '1', AUTO_ADMIN_LOGIN: '', NODE_ENV: 'development', SESSION_SECRET: crypto.randomBytes(32).toString('hex'), DB_BACKUP_DISABLED: '1' })
  await ready(origin + '/api/health', server)
  const cookies = {}
  for (const user of [admin, owner, member, outsider]) cookies[user.id] = (await request(null, '/api/auth/login', { method: 'POST', body: { username: user.username, password } })).cookie
  const organization = (await request(cookies[admin.id], '/api/admin/organizations', { method: 'POST', expected: 201, body: { name: '회원 공유 확인 기관', adminUserId: admin.id } })).value.organization
  const prefix = `/api/organizations/${organization.id}`
  for (const user of [owner, member]) await request(cookies[admin.id], `${prefix}/members/${user.id}`, { method: 'PUT', body: { role: 'member', status: 'active' } })
  const snapshot = structuredClone(organizationFlightFixture.snapshot)
  snapshot.etd = '2026-09-10T13:30:00Z'; snapshot.eta = '2026-09-10T14:00:00Z'
  snapshot.profileRequest = { flightRule: 'VFR', plannedCruiseAltitudeFt: 3500, vfrWaypoints: [], procedureContext: {} }
  const saved = (await request(cookies[owner.id], '/api/me/routes', { method: 'POST', expected: 201, body: { name: '내가 저장한 광주–여수 브리핑', snapshot } })).value
  const savedRoute = (await request(cookies[owner.id], '/api/me/routes', { method: 'POST', expected: 201, body: { name: '내가 저장한 광주–여수 경로', snapshot: { ...snapshot, kind: 'route' } } })).value
  await request(cookies[member.id], `${prefix}/flights/share`, { method: 'POST', expected: 404, body: { savedRouteId: saved.id } })
  await request(cookies[outsider.id], `${prefix}/flights/share`, { method: 'POST', expected: 403, body: { savedRouteId: saved.id } })
  result.checks.push('other owner saved route and nonmember access denied')
  const vite = start('vite', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5199', '--strictPort'], path.join(root, 'frontend'), { PROJECTAMO_BACKEND_TARGET: origin })
  await ready(frontendOrigin, vite)
  let lastFlightId
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    browser = await launcher.launch()
    for (const [size, viewport] of [['desktop', { width: 1920, height: 1080 }], ['ipad', { width: 1180, height: 820 }], ['compact', { width: 1024, height: 768 }]]) {
      if (process.env.ORGANIZATION_SHARING_FOCUSED === '1' && !((engine === 'chromium' && size === 'desktop') || (engine === 'webkit' && size === 'ipad'))) continue
      const context = await browser.newContext({ viewport, hasTouch: size !== 'desktop', reducedMotion: 'reduce' })
      const [cookieName, ...cookieParts] = cookies[owner.id].split('=')
      await context.addCookies([{ name: cookieName, value: cookieParts.join('='), url: frontendOrigin, httpOnly: true, sameSite: 'Lax' }])
      await context.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
      const page = await context.newPage(); currentPage = page; const errors = []; page.on('pageerror', error => errors.push(error.message))
      const capture = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'horizontal overflow')
        const filename = `${engine}-${size}-${name}.png`; await page.screenshot({ path: path.join(instance, filename) }); result.captures.push(filename); assert.deepEqual(errors, [])
      }
      await page.goto(frontendOrigin + '/')
      await page.getByRole('button', { name: '계정', exact: true }).click()
      await page.getByRole('button', { name: '기관에 공유', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '내 비행을 기관에 공유', exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[name=etd]')).toHaveValue('2026-09-10T22:30')
      await capture('share-saved-briefing')
      await dialog.getByRole('button', { name: '내 비행 공유', exact: true }).click()
      const detailLink = page.getByRole('link', { name: '기관 비행 보기', exact: true })
      await expect(detailLink).toBeVisible({ timeout: 20000 })
      const href = await detailLink.getAttribute('href'); lastFlightId = Number(href.split('/').at(-1))
      await detailLink.click()
      await expect(page.getByRole('button', { name: '비행계획 편집', exact: true })).toBeVisible()
      await capture('owner-shared-flight')
      const savedFlight = (await request(cookies[owner.id], `${prefix}/flights/${lastFlightId}`)).value.flight
      assert.equal(savedFlight.createdBy, owner.id); assert.equal(savedFlight.assignedUserId, owner.id)
      await request(cookies[member.id], `${prefix}/flights/${lastFlightId}`, { method: 'PATCH', expected: 403, body: { expectedVersion: savedFlight.version, name: 'forbidden' } })
      await context.clearCookies()
      const [readerCookieName, ...readerCookieParts] = cookies[member.id].split('=')
      await context.addCookies([{ name: readerCookieName, value: readerCookieParts.join('='), url: frontendOrigin, httpOnly: true, sameSite: 'Lax' }])
      await page.goto(frontendOrigin + href)
      await expect(page.getByRole('link', { name: '기상 브리핑 보기', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '비행계획 편집', exact: true })).toHaveCount(0)
      await capture('member-shared-flight')
      await page.getByRole('link', { name: '기상 브리핑 보기', exact: true }).click()
      await expect(page.locator('.briefing-view')).toBeVisible({ timeout: 45000 })
      await expect(page.getByRole('region', { name: '기관 브리핑 조회', exact: true })).toHaveCount(0)
      await expect(page.getByLabel('기관 조회 고도')).toHaveCount(0)
      await capture('member-existing-weather-briefing')
      await page.locator('.bv-head-side').getByRole('button', { name: '닫기', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/lounge/${organization.id}/flights/${lastFlightId}$`))
      result.checks.push(`${engine}/${size}: member shares own saved briefing, another member reads existing weather screen`)
      await context.close()
    }
    await browser.close(); browser = null
  }
  const routeShared = (await request(cookies[owner.id], `${prefix}/flights/share`, { method: 'POST', expected: 201, body: { savedRouteId: savedRoute.id } })).value.flight
  assert.equal(routeShared.createdBy, owner.id)
  await request(cookies[owner.id], `/api/me/routes/${saved.id}`, { method: 'DELETE' })
  const afterDelete = (await request(cookies[member.id], `${prefix}/flights/${lastFlightId}`)).value.flight
  assert.deepEqual(afterDelete.snapshot.routeGeometry, snapshot.routeGeometry)
  result.checks.push('saved route share supported and deleting personal source preserves shared flight')
  result.status = 'passed'
} catch (error) {
  result.status = 'failed'; result.error = error.stack; process.exitCode = 1
  if (currentPage && !currentPage.isClosed()) { await currentPage.screenshot({ path: path.join(instance, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(instance, 'failure.html'), await currentPage.content().catch(() => '')) }
}
finally {
  await browser?.close()
  for (const child of processes.reverse()) { child.kill('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1500)]); if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL') }
  for (const log of logs) fs.closeSync(log)
  fs.writeFileSync(path.join(root, 'artifacts/organization-lounge/member-sharing-result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ status: result.status, instance, checks: result.checks.length, captures: result.captures.length, error: result.error }))
}
