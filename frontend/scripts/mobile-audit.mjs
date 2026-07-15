// One-off mobile responsive audit capture (390x844).
// Drives the live dev app, opens every meaningful state, and screenshots it.
// Requires dev servers running: frontend localhost:5173, backend :3001.
// Uses a TEMP window.__amoMap hook (added in MapView.jsx) to open the airport drawer.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const APP = process.env.PROJECTAMO_URL || 'http://localhost:5173'
const OUT_DIR = new URL(`../../artifacts/responsive-screenshots/mobile-audit/${process.env.STAMP}/`, import.meta.url)
const VIEWPORT = { width: 390, height: 844 }
const LAST_SEEN_KEY = 'projectamo:lastSeenVersion'
const CURRENT_VERSION = process.env.CURRENT_VERSION || '0.1.7'

await mkdir(OUT_DIR, { recursive: true })
const results = []
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
// Prevent the updates board from auto-opening on first load.
await context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v) } catch {} }, [LAST_SEEN_KEY, CURRENT_VERSION])

const page = await context.newPage()
page.setDefaultTimeout(7000)

let n = 0
async function shot(name, note = '') {
  n += 1
  const id = String(n).padStart(2, '0')
  const file = new URL(`${id}_${name}.png`, OUT_DIR)
  await page.screenshot({ path: fileURLToPath(file), fullPage: false })
  results.push({ id, name, note, status: 'ok' })
  console.log(`[ok] ${id} ${name}`)
}
async function step(name, fn, note = '') {
  try { await fn(); await page.waitForTimeout(700); await shot(name, note) }
  catch (e) { results.push({ name, status: 'FAIL', error: String(e).split('\n')[0] }); console.log(`[FAIL] ${name}: ${String(e).split('\n')[0]}`) }
}

async function gotoMain() {
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.map-shell', { timeout: 20000 })
  await page.waitForTimeout(1500)
}
async function closePanels() {
  // Modals close via their X button, not Escape. Click whichever close button is present.
  for (const sel of ['.settings-close-btn', '.updates-modal__close']) {
    const btn = page.locator(sel)
    if (await btn.count().catch(() => 0)) { await btn.first().click({ timeout: 3000 }).catch(() => {}) }
  }
  await page.waitForTimeout(300)
}

// ---------- MAIN APP ----------
await gotoMain()
await step('main-map-default', async () => {}, 'collapsed sidebar, no panel')

// Mobile shell: bottom task bar (지도/브리핑/더보기), layer bottom-sheets, no sidebar.
await step('sheet-aviation', async () => { await page.click('.mobile-map-layer-btn[aria-label="항공정보 레이어"]') }, 'aviation bottom sheet')
await page.click('.mobile-map-layer-btn[aria-label="항공정보 레이어"]').catch(() => {}) // close
await page.waitForTimeout(300)

await step('sheet-met', async () => { await page.click('.mobile-map-layer-btn[aria-label="기상정보 레이어"]') }, 'MET bottom sheet')
await page.click('.mobile-map-layer-btn[aria-label="기상정보 레이어"]').catch(() => {}) // close
await page.waitForTimeout(300)

await step('task-route', async () => { await page.click('.mobile-task-btn:has-text("브리핑")') }, 'route briefing task')

await step('task-more', async () => { await page.click('.mobile-task-btn:has-text("더보기")') }, 'more menu')

await step('modal-settings-general', async () => {
  await page.click('.mobile-more-item:has-text("설정")')
  await page.waitForSelector('.settings-modal', { timeout: 5000 })
})
await step('modal-settings-minima', async () => { await page.click('.settings-tab-btn:has-text("공항 미니마")') })
await closePanels()
await page.waitForTimeout(300)

await step('modal-updates', async () => {
  await page.click('.mobile-more-item:has-text("업데이트")')
  await page.waitForSelector('.updates-modal', { timeout: 5000 })
})
await closePanels()
// Back to the map task before selecting an airport.
await page.click('.mobile-task-btn:has-text("지도")').catch(() => {})
await page.waitForTimeout(300)

// ---------- AIRPORT DRAWER (RKSI) via temp map hook ----------
async function openAirport(icao) {
  // Map tiles do not render in this capture env, so select via the temp hook
  // instead of clicking a Mapbox symbol. The drawer is pure data, no map needed.
  await page.waitForFunction(() => typeof window.__amoSelectAirport === 'function', { timeout: 15000 })
  await page.evaluate((icao) => window.__amoSelectAirport(icao), icao)
  await page.waitForSelector('.airport-panel', { timeout: 8000 })
}

await step('airport-drawer-current', async () => { await openAirport('RKSI') }, 'RKSI 현재날씨 (full-feature)')

// Airport detail uses a labeled tab bar; click each tab.
const airportTabs = [
  ['airport-tab-metar', 'METAR'],
  ['airport-tab-taf', 'TAF'],
  ['airport-tab-amos', 'AMOS'],
  ['airport-tab-warn', '공항경보'],
  ['airport-tab-info', '기상정보'],
]
for (const [name, label] of airportTabs) {
  await step(name, async () => { await page.click(`.airport-panel-tab:has-text("${label}")`) })
}

// ---------- MONITORING ----------
async function gotoMonitoring(query = '') {
  await page.goto(`${APP}/monitoring${query}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.dashboard-root', { timeout: 20000 })
  await page.waitForTimeout(1800)
}
await gotoMonitoring('?mode=ops')
await step('monitoring-weather-ops', async () => {
  await page.click('.phone-task-tab:has-text("기상정보")').catch(() => {})
}, 'mobile weather task tab, ops')

await step('monitoring-map', async () => { await page.click('.phone-task-tab:has-text("지도")') })
await step('monitoring-settings', async () => { await page.click('.phone-task-tab:has-text("설정")') })

await gotoMonitoring('?mode=ground')
await step('monitoring-weather-ground', async () => {
  await page.click('.phone-task-tab:has-text("기상정보")').catch(() => {})
}, 'mobile weather task tab, ground')

await writeFile(new URL('results.json', OUT_DIR), JSON.stringify(results, null, 2))
await browser.close()
console.log(`\nDONE. ${results.filter(r => r.status === 'ok').length} ok, ${results.filter(r => r.status === 'FAIL').length} failed.`)
console.log(fileURLToPath(OUT_DIR))
if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1
