import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '../frontend/node_modules/playwright/index.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))
const out = path.join(repo, 'artifacts/acim-preview')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const reports = []
try {
  for (const [name, width, height] of [['desktop',1440,1100],['tablet',1024,1000],['mobile',390,960]]) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = [], external = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()) })
    await page.goto(pathToFileURL(path.join(repo, 'docs/design/mockups/acim-reference-map.html')).href)
    await page.waitForFunction(() => window.acimPreview)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const hasLive = await page.evaluate(() => Boolean(window.acimPreview.live))
    assert.equal(await page.locator('#source').textContent(), hasLive ? '실제 KIM 입력 · 검증 중' : '합성 입력 · 화면 예시')
    assert.equal(await page.locator('.bands span').count(), 7)
    if (hasLive) {
      assert.equal(await page.locator('#forecast option:enabled').count(), 1)
      assert.match(await page.locator('#valid').textContent(), /21:00 KST/)
      await page.locator('#zone').selectOption('UTC')
      assert.match(await page.locator('#valid').textContent(), /12:00 UTC/)
      await page.locator('#zone').selectOption('Asia/Seoul')
      const off = await page.evaluate(() => { document.querySelector('#visibility').click(); return document.querySelector('#map').toDataURL() })
      const on = await page.evaluate(() => { document.querySelector('#visibility').click(); return document.querySelector('#map').toDataURL() })
      assert.notEqual(on, off)
    }
    await page.screenshot({ path: path.join(out, `reference-${name}.png`), fullPage: true })
    await page.locator('#mode').selectOption('sample')
    assert.equal(await page.locator('#forecast option:enabled').count(), 13)
    const early = await page.evaluate(() => window.acimPreview.sampleFrame(0).topFt)
    await page.locator('#forecast').selectOption('12')
    const late = await page.evaluate(() => window.acimPreview.sampleFrame(12).topFt)
    assert.notDeepEqual(early, late)
    assert.ok(late.includes(35000))
    await page.screenshot({ path: path.join(out, `sample-${name}.png`), fullPage: true })
    assert.deepEqual(errors, [])
    assert.deepEqual(external, [])
    reports.push({ name, viewport: {width, height}, liveFrame: hasLive, errors, externalRequests: external.length, checks: ['no overflow','seven height bands','exact live hour only','UTC/KST','visibility toggle','13 synthetic frames'] })
    await page.close()
  }
} finally { await browser.close() }
await fs.writeFile(path.join(out, 'browser-verification.json'), JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
