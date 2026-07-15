import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const APP_URL = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const PHASE = process.env.PROJECTAMO_SCREENSHOT_PHASE || 'manual'
const LABEL = process.env.PROJECTAMO_SCREENSHOT_LABEL || 'after'
const capturedAt = new Date()
const stamp = capturedAt.toISOString()
  .replace(/\.\d{3}Z$/, '')
  .replace('T', '_')
  .replaceAll(':', '')
const OUT_DIR = new URL(
  `../../artifacts/responsive-screenshots/${PHASE}/${stamp}_${LABEL}/`,
  import.meta.url,
)
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim()

const viewports = [
  { name: 'scaled-fhd-laptop', width: 1536, height: 864 },
  { name: 'desktop-fhd', width: 1920, height: 1080 },
  { name: 'wqhd-desktop', width: 2560, height: 1440 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
]

const routes = [
  { name: 'main-map', path: '/', readySelector: '.map-shell' },
  { name: 'monitoring-ops', path: '/monitoring?mode=ops', readySelector: '.dashboard-root' },
  { name: 'monitoring-ground', path: '/monitoring?mode=ground', readySelector: '.dashboard-root' },
]

const manifest = {
  capturedAt: capturedAt.toISOString(),
  commit,
  phase: PHASE,
  label: LABEL,
  appUrl: APP_URL,
  method: 'frontend/scripts/responsive-screenshots.mjs',
  verificationCommands: ['npm.cmd run dev:screenshots'],
  viewports,
  routes,
  files: [],
}

// This route-level runner captures stable baseline pages. Interactive states
// from the Required Screen Coverage Matrix are captured by the phase-specific
// Playwright/UI-QA checkpoint steps after opening panels, tabs, and dialogs.
// Do not use this baseline runner alone to mark visual QA complete.

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch()

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport })
      await page.goto(`${APP_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForSelector(route.readySelector, { timeout: 15000 })

      const file = new URL(`${route.name}-${viewport.name}-${LABEL}.png`, OUT_DIR)
      await page.screenshot({ path: fileURLToPath(file), fullPage: false })
      manifest.files.push(fileURLToPath(file))
      console.log(fileURLToPath(file))

      await page.close()
    }
  }
} finally {
  await browser.close()
  await writeFile(fileURLToPath(new URL('manifest.json', OUT_DIR)), JSON.stringify(manifest, null, 2), 'utf8')
}
