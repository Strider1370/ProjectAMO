import { test, expect } from '../fixtures.mjs'
import { enterRouteTokens } from '../route-token-input.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

async function openRouteBriefing(page, isMobile, fixtureOptions) {
  // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
  // 소스의 상수를 그대로 쓴다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  // Precondition: route geometry is committed navdata; this installs deterministic
  // weather, terrain, altitude, and briefing responses because dev:test has none.
  const exposureRequests = await installRouteBriefingFixtures(page, fixtureOptions)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: isMobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
  return exposureRequests
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

async function completeWorkflow(page, rule, isMobile, { stopAtCompare = false, stopAtAltitude = false, expectedAltitude = /^FL90/ } = {}) {
  await setFlightRule(page, rule, isMobile)
  await selectAirport(page, '출발', 'RKSS', isMobile)
  await selectAirport(page, '도착', 'RKPK', isMobile)

  // 토큰이 확정될 때마다 반영되므로 적용 버튼이 없다. 공항은 위 선택기가 이미 넣었다.
  await enterRouteTokens(page, rule === 'IFR' ? ['SEL'] : ['DCT'])
  await expect(page.getByRole('button', { name: '경로비교로', exact: true })).toBeEnabled()

  await page.getByRole('button', { name: '경로비교로', exact: true }).click()
  await expect(page.getByText('기본 경로', { exact: true })).toBeVisible()
  if (stopAtCompare) return
  await page.getByRole('button', { name: '기본 경로로 고도 비교', exact: true }).click()

  await page.getByRole('spinbutton', { name: '계획 순항고도 (ft)', exact: true }).fill('9000')
  await page.getByRole('button', { name: isMobile ? '고도 비교 실행' : '고도 비교', exact: true }).click()
  const altitude = page.getByRole('button', { name: expectedAltitude })
  await expect(altitude).toBeVisible()
  await altitude.click()
  if (stopAtAltitude) return
  if (!isMobile) await page.getByRole('button', { name: '연직단면도 숨기고 지도 보기', exact: true }).click()
  await page.getByRole('button', { name: '브리핑 준비로', exact: true }).click()
  await expect(page.getByRole('region', { name: '브리핑 준비 요약', exact: true })).toBeVisible()
}

test.describe('route-workflow', () => {
  test('IFR flight setup progresses through route and altitude comparison to briefing preparation', async ({ page }, testInfo) => {
    const requests = await openRouteBriefing(page, testInfo.project.name === 'mobile')
    await completeWorkflow(page, 'IFR', testInfo.project.name === 'mobile')
    expect(requests.crossSection.count).toBe(0)
  })

  test('VFR flight setup progresses through the same preparation workflow', async ({ page }, testInfo) => {
    await openRouteBriefing(page, testInfo.project.name === 'mobile')
    await completeWorkflow(page, 'VFR', testInfo.project.name === 'mobile')
  })

  test('a route without AIP airway segments still compares weather at the entered altitude', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    await openRouteBriefing(page, isMobile, {
      altitudeResponse: {
        constraints: { status: 'not_applicable', routeFloorFt: null, routeCeilingFt: null },
        rows: [{
          altitudeFt: 9000,
          label: '9,000 ft',
          status: 'input_only',
          weatherStatus: 'available',
          wind: { averageKt: 12 },
          icing: { summary: { status: 'available', highestGrade: 0 } },
          turbulence: { summary: { status: 'available', highestGrade: 0 } },
          hazards: [],
          notams: [],
        }],
      },
    })
    await completeWorkflow(page, 'VFR', isMobile, { stopAtAltitude: true, expectedAltitude: /^9,000 ft/ })
    await expect(page.getByText('공표 고도 제약 미확인 · 입력 고도 기상만 표시', { exact: true })).toBeVisible()
  })

  test('mobile opens the vertical profile as a full-screen sheet', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'vertical profile full screen is mobile-only')
    await openRouteBriefing(page, true)
    await completeWorkflow(page, 'VFR', true, { stopAtAltitude: true })
    await page.getByRole('button', { name: '연직단면도 보기', exact: true }).click()
    const profile = page.getByRole('dialog', { name: '연직단면도', exact: true })
    await expect(profile).toBeVisible()
    await expect(profile.getByText('연직단면도', { exact: true })).toBeVisible()
    for (const label of ['이전 비교 고도', '다음 비교 고도', '이전 예보시간', '다음 예보시간', '닫기', '기온', '습도', '착빙', '바람', '난류', 'SIGMET/AIRMET']) {
      await expect(profile.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    expect(await profile.locator('.cross-section-toggle-group').evaluate((node) => {
      const style = getComputedStyle(node)
      return style.display === 'inline-flex' && style.flexWrap === 'nowrap' && node.scrollWidth <= node.clientWidth
    })).toBe(true)
  })

  test('alternative route edits issue one batch exposure request without another single request', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the edit request-count contract runs once on desktop')
    const exposureRequests = await openRouteBriefing(page, false)
    await completeWorkflow(page, 'IFR', false, { stopAtCompare: true })
    const singleBefore = [...exposureRequests.single.values()].reduce((sum, count) => sum + count, 0)
    const batchBefore = [...exposureRequests.batch.values()].reduce((sum, count) => sum + count, 0)
    // 우회안 생성 → 자동 선택 → 항로 문자열 편집칸 자동 표시(버튼 없이 선택 자체가 진입점).
    await page.getByRole('button', { name: '우회안 만들기', exact: true }).click()
    await expect(page.getByRole('button', { name: '적용', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '적용', exact: true }).click()
    await expect.poll(() => [...exposureRequests.batch.values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThan(batchBefore)
    expect([...exposureRequests.single.values()].reduce((sum, count) => sum + count, 0)).toBe(singleBefore)
  })
})
