import { test, expect } from '../fixtures.mjs'
import { createRf151FrontendRetentionFixture } from '../rf151-frontend-retention-fixture.mjs'

test.describe('rf151-frontend-retention', () => {
  test('an old tab gets its one retained lazy chunk while a new tab gets the new index', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '배포 세대 전환은 하나의 Chromium 탭 쌍으로 확인한다')

    const fixture = await createRf151FrontendRetentionFixture()
    try {
      await page.goto(fixture.baseUrl)
      await expect(page.getByRole('heading', { name: 'Old build index' })).toBeVisible()

      fixture.deployNewBuild()

      await page.getByRole('button', { name: 'Load old lazy chunk' }).click()
      await expect(page.locator('#lazy-result')).toHaveText('old lazy chunk from dist.previous')

      const newContext = await browser.newContext()
      const newPage = await newContext.newPage()
      try {
        await newPage.goto(`${fixture.baseUrl}/index.html`)
        await expect(newPage.getByRole('heading', { name: 'New build index' })).toBeVisible()
        await expect(newPage.locator('#new-entry-result')).toHaveText('new entry from dist')
      } finally {
        await newContext.close()
      }

      expect(fixture.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ pathname: '/assets/old-lazy.js', source: 'previous-asset', status: 200 }),
        expect.objectContaining({ pathname: '/index.html', generation: 'new', source: 'current-index', status: 200 }),
        expect.objectContaining({ pathname: '/assets/new-entry.js', generation: 'new', source: 'current-asset', status: 200 }),
      ]))
    } finally {
      await fixture.close()
    }
  })
})
