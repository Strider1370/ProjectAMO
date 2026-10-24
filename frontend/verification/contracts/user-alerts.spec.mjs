import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

const ID = 'b6996040-16a8-4580-a230-04eb66b9b756'
const now = new Date().toISOString()
const rules = {
  visibility: { enabled: true, threshold: 1500 }, ceiling: { enabled: false, threshold: 500 },
  wind: { enabled: false, threshold: 25 }, gust: { enabled: false, threshold: 35 },
  temperature: { enabled: false, threshold: 30, direction: 'above' },
  windshear: { enabled: false }, fzra: { enabled: false },
  tafNew: { enabled: true }, tafAmd: { enabled: true }, airportWarning: { enabled: true },
  lightning: { enabled: true, radiusKm: 10, windowMinutes: 30, minCount: 1 },
  channels: { popup: true, push: false },
}
const run = { id: ID, targetType: 'airport', targetId: 'RKSI', airportName: '인천국제공항',
  scenario: 'metar', kind: 'metar', test: true, createdAt: now, expiresAt: now,
  pushStatus: 'not_requested', payload: { title: '인천국제공항 관측 임계값', observedAt: now,
    metrics: [{ key: 'visibility', label: '시정', value: 1499, unit: 'm', threshold: 1500, direction: 'below' }] } }

async function installApi(page) {
  await page.addInitScript((version) => { localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 901, username: 'alert-test', role: 'pilot' } }))
  await page.route('**/api/me/airport-watches', (route) => route.fulfill({ json: {
    defaults: rules, watches: [{ icao: 'RKSI', enabled: true, rules, lastEvaluatedAt: now }],
  } }))
  await page.route('**/api/me/route-alert-watches', (route) => route.fulfill({ json: { watches: [], routes: [] } }))
  await page.route('**/api/me/alert-tests/latest?*', (route) => route.fulfill({ json: { test: null } }))
  await page.route(`**/api/me/alert-tests/${ID}`, (route) => route.fulfill({ json: { test: run } }))
  await page.route('**/api/me/alert-tests', (route) => route.fulfill({ status: 201, json: { test: run } }))
  await page.route('**/api/me/notifications', (route) => route.fulfill({ json: { notifications: [], unreadCount: 0 } }))
}

test('user-alerts: 공항 종에서 설정 패널을 열고 시험 알림 상세로 이동한다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'PC 팝업은 데스크톱 전용(휴대폰은 푸시로 받는다)')
  await installApi(page)
  await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '인천국제공항 알림 설정' }).click()
  const panel = page.getByRole('dialog', { name: '알림 관리' })
  await expect(panel).toBeVisible()
  // 공항 종은 그 공항의 편집 화면을 바로 연다.
  await expect(panel.getByRole('heading', { name: '인천국제공항' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('alert-settings-desktop.png') })
  await panel.getByRole('button', { name: '내 기기로 시험 받기' }).click()
  const toast = page.getByRole('alert', { name: '새 공항 알림' })
  await expect(toast).toContainText('테스트 · 모의 자료')
  await expect(toast).toContainText('시정 기준 미달')
  await toast.getByRole('button', { name: '시험 내용 보기' }).click()
  const detail = page.getByRole('dialog', { name: '시험 알림 상세' })
  await expect(detail).toContainText('시정')
  await expect(detail).toContainText('1499m')
  await expect(detail).toContainText('현재 공항 실황과 다릅니다')
})

test('user-alerts: 휴대폰 푸시 딥링크에서 모의 자료를 끝까지 읽는다', async ({ page }, testInfo) => {
  await installApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/?alertTest=${ID}`, { waitUntil: 'domcontentloaded' })
  const detail = page.getByRole('dialog', { name: '시험 알림 상세' })
  await expect(detail).toContainText('테스트 · 모의 자료')
  await expect(detail).toContainText('시정')
  await expect(detail).toContainText('설정 기준 1500m 미만')
  await page.screenshot({ path: testInfo.outputPath('alert-test-mobile.png') })
  expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
})

test('user-alerts: 경로 종에서 해당 경로 SIGMET 설정을 바로 연다', async ({ page }, testInfo) => {
  await installApi(page)
  const route = { id: 73, name: '김포 → 제주', snapshot: {
    routeGeometry: { type: 'LineString', coordinates: [[126.8, 37.5], [126.5, 33.5]] },
    etd: new Date(Date.now() + 3_600_000).toISOString(),
    eta: new Date(Date.now() + 10_800_000).toISOString(), cruiseAltitudeFt: 18000,
  } }
  await page.route('**/api/me/route-alert-watches', (request) => request.fulfill({ json: { watches: [], routes: [route] } }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-alert-panel', {
    detail: { view: 'settings', routeId: 73 },
  })))
  const panel = page.getByRole('dialog', { name: '알림 관리' })
  // 경로 종은 그 경로의 감시 편집을 바로 연다(공항 편집은 열리지 않는다).
  await expect(panel.getByRole('heading', { name: '김포 → 제주' })).toBeVisible()
  await expect(panel.getByText('미설정', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '이 경로 감시 시작' })).toBeVisible()
  await expect(panel.getByRole('heading', { name: '인천국제공항' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('route-alert-settings.png') })
})

test('user-alerts: 경로 감시를 삭제하면 설정 목록에서 빠지고 이력 보존 안내가 나온다', async ({ page }) => {
  await installApi(page)
  const route = { id: 73, name: '김포 → 제주', snapshot: {
    routeGeometry: { type: 'LineString', coordinates: [[126.8, 37.5], [126.5, 33.5]] },
    etd: new Date(Date.now() + 3_600_000).toISOString(),
    eta: new Date(Date.now() + 10_800_000).toISOString(), cruiseAltitudeFt: 18000,
  } }
  let deleted = false
  await page.route('**/api/me/route-alert-watches', (request) => request.fulfill({ json: {
    routes: [route], watches: deleted ? [] : [{ id: 81, routeId: route.id, routeName: route.name,
      snapshot: route.snapshot, enabled: true }],
  } }))
  await page.route('**/api/me/route-alert-watches/81', (request) => {
    deleted = true
    return request.fulfill({ json: { ok: true } })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-alert-panel', {
    detail: { view: 'settings', routeId: 73 },
  })))
  const panel = page.getByRole('dialog', { name: '알림 관리' })
  await panel.getByRole('button', { name: '감시 삭제' }).click()
  await expect(panel.getByRole('status')).toContainText('발생 이력은 유지됩니다')
  await expect(panel.getByText('미설정', { exact: true })).toBeVisible()
})

test('user-alerts: 휴대폰 TAF 시험 푸시를 누르면 저장된 전문 전체가 보인다', async ({ page }) => {
  await installApi(page)
  const report = `TAF RKSI 230300Z 2306/2412 24006KT 9999 SCT030\n${'TEMPO 2306/2310 3000 -FZRA BKN008\n'.repeat(20)}BECMG 2410/2412 30012KT CAVOK`
  await page.route(`**/api/me/alert-tests/${ID}`, (route) => route.fulfill({ json: { test: {
    ...run, scenario: 'taf_amd', kind: 'taf', payload: { reportType: 'AMD', textSource: 'raw',
      issuedAt: now, validFrom: now, validTo: new Date(Date.now() + 36e5).toISOString(), text: report },
  } } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/?alertTest=${ID}`, { waitUntil: 'domcontentloaded' })
  const detail = page.getByRole('dialog', { name: '시험 알림 상세' })
  await expect(detail).toContainText('TAF AMD')
  await expect(detail.locator('pre')).toContainText('BECMG 2410/2412 30012KT CAVOK')
  expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
})

test('user-alerts: 휴대폰 경로 SIGMET 시험 푸시에서 유효기간과 교차 구간을 확인한다', async ({ page }) => {
  await installApi(page)
  await page.route(`**/api/me/alert-tests/${ID}`, (route) => route.fulfill({ json: { test: {
    ...run, targetType: 'route', targetId: '73', routeId: 73, airportName: null,
    scenario: 'sigmet', kind: 'sigmet', payload: { routeName: '김포 → 제주', phenomenon: '뇌우 SIGMET',
      validFrom: now, validTo: new Date(Date.now() + 36e5).toISOString(),
      intersectFromNm: 42, intersectToNm: 61, altitudeStatus: 'matched' },
  } } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/?alertTest=${ID}`, { waitUntil: 'domcontentloaded' })
  const detail = page.getByRole('dialog', { name: '시험 알림 상세' })
  await expect(detail).toContainText('김포 → 제주')
  await expect(detail).toContainText('뇌우 SIGMET')
  await expect(detail).toContainText('42.0–61.0 NM')
  await expect(detail).toContainText('계획 고도와 겹침')
})

test('user-alerts: 비로그인 상태에서 공항 설정의 로그인 창이 알림 패널 위에 열린다', async ({ page }) => {
  await installApi(page)
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }))
  await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '인천국제공항 알림 설정' }).click()
  await page.getByRole('dialog', { name: '알림 관리' }).getByRole('button', { name: '로그인' }).click()
  const auth = page.getByRole('dialog', { name: '계정' })
  await expect(auth).toBeVisible()
  await page.keyboard.press('Tab')
  expect(await auth.evaluate((node) => node.contains(document.activeElement))).toBe(true)
})

test('user-alerts: 공항 패널 종 버튼이 감시 여부를 글자로 보인다', async ({ page }) => {
  await installApi(page)
  await page.goto('/?airport=RKSI', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '인천국제공항 알림 설정 · 감시 중' })).toContainText('알림 감시 중')
  await page.goto('/?airport=RKSS', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '김포국제공항 알림 설정', exact: true })).toContainText('알림 설정')
})

test('user-alerts: 다른 공항을 이미 감시해도 누른 공항의 설정이 먼저 열린다', async ({ page }) => {
  await installApi(page)
  await page.goto('/?airport=RKSS', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '김포국제공항 알림 설정' }).click()
  const panel = page.getByRole('dialog', { name: '알림 관리' })
  await expect(panel.getByRole('heading', { name: '김포국제공항' })).toBeVisible()
  await expect(panel.getByText('미등록', { exact: true })).toBeVisible()
})
