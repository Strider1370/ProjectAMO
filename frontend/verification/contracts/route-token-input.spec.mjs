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

  test('reset empties the field instead of letting the pills grow back', async ({ page }, testInfo) => {
    // 토큰 목록이 경로의 원본이므로, 초기화가 그것을 비우지 않으면 남은 알약이
    // 선택기와 경로를 곧바로 되살린다 — 눌러도 아무 일도 없는 것처럼 보인다.
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL'])
    await expect.poll(() => page.locator('.rtf-pill').count()).toBeGreaterThan(0)

    // 오클릭 방지로 두 번 눌러야 한다(첫 번째는 '초기화 확인'으로 바뀜).
    const reset = page.getByRole('button', { name: /^초기화/ }).first()
    await reset.click()
    await page.getByRole('button', { name: '초기화 확인', exact: true }).first().click()

    await expect.poll(() => page.locator('.rtf-pill').count()).toBe(0)
    await expect(page.getByRole('button', { name: /출발.*RKSI/ })).toHaveCount(0)
  })

  // 토큰만으로 경로를 만들어도 뒷단계(고도비교·연직단면도)까지 이어져야 한다. 선택기를
  // 쓰지 않고 공항까지 치는 것이 실제 사용 방식이고, 계약은 그 길을 지켜야 한다.
  test('a route typed entirely as tokens reaches altitude comparison and the profile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '모바일 단계 이동은 route-workflow가 덮는다')
    await openRoutePanel(page, false)
    await enterRouteTokens(page, ['RKSI', 'ANDOL', 'RKPK'])

    // 거리가 나오면 경로가 실제로 계산된 것이다.
    await expect(page.locator('.rtf-status-right')).toContainText('NM')

    await page.getByRole('button', { name: '경로비교로', exact: true }).click()
    await page.getByRole('button', { name: '기본 경로로 고도 비교', exact: true }).click()
    await page.getByRole('spinbutton', { name: '계획 순항고도 (ft)', exact: true }).fill('9000')
    await page.getByRole('button', { name: '고도 비교', exact: true }).click()

    // 비교 카드가 뜬다.
    await expect(page.getByText('9,000 ft', { exact: false }).first()).toBeVisible()
    // 연직단면도는 창으로 바로 열린다(데스크톱). 창이 안 열리는 구성에서는 여는 버튼이
    // 남으므로 둘 중 하나가 있으면 된다 — 어느 쪽이든 단면도에 닿을 수 있다는 뜻이다.
    const profileWindow = page.getByText('연직단면도', { exact: true }).first()
    const profileButton = page.getByRole('button', { name: '연직단면도 보기', exact: true })
    await expect(profileWindow.or(profileButton).first()).toBeVisible()
  })

  test('auto-generate puts its whole route into the field', async ({ page }, testInfo) => {
    // 목록이 경로의 원본이므로, 자동 생성 결과가 목록에 들어가지 않으면 지도에는 있는데
    // 글자로는 없는 상태가 된다.
    test.skip(testInfo.project.name === 'mobile', '모바일 자동 생성은 점진 노출 뒤에 있다')
    await openRoutePanel(page, false)
    // route-fixture가 맞춰둔 조합을 쓴다(route-workflow와 같은 RKSS→RKPK).
    await enterRouteTokens(page, ['RKSS', 'RKPK'])

    await page.getByRole('button', { name: '자동 생성', exact: true }).click()
    await page.waitForTimeout(6000)

    // 자동 생성은 추천할 절차를 못 찾으면 아무 경로도 만들지 않는다(그 자체는 이 계약의
    // 관심사가 아니다). 이 계약이 지키는 것은 **만들어졌다면 입력창에도 있어야 한다**는 것이다 —
    // 지도에는 있는데 글자로는 없는 상태가 이용자가 보고한 증상이었다.
    const pills = await page.locator('.rtf-pill').count()
    const distanceShown = /\d+\s*NM/.test((await page.locator('.rtf-status-right').textContent()) ?? '')
    if (distanceShown) {
      expect(pills, '경로가 만들어졌으면 양 끝 공항 말고도 알약이 있어야 한다').toBeGreaterThan(2)
      await expect(page.locator('.rtf-pill').first()).toHaveText('RKSS')
      await expect(page.locator('.rtf-pill').last()).toHaveText('RKPK')
      // 생성된 경로가 오류로 잡히면 그 형태를 우리가 다시 못 읽는다는 뜻이다.
      await expect(page.locator('.rtf-pill.is-error')).toHaveCount(0)
    } else {
      // 아무것도 만들어지지 않았다면 입력창도 그대로여야 한다 — 반쪽 상태가 없어야 한다.
      expect(pills).toBe(2)
    }
  })

  test('the alternatives step edits its route with pills too', async ({ page }, testInfo) => {
    // 같은 일을 두 화면에서 다르게 하면 배울 것이 두 가지가 된다.
    test.skip(testInfo.project.name === 'mobile', '모바일 대안 단계는 route-workflow가 덮는다')
    await openRoutePanel(page, false)
    await enterRouteTokens(page, ['RKSI', 'ANDOL', 'RKPK'])
    await page.getByRole('button', { name: '경로비교로', exact: true }).click()

    // 우회안을 만들면 항로 문자열 편집칸이 뜬다.
    await page.getByRole('button', { name: /우회안 만들기/ }).click()
    const editor = page.locator('.rtf-box')
    await expect(editor).toHaveCount(1)
    await expect(page.getByText('항로 문자열 직접 편집', { exact: true })).toBeVisible()
    // 옛 방식(문자열 칸 + 적용 버튼)이 남아 있으면 안 된다.
    await expect(page.locator('#rb-compatible-route')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '적용', exact: true })).toHaveCount(0)
  })

  test('the four pill colors are actually different', async ({ page }, testInfo) => {
    await openRoutePanel(page, testInfo.project.name === 'mobile')
    await enterRouteTokens(page, ['RKSI', 'ANDOL', 'A582', 'GONXA'])

    const colors = await page.locator('.rtf-box').first().evaluate((box) => [...box.querySelectorAll('.rtf-pill')]
      .map((pill) => getComputedStyle(pill).backgroundColor))
    expect(new Set(colors).size).toBe(colors.length)
  })
})
