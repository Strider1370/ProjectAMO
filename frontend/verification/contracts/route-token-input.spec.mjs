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

  // 지도 소스의 데이터는 getSource(id).serialize().data로 읽는다 — querySourceFeatures는
  // 이미 그려진 타일을 읽어 setData 직후를 반영하지 못한다(계약 등록부 규칙).
  const tokenPreview = (page) => page.evaluate(() => {
    const data = window.__map?.getSource?.('route-token-preview')?.serialize?.()?.data
    const features = data?.features ?? []
    return {
      points: features.filter((f) => f.geometry.type === 'Point').map((f) => f.properties.text),
      lines: features.filter((f) => f.geometry.type === 'LineString').length,
    }
  })

  test('a departure airport alone shows its point on the map', async ({ page }, testInfo) => {
    // 출발공항만 입력해도 그것이 입력됐다는 것을 지도에서 알 수 있어야 한다.
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI'])

    await expect.poll(() => tokenPreview(page).then((p) => p.points)).toEqual(['RKSI'])
    expect((await tokenPreview(page)).lines).toBe(0)
  })

  test('a route without an arrival airport still draws its line', async ({ page }, testInfo) => {
    // RKSI ANDOL만 쳐도 그 사이를 잇는 선이 실시간으로 나와야 한다.
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL'])

    await expect.poll(() => tokenPreview(page).then((p) => p.lines)).toBe(1)
    expect((await tokenPreview(page)).points).toEqual(['RKSI', 'ANDOL'])
  })

  test('airways contribute no point — they are not places', async ({ page }, testInfo) => {
    // 항공로에 점을 찍으면 있지도 않은 위치를 그리는 것이 된다.
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'A582', 'ANDOL'])

    await expect.poll(() => tokenPreview(page).then((p) => p.points)).toEqual(['RKSI', 'ANDOL'])
  })

  test('arrow keys move the caret between pills', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL'])

    // 커서를 왼쪽으로 한 칸 옮기면 그 자리에 세로선이 보이고, 치는 것이 그 자리에 들어간다.
    await page.locator('.rtf-input').first().click()
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('.rtf-caret')).toBeVisible()

    await page.locator('.rtf-input').first().fill('A582')
    await page.keyboard.press('Space')
    await expect(page.locator('.rtf-pill').nth(1)).toHaveText('A582')
  })

  // SID/STAR는 양방향이어야 한다. 한쪽만 되면 같은 사실을 두 곳에서 다르게 말한다.
  test('typing a SID selects it in the picker above', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    await openRoutePanel(page, isMobile)
    // 절차는 공항에 딸린 자료다 — 출발공항이 먼저 있어야 목록을 불러온다.
    await enterRouteTokens(page, ['RKSI'])
    await expect(page.getByRole('button', { name: /출발.*RKSI/ })).toBeVisible()

    await enterRouteTokens(page, ['BINIL3C'])

    // 절차 이름 그대로 쳤으니 오류가 아니어야 한다 — 선택기에 적힌 표시가 아니라 이름이다.
    await expect.poll(() => page.locator('.rtf-pill.is-error').count()).toBe(0)
    await expect(page.locator('.rtf-pill.is-procedure').first()).toContainText('BINIL3C')
    // 위쪽 SID 칸이 그 절차를 보여준다.
    await expect.poll(() => page.getByText('BINIL3C', { exact: false }).count()).toBeGreaterThan(1)
  })

  test('picking a SID writes it into the field', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    test.skip(isMobile, '모바일 SID 칸은 점진 노출 뒤에 있어 별도 경로가 필요하다')
    await openRoutePanel(page, isMobile)
    await enterRouteTokens(page, ['RKSI'])

    // Fluent Dropdown이다. 값이 '-- 없음 --'인 콤보박스가 SID 칸이고, 옵션은 목록에서
    // 이름으로 잡는다 — 위치(nth)로 잡으면 옵션 순서가 바뀔 때 조용히 다른 것을 고른다.
    const sid = page.getByRole('combobox').filter({ hasText: /없음/ }).first()
    await sid.click()
    const option = page.getByRole('option', { name: /BINIL3C/ }).first()
    await option.click()

    // 고른 절차가 알약으로 들어와야 한다 — 한 방향만 되면 두 곳이 어긋난다.
    await expect.poll(() => page.locator('.rtf-pill.is-procedure').count()).toBeGreaterThan(0)
  })

  test('the four pill colors are actually different', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL', 'A582', 'GONXA'])

    const colors = await page.locator('.rtf-box').first().evaluate((box) => [...box.querySelectorAll('.rtf-pill')]
      .map((pill) => getComputedStyle(pill).backgroundColor))
    expect(new Set(colors).size).toBe(colors.length)
  })
})
