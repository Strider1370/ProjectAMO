// 달빛 섹션 포커스 캡처. 18장 baseline 매트릭스 대신 필요한 것만 찍는다.
// 사전조건: dev 서버 기동 (docs/dev-server-and-capture.md)
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const ICAO = process.env.PROJECTAMO_CAPTURE_ICAO || 'RKSI'
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/moon-section')

const VIEWPORTS = [
  { name: 'desktop', width: 1600, height: 1200 },
  { name: 'mobile', width: 390, height: 844 },
]

async function run() {
  await fs.mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const problems = []

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    // 비로그인 상태의 /api/auth/me 401은 앱의 정상 동작 — 이 검증과 무관하므로 제외.
    const BENIGN = /\/api\/auth\/me/
    const consoleErrors = []
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const src = `${m.text()} ${m.location()?.url || ''}` // 리소스 실패 메시지는 본문에 URL이 없다
      if (!BENIGN.test(src)) consoleErrors.push(src)
    })
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
    page.on('response', (r) => {
      if (r.status() >= 400 && !BENIGN.test(r.url())) consoleErrors.push(`${r.status()} ${r.url()}`)
    })

    await page.goto(`${appUrl}/?airport=${ICAO}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.airport-panel', { timeout: 15000 })
    const closeBtn = page.locator('.updates-modal__close')
    if (await closeBtn.count()) { await closeBtn.first().click(); await page.waitForTimeout(300) }
    await page.waitForTimeout(1000)

    // 레일에 '달빛' 버튼이 있는가
    const rail = page.locator('.airport-panel-tab', { hasText: '달빛' })
    if (!(await rail.count())) { problems.push(`${vp.name}: 레일에 달빛 버튼 없음`); continue }
    await rail.first().click()
    await page.waitForTimeout(700)

    const sec = page.locator('#sec-moon')
    if (!(await sec.count())) { problems.push(`${vp.name}: #sec-moon 섹션 없음`); continue }

    // 요약·곡선은 바로 보여야 한다
    const chart = await page.locator('.moon-chart').count()
    const totalLine = await page.locator('.moon-line-total').count()
    const moonLine = await page.locator('.moon-line-moon').count()
    if (!chart) problems.push(`${vp.name}: 차트 없음`)
    if (!totalLine || !moonLine) problems.push(`${vp.name}: 곡선 2개가 아님 (총=${totalLine}, 달=${moonLine})`)

    // 달력은 기본 접힘
    const foldOpen = await page.locator('.moon-cal-fold[open]').count()
    if (foldOpen) problems.push(`${vp.name}: 달력이 기본으로 펼쳐져 있음 (접혀야 함)`)
    const cellsBefore = await page.locator('.moon-cell:not(.moon-cell--pad)').count()
    if (cellsBefore > 0) problems.push(`${vp.name}: 접힌 상태인데 달력 칸이 ${cellsBefore}개 렌더됨`)

    // 접힌 스크린샷 (기본 상태)
    await sec.screenshot({ path: path.join(outDir, `${ICAO.toLowerCase()}-moon-${vp.name}-collapsed.png`) })

    // 펼치기
    await page.locator('.moon-cal-summary').click()
    await page.waitForTimeout(500)
    const cells = await page.locator('.moon-cell:not(.moon-cell--pad)').count()
    const darkCells = await page.locator('.moon-cell--dark').count()
    if (cells < 28) problems.push(`${vp.name}: 펼친 뒤 달력 칸 ${cells}개 (28+ 기대)`)
    console.log(`[${vp.name}] 접힘 기본 OK → 펼침: 달력 ${cells}칸, 무월광 ${darkCells}칸, 곡선 총=${totalLine} 달=${moonLine}`)

    // 가로 넘침 금지 (design-language §6). 모바일에서 달력 7열이 터지기 쉽다.
    // 범위는 달빛 섹션. 패널 본문 전체를 재면 TAF 섹션(.ap-taf-scale)의 기존 11px 넘침이 섞여
    // 이 검증이 남의 버그로 실패한다.
    const overflow = await page.evaluate(() => {
      const sec = document.querySelector('#sec-moon')
      const cal = document.querySelector('.moon-cal')
      const secBox = sec.getBoundingClientRect()
      const calBox = cal.getBoundingClientRect()
      const cells = [...document.querySelectorAll('.moon-cell:not(.moon-cell--pad)')]
      const wide = [...sec.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > secBox.right + 1).length
      return {
        secScroll: sec.scrollWidth - sec.clientWidth,
        calScroll: cal.scrollWidth - cal.clientWidth,
        clipped: cells.filter((c) => c.getBoundingClientRect().right > calBox.right + 1).length,
        wide,
      }
    })
    if (overflow.secScroll > 1) problems.push(`${vp.name}: 달빛 섹션 가로 스크롤 ${overflow.secScroll}px`)
    if (overflow.calScroll > 1) problems.push(`${vp.name}: 달력 가로 넘침 ${overflow.calScroll}px`)
    if (overflow.clipped > 0) problems.push(`${vp.name}: 달력 칸 ${overflow.clipped}개가 잘림`)
    if (overflow.wide > 0) problems.push(`${vp.name}: 섹션 밖으로 삐져나온 요소 ${overflow.wide}개`)

    // 달력 칸 클릭 → 차트가 바뀌는가
    const before = await page.locator('.moon-peak-label').textContent().catch(() => null)
    await page.locator('.moon-cell:not(.moon-cell--pad)').nth(0).click()
    await page.waitForTimeout(400)
    const after = await page.locator('.moon-peak-label').textContent().catch(() => null)
    if (before === after) problems.push(`${vp.name}: 달력 칸 클릭해도 차트가 안 바뀜 (${before})`)
    else console.log(`[${vp.name}] 칸 클릭 → 최대값 ${before} → ${after}`)

    await sec.screenshot({ path: path.join(outDir, `${ICAO.toLowerCase()}-moon-${vp.name}.png`) })
    if (consoleErrors.length) problems.push(`${vp.name}: 콘솔 에러 ${consoleErrors.length}건 — ${consoleErrors[0]}`)
    await ctx.close()
  }

  await browser.close()
  if (problems.length) {
    console.error('\n검증 실패:')
    problems.forEach((p) => console.error(' -', p))
    process.exitCode = 1
  } else {
    console.log('\n검증 통과. 캡처:', outDir)
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1 })
