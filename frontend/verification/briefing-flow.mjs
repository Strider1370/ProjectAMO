import { enterRouteTokens } from './route-token-input.mjs'
import { installRouteBriefingFixtures } from './route-fixture.mjs'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

// RKSS→RKPK(SEL) 경로로 브리핑을 만든다. view: 'document'(기존 BriefingView) | 'map'(지도형, 폭 1024 이상 기본).
export async function createBriefing(page, { view = 'document', patchBriefing = null } = {}) {
  const requests = await installRouteBriefingFixtures(page, { patchBriefing })
  // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
  // 소스의 상수를 그대로 쓴다.
  await page.addInitScript(({ version, briefingView }) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
    localStorage.setItem('projectamo.briefingView', briefingView)
  }, { version: CURRENT_VERSION, briefingView: view })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  // 진입점이 화면 크기마다 다르다: 데스크톱은 사이드바 "비행 전 브리핑",
  // 모바일은 사이드바가 숨으므로 하단 "주요 작업" 탭의 "브리핑".
  const desktopEntry = page.getByRole('button', { name: '비행 전 브리핑', exact: true })
  const mobileEntry = page.getByRole('navigation', { name: '주요 작업' })
    .getByRole('button', { name: '브리핑', exact: true })
  await desktopEntry.or(mobileEntry).first().click()
  await page.getByRole('button', { name: /^출발 공항 선택$/ }).click()
  await page.getByRole('button', { name: /RKSS$/ }).click()
  await page.getByRole('button', { name: /^목적 공항 선택$/ }).click()
  await page.getByRole('button', { name: /RKPK$/ }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await enterRouteTokens(page, ['SEL'])
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.getByRole('spinbutton', { name: '순항고도 (ft)', exact: true }).fill('9000')
  await page.getByRole('button', { name: '브리핑 보기', exact: true }).click()
  return requests
}
