import { expect, test } from '@playwright/test'

// 관리자 콘솔 브라우저 계약.
//
// 이 화면의 값어치는 "이상한 것이 눈에 띄는가"에 있는데, 그건 단위 테스트로 증명되지 않는다.
// 여기서 확인하는 것은 세 가지다 — 여섯 화면이 실제로 뜨는가, 상태가 색만이 아니라 글자로도
// 적히는가, 그리고 모든 그래프에 y축 눈금과 단위가 있는가(축 없는 그래프가 다시 새어 들어오면
// 여기서 걸린다).
//
// 계정은 verification/admin-fixture.mjs가 만든다. 없으면 로그인에서 멈추므로,
// 실패 메시지로 바로 알 수 있게 로그인 단계에서 명시적으로 확인한다.
const ADMIN = { username: process.env.CONTRACT_ADMIN_USER || 'contract_admin', password: process.env.CONTRACT_ADMIN_PASS || 'contract-pass-1' }

const MENUS = [
  ['개요', '.ac-hero'],
  ['자료 수집', 'table.ac-t'],
  ['서버 자원', '.ac-gauges'],
  ['API 사용량', '.ac-sec'],
  ['이용자', '.ac-sec'],
  ['계정 관리', 'table.ac-t'],
]

async function loginAsAdmin(page, request) {
  const response = await request.post('http://127.0.0.1:3001/api/auth/login', { data: ADMIN })
  expect(response.status(), '관리자 계정이 없습니다 — verification/admin-fixture.mjs를 먼저 실행하세요').toBe(200)
  const cookie = response.headers()['set-cookie'].split(';')[0]
  const [name, value] = cookie.split('=')
  await page.context().addCookies([{ name, value, domain: '127.0.0.1', path: '/' }])
}

test.describe('관리자 콘솔', () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAsAdmin(page, request)
    await page.goto('/admin')
    await expect(page.locator('.ac-shell')).toBeVisible()
  })

  test('여섯 화면이 모두 열린다', async ({ page }, testInfo) => {
    for (const [label, marker] of MENUS) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(page.locator(marker).first()).toBeVisible()
      await testInfo.attach(`admin-${label}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    }
  })

  test('상단 신호등 넷이 이름과 함께 보인다 — 색만으로 알리지 않는다', async ({ page }) => {
    const signals = page.locator('.ac-topbar .ac-sig')
    await expect(signals).toHaveCount(4)
    for (const name of ['자료', '수집', 'API', '서버']) {
      await expect(page.locator('.ac-topbar').getByText(name, { exact: false }).first()).toBeVisible()
    }
  })

  test('자료 격자는 출처별로 시작하고 성격별로 바뀐다', async ({ page }) => {
    await expect(page.getByRole('button', { name: '출처별' })).toHaveClass(/ac-on/)
    const sourceGroups = await page.locator('.ac-grp .ac-gl').allTextContents()
    await page.getByRole('button', { name: '성격별' }).click()
    const characterGroups = await page.locator('.ac-grp .ac-gl').allTextContents()
    expect(characterGroups).not.toEqual(sourceGroups)
  })

  test('모든 그래프에 y축 눈금과 단위가 있다', async ({ page }) => {
    await page.getByRole('button', { name: '서버 자원', exact: true }).click()
    const chart = page.locator('svg.ac-chart').first()
    await expect(chart).toBeVisible()
    const labels = await chart.locator('text').allTextContents()
    expect(labels, 'y축 0 눈금이 없다').toContain('0')
    expect(labels, 'y축 최댓값 눈금이 없다').toContain('100')
    expect(labels, '단위 표기가 없다').toContain('%')
  })

  test('상태는 색만이 아니라 글자로도 적힌다', async ({ page }) => {
    await page.getByRole('button', { name: '자료 수집', exact: true }).click()
    const chips = await page.locator('.ac-chip').allTextContents()
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.every((text) => text.trim().length > 0), '빈 상태 표시가 있다').toBe(true)
  })

  test('이모지를 쓰지 않는다', async ({ page }) => {
    const body = await page.locator('.admin-page').innerText()
    expect(body, '어드민 화면에 이모지가 있다').not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})
