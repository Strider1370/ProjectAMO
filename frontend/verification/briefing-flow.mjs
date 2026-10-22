import { enterRouteTokens } from './route-token-input.mjs'
import { installRouteBriefingFixtures } from './route-fixture.mjs'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

// RKSS→RKPK(SEL) 경로로 브리핑을 만든다. view: 'document'(기존 BriefingView) | 'map'(지도형, 폭 1280 이상 기본).
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
  // 모바일 패널은 라벨이 짧다("출발 선택") — 데스크톱은 "출발 공항 선택".
  await page.getByRole('button', { name: /^출발(\s공항)?\s선택$/ }).click()
  await page.getByRole('button', { name: /RKSS$/ }).click()
  await page.getByRole('button', { name: /^도착(\s공항)?\s선택$/ }).click()
  await page.getByRole('button', { name: /RKPK$/ }).click()
  // 토큰이 확정될 때마다 반영되므로 적용 버튼이 없다.
  await enterRouteTokens(page, ['SEL'])
  await page.getByRole('button', { name: '경로비교로', exact: true }).click()
  await page.getByRole('button', { name: '기본 경로로 고도 비교', exact: true }).click()
  await page.getByRole('spinbutton', { name: '계획 순항고도 (ft)', exact: true }).fill('9000')
  await page.getByRole('button', { name: '고도 비교', exact: true }).click()
  // 고도 비교는 선택 사항이다. 비교 카드가 뜨면 고도를 고르고, 안 뜨면(모바일에서
  // 관측되는 상태) 그대로 다음 단계로 간다 — 브리핑 생성 자체는 순항고도만 있으면 된다.
  const flOption = page.getByRole('button', { name: /^FL90/ })
  const comparisonOptional = page.getByText('고도 비교는 선택 사항입니다.', { exact: false })
  await flOption.or(comparisonOptional).first().waitFor()
  if (await flOption.count()) {
    await flOption.click()
    await page.getByRole('button', { name: '연직단면도 닫기', exact: true }).click()
  }
  await page.getByRole('button', { name: '브리핑 준비로', exact: true }).click()
  await page.getByRole('button', { name: '브리핑 생성', exact: true }).click()
  return requests
}
