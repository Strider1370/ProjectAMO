import { test, expect } from '../fixtures.mjs'
import { enterRouteTokens, routeTokenTexts } from '../route-token-input.mjs'
import { installRouteBriefingFixtures } from '../route-fixture.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'

// 경로 생성 단계에서 입력을 바꾸는 조작들. 제안서
// docs/design/proposals/2026-10-23-route-input-rework.md 5절의 시나리오 표를 그대로 옮겼다.
// 경로 알약·위쪽 칸(출발·도착·교체·SID·STAR)·경로 결과가 조작 뒤에도 서로 맞는지를 본다.
// 아직 고치지 않은 것은 test.fail로 둔다 — 고쳐지면 "예상 실패가 통과함"으로 알려 준다.

async function openRoutePanel(page) {
  await installRouteBriefingFixtures(page)
  await page.addInitScript((version) => {
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
  await expect(page.locator('.rtf-box')).toBeVisible()
}

// 공항 선택 칸은 '출발 공항'·'도착 공항'·'교체 공항' 이름표로 찾는다(값이 붙으면 이름이 바뀌므로 앞부분만).
const airportField = (page, label) => page.locator('.apf-row', { hasText: label }).first()
async function pickAirport(page, label, icao) {
  await airportField(page, label).click()
  await page.locator('.apf-chip', { hasText: icao }).first().click()
}
async function pickFir(page, label) {
  await airportField(page, label).click()
  // 지역 목록 맨 아래라 목록 안에서 스크롤해야 보인다.
  const fir = page.locator('.apf-region--fir')
  await fir.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
  await fir.click()
}
const fieldText = async (page, label) => ((await airportField(page, label).textContent()) ?? '').replace(/\s+/g, ' ')

const confirmBar = (page) => page.getByRole('alert').filter({ hasText: '바꿀까요' })
const sidBox = (page) => page.getByRole('combobox').nth(0)
const starBox = (page) => page.getByRole('combobox').nth(1)
const distance = (page) => page.locator('.rtf-status-right')

async function pickFirstProcedure(page, box) {
  // 절차 목록은 공항을 고른 뒤 따로 불러온다. 목록이 오기 전에 열면 '-- 없음 --'만 있으므로 닫고 다시 연다.
  await expect(async () => {
    await box.click()
    const option = page.getByRole('option').nth(1) // 0번은 '-- 없음 --'
    if (!(await option.isVisible())) { await page.keyboard.press('Escape'); throw new Error('procedures not loaded') }
    await option.click()
  }).toPass({ timeout: 15_000 })
}

async function autoGenerate(page, departure, arrival) {
  await pickAirport(page, '출발 공항', departure)
  await pickAirport(page, '도착 공항', arrival)
  await page.getByRole('button', { name: '자동 생성', exact: true }).click()
  await expect(distance(page)).toContainText('NM', { timeout: 20_000 })
  await expect(page.locator('.rtf-pill.is-error')).toHaveCount(0)
}

test.describe('route-editing', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '입력 상태 시나리오는 데스크톱 한 화면에서만 본다')
  })

  test('1 auto-generate fills SID, en-route and STAR pills between the airports', async ({ page }) => {
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    const pills = await routeTokenTexts(page)
    expect(pills.at(0)).toBe('RKSI')
    expect(pills.at(-1)).toBe('RKPC')
    expect(pills.length).toBeGreaterThan(4)
    await expect(page.locator('.rtf-pill.is-procedure')).toHaveCount(2)
  })

  test('2 cancelling an airport change leaves everything as it was', async ({ page }) => {
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    const before = await routeTokenTexts(page)
    await pickAirport(page, '도착 공항', 'RKPK')
    await expect(confirmBar(page)).toBeVisible()
    await page.getByRole('button', { name: '취소', exact: true }).click()
    await expect(confirmBar(page)).toHaveCount(0)
    expect(await routeTokenTexts(page)).toEqual(before)
    expect(await fieldText(page, '도착 공항')).toContain('RKPC')
  })

  test('3 confirming an airport change clears the route and keeps the new airport', async ({ page }) => {
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    await pickAirport(page, '도착 공항', 'RKPK')
    await page.getByRole('button', { name: '계속', exact: true }).click()
    await expect.poll(() => routeTokenTexts(page)).toEqual(['RKSI', 'RKPK'])
    expect(await fieldText(page, '도착 공항')).toContain('RKPK')
    await expect(distance(page)).not.toContainText('NM')
  })

  test('4 swapping after a route asks first, then swaps both fields and pills', async ({ page }) => {
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    await page.getByRole('button', { name: '출발 도착 교환' }).click()
    await expect(confirmBar(page)).toBeVisible()
    await page.getByRole('button', { name: '계속', exact: true }).click()
    await expect.poll(() => routeTokenTexts(page)).toEqual(['RKPC', 'RKSI'])
    expect(await fieldText(page, '출발 공항')).toContain('RKPC')
    expect(await fieldText(page, '도착 공항')).toContain('RKSI')
  })

  test('5 changing the arrival drops only its STAR pill', async ({ page }) => {
    await openRoutePanel(page)
    await pickAirport(page, '출발 공항', 'RKSS')
    await pickAirport(page, '도착 공항', 'RKPK')
    await pickFirstProcedure(page, sidBox(page))
    await pickFirstProcedure(page, starBox(page))
    await expect(page.locator('.rtf-pill.is-procedure')).toHaveCount(2)
    const sid = (await routeTokenTexts(page))[1]
    await pickAirport(page, '도착 공항', 'RKPC')
    await expect.poll(() => routeTokenTexts(page)).toEqual(['RKSS', sid, 'RKPC'])
    await expect(page.locator('.rtf-pill.is-error')).toHaveCount(0)
  })

  test('6 changing the departure drops its SID pill', async ({ page }) => {
    await openRoutePanel(page)
    await pickAirport(page, '출발 공항', 'RKSS')
    await pickFirstProcedure(page, sidBox(page))
    await expect(page.locator('.rtf-pill.is-procedure')).toHaveCount(1)
    await pickAirport(page, '출발 공항', 'RKPK')
    await expect.poll(() => routeTokenTexts(page)).toEqual(['RKPK'])
  })

  test('7 an alternate that becomes the arrival is cleared', async ({ page }) => {
    await openRoutePanel(page)
    await pickAirport(page, '출발 공항', 'RKSI')
    await pickAirport(page, '도착 공항', 'RKPC')
    await pickAirport(page, '교체 공항', 'RKPK')
    expect(await fieldText(page, '교체 공항')).toContain('RKPK')
    await pickAirport(page, '도착 공항', 'RKPK')
    await expect.poll(() => fieldText(page, '교체 공항')).toContain('선택 안 함')
  })

  test('8 reset clears airports, pills, alternate and the route', async ({ page }) => {
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    await pickAirport(page, '교체 공항', 'RKPK')
    await page.getByRole('button', { name: /^초기화/ }).last().click()
    await page.getByRole('button', { name: '초기화 확인', exact: true }).last().click()
    await expect.poll(() => routeTokenTexts(page)).toEqual([])
    expect(await fieldText(page, '출발 공항')).not.toContain('RKSI')
    expect(await fieldText(page, '교체 공항')).toContain('선택 안 함')
    await expect(distance(page)).not.toContainText('NM')
  })

  test('9 deleting the STAR pill clears the STAR field and keeps the SID pill', async ({ page }) => {
    test.fail(true, '알려진 버그(2026-10-23): STAR 알약을 지워도 STAR 칸·경로 계산에 그 STAR가 남는다')
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    const pills = await routeTokenTexts(page)
    const sid = pills[1]
    const star = pills.at(-2)
    // 입력 커서는 도착 공항 알약 앞에 있다 — 지우기 한 번이 STAR 알약을 지운다.
    await page.locator('.rtf-input').first().click()
    await page.keyboard.press('Backspace')
    await expect.poll(() => routeTokenTexts(page)).not.toContain(star)
    expect(await routeTokenTexts(page)).toContain(sid)
    await expect(starBox(page)).toContainText('없음')
  })

  test('10 typing an airport into the middle of the route is reported, not ignored', async ({ page }) => {
    test.fail(true, '알려진 버그(2026-10-23): 경로 중간에 친 공항이 오류 없이 무시된다')
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    await enterRouteTokens(page, ['RKPK'])
    await expect(page.locator('.rtf-error-toggle')).toBeVisible()
  })

  test('11 switching IFR to VFR after a route asks first', async ({ page }) => {
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    await page.getByRole('tab', { name: 'VFR', exact: true }).click()
    await expect(confirmBar(page)).toBeVisible()
  })

  test('12 FIR entry keeps the sentinel out of the pills and offers entry fixes', async ({ page }) => {
    test.skip(true, 'FIR 진입·이탈은 공항 선택 창에서 숨겨져 있다(dd439da3, .apf-region--fir display:none) — 이용자가 고를 수 없다')
    await openRoutePanel(page)
    await pickFir(page, '출발 공항')
    await pickAirport(page, '도착 공항', 'RKPC')
    expect(await fieldText(page, '출발 공항')).toContain('FIR 진입')
    await expect.poll(() => routeTokenTexts(page)).toEqual(['RKPC'])
    await expect(page.getByText('진입 FIX', { exact: true })).toBeVisible()
  })

  test('13 a typed fix after auto-generate keeps the SID and STAR pills', async ({ page }) => {
    // 지도에서 지점을 넣는 것과 같은 길(편집기 문자열 → 알약 재작성)을 탄다.
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    const pills = await routeTokenTexts(page)
    await page.locator('.rtf-input').first().click()
    await page.keyboard.press('Backspace') // STAR
    await page.keyboard.press('Backspace') // STAR 앞 FIX
    await expect.poll(async () => (await routeTokenTexts(page)).length).toBe(pills.length - 2)
    expect(await routeTokenTexts(page)).toContain(pills[1])
  })

  test('14 a saved route loads back airports and alternate', async ({ page }) => {
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    await pickAirport(page, '교체 공항', 'RKPK')
    page.once('dialog', (dialog) => dialog.accept('route-editing contract'))
    await page.getByRole('button', { name: '경로', exact: true }).click()
    await page.getByRole('menuitem', { name: /현재 경로 저장/ }).click()
    await page.getByRole('button', { name: /^초기화/ }).last().click()
    await page.getByRole('button', { name: '초기화 확인', exact: true }).last().click()
    await expect.poll(() => routeTokenTexts(page)).toEqual([])
    await page.getByRole('button', { name: '경로', exact: true }).click()
    await page.locator('.rb-saved-row', { hasText: 'route-editing contract' }).getByRole('button', { name: '로드' }).click()
    await expect(distance(page)).toContainText('NM', { timeout: 20_000 })
    expect(await fieldText(page, '출발 공항')).toContain('RKSI')
    expect(await fieldText(page, '도착 공항')).toContain('RKPC')
    expect(await fieldText(page, '교체 공항')).toContain('RKPK')
  })

  test('14b a saved route loads back the same pills', async ({ page }) => {
    test.fail(true, '알려진 버그(2026-10-23): 불러온 절차 알약이 짧은 이름으로 바뀐다(15L.BOPTA3C.BOPTA → BOPTA3C)')
    await openRoutePanel(page)
    await autoGenerate(page, 'RKSI', 'RKPC')
    await pickAirport(page, '교체 공항', 'RKPK')
    const pills = await routeTokenTexts(page)
    page.once('dialog', (dialog) => dialog.accept('route-editing contract'))
    await page.getByRole('button', { name: '경로', exact: true }).click()
    await page.getByRole('menuitem', { name: /현재 경로 저장/ }).click()
    await page.getByRole('button', { name: /^초기화/ }).last().click()
    await page.getByRole('button', { name: '초기화 확인', exact: true }).last().click()
    await expect.poll(() => routeTokenTexts(page)).toEqual([])
    await page.getByRole('button', { name: '경로', exact: true }).click()
    await page.locator('.rb-saved-row', { hasText: 'route-editing contract' }).getByRole('button', { name: '로드' }).click()
    await expect.poll(() => routeTokenTexts(page), { timeout: 20_000 }).toEqual(pills)
  })

  test('15 picking the arrival first leaves the departure empty', async ({ page }) => {
    test.fail(true, '알려진 버그(2026-10-23): 도착만 먼저 고르면 알약 하나뿐이라 출발로 읽혀 출발 칸도 같은 공항이 된다')
    await openRoutePanel(page)
    await pickAirport(page, '도착 공항', 'RKPC')
    await expect.poll(() => fieldText(page, '도착 공항')).toContain('RKPC')
    expect(await fieldText(page, '출발 공항')).not.toContain('RKPC')
  })
})
