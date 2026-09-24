import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { createDb } from '../../../backend/src/db/index.js'
import { createAlertTools } from '../../../backend/src/ai/alert-tools.js'

async function setup(page, { cancel = false, list = false, lostResponse = false } = {}) {
  const db = createDb(':memory:')
  let clock = Date.now()
  const now = () => clock
  const source = { version: 3, base: { routeForm: { flightRule: 'IFR', departureAirport: 'RKSS', arrivalAirport: 'RKPC' } },
    cruiseAltitudeFt: 31000, routeGeometry: { type: 'LineString', coordinates: [[126.79, 37.55], [126.49, 33.5]] } }
  db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(901,?,?,?)').run('contract', 'unused', new Date(clock).toISOString())
  const routeId = Number(db.prepare('INSERT INTO routes(user_id,name,payload,created_at,updated_at) VALUES(901,?,?,?,?)')
    .run('알람 테스트 원본', JSON.stringify(source), new Date(clock).toISOString(), new Date(clock).toISOString()).lastInsertRowid)
  const tools = createAlertTools({ database: () => db, now })
  const args = { action: 'register', route_id: routeId, etd: new Date(clock + 12 * 3600_000).toISOString(), eta: new Date(clock + 13 * 3600_000).toISOString() }
  let result = await tools.call('prepare_flight_alert', args, 'user:901')
  let alertId
  if (cancel || list) {
    alertId = tools.confirm({ confirmationToken: result.data.confirmationToken, decision: 'confirm' }, 'user:901').alertId
    if (list) {
      const second = await tools.call('prepare_flight_alert', { action: 'register', route_id: routeId,
        etd: new Date(clock + 15 * 3600_000).toISOString() }, 'user:901')
      tools.confirm({ confirmationToken: second.data.confirmationToken, decision: 'confirm' }, 'user:901')
      result = await tools.call('list_my_flight_alerts', {}, 'user:901')
    } else result = await tools.call('prepare_flight_alert', { action: 'cancel', alert_id: alertId }, 'user:901')
  }
  expect(result.status).toBe('ok')
  let requests = [], chatCalls = 0
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 901, username: 'contract', role: 'pilot' } }))
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true, ready: true } }))
  await page.route('**/api/ai/conversations', (route) => route.fulfill({ json: { conversationId: 'alerts-contract', revision: 0 } }))
  await page.route('**/api/ai/chat', (route) => {
    chatCalls++
    const body = route.request().postDataJSON()
    return route.fulfill({ json: { requestId: body.requestId, revision: body.revision + 1, status: 'completed',
      text: '확인한 뒤 실행해 주세요.', cards: [{ tool: list ? 'list_my_flight_alerts' : 'prepare_flight_alert', result }],
      context: body.context, displayTimezone: body.displayTimezone } })
  })
  await page.route('**/api/ai/confirm', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    try {
      const receipt = tools.confirm(body, 'user:901')
      if (lostResponse && requests.length === 1) return route.abort('failed')
      return route.fulfill({ json: receipt })
    } catch (error) { return route.fulfill({ status: error.status ?? 500, json: { error: error.code ?? 'CONFIRMATION_FAILED' } }) }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '기상이에게 질문하기' }).click()
  await page.getByLabel('현재 화면 연결', { exact: true }).uncheck()
  await page.getByLabel('기상이에게 질문', { exact: true }).fill('알람 변경안 준비')
  await page.getByRole('button', { name: '전송', exact: true }).click()
  return { db, routeId, alertId, requests, calls: () => chatCalls, advance: (ms) => { clock += ms },
    count: () => db.prepare('SELECT COUNT(*) n FROM routes WHERE alert_enabled=1').get().n }
}

test.describe('copilot-personal-alerts', () => {
  test('registration needs an explicit click; lost response retry reuses the same token without duplicate alert or model calls', async ({ page }, info) => {
    const x = await setup(page, { lostResponse: true })
    try {
      const card = page.getByRole('region', { name: '알람 변경 확인' })
      await expect(card).toContainText('출발 6시간 전')
      expect(x.count()).toBe(0)
      expect(x.requests).toHaveLength(0)
      await page.screenshot({ path: info.outputPath('copilot-alert-confirmation.png') })
      await page.getByRole('button', { name: '확인하고 알람 등록', exact: true }).click()
      await expect(card.getByRole('alert')).toContainText('이미 실행됐을 수도 있습니다')
      expect(x.count()).toBe(1)
      await page.getByRole('button', { name: '같은 요청 결과 확인·재시도', exact: true }).click()
      await expect(card.getByRole('status')).toContainText('이미 처리된 요청의 결과')
      expect(x.requests).toHaveLength(2)
      expect(x.requests[0]).toEqual(x.requests[1])
      expect(x.count()).toBe(1)
      expect(x.calls()).toBe(1)
      expect(x.db.prepare('SELECT payload FROM routes WHERE id=?').get(x.routeId)).toBeTruthy()
    } finally { x.db.close() }
  })

  test('cancelling a proposal does not register an alert', async ({ page }) => {
    const x = await setup(page)
    try {
      await page.getByRole('button', { name: '알람 변경안 취소', exact: true }).click()
      await expect(page.getByRole('region', { name: '알람 변경 확인' }).getByRole('status')).toContainText('알람은 바꾸지 않았습니다')
      expect(x.requests[0].decision).toBe('cancel')
      expect(x.count()).toBe(0)
    } finally { x.db.close() }
  })

  test('expiry is an explicit failure, never successful registration', async ({ page }) => {
    const x = await setup(page)
    try {
      x.advance(6 * 60_000)
      await page.getByRole('button', { name: '확인하고 알람 등록', exact: true }).click()
      await expect(page.getByRole('region', { name: '알람 변경 확인' }).getByRole('alert')).toContainText('유효기간이 지났어요')
      expect(x.count()).toBe(0)
    } finally { x.db.close() }
  })

  test('changed source requires a new review instead of silently registering changed conditions', async ({ page }) => {
    const x = await setup(page)
    try {
      x.db.prepare('UPDATE routes SET name=? WHERE id=?').run('수정된 원본', x.routeId)
      await page.getByRole('button', { name: '확인하고 알람 등록', exact: true }).click()
      const card = page.getByRole('region', { name: '알람 변경 확인' })
      await expect(card.getByRole('alert')).toContainText('저장 원본이 바뀌었어요')
      await expect(card.getByRole('button', { name: '같은 요청 결과 확인·재시도' })).toHaveCount(0)
      expect(x.count()).toBe(0)
    } finally { x.db.close() }
  })

  test('lost proposal-cancellation response replays cancellation without registering', async ({ page }) => {
    const x = await setup(page, { lostResponse: true })
    try {
      await page.getByRole('button', { name: '알람 변경안 취소', exact: true }).click()
      await page.getByRole('button', { name: '같은 요청 결과 확인·재시도', exact: true }).click()
      await expect(page.getByRole('region', { name: '알람 변경 확인' }).getByRole('status')).toContainText('알람은 바꾸지 않았습니다')
      expect(x.requests).toHaveLength(2)
      expect(x.requests[0]).toEqual(x.requests[1])
      expect(x.requests[1].decision).toBe('cancel')
      expect(x.count()).toBe(0)
    } finally { x.db.close() }
  })

  test('cancelling a selected monitoring copy preserves the saved original and notification history', async ({ page }) => {
    const x = await setup(page, { cancel: true })
    try {
      x.db.prepare('INSERT INTO triggered_alerts(user_id,route_id,type,severity,dedup_key,detected_at) VALUES(?,?,?,?,?,?)')
        .run(901, x.alertId, 'CEIL', 'HIGH', 'contract', new Date().toISOString())
      const card = page.getByRole('region', { name: '알람 변경 확인' })
      await expect(card).toContainText(`감시 #${x.alertId}`)
      expect(x.count()).toBe(1)
      await page.getByRole('button', { name: '확인하고 알람 해제', exact: true }).click()
      await expect(card.getByRole('status')).toContainText('알림 이력은 보존하고 감시만 해제')
      expect(x.count()).toBe(0)
      expect(x.db.prepare('SELECT 1 FROM routes WHERE id=?').get(x.routeId)).toBeTruthy()
      expect(x.db.prepare('SELECT COUNT(*) n FROM triggered_alerts').get().n).toBe(1)
    } finally { x.db.close() }
  })

  test('same original with multiple ETDs shows separate monitoring IDs and only composes a selection question', async ({ page }) => {
    const x = await setup(page, { list: true })
    try {
      const card = page.getByRole('region', { name: '내 예정 비행 알람' })
      await expect(card.getByRole('button', { name: /해제 질문 작성/ })).toHaveCount(2)
      await card.getByRole('button', { name: `감시 #${x.alertId} 해제 질문 작성` }).click()
      await expect(page.getByLabel('기상이에게 질문', { exact: true })).toHaveValue(`예정 비행 알람 ID ${x.alertId}의 해제 변경안을 준비해 줘`)
      expect(x.count()).toBe(2)
      expect(x.requests).toHaveLength(0)
    } finally { x.db.close() }
  })
})
