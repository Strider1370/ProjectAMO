import { test, expect } from '../fixtures.mjs'
import { createBriefing } from '../briefing-flow.mjs'

// 지도형 브리핑(폭 1280 이상 기본): 패널·위험 막대·연직단면도 독, 문서형 전환, 따로 접기.
test.describe('map-briefing', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '지도형은 폭 1280 이상 데스크톱만')
  })

  test('opens the map briefing with panel, hazard ribbon and profile dock, and switches to the document view', async ({ page }) => {
    await createBriefing(page, { view: 'map' })
    const panel = page.getByRole('complementary', { name: '비행 전 브리핑' })
    await expect(panel).toBeVisible()
    await expect(panel.getByText('RKSS → RKPK')).toBeVisible()
    const ribbon = page.getByRole('group', { name: '경로상 위험 막대' })
    await expect(ribbon).toBeVisible()
    // 픽스처는 모델 단면이 없다: 난류·착빙은 "확인 불가"(짧게 '불가') 줄로 남고, 걸린 것이 없는 대류 줄은 빠진다.
    for (const label of ['난류', '착빙']) await expect(ribbon.getByText(label, { exact: true })).toBeVisible()
    await expect(ribbon.getByText('대류', { exact: true })).toHaveCount(0)
    await expect(ribbon.getByText('불가', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('group', { name: '연직단면도' })).toBeVisible()
    // 위험 막대 가로축이 아래 단면도 그림의 0NM~끝과 같은 세로선에 온다.
    await expect.poll(() => page.evaluate(() => {
      const track = document.querySelector('.mb-track').getBoundingClientRect()
      const svg = document.querySelector('.mb-profile-body .vertical-profile-plot-svg')
      const rect = svg.getBoundingClientRect()
      return [Math.round(track.left - (rect.left + Number(svg.dataset.plotLeft))), Math.round(track.right - (rect.left + Number(svg.dataset.plotRight)))]
    })).toEqual([0, 0])

    // 상단 버튼: 연직단면도 대신 브리핑(패널 켜기/끄기). 패널을 닫아도 독은 남는다.
    await expect(page.getByRole('button', { name: '연직단면도', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '브리핑 패널' }).click()
    await expect(panel).toHaveCount(0)
    await expect(ribbon).toBeVisible()
    await page.getByRole('button', { name: '브리핑 패널' }).click()
    await expect(panel).toBeVisible()

    // 문서형 ↔ 지도형
    await panel.getByRole('button', { name: '문서형 보기' }).click()
    await expect(page.locator('.briefing-view')).toBeVisible()
    await expect(ribbon).toHaveCount(0)
    await page.getByRole('button', { name: '지도형 보기' }).click()
    await expect(page.getByRole('group', { name: '경로상 위험 막대' })).toBeVisible()
  })

  test('folds the ribbon and the profile separately and remembers it', async ({ page }) => {
    await createBriefing(page, { view: 'map' })
    await page.getByRole('button', { name: '연직단면도 접기', exact: true }).click()
    await expect(page.getByRole('group', { name: '연직단면도' })).toHaveCount(0)
    await expect(page.getByRole('group', { name: '경로상 위험 막대' })).toBeVisible()
    await page.getByRole('button', { name: '경로상 위험 접기', exact: true }).click()
    await expect(page.getByRole('group', { name: '경로상 위험 막대' })).toHaveCount(0)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('projectamo.briefingDock')))
    expect(saved).toMatchObject({ ribbonOpen: false, profileOpen: false })
    // 독 전체 접기: 탭 하나만 남고, 누르면 원래대로.
    await page.getByRole('button', { name: '경로상 위험·연직단면도 접기' }).click()
    await expect(page.getByRole('region', { name: '경로상 위험과 연직단면도' })).toHaveCount(0)
    await page.getByRole('button', { name: '경로상 위험·연직단면도 펼치기' }).click()
    await expect(page.getByRole('region', { name: '경로상 위험과 연직단면도' })).toBeVisible()
  })
})
