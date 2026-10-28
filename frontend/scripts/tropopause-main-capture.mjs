import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'

const directory = path.resolve(import.meta.dirname, '../../artifacts/tropopause-comparison')
const manifest = JSON.parse(await fs.readFile(path.join(directory, 'data/index.json'), 'utf8'))
const item = manifest.cases.find(entry => entry.hf === 10)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', extraHTTPHeaders: { 'X-ProjectAMO-Analytics': 'ignore' } })
const errors = [], requests = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(version => {
  localStorage.setItem('projectamo:skip-intro', '1')
  localStorage.setItem('amo.tour.v1.done', '1')
  localStorage.setItem('projectamo.sidebarIntroShown', '1')
  localStorage.setItem('projectamo:lastSeenVersion', version)
}, CURRENT_VERSION)
await page.route('**/api/kim/tropopause/**', route => {
  const url = new URL(route.request().url())
  if (url.pathname.endsWith('/index')) return route.fulfill({ json: { latestRun: item.tmfc, domain: item.domain, revision: item.revision, times: [item] } })
  if (url.pathname.endsWith('/runs')) return route.fulfill({ json: { fields: [] } })
  requests.push(Object.fromEntries(url.searchParams))
  return route.fulfill({ path: path.join(directory, 'data', item.filename), contentType: 'application/json' })
})
async function ready() {
  await page.waitForFunction(revision => {
    const canvas = document.querySelector('.tropopause-jet-canvas')
    return window.__map?.isStyleLoaded() && window.__map?.isSourceLoaded('kim-tropopause-jet-source')
      && canvas?.dataset.model?.includes(`${revision}:display-v2`) && JSON.parse(canvas.dataset.stats).jets === 2
  }, item.revision, { timeout: 90_000 })
  await page.evaluate(() => new Promise(resolve => {
    const map = window.__map
    if (map.areTilesLoaded()) return resolve()
    map.once('idle', resolve)
    setTimeout(resolve, 10_000)
  }))
}
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  const entry = page.getByRole('button', { name: '기상정보', exact: true })
  await entry.click()
  await page.getByRole('button', { name: '권계면·제트', exact: true }).click()
  await entry.click()
  await ready()
  assert.equal(requests[0].domain, 'ea')
  assert.equal(requests[0].revision, item.revision)
  await page.evaluate(() => { window.__map.jumpTo({ center: [125, 33], zoom: 4.1 }) })
  await ready()
  await page.screenshot({ path: path.join(directory, 'screenshots/main-default.png') })
  await page.evaluate(() => { window.__map.jumpTo({ center: [120, 39.5], zoom: 5.2 }) })
  await ready()
  await page.waitForFunction(() => JSON.parse(document.querySelector('.tropopause-jet-canvas').dataset.stats).cores > 0)
  await page.screenshot({ path: path.join(directory, 'screenshots/main-zoomed-cores.png') })
  for (const name of [/^남색/, /^기본/]) {
    await page.getByRole('button', { name: /지도 선택$/ }).click()
    await page.getByRole('menuitemradio', { name }).click()
    await ready()
    await expect(page.locator('.tropopause-jet-canvas')).toHaveCount(1)
  }
  await entry.click()
  await page.getByRole('button', { name: '권계면·제트', exact: true }).click()
  await expect(page.locator('.tropopause-jet-canvas')).toHaveCount(0)
  assert.equal(await page.evaluate(() => Boolean(window.__map.getSource('kim-tropopause-jet-source'))), false)
  await page.getByRole('button', { name: '권계면·제트', exact: true }).click()
  await entry.click()
  await ready()
  assert.deepEqual(errors, [])
  const result = { checkedAt: new Date().toISOString(), field: item, checks: ['native layer toggle', '5000ft model', 'localized strong cores', 'two basemap switches', 'no duplicate canvas', 'source cleanup', 're-enable from cache'], requests, errors }
  await fs.writeFile(path.join(directory, 'main-verification.json'), JSON.stringify(result, null, 2))
  console.log('Native map checks passed')
} finally { await browser.close() }
