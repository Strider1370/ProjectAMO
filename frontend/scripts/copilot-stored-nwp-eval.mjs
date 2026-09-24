// Explicit read-only local-data acceptance. No LLM calls, collectors, account
// writes or server lifecycle changes. Only chat/auth transport is simulated;
// model/profile/briefing values come from the real worker and ordinary REST API.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { chromium, webkit, devices, expect } from '@playwright/test'
import { createWorkerExecutor } from '../../backend/src/ai/worker-executor.js'
import { createFileRoutePlanningProvider } from '../../backend/src/briefing/route-planning-provider.js'
import { planRoute } from '../../shared/route-planning/planRoute.js'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
if (!option('data-root') || !option('url')) throw new Error('Required: --data-root=/path/to/stored/data --url=http://127.0.0.1:5173')
const dataRoot = path.resolve(option('data-root')), origin = new URL(option('url'))
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Local server only')
const root = fileURLToPath(new URL('../../', import.meta.url))
const parent = path.join(root, 'artifacts/ai-copilot')
fs.mkdirSync(parent, { recursive: true })
const output = fs.mkdtempSync(path.join(parent, 'stored-nwp-'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const indexFile = path.join(dataRoot, 'kim_nwp/index.json'), latestFile = path.join(dataRoot, 'kim_nwp/latest.json')
const index = JSON.parse(fs.readFileSync(indexFile)), latest = JSON.parse(fs.readFileSync(latestFile))
const publication = hash([index, latest])
const times = [...index.times].sort((a, b) => Date.parse(a.validTime) - Date.parse(b.validTime))
assert.ok(times.length >= 2, 'Needs two already collected KIM frames')
const first = times[0], next = times.find(time => Date.parse(time.validTime) > Date.parse(first.validTime))
const offset = (Date.parse(next.validTime) - Date.parse(first.validTime)) / 3_600_000
assert.ok(Number.isInteger(offset) && offset <= 12, 'Needs supported waypoint offset')
const provider = await createFileRoutePlanningProvider()
const worker = createWorkerExecutor({ dataRoot, navdata: provider.readJson('enroute.json'),
  procedureRoot: path.join(root, 'frontend/public/data/navdata/procedures') })
const evidence = { publication: { hash: publication, run: latest.latestRun, times: [first, next] },
  scope: 'historical stored NWP; no live LLM; simulated chat/auth transport', cases: [], browsers: [] }
const save = () => fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2))
const bundles = []
async function post(endpoint, body) {
  const response = await fetch(new URL(endpoint, origin), { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200, `${endpoint}: ${response.status}`)
  return response.json()
}
let browser
try {
  for (const [departureAirport, arrivalAirport, altitude, reverse] of [
    ['RKSS', 'RKPC', 31000, false], ['RKSI', 'RKPK', 25000, true],
  ]) {
    const planned = await planRoute({ routeForm: { flightRule: 'IFR', departureAirport, arrivalAirport },
      etd: first.validTime, eta: new Date(Date.parse(first.validTime) + 3_600_000).toISOString(), tasKt: 450, cruiseAltitudeFt: altitude }, provider)
    const request = { flightRule: 'IFR', departureAirport, arrivalAirport, ...planned.profileRequest,
      etd: planned.etd, eta: planned.eta }
    // Take only the applied context fields, as the browser exporter does.
    const { routeGeometry, routeModel, routeMarkers, procedureContext, plannedCruiseAltitudeFt } = request
    const applied = { flightRule: 'IFR', departureAirport, arrivalAirport, routeGeometry, routeModel, routeMarkers,
      procedureContext, plannedCruiseAltitudeFt, etd: planned.etd, eta: planned.eta,
      nwpTimeSelection: { baseTime: first.validTime, waypointOverrides: [
        ...(reverse ? [{ waypointId: routeMarkers[0].id, offsetHours: offset }] : []),
        { waypointId: routeMarkers[Math.floor(routeMarkers.length / 2)].id, offsetHours: reverse ? 0 : offset },
      ] } }
    const registered = await worker.registerContext({ schemaVersion: 1, scope: 'personal', revision: `stored-${departureAirport}`, request: applied }, 'stored-evaluation')
    assert.equal(registered.status, 'ok', JSON.stringify(registered.error))
    const digest = await worker.call('get_route_briefing', { context_ref: registered.contextRef }, 'stored-evaluation')
    assert.equal(digest.status, 'partial', JSON.stringify(digest.error))
    const bundle = await worker.getResult(digest.reference.briefingRef, 'stored-evaluation')
    assert.equal(bundle.status, 'ok')
    assert.ok(bundle.verticalProfile, 'Actual stored terrain/profile is required')
    const crossSection = await post('/api/briefing/cross-section', bundle.request)
    assert.equal(hash(bundle.crossSection), hash(crossSection), 'Entire ordinary REST and frozen cross-section must match')
    const verticalProfile = await post('/api/vertical-profile', bundle.request)
    assert.equal(hash(bundle.verticalProfile), hash(verticalProfile), 'Ordinary REST and frozen altitude/terrain profile must match')
    const sampledHours = [...new Set(bundle.crossSection.levels.flatMap(level => level.values.map(value => value.sourceHf)).filter(Number.isFinite))].sort((a, b) => a - b)
    assert.deepEqual(sampledHours, [first.hf, next.hf].sort((a, b) => a - b))
    assert.ok(bundle.crossSection.levels.some(level => level.values.some(value => Number.isFinite(value.u))))
    const ordinaryComparison = await post('/api/briefing/altitudes', bundle.request)
    const additionalAltitude = ordinaryComparison.rows.find(row => row.altitudeFt !== altitude && row.status === 'valid')?.altitudeFt
    assert.ok(additionalAltitude, 'Need a normal valid candidate as well as the requested altitude')
    const comparison = await worker.call('compare_route_altitudes', { briefing_ref: digest.reference.briefingRef,
      altitudes_ft: [altitude, additionalAltitude] }, 'stored-evaluation')
    assert.equal(comparison.status, 'partial', JSON.stringify(comparison.error))
    const restored = await worker.getResult(comparison.reference.briefingRef, 'stored-evaluation')
    assert.deepEqual(restored.crossSection, bundle.crossSection)
    assert.deepEqual(restored.verticalProfile, bundle.verticalProfile)
    assert.deepEqual(restored.request, bundle.request)
    assert.equal(restored.resultHash, comparison.reference.resultHash)
    // Include invalid requested inputs without reclassifying them as valid.
    for (const row of restored.altitudeComparison.rows) {
      const originalRow = ordinaryComparison.rows.find(candidate => candidate.altitudeFt === row.altitudeFt)
      const { profileStatus, ...comparedRow } = row
      assert.ok(originalRow)
      assert.deepEqual(comparedRow, originalRow)
      assert.equal(profileStatus, originalRow.status === 'input_invalid' ? 'not_assessed' : 'applied')
    }
    const item = { route: `${departureAirport}-${arrivalAirport}`, altitudeFt: altitude, sampledHours,
      requestHash: hash(bundle.request), crossSectionHash: hash(bundle.crossSection), verticalProfileHash: hash(bundle.verticalProfile),
      comparisonRows: comparison.data.rows, rules: bundle.crossSection.timeRules, ordinaryRestEquivalent: true }
    evidence.cases.push(item)
    bundles.push({ bundle: restored, card: comparison, item })
    fs.writeFileSync(path.join(output, `${item.route}.json`), JSON.stringify(restored))
    save()
    console.log(JSON.stringify({ step: 'worker_rest_equivalence', route: item.route, sampledHours }))
  }
  for (const [name, engine, device] of [
    ['desktop', chromium, { viewport: { width: 1440, height: 1000 } }],
    ['ipad-landscape', chromium, devices['iPad Pro 11 landscape']],
    ['mobile', chromium, devices['Pixel 5']],
    ['ipad-safari', webkit, devices['iPad Pro 11 landscape']],
  ]) {
    browser = await engine.launch({ headless: true })
    for (const timezone of ['KST', 'UTC']) {
      const { bundle, card, item } = bundles[timezone === 'KST' ? 0 : 1]
      const context = await browser.newContext({ ...device, serviceWorkers: 'block' })
      const page = await context.newPage(), recalculations = [], errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.setDefaultTimeout(20_000)
      await page.addInitScript(({ version, timezone }) => {
        localStorage.setItem('amo.tour.v1.done', 'true')
        localStorage.setItem('projectamo:lastSeenVersion', version)
        localStorage.setItem('time_zone', timezone)
      }, { version: CURRENT_VERSION, timezone })
      await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 900001, username: 'stored-nwp-evaluation', role: 'pilot' } }))
      await page.route('**/api/ai/status', route => route.fulfill({ json: { enabled: true, ready: true } }))
      await page.route('**/api/ai/conversations', route => route.fulfill({ json: { conversationId: 'stored-evaluation', revision: 0 } }))
      await page.route('**/api/ai/chat', route => {
        const body = route.request().postDataJSON()
        return route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1, status: 'completed',
          text: '보관된 과거 KIM 단면 검증입니다. 최신 기상이나 실제 LLM 답변이 아닙니다.',
          cards: [{ tool: 'compare_route_altitudes', result: card }], context: body.context, displayTimezone: body.displayTimezone } })
      })
      await page.route('**/api/ai/results/*', route => route.fulfill({ json: bundle }))
      await page.route(/\/api\/(route-briefing|vertical-profile|briefing\/(cross-section|altitudes|nwp-time-refresh))$/, route => {
        recalculations.push(route.request().url())
        return route.fulfill({ status: 500, json: { error: 'MUST_NOT_RECALCULATE' } })
      })
      await page.goto(origin.href, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
      await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
      await page.getByLabel('기상이에게 질문', { exact: true }).fill('보관 단면 검증')
      await page.getByRole('button', { name: '전송', exact: true }).click()
      await page.locator('.copilot-fact summary').filter({ hasText: '고도 비교' }).click()
      await page.getByRole('button', { name: '같은 결과 전체 보기', exact: true }).click()
      const notice = page.getByRole('region', { name: '챗봇 보관 결과' })
      await expect(notice).toHaveAttribute('data-result-hash', bundle.resultHash)
      await expect(notice).toContainText(latest.latestRun)
      const displayed = new Date(Date.parse(bundle.crossSection.run.validTime) + (timezone === 'KST' ? 9 * 3_600_000 : 0))
      const timeLabel = `${displayed.toISOString().slice(5, 10)} ${displayed.toISOString().slice(11, 16)}${timezone === 'KST' ? ' KST' : 'Z'}`
      await expect(notice).toContainText(`KIM 유효 ${timeLabel}`)
      await expect.poll(() => page.evaluate(() => window.__map?.getSource('briefing-route-applied')?.serialize()?.data?.features
        ?.find(feature => feature.geometry?.type === 'LineString')?.geometry)).toEqual(bundle.request.routeGeometry)
      const rail = page.getByLabel('NWP 시간 규칙', { exact: true }).first()
      await expect(rail).toBeVisible()
      await expect(rail).toContainText(`+${offset}h`)
      await expect(rail.getByRole('button')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '다음 예보시간', exact: true })).toHaveCount(0)
      await expect(page.locator('.vertical-profile-nwp-hint').first()).toContainText('이 화면에서는 변경할 수 없습니다')
      // Cold opening a copilot result must load profile CSS without first opening
      // the lazy route editor. SVG's default black fill hides the whole chart.
      await expect(page.locator('.vertical-profile-procedure-line').first()).toHaveCSS('fill', 'none')
      await expect(page.locator('.vertical-profile-nwp-rail-line').first()).toHaveCSS('stroke-width', '6px')
      assert.ok(await page.locator('.vertical-profile-procedure-line').count())
      assert.ok(await page.locator('.vertical-profile-terrain-line').count())
      assert.deepEqual(recalculations, [])
      assert.deepEqual(errors, [])
      await page.screenshot({ path: path.join(output, `${name}-${timezone}.png`) })
      await rail.scrollIntoViewIfNeeded()
      await expect(rail).toBeInViewport()
      await page.screenshot({ path: path.join(output, `${name}-${timezone}-profile.png`) })
      evidence.browsers.push({ name, timezone, route: item.route, resultHash: bundle.resultHash,
        readOnlyTimeRules: true, mapGeometryEqual: true, recalculations: 0, pageErrors: errors })
      save()
      await context.close()
      console.log(JSON.stringify({ step: 'browser', name, timezone }))
    }
    await browser.close(); browser = null
  }
  assert.equal(hash([JSON.parse(fs.readFileSync(indexFile)), JSON.parse(fs.readFileSync(latestFile))]), publication, 'Source publication changed during acceptance')
  evidence.status = 'passed'
} catch (error) {
  evidence.status = 'failed'
  evidence.error = error.stack
  throw error
} finally {
  save()
  await browser?.close()
  await worker.close()
  console.log(JSON.stringify({ output, status: evidence.status }))
}
