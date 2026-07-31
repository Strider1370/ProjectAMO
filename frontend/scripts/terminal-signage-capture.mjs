import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const viewport = { width: 1920, height: 1080 }
const routes = [
  { name: '01-board.png', url: '/terminal?autoplay=0', readiness: '[data-testid="option-one"]' },
  { name: '02-rail.png', url: '/terminal?view=rail&autoplay=0', readiness: '[data-testid="option-three"]' },
]

export function safePathComponent(value, name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`${name} must be a safe path component`)
  return value
}

export function buildCaptureCommand(phase, label) {
  return `PROJECTAMO_SCREENSHOT_PHASE=${phase} PROJECTAMO_SCREENSHOT_LABEL=${label} npm run dev:terminal-capture`
}

export function createManifest({ capturedAt, commit, browser, phase, label }) {
  return { capturedAt, commit, routes: routes.map(({ name, url }) => ({ name, url })), viewport, browser, command: buildCaptureCommand(phase, label), screenshots: [], status: 'running', error: null }
}

export async function captureSignage() {
  const phase = safePathComponent(process.env.PROJECTAMO_SCREENSHOT_PHASE || 'terminal-signage', 'phase')
  const label = safePathComponent(process.env.PROJECTAMO_SCREENSHOT_LABEL || 'before', 'label')
  const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
  const capturedAt = new Date().toISOString()
  const timestamp = capturedAt.replace(/[:.]/g, '').replace('T', '_').replace('Z', '')
  const outputDir = path.join(rootDir, 'artifacts', 'responsive-screenshots', phase, `${timestamp}_${label}`)
  let commit = 'unknown'
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim() } catch {}
  await mkdir(outputDir, { recursive: true })
  let browser
  const manifest = createManifest({ capturedAt, commit, browser: 'unknown', phase, label })
  try {
    browser = await chromium.launch()
    manifest.browser = browser.version()
    manifest.routes = routes.map(({ name, url }) => ({ name, url: new URL(url, appUrl).toString() }))
    for (const route of routes) {
      const context = await browser.newContext({ viewport })
      try {
        const page = await context.newPage()
        await page.goto(new URL(route.url, appUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForSelector(route.readiness, { timeout: 30000 })
        await page.evaluate(async () => document.fonts.ready)
        await page.screenshot({ path: path.join(outputDir, route.name), fullPage: false })
        manifest.screenshots.push(route.name)
        console.log(`captured ${route.name}`)
      } finally { await context.close() }
    }
    manifest.status = 'completed'
  } catch (error) {
    manifest.status = 'failed'
    manifest.error = { message: error instanceof Error ? error.message : String(error) }
    throw error
  } finally {
    await browser?.close()
    await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(`manifest: ${path.join(outputDir, 'manifest.json')}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await captureSignage() } catch (error) { console.error(error); process.exitCode = 1 }
}
