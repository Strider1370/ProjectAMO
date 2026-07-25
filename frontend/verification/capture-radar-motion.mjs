// 실화면 캡처 — 실제 KMA 프레임의 이동 화살표를 3개 뷰포트로 남긴다. 픽스처를 쓰지 않는다.
import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

const BASE = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const OUT = process.env.CAPTURE_DIR || 'artifacts/responsive-screenshots/radar-motion/local'

const TARGETS = [
  { name: 'desktop', options: { viewport: { width: 1440, height: 900 } } },
  { name: 'ipad-landscape', options: { ...devices['iPad Pro 11 landscape'] } },
  { name: 'mobile', options: { ...devices['Pixel 5'] } },
]

const browser = await chromium.launch()
await mkdir(OUT, { recursive: true })

for (const target of TARGETS) {
  const context = await browser.newContext(target.options)
  const page = await context.newPage()
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const entry = target.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  await page.locator(`[aria-label="${entry}"]`).first().click()
  const radar = page.getByRole('button', { name: '레이더', exact: true })
  if (await radar.getAttribute('aria-pressed') !== 'true') await radar.click()
  await page.locator(`[aria-label="${entry}"]`).first().click()
  await page.getByRole('button', { name: '범례', exact: true }).click()
  await page.getByRole('button', { name: '이동 화살표 표시' }).click()
  await page.waitForTimeout(4000)

  const state = await page.evaluate(() => ({
    shaft: window.__map?.getSource('kma-radar-motion-shaft')?._data?.features?.length ?? null,
    head: window.__map?.getSource('kma-radar-motion')?._data?.features?.length ?? null,
  }))
  console.log(target.name, JSON.stringify(state))
  await page.screenshot({ path: `${OUT}/${target.name}.png`, fullPage: false })
  await context.close()
}

await browser.close()
