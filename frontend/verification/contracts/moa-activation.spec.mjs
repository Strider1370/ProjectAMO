import { test, expect } from '../fixtures.mjs'
import { moaActivationNotam, moaActivationNotamDefinite } from './fixtures/moa-activation-notam.mjs'

// 활성화 NOTAM과 매칭된 군작전구역만 빗금으로 덧칠되는지 확인한다.
// 핵심 위험은 필터 표현식이 조용히 어긋나는 것 — 아무것도 안 칠해지거나 전부 칠해져도
// 화면은 그럴듯해 보인다. 그래서 '칠해진 구역 수'와 '어느 구역인지'를 둘 다 검사한다.

const MOA_TILE = '군작전구역'

async function openMoaLayer(page, testInfo) {
  const entry = testInfo.project.name === 'mobile' ? '항공정보 레이어' : '항공정보'
  await page.getByRole('button', { name: entry }).click()
  const tile = page.getByRole('button', { name: MOA_TILE, exact: true })
  await expect(tile).toBeVisible()
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
}

// 빗금 레이어에 실제로 렌더된 구역 코드 — querySourceFeatures는 필터를 반영하지 않으므로
// queryRenderedFeatures로 '화면에 그려진 것'을 본다.
async function hatchedCodes(page) {
  return page.evaluate(() => {
    const map = window.__map
    if (!map?.getLayer('wfs-moa-active-fill')) return null
    return [...new Set(map.queryRenderedFeatures({ layers: ['wfs-moa-active-fill'] })
      .map((f) => `${f.properties.moa_lbl_1}|${f.properties.moa_lbl_2}|${f.properties.moa_lbl_3}`))].sort()
  })
}

test.describe('moa-activation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', '0.2.6')
    })
  })

  test('hatches only the MOA zones an activation NOTAM matches', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.route('**/api/notam', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(moaActivationNotam()),
    }))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await openMoaLayer(page, testInfo)

    // 두 NOTAM이 걸린 구역으로 이동(CATA 7H 동해안 + MOA 27S 남해). 둘 다 보이는 범위.
    await page.evaluate(() => window.__map.jumpTo({ center: [128.4, 36.1], zoom: 6.4 }))
    await expect.poll(() => hatchedCodes(page), { timeout: 25_000 }).not.toBeNull()
    await expect.poll(() => hatchedCodes(page), { timeout: 25_000 }).toEqual([
      'CATA 7H|5 000 AMSL|2 500 AGL',
      'MOA 27S|FL 400|11 000 AMSL',
    ])

    // 쌍둥이 저층(CATA 7L)은 좌표가 같지만 NOTAM이 지목하지 않았으므로 칠해지면 안 된다.
    const codes = await hatchedCodes(page)
    expect(codes.some((c) => c.startsWith('CATA 7L'))).toBe(false)

    await page.screenshot({ path: testInfo.outputPath('moa-active-hatch.png') })
    await testInfo.attach('moa-active-hatch', { path: testInfo.outputPath('moa-active-hatch.png'), contentType: 'image/png' })
  })

  test('NOTAM without a D) time condition renders at the definite-active opacity', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.route('**/api/notam', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(moaActivationNotamDefinite()),
    }))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await openMoaLayer(page, testInfo)
    await page.evaluate(() => window.__map.jumpTo({ center: [128.4, 36.1], zoom: 6.4 }))
    await expect.poll(() => hatchedCodes(page), { timeout: 25_000 }).not.toEqual(null)

    // D)가 없으면 deriveNotamTime이 'active'로 판정 → 조건부(0.4)가 아니라 진한 0.85로 칠해진다.
    const opacity = await page.evaluate(() => {
      const map = window.__map
      const expr = map.getPaintProperty('wfs-moa-active-fill', 'fill-opacity')
      // ['case', ['in', <key>, ['literal', activeKeys]], 0.85, 0.4]
      return { activeKeys: expr[1][2][1], activeValue: expr[2], fallback: expr[3] }
    })
    expect(opacity.activeKeys.length, '확정 활성 구역이 있어야 함').toBeGreaterThan(0)
    expect(opacity.activeValue).toBeGreaterThan(opacity.fallback)

    await page.screenshot({ path: testInfo.outputPath('moa-definite-hatch.png') })
    await testInfo.attach('moa-definite-hatch', { path: testInfo.outputPath('moa-definite-hatch.png'), contentType: 'image/png' })
  })

  test('no activation NOTAM leaves every MOA unhatched', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.route('**/api/notam', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ fetched_at: new Date().toISOString(), horizon_hours: 24, items: [] }),
    }))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await openMoaLayer(page, testInfo)
    await page.evaluate(() => window.__map.jumpTo({ center: [128.4, 36.1], zoom: 6.4 }))

    // 구역 자체는 보이지만(윤곽선) 빗금은 하나도 없어야 한다.
    await expect.poll(async () => page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['wfs-moa-line'] }).length), { timeout: 25_000 }).toBeGreaterThan(0)
    expect(await hatchedCodes(page)).toEqual([])
  })
})
