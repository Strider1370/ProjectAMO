// 아이패드 Safari에서 '그리기'가 손가락으로 동작하지 않고 지도만 끌려 다녔다.
// 원인은 draw 모드가 mousedown/mousemove/mouseup에만 걸려 있던 것 — 터치는 mouse 이벤트를 내지 않는다.
// 단위 테스트는 핸들러 등록만 볼 수 있으므로, 실제 터치 이벤트로 브라우저에서 확인한다.
import { test, expect } from '../fixtures.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

// 지도 위 실제 캔버스 지점을 찾는다 — 왼쪽은 브리핑 패널이 덮고 있어 좌표를 고정하면 패널을 누른다.
async function findMapPoint(page, box) {
  return page.evaluate((b) => {
    for (const fx of [0.55, 0.65, 0.45, 0.75]) {
      const x = Math.round(b.x + b.width * fx)
      const y = Math.round(b.y + b.height * 0.5)
      if (document.elementFromPoint(x, y)?.classList.contains('mapboxgl-canvas')) return { x, y }
    }
    return null
  }, box)
}

test.describe('route-touch-draw', () => {
  test('터치로 선을 그으면 지도가 움직이지 않고 경로 선이 그려진다', async ({ page }, testInfo) => {
    // 휴대폰 레이아웃에는 '그리기' 버튼 자체가 없다 — 터치 그리기는 태블릿 폭에서만 쓴다.
    test.skip(testInfo.project.name !== 'ipad-landscape', '아이패드 가로 전용 계약')

    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
    await installRouteBriefingFixtures(page)
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const isMobile = testInfo.project.name === 'mobile'
    await page.getByRole('button', { name: isMobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
    if (!isMobile) await page.getByRole('tab', { name: 'IFR', exact: true }).click()
    await page.getByRole('button', { name: isMobile ? '출발 선택' : '출발 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKSS$/ }).click()
    await page.getByRole('button', { name: isMobile ? '도착 선택' : '도착 공항 선택', exact: true }).click()
    await page.getByRole('button', { name: /RKPK$/ }).click()

    const draw = page.getByRole('button', { name: '그리기', exact: true })
    await expect(draw).toBeEnabled()
    await draw.click()

    const box = await page.locator('.mapboxgl-canvas').boundingBox()
    const start = await findMapPoint(page, box)
    expect(start, '지도 캔버스가 보이는 지점을 찾지 못했다').not.toBeNull()

    const centerBefore = await page.evaluate(() => { const c = window.__map.getCenter(); return [c.lng, c.lat] })
    const client = await page.context().newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] })
    for (const dx of [40, 80, 120]) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + dx, y: start.y }] })
    }

    // 손가락을 떼기 전: 선이 자라고 있고 지도 끌기는 잠겨 있어야 한다.
    const midGesture = await page.evaluate(() => {
      const source = window.__map.getSource('briefing-route-draw')
      const data = source?._data ?? source?.serialize?.().data
      return {
        coordinates: data?.features?.[0]?.geometry?.coordinates?.length ?? 0,
        dragPanEnabled: window.__map.dragPan.isEnabled(),
        status: document.querySelector('.route-map-interaction-status')?.textContent ?? '',
      }
    })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    expect(midGesture.coordinates).toBeGreaterThan(1)
    expect(midGesture.dragPanEnabled).toBe(false)
    expect(midGesture.status).toContain('그리는 중')
    // 그리는 동안 지도가 따라 움직이면 안 된다.
    expect(await page.evaluate(() => { const c = window.__map.getCenter(); return [c.lng, c.lat] })).toEqual(centerBefore)
  })
})
