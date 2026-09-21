import { fileURLToPath } from 'node:url'
import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { createPersonalMap, deleteCurrentMap } from './my-map-helpers.mjs'

const KMZ = fileURLToPath(new URL('../../test/fixtures/my-map/folders.kmz', import.meta.url))
async function open(page) {
  await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  if (page.viewportSize().width < 720) await page.getByRole('button', { name: '더보기', exact: true }).click()
  await page.getByRole('button', { name: '내 지도', exact: true }).click()
}

test('my-map 진입 재설계: 빈 상태·파일 미리보기 취소·잘못된 파일·열기', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  await open(page)
  await expect(page.locator('.my-map-start-choice')).toHaveCount(2)
  await expect(page.getByRole('searchbox', { name: '지도 검색', exact: true })).toHaveCount(0)
  await expect(page.locator('.my-map-panel-content')).not.toContainText('기관')
  await page.screenshot({ path: testInfo.outputPath('empty-start.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '파일 불러오기', exact: true }).click()
  await page.getByTestId('my-map-file').setInputFiles({ name: 'broken.kml', mimeType: 'text/xml', buffer: Buffer.from('not xml') })
  await expect(page.locator('.my-map-error')).toBeVisible()
  await expect(page.getByRole('button', { name: '지도에서 보기', exact: true })).toHaveCount(0)
  await page.getByTestId('my-map-file').setInputFiles(KMZ)
  await expect(page.getByRole('region', { name: '지도 파일 확인' })).toContainText('3개 항목')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('my_map_files') || '{"files":[]}').files.length)).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('file-review.png'), animations: 'disabled' })
  await page.locator('.my-map-panel, .mobile-sheet').getByRole('button', { name: '내 지도', exact: true }).click()
  await expect(page.locator('.my-map-start-choice')).toHaveCount(2)
  await page.getByRole('button', { name: '파일 불러오기', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '파일 선택', exact: true }).click()
  await (await chooser).setFiles(KMZ)
  await page.getByRole('button', { name: '지도에서 보기', exact: true }).click()
  await expect(page.getByTestId('my-map-tree')).toBeVisible()
  await expect(page.getByRole('button', { name: '사본 만들어 편집', exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('my_map_files')).files.length)).toBe(1)
  await deleteCurrentMap(page)
  await expect(page.locator('.my-map-start-choice')).toHaveCount(2)
})

test('my-map 진입 재설계: 이름 단계 없이 기존 편집·완료·마지막 지도 삭제', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '지도 클릭 좌표가 고정된 작성 계약')
  await open(page)
  await createPersonalMap(page, '새 흐름 지도')
  await expect(page.getByRole('region', { name: '내 지도 편집', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '새 지도', exact: true })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: '지점 연속 추가' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '추가할 그룹' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('empty-editor.png'), animations: 'disabled' })
  await page.waitForFunction(() => window.__map?.getLayer('my-map-edit-line'))
  await page.getByRole('button', { name: '점', exact: true }).click()
  await page.locator('.mapboxgl-canvas').click({ position: { x: 780, y: 330 } })
  await expect(page.getByRole('region', { name: '항목 속성 수정', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '편집 마침', exact: true }).click()
  await expect(page.locator('.my-map-panel h1')).toHaveText('새 흐름 지도')
  await expect(page.getByRole('button', { name: '기관에 공유' })).toHaveCount(0)
  await deleteCurrentMap(page)
  await expect(page.locator('.my-map-start-choice')).toHaveCount(2)
})

test('my-map 진입 재설계: 로그인해도 기관 지도 자동 조회와 공유 UI 없음', async ({ page }) => {
  const requested = []
  page.on('request', request => { if (/\/api\/organizations\/[^/]+\/maps/.test(request.url())) requested.push(request.url()) })
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 9191, username: 'map-entry', status: 'active', role: 'user' } } }))
  await page.route('**/api/me/maps', route => route.fulfill({ json: { maps: [] } }))
  await page.route('**/api/me/organizations', route => route.fulfill({ json: { organizations: [{ id: 77, name: '소속 기관', role: 'admin' }] } }))
  await open(page)
  await expect(page.getByRole('button', { name: '새 지도 그리기', exact: true })).toBeEnabled()
  await expect(page.locator('.my-map-panel-content')).not.toContainText('기관')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  expect(requested).toEqual([])
})
