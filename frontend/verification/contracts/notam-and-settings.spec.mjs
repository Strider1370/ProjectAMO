import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
import { hydrateNotamSnapshot } from '../../../shared/notam-fields.js'

async function openApp(page) {
  // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
  // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
  // 소스의 상수를 그대로 쓴다.
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
    localStorage.setItem('time_zone', 'KST')
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

async function openSettings(page, isMobile) {
  if (isMobile) {
    await page.getByRole('button', { name: '더보기', exact: true }).click()
    await page.getByRole('button', { name: '설정', exact: true }).click()
  } else {
    // 접힌 데스크톱 사이드바의 첫 설정 버튼은 유틸리티 메뉴를 여는 동작이다.
    // 메뉴 안의 설정 항목이 SettingsModal의 실제 진입점이다.
    await page.locator('.sidebar-collapsed-utility > .sidebar-icon-button[aria-label="설정"]').click()
    await page.getByRole('group', { name: '알림, 도움말 및 앱 설정' }).getByRole('button', { name: '설정', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible()
}

test.describe('notam-and-settings', () => {
  test('current-only filters the list and map by D) and keeps uncertain schedules discoverable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Existing NOTAM panel entry is desktop/tablet only.')
    const polygon = { type: 'Polygon', coordinates: [[[126, 35], [127, 35], [127, 36], [126, 36], [126, 35]]] }
    const item = (id, summary, { start = '2611060000', end = '2611070000', schedule, altitude = 'F)SFC G)1200FT AMSL' } = {}) => ({
      id, category: 'restricted', scope: 'fir', location: 'RKRR', geometry: polygon,
      rawText: `(${id} NOTAMN\nQ)RKRR/QRTCA/IV/BO/W/000/012/3530N12630E050\nA)RKRR B)${start} C)${end}\n${schedule ? `D)${schedule}\n` : ''}E)${summary}\n${altitude})`,
    })
    const payload = hydrateNotamSnapshot({ fetched_at: '2026-11-06T12:00:00Z', horizon_hours: 24, items: [
      item('A0001/26', 'Active test restriction', { schedule: '0900-1300' }),
      item('A0002/26', 'Outside activity window', { schedule: '1400-1500' }),
      item('A0003/26', 'Future validity', { start: '2611070000', end: '2611080000' }),
      item('A0004/26', 'Unknown activity schedule', { schedule: 'MON-FRI SR-SS' }),
      item('A0005/26', 'Expired restriction', { end: '2611061200' }),
      item('A0006/26', 'Mixed altitude reference', { altitude: 'F)1000FT AGL G)6000FT AMSL' }),
    ] })
    await page.route('**/api/notam', route => route.fulfill({ json: payload }))
    await page.route('**/api/demo-mode', route => route.fulfill({ json: { on: false, now: '2026-11-06T12:00:30Z' } }))
    await openApp(page)
    await page.getByRole('button', { name: 'NOTAM', exact: true }).click()
    const panel = page.getByLabel('NOTAM 패널')
    await expect(panel.locator('.notam-row')).toHaveCount(5)
    await expect(panel.getByText('Expired restriction', { exact: true })).toHaveCount(0)
    await expect(panel.getByText('1,000FT AGL–6,000FT AMSL', { exact: true })).toBeVisible()
    const master = panel.getByRole('switch', { name: '지도에 NOTAM 표시' })
    if (await master.getAttribute('aria-checked') !== 'true') await master.click()
    const active = panel.getByRole('button', { name: '지금 유효한 NOTAM만', exact: true })
    await active.click()
    await expect(active).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.locator('.notam-row')).toHaveCount(2)
    await expect(panel.getByRole('button', { name: '시간 확인 1건 보기' })).toBeVisible()
    const mapIds = () => page.evaluate(() => {
      const source = window.__map?.getSource('notam-src')
      return (source?._data?.features || []).map(feature => feature.properties.id).sort()
    })
    await expect.poll(mapIds).toEqual(['A0001/26', 'A0006/26'])
    for (const label of ['남색', '녹색']) {
      await page.locator('.basemap-switcher-toggle').click()
      await page.getByRole('menuitemradio', { name: label }).click()
      await expect.poll(mapIds, { timeout: 15000 }).toEqual(['A0001/26', 'A0006/26'])
    }
    await page.screenshot({ path: testInfo.outputPath('notam-current-only.png') })
    await panel.getByRole('button', { name: '시간 확인 1건 보기' }).click()
    await expect(active).toHaveAttribute('aria-pressed', 'false')
    await expect(panel.locator('.notam-row')).toHaveCount(5)
    await expect.poll(mapIds).toEqual(['A0001/26', 'A0002/26', 'A0003/26', 'A0004/26', 'A0006/26'])
  })

  test('toggles the NOTAM map master switch on desktop surfaces', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'NOTAM has no mobile entry in the current More menu; mobile settings is covered below.')
    await openApp(page)

    await page.getByRole('button', { name: 'NOTAM', exact: true }).click()
    const masterSwitch = page.getByRole('switch', { name: '지도에 NOTAM 표시' })
    await expect(masterSwitch).toBeVisible()
    const wasChecked = await masterSwitch.getAttribute('aria-checked')
    await masterSwitch.click()
    await expect(masterSwitch).toHaveAttribute('aria-checked', wasChecked === 'true' ? 'false' : 'true')
  })

  test('saves the selected time zone', async ({ page }, testInfo) => {
    await openApp(page)

    await openSettings(page, testInfo.project.name === 'mobile')

    const timeZone = page.getByRole('combobox', { name: '시간대', exact: true })
    await expect(timeZone).toBeVisible()
    await timeZone.selectOption('UTC')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeHidden()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('time_zone'))).toBe('UTC')
  })

  test('renders only active display settings controls', async ({ page }, testInfo) => {
    await openApp(page)

    await openSettings(page, testInfo.project.name === 'mobile')

    await expect(page.getByRole('combobox', { name: '시간대', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: '언어', exact: true })).toBeVisible()
    await expect(page.getByText('글꼴 (테스트)', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/기상 미니마와 비행 알림은/)).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('settings-display-controls.png') })
  })
})
