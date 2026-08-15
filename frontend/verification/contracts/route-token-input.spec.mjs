import { test, expect } from '../fixtures.mjs'
import { enterRouteTokens, routeTokenErrorLabel } from '../route-token-input.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

// 경로 토큰 입력칸. 소스를 읽는 시험으로는 잡히지 않는 것만 여기서 확인한다 —
// 실제로 이 화면에서 다섯 가지가 시험·빌드를 통과한 채로 깨져 있었다:
// 화면이 죽음(정의 전 참조), 알약이 오른쪽으로 밀림, 정상 FIX가 오류로 판정,
// 선택기가 목록을 안 따라옴, 초기화가 이용자 입력을 지움.

async function openRoutePanel(page, isMobile) {
  await installRouteBriefingFixtures(page)
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: isMobile ? '브리핑' : '비행 전 브리핑', exact: true }).click()
  await expect(page.locator('.rtf-box')).toBeVisible()
}

test.describe('route-token-input', () => {
  test('confirms tokens on space and classifies each kind', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')

    // 실제 항법자료에 있는 이름만 쓴다. ANDOL은 항로 지점, A582는 항공로다.
    await enterRouteTokens(page, ['RKSI', 'ANDOL', 'A582'])

    await expect(page.locator('.rtf-pill.is-airport').first()).toHaveText('RKSI')
    await expect(page.locator('.rtf-pill.is-fix').first()).toHaveText('ANDOL')
    await expect(page.locator('.rtf-pill.is-airway').first()).toHaveText('A582')
    expect(await routeTokenErrorLabel(page)).toBe('')
  })

  test('flags a typo and holds the map until it is fixed', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'GONXA'])

    await expect(page.locator('.rtf-pill.is-error')).toHaveCount(1)
    expect(await routeTokenErrorLabel(page)).toContain('1 error')

    // 이유는 종류별로 다르게 나온다 — 어디를 고칠지 알려주는 것이 이 줄의 목적이다.
    await page.locator('.rtf-error-toggle').first().click()
    await expect(page.locator('.rtf-error-list li').first()).toHaveText('GONXA — 그런 지점이 없습니다')

    // 오류 알약은 색 말고 테두리로도 구분된다(색을 못 알아보는 경우와 햇빛에 씻긴 화면).
    const border = await page.locator('.rtf-pill.is-error').first().evaluate((pill) => getComputedStyle(pill).borderStyle)
    expect(border).toBe('solid')
  })

  test('backspace on an empty draft removes the pill before it', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL'])
    const before = await page.locator('.rtf-pill').count()

    await page.locator('.rtf-input').first().click()
    await page.keyboard.press('Backspace')

    await expect(page.locator('.rtf-pill')).toHaveCount(before - 1)
  })

  test('the picker and the token list never disagree', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    await openRoutePanel(page, isMobile)

    // 목록에 공항을 치면 위쪽 선택기가 그 공항을 보여야 한다. 같은 사실을 두 곳에서
    // 다르게 말하면 어느 쪽이 진짜인지 알 수 없다.
    await enterRouteTokens(page, ['RKSI'])
    await expect(page.getByRole('button', { name: /출발.*RKSI/ })).toBeVisible()
  })

  test('typing keeps focus in a real input so the keyboard stays open', async ({ page }, testInfo) => {
    // iPad에서 알약을 눌렀을 때 초점이 빠지면 화면 키보드가 닫힌다. 키보드 자체는
    // 프로그램으로 볼 수 없으므로 그 원인인 초점 유지를 기준으로 삼는다.
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL'])

    await page.locator('.rtf-pill').first().click()

    expect(await page.evaluate(() => document.activeElement?.classList?.contains('rtf-input') ?? false)).toBe(true)
  })

  test('a long route wraps instead of scrolling sideways', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL', 'A582', 'AGAVO', 'ANKUS', 'APELA', 'ANROD', 'ANSIM', 'ANUBA', 'APARU', 'AKPON', 'AGSUS'])

    const box = page.locator('.rtf-box').first()
    // 가로로 숨으면 무엇을 쳤는지 한눈에 볼 수 없다.
    expect(await box.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    expect(await box.evaluate((el) => new Set([...el.querySelectorAll('.rtf-pill')].map((p) => Math.round(p.getBoundingClientRect().top))).size)).toBeGreaterThan(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  })

  test('the four pill colors are actually different', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL', 'A582', 'GONXA'])

    const colors = await page.locator('.rtf-box').first().evaluate((box) => [...box.querySelectorAll('.rtf-pill')]
      .map((pill) => getComputedStyle(pill).backgroundColor))
    expect(new Set(colors).size).toBe(colors.length)
  })
})
