import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { GROUND_SIGNAGE_NOW, installGroundSignageFixture } from '../verification/monitoring-ground-signage-fixture.mjs'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(frontendDir, '../..')
const captureRoot = path.join(rootDir, 'artifacts', 'responsive-screenshots', 'monitoring-ground-signage')
const activeRunPath = path.join(captureRoot, 'active-run.json')
const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const phase = process.env.PROJECTAMO_CAPTURE_PHASE
const viewport = { width: 1920, height: 1080 }
const commandList = [
  'npm --prefix frontend test -- src/features/monitoring/legacy/utils/groundForecastViewModel.test.js',
  'npm --prefix frontend run build',
  'npm --prefix frontend run dev:contract:fast -- contracts/monitoring-ground-signage.spec.mjs -g "ground-signage"',
  'npm run dev:contract -- --grep "ground-signage"',
  'PROJECTAMO_CAPTURE_PHASE=before npm run dev:ground-signage-capture',
  'PROJECTAMO_CAPTURE_PHASE=after npm run dev:ground-signage-capture',
]

if (!['before', 'after'].includes(phase)) {
  throw new Error('PROJECTAMO_CAPTURE_PHASE must be before or after')
}

const git = (args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim()
async function readLayout(page) {
  return page.evaluate(() => {
    const firstBox = (selectors) => {
      const element = selectors.map((selector) => document.querySelector(selector)).find(Boolean)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return {
      header: firstBox(['.left-panel-header']),
      rightTop: firstBox(['.right-panel-top']),
      map: firstBox(['.map-panel-wrap']),
      alert: firstBox(['[aria-label="공항경보"]', '.warning-banner']),
      current: firstBox(['[aria-label="현재 날씨"]', '.ground-current-card']),
      forecast: firstBox(['[aria-label="지상 예보"]', '.ground-hourly-strip', '.ground-forecast-panel']),
    }
  })
}

async function loadManifest(runDir) {
  const file = path.join(runDir, 'manifest.json')
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function run() {
  await fs.mkdir(captureRoot, { recursive: true })
  let runId
  let runDir
  let manifest
  const currentCommit = git(['rev-parse', 'HEAD'])

  if (phase === 'before') {
    const now = new Date()
    runId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}_monitoring-ground-signage`
    runDir = path.join(captureRoot, runId)
    manifest = {
      route: '/monitoring?mode=ground',
      viewport,
      generatedAt: now.toISOString(),
      branch: git(['branch', '--show-current']),
      commits: { before: currentCommit, after: null },
      captureMethod: 'Playwright Chromium via scripts/projectamo-dev.mjs managed launcher',
      phases: { before: false, after: false },
      commands: commandList,
    }
    await fs.mkdir(path.join(runDir, 'before'), { recursive: true })
    await fs.writeFile(activeRunPath, JSON.stringify({ runId }, null, 2), 'utf8')
  } else {
    ({ runId } = JSON.parse(await fs.readFile(activeRunPath, 'utf8')))
    runDir = path.join(captureRoot, runId)
    manifest = await loadManifest(runDir)
    manifest.commits.after = currentCommit
    await fs.mkdir(path.join(runDir, 'after'), { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  try {
    await page.clock.install({ time: GROUND_SIGNAGE_NOW })
    await installGroundSignageFixture(page)
    await page.goto(`${appUrl}/monitoring?mode=ground`, { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    if (phase === 'before') {
      await page.screenshot({ path: path.join(runDir, 'before', 'monitoring-ground-before-linux.png') })
      await fs.writeFile(path.join(runDir, 'before', 'layout.json'), JSON.stringify(await readLayout(page), null, 2), 'utf8')
      manifest.phases.before = true
    } else {
      await page.screenshot({ path: path.join(runDir, 'after', 'monitoring-ground-hourly-linux.png') })
      await page.clock.runFor(12_000)
      await page.locator('.ground-forecast-layer').evaluateAll((layers) => layers.forEach((layer) => layer.getAnimations().filter((animation) => animation.effect?.getKeyframes?.().some((frame) => Object.hasOwn(frame, 'opacity'))).forEach((animation) => animation.finish())))
      await page.screenshot({ path: path.join(runDir, 'after', 'monitoring-ground-weekly-linux.png') })
      await fs.writeFile(path.join(runDir, 'after', 'layout.json'), JSON.stringify(await readLayout(page), null, 2), 'utf8')
      manifest.phases.after = true
    }
  } finally {
    await browser.close()
  }

  await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log(runDir)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
