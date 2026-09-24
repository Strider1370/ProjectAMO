// Explicit, paid integration acceptance. Real login, API, provider and UI;
// isolated synthetic account/data directory, no route interception or auto-login.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

if (!process.argv.includes('--live')) throw new Error('Use --live to authorize paid OpenAI calls with synthetic personal data')
const suite = process.argv.find((arg) => arg.startsWith('--suite='))?.slice(8) ?? 'flight'
if (!['flight', 'ui-actions'].includes(suite)) throw new Error('Unknown live evaluation suite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = path.join(root, 'backend/data')
const parent = path.join(root, 'artifacts/ai-copilot')
fs.mkdirSync(parent, { recursive: true })
const output = fs.mkdtempSync(path.join(parent, 'live-browser-'))
const dataRoot = path.join(output, 'data')
fs.mkdirSync(dataRoot)
// Set before backend imports: nothing can accidentally open the user's DB.
process.env.DATA_PATH = dataRoot
process.env.DISABLE_COLLECTION = '1'
process.env.DISABLE_KIM_NWP = '1'
process.env.AUTO_ADMIN_LOGIN = ''
process.env.ALERTS_DISABLED = '1'
process.env.NODE_ENV = 'development'
await import('../../backend/src/config.js')
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing')
const { createDb } = await import('../../backend/src/db/index.js')
const { createUser } = await import('../../backend/src/db/users.js')
const { createLocalRuntime } = await import('../../backend/src/ai/local-runtime.js')
const db = createDb(path.join(dataRoot, 'projectamo.db'))
const username = 'ai_acceptance', password = randomBytes(24).toString('hex')
const user = createUser(db, { username, password, role: 'pilot' })
for (const kind of ['metar', 'taf', 'sigmet', 'airmet', 'warning']) {
  const file = path.join(source, kind, 'latest.json')
  if (fs.existsSync(file)) {
    fs.mkdirSync(path.join(dataRoot, kind))
    fs.copyFileSync(file, path.join(dataRoot, kind, 'latest.json'))
  }
}
const etd = new Date(Date.now() + 12 * 3600_000).toISOString()
const eta = new Date(Date.parse(etd) + 3600_000).toISOString()
const runtime = createLocalRuntime({ dataRoot })
const planned = await runtime.call('plan_route', { departure: '김포', arrival: '제주', flightRule: 'IFR',
  cruiseAltitude: { value: 310, unit: 'FL' }, departureUtc: etd, tasKt: 450 }, `user:${user.id}`)
assert.equal(planned.data?.planningState, 'planned')
const briefing = await runtime.call('get_route_briefing', { context_ref: planned.reference.contextRef }, `user:${user.id}`)
const stored = runtime.getResult(briefing.reference.briefingRef, `user:${user.id}`)
assert.equal(stored.status, 'ok')
const { editor } = stored.plan
const snapshot = { version: 3, base: { routeForm: editor.routeForm, procedures: editor.procedures,
  enroute: editor.enroute, routeString: editor.rawText }, alternatives: [],
  routeGeometry: stored.request.routeGeometry, routeModel: stored.request.routeModel, routeMarkers: stored.request.routeMarkers,
  etd, eta, cruiseAltitudeFt: 31000, tasKt: 450, profileRequest: { procedureContext: stored.request.procedureContext } }
const routeId = Number(db.prepare('INSERT INTO routes(user_id,name,payload,created_at,updated_at) VALUES(?,?,?,?,?)')
  .run(user.id, '통합검증 김포 제주', JSON.stringify(snapshot), new Date().toISOString(), new Date().toISOString()).lastInsertRowid)

const children = [], logs = [], events = []
let browser, page
const count = () => db.prepare('SELECT COUNT(*) n FROM routes WHERE alert_enabled=1').get().n
const clean = (value) => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([key]) => !['confirmationToken'].includes(key)).map(([key, v]) => [key, clean(v)])) : value
function record(value) {
  events.push(clean(value))
  fs.writeFileSync(path.join(output, 'events.json'), JSON.stringify(events, null, 2))
}
async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
function start(name, args, cwd, env) {
  const fd = fs.openSync(path.join(output, `${name}.log`), 'w')
  logs.push(fd)
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', fd, fd] })
  children.push(child)
  return child
}
async function ready(child, url) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) throw new Error('Owned server exited before readiness')
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Owned server readiness timeout')
}
try {
  const backendPort = await freePort(), frontendPort = await freePort()
  const origin = `http://127.0.0.1:${frontendPort}`
  const env = { ...process.env, BACKEND_PORT: String(backendPort), BACKEND_HOST: '127.0.0.1',
    FRONTEND_ORIGIN: origin, PROJECTAMO_BACKEND_TARGET: `http://127.0.0.1:${backendPort}`,
    AMO_AI_ENABLED: '1', AMO_AI_MODEL: 'gpt-6-luna', AMO_AI_REASONING_EFFORT: 'high', AMO_AI_MAX_OUTPUT_TOKENS: '3200',
    SESSION_SECRET: randomBytes(32).toString('hex'), ENABLE_TEST_MUTATIONS: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' }
  const backend = start('backend', ['server.js'], path.join(root, 'backend'), env)
  await ready(backend, `http://127.0.0.1:${backendPort}/api/health`)
  const frontend = start('frontend', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], path.join(root, 'frontend'), env)
  await ready(frontend, origin)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  page = await context.newPage()
  page.setDefaultTimeout(15_000)
  await page.addInitScript(version => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
  await page.getByRole('button', { name: '로그인하고 질문하기', exact: true }).click()
  const login = page.getByRole('dialog', { name: '계정', exact: true })
  await login.getByLabel('아이디', { exact: true }).fill(username)
  await login.getByLabel('비밀번호', { exact: true }).fill(password)
  const authenticated = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST')
  await login.getByRole('button', { name: '로그인', exact: true }).click()
  assert.equal((await authenticated).status(), 200)
  await expect(login).not.toBeVisible()
  await expect(page.getByLabel('기상이에게 질문', { exact: true })).toBeVisible()
  await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
  record({ step: 'authenticated', userId: user.id, synthetic: true, model: env.AMO_AI_MODEL,
    reasoning: env.AMO_AI_REASONING_EFFORT, dataRoot, etd, eta })
  console.log(JSON.stringify({ output, step: 'authenticated' }))
  async function ask(question, requiredTool) {
    const opened = page.getByRole('button', { name: '기상이에게 질문하기', exact: true })
    if (await opened.isVisible()) await opened.click()
    await page.getByLabel('기상이에게 질문', { exact: true }).fill(question)
    const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/chat' && r.request().method() === 'POST', { timeout: 55_000 })
    const start = Date.now()
    await page.getByRole('button', { name: '전송', exact: true }).click()
    const received = await response, result = await received.json()
    record({ step: 'chat', question, httpStatus: received.status(), elapsedMs: Date.now() - start, result })
    console.log(JSON.stringify({ step: 'chat', status: result.status, tools: result.cards?.map(c => c.tool), usage: result.usage }))
    assert.equal(received.status(), 200)
    assert.equal(result.status, 'completed', result.error)
    assert.ok(result.cards?.some(c => c.tool === requiredTool), `Missing ${requiredTool}`)
    await expect(page.locator('.copilot-message.assistant .copilot-bubble').last()).toHaveText(result.text)
    return result
  }
  if (suite === 'ui-actions') {
    for (const action of [
      { question: '김포공항 상세 패널을 열 수 있는 버튼을 만들어 줘.', type: 'open_airport', target: 'RKSS', button: 'RKSS 공항 패널 열기' },
      { question: '국내 AIRMET 레이어를 지도에 켤 수 있게 해 줘.', type: 'enable_weather_layer', target: 'airmet', button: 'AIRMET 켜기' },
    ]) {
      const result = await ask(action.question, 'request_ui_action')
      const card = result.cards.find((c) => c.tool === 'request_ui_action')
      assert.deepEqual(card.result.data.action, { schemaVersion: 1, type: action.type, target: action.target })
      assert.equal(card.result.data.executionState, 'awaiting_user_click')
      const region = page.locator('.copilot-message.assistant').last().getByRole('region', { name: '화면 연결', exact: true })
      await expect(region.getByRole('status')).toHaveCount(0)
      await region.getByRole('button', { name: action.button, exact: true }).click()
      if (action.type === 'open_airport') await expect(page.locator('.airport-panel-title-code')).toContainText('RKSS')
      else await expect(page.locator('.layer-tile').filter({ hasText: 'AIRMET' })).toHaveAttribute('aria-pressed', 'true')
      await page.screenshot({ path: path.join(output, `${action.type}.png`) })
      await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
      await expect(region.getByRole('status')).toContainText('실행 결과:')
      record({ step: 'ui_action_applied', action: card.result.data.action, receipt: await region.getByRole('status').innerText() })
    }
    assert.equal(count(), 0)
  } else {
  await ask('김포 공항의 지금부터 한 시간 관측과 예보를 확인하고, 자료 시각과 미확인 범위를 알려줘.', 'get_airport_weather')
  await ask('내 저장 경로 목록을 찾아줘.', 'search_my_routes')
  await ask(`저장 경로 ID ${routeId}의 저장 입력을 확인해 줘. 아직 기상 재조회는 하지 마.`, 'get_my_saved_route')
  await page.getByRole('button', { name: '저장 경로 불러오기 준비', exact: true }).click()
  await expect(page.getByRole('region', { name: '저장 경로 불러오기 확인' })).toBeVisible()
  await page.getByRole('button', { name: '확인하고 저장 경로 불러오기', exact: true }).click()
  await expect(page.getByRole('button', { name: '기상이에게 질문하기', exact: true })).toBeVisible()
  assert.equal(count(), 0)
  record({ step: 'saved_import_confirmed', routeId, activeAlerts: count() })
  const prepared = await ask(`저장 원본 ID ${routeId}의 새 예정 비행 알람 등록 변경안을 준비해 줘. 출발은 ${etd}, 도착은 ${eta}야. 두 시각은 UTC이고 확인 버튼을 누르기 전에는 실행하지 마.`, 'prepare_flight_alert')
  assert.equal(count(), 0)
  const proposal = prepared.cards.find(c => c.tool === 'prepare_flight_alert').result.data.proposal
  assert.equal(proposal.etd, etd)
  assert.equal(proposal.eta, eta)
  await page.screenshot({ path: path.join(output, 'alert-before-confirm.png') })
  const confirmResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/confirm')
  await page.getByRole('button', { name: '확인하고 알람 등록', exact: true }).click()
  const receipt = await (await confirmResponse).json()
  assert.equal(receipt.outcome, 'registered')
  assert.equal(count(), 1)
  record({ step: 'alert_registered', receipt })
  await ask(`예정 비행 감시 ID ${receipt.alertId}의 알람 해제 변경안을 준비해 줘.`, 'prepare_flight_alert')
  const cancelResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/confirm')
  await page.getByRole('button', { name: '확인하고 알람 해제', exact: true }).click()
  const cancelled = await (await cancelResponse).json()
  assert.equal(cancelled.action, 'cancel')
  assert.equal(count(), 0)
  assert.ok(db.prepare('SELECT 1 FROM routes WHERE id=?').get(routeId))
  record({ step: 'alert_cancelled_original_preserved', receipt: cancelled })
  const generated = await ask(`다른 새 경로야. 김포에서 제주로 IFR FL310, TAS450kt, ${etd} UTC 출발로 새 경로와 기상 브리핑을 만들어 줘. 도착은 거리와 TAS로 계산해 줘.`, 'get_route_briefing')
  assert.ok(generated.cards.some(c => c.tool === 'plan_route'))
  const compared = await ask('방금 만든 경로의 FL310과 FL330 기상 자료를 비교해 줘. 안전한 고도 추천은 하지 마.', 'compare_route_altitudes')
  const card = compared.cards.find(c => c.tool === 'compare_route_altitudes')
  const facts = page.locator('.copilot-message.assistant').last().locator('details')
  await facts.locator('summary').click()
  const resultResponse = page.waitForResponse(r => new URL(r.url()).pathname === `/api/ai/results/${card.result.reference.briefingRef}`)
  await facts.getByRole('button', { name: '같은 결과 전체 보기', exact: true }).click()
  const openedResponse = await resultResponse
  assert.equal(openedResponse.status(), 200)
  const openedBundle = await openedResponse.json()
  await expect(page.getByRole('region', { name: '챗봇 보관 결과', exact: true })).toHaveAttribute('data-result-ref', card.result.reference.briefingRef)
  await page.screenshot({ path: path.join(output, 'stored-comparison.png') })
  record({ step: 'stored_comparison_opened', reference: card.result.reference })
  // While the frozen comparison is visible, "current screen" means that
  // result's flight inputs, not the saved editor underneath it. Close it before
  // asserting that the editor's explicit ETA survived the read-only overlay.
  assert.notEqual(openedBundle.request.eta, eta)
  await page.getByRole('button', { name: '닫기', exact: true }).last().click()
  await expect(page.getByRole('region', { name: '챗봇 보관 결과', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /도착.*RKPC/ })).toBeVisible()
  record({ step: 'stored_comparison_closed', frozenEta: openedBundle.request.eta, savedEta: eta })
  await page.getByRole('button', { name: '기상이에게 질문하기', exact: true }).click()
  await page.getByLabel('현재 화면 연결', { exact: true }).check()
  const registered = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/contexts' && r.request().method() === 'POST')
  const [current, contextResponse] = await Promise.all([
    ask('지금 화면에 적용된 저장 경로를 브리핑해 줘. 앞서 대화에서 새로 만든 경로가 아니라 현재 화면 경로 기준이야.', 'get_route_briefing'),
    registered,
  ])
  assert.equal(contextResponse.status(), 201)
  const body = contextResponse.request().postDataJSON()
  record({ step: 'applied_screen_request', request: body.request })
  assert.equal(body.request.etd, etd)
  assert.equal(body.request.eta, eta)
  assert.deepEqual(body.request.routeGeometry, snapshot.routeGeometry)
  const contextResult = await contextResponse.json()
  const currentCard = current.cards.find(c => c.tool === 'get_route_briefing')
  assert.equal(currentCard.result.reference.contextRef, contextResult.contextRef)
  record({ step: 'applied_screen_context', registered: contextResult, reference: currentCard.result.reference })
  await page.screenshot({ path: path.join(output, 'applied-screen-chat.png') })
  }
  console.log(JSON.stringify({ output, suite, status: 'passed', chats: events.filter(e => e.step === 'chat').length }))
} catch (error) {
  record({ step: 'failed', error: error.message })
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  console.error(JSON.stringify({ output, status: 'failed', error: error.message }))
  process.exitCode = 1
} finally {
  await browser?.close()
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode) return resolve()
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.kill('SIGTERM')
  })))
  db.close()
  for (const fd of logs) fs.closeSync(fd)
}
