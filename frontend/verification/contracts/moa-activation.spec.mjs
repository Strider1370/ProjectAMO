import { test, expect } from '../fixtures.mjs'
import {
  moaActivationNotam,
  moaActivationNotamDefinite,
  moaActivationNotamUnreadable,
} from './fixtures/moa-activation-notam.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

// 활성화 NOTAM과 매칭된 군작전구역만 빗금으로 덧칠되는지 확인한다.
// 핵심 위험은 필터 표현식이 조용히 어긋나는 것 — 아무것도 안 칠해지거나 전부 칠해져도
// 화면은 그럴듯해 보인다. 그래서 '칠해진 구역 수'와 '어느 구역인지'를 둘 다 검사한다.
//
// D) 시간대 판정이 붙은 뒤로 빗금 조건은 세 갈래다:
//   발효 중(D) 창 안 또는 D) 없음) → 진한 빗금 / D) 해석 불가 → 옅은 빗금 / D) 창 밖 → 빗금 없음

const MOA_TILE = '군작전구역'
const CATA_7H = 'CATA 7H|5 000 AMSL|2 500 AGL'
const MOA_27S = 'MOA 27S|FL 400|11 000 AMSL'

async function openMoaLayer(page, testInfo) {
  const entry = testInfo.project.name === 'mobile' ? '항공정보 레이어' : '항공정보'
  await page.getByRole('button', { name: entry }).click()
  const tile = page.getByRole('button', { name: MOA_TILE, exact: true })
  await expect(tile).toBeVisible()
  await tile.click()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
}

// 빗금 레이어에 실제로 렌더된 구역 — querySourceFeatures는 필터를 반영하지 않으므로
// queryRenderedFeatures로 '화면에 그려진 것'을 본다.
async function hatchedCodes(page) {
  return page.evaluate(() => {
    const map = window.__map
    if (!map?.getLayer('wfs-moa-active-fill')) return null
    return [...new Set(map.queryRenderedFeatures({ layers: ['wfs-moa-active-fill'] })
      .map((f) => `${f.properties.moa_lbl_1}|${f.properties.moa_lbl_2}|${f.properties.moa_lbl_3}`))].sort()
  })
}

// fill-opacity 표현식: ['case', ['in', <key>, ['literal', activeKeys]], 진하게, 옅게]
async function opacityExpression(page) {
  return page.evaluate(() => {
    const expr = window.__map.getPaintProperty('wfs-moa-active-fill', 'fill-opacity')
    return { activeKeys: expr[1][2][1], activeValue: expr[2], faintValue: expr[3] }
  })
}

async function openWith(page, testInfo, payload) {
  await page.route('**/api/notam', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(payload),
  }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await openMoaLayer(page, testInfo)
  // 두 구역이 함께 보이는 범위(CATA 7H 동해안 + MOA 27S 남해).
  await page.evaluate(() => window.__map.jumpTo({ center: [128.4, 36.1], zoom: 6.4 }))
}

test.describe('moa-activation', () => {
  test.beforeEach(async ({ page }) => {
    // lastSeenVersion은 CURRENT_VERSION과 "같아야" 업데이트 패널이 안 뜬다(hasUpdate = 다름).
    // 임의의 큰 값을 넣으면 오히려 패널이 떠서 사이드바를 덮는다. 릴리스마다 깨지지 않도록
    // 소스의 상수를 그대로 쓴다.
    await page.addInitScript((version) => {
      localStorage.setItem('amo.tour.v1.done', 'true')
      localStorage.setItem('projectamo:lastSeenVersion', version)
    }, CURRENT_VERSION)
  })

  test('hatches the zone whose D) window covers now, not the one outside it', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await openWith(page, testInfo, moaActivationNotam())

    // CATA 7H는 D) 창 안, MOA 27S는 창 밖 — 유효기간(B~C)은 둘 다 지금을 포함한다.
    // D)를 안 읽으면 둘 다 칠해지므로, 이 차이가 D) 파싱이 살아있다는 증거다.
    await expect.poll(() => hatchedCodes(page), { timeout: 25_000 }).toEqual([CATA_7H])

    const { activeKeys } = await opacityExpression(page)
    expect(activeKeys).toEqual([CATA_7H])
    await page.screenshot({ path: testInfo.outputPath('moa-in-window.png') })
    await testInfo.attach('moa-in-window', { path: testInfo.outputPath('moa-in-window.png'), contentType: 'image/png' })
  })

  test('a NOTAM with no D) condition hatches both matched zones at the definite opacity', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await openWith(page, testInfo, moaActivationNotamDefinite())
    await expect.poll(() => hatchedCodes(page), { timeout: 25_000 }).toEqual([CATA_7H, MOA_27S].sort())

    const { activeKeys, activeValue, faintValue } = await opacityExpression(page)
    expect(activeKeys.sort()).toEqual([CATA_7H, MOA_27S].sort())
    expect(activeValue).toBeGreaterThan(faintValue)
    await page.screenshot({ path: testInfo.outputPath('moa-definite.png') })
    await testInfo.attach('moa-definite', { path: testInfo.outputPath('moa-definite.png'), contentType: 'image/png' })
  })

  test('an unreadable D) hatches faintly instead of claiming the zone is off', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await openWith(page, testInfo, moaActivationNotamUnreadable())
    await expect.poll(() => hatchedCodes(page), { timeout: 25_000 }).toEqual([CATA_7H, MOA_27S].sort())

    // 해석 못 한 D)는 확정 목록(진한 빗금)에 들어가면 안 된다 — 옅게만 칠한다.
    const { activeKeys } = await opacityExpression(page)
    expect(activeKeys).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('moa-unreadable.png') })
    await testInfo.attach('moa-unreadable', { path: testInfo.outputPath('moa-unreadable.png'), contentType: 'image/png' })
  })

  test('no activation NOTAM leaves every MOA unhatched', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await openWith(page, testInfo, { fetched_at: new Date().toISOString(), horizon_hours: 24, items: [] })

    // 구역 자체는 보이지만(윤곽선) 빗금은 하나도 없어야 한다.
    await expect.poll(async () => page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['wfs-moa-line'] }).length), { timeout: 25_000 }).toBeGreaterThan(0)
    expect(await hatchedCodes(page)).toEqual([])
  })
})
