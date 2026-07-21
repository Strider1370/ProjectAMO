// Capture script that reuses an already-running dev server (http://127.0.0.1:5173) instead
// of spinning up a managed one via `npm run dev:contract` — that command insists on owning
// ports 3001/5173 and kills whatever is already listening there, which can be a server the
// user is actively viewing. Run with: node scripts/_tmp-route-compare-capture.mjs
// (requires `npm run dev:serve` or equivalent already running).
import { chromium } from 'playwright'
import { installRouteBriefingFixtures } from '../verification/route-fixture.mjs'

const OUT = 'artifacts/tab-capture'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

await page.addInitScript(() => {
  localStorage.setItem('amo.tour.v1.done', 'true')
  localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
})
await installRouteBriefingFixtures(page)
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()

await page.getByRole('tab', { name: 'IFR', exact: true }).click()
await page.getByRole('button', { name: '출발 공항 선택', exact: true }).click()
await page.getByRole('button', { name: /RKSS$/ }).click()
await page.getByRole('button', { name: '도착 공항 선택', exact: true }).click()
await page.getByRole('button', { name: /RKPC$/ }).click()

await page.getByRole('textbox', { name: /en-route 경로|예: OSPAT/ }).fill('SEL')
await page.getByRole('button', { name: '경로 적용', exact: true }).click()
await page.getByRole('button', { name: '경로비교로', exact: true }).click()
await page.getByText('기본 경로', { exact: true }).waitFor()

await page.getByRole('button', { name: '이 경로에서 우회안 만들기', exact: true }).click()
await page.getByRole('button', { name: '이 경로에서 우회안 만들기', exact: true }).click()
await page.locator('.rb-alternative-card').nth(1).waitFor()

// 기본 경로 선택 버튼 확인 — 클릭 후 is-selected가 기본 경로로 옮겨가는지.
await page.locator('.rb-comparison-summary-select').click()
await page.screenshot({ path: `${OUT}/2d-base-route-selectable.png`, fullPage: true })

await browser.close()
console.log('saved', `${OUT}/2c-base-vs-alt-alignment.png`)
