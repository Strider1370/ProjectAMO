import { test, expect } from '../fixtures.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'

async function openRouteBriefing(page, isMobile) {
  await page.addInitScript(() => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
  })
  // Precondition: route geometry is committed navdata; this installs deterministic
  // weather, terrain, altitude, and briefing responses because dev:test has none.
  await installRouteBriefingFixtures(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: isMobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
}

async function selectAirport(page, field, airport, isMobile) {
  await page.getByRole('button', { name: isMobile ? `${field} 선택` : `${field} 공항 선택`, exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`${airport}$`) }).click()
}

async function setFlightRule(page, rule, isMobile) {
  const control = isMobile
    ? page.getByRole('button', { name: rule, exact: true })
    : page.getByRole('tab', { name: rule, exact: true })
  await control.click()
}

async function completeWorkflow(page, rule, isMobile, { stopAtAltitude = false } = {}) {
  await setFlightRule(page, rule, isMobile)
  await selectAirport(page, '출발', 'RKSS', isMobile)
  await selectAirport(page, '도착', 'RKPK', isMobile)

  const routeDraft = page.getByRole('textbox', {
    name: rule === 'IFR' ? /en-route 경로|예: OSPAT/ : (isMobile ? /VFR 초안 경로/ : /예: RKSI DCT GONAX DCT RKPK/),
  })
  await routeDraft.fill(rule === 'IFR' ? 'SEL' : 'RKSS DCT RKPK')
  await page.getByRole('button', { name: '경로 적용', exact: true }).click()
  await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()

  await page.getByRole('button', { name: '경로비교로', exact: true }).click()
  await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '기본 경로로 고도 비교', exact: true }).click()

  await page.getByRole('spinbutton', { name: '계획 순항고도 (ft)', exact: true }).fill('9000')
  await page.getByRole('button', { name: isMobile ? '고도 비교 실행' : '고도 비교', exact: true }).click()
  const flightLevel = page.getByRole('button', { name: /^FL90/ })
  await expect(flightLevel).toBeVisible()
  await flightLevel.click()
  if (stopAtAltitude) return
  if (!isMobile) await page.getByRole('button', { name: '연직단면도 숨기고 지도 보기', exact: true }).click()
  await page.getByRole('button', { name: '브리핑 준비로', exact: true }).click()
  await expect(page.getByRole('region', { name: '브리핑 준비 요약', exact: true })).toBeVisible()
}

test.describe('route-workflow', () => {
  test('IFR flight setup progresses through route and altitude comparison to briefing preparation', async ({ page }, testInfo) => {
    await openRouteBriefing(page, testInfo.project.name === 'mobile')
    await completeWorkflow(page, 'IFR', testInfo.project.name === 'mobile')
  })

  test('VFR flight setup progresses through the same preparation workflow', async ({ page }, testInfo) => {
    await openRouteBriefing(page, testInfo.project.name === 'mobile')
    await completeWorkflow(page, 'VFR', testInfo.project.name === 'mobile')
  })

  test('mobile opens the vertical profile as a full-screen sheet', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'vertical profile full screen is mobile-only')
    await openRouteBriefing(page, true)
    await completeWorkflow(page, 'VFR', true, { stopAtAltitude: true })
    await page.getByRole('button', { name: '연직단면도 보기', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '연직단면도', exact: true })).toBeVisible()
  })
})
