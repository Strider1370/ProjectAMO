import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve(import.meta.dirname, '../../artifacts/tropopause-comparison')
const output = path.join(directory, 'screenshots')
await fs.mkdir(output, { recursive: true })
const manifest = JSON.parse(await fs.readFile(path.join(directory, 'data/index.json'), 'utf8'))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
const errors = [], weatherRequests = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (/\/api\/kim\/tropopause/.test(request.url())) weatherRequests.push(request.url()) })
const reports = []
async function settle(axes) {
  await page.waitForSelector('main[data-ready="true"]', { timeout: 120_000 })
  await page.waitForFunction(expected => {
    const maps = window.__tropopauseComparisonMaps
    const canvases = [...document.querySelectorAll('.tropopause-jet-canvas')]
    const stats = canvases.map(canvas => { try { return JSON.parse(canvas.dataset.stats) } catch { return null } })
    return maps?.current?.isStyleLoaded() && maps?.proposed?.isStyleLoaded()
      && maps.current.isSourceLoaded('comparison-tropopause') && maps.proposed.isSourceLoaded('comparison-tropopause')
      && stats.length === 2 && stats[1]?.jets === expected
  }, axes, { timeout: 120_000 })
  await page.evaluate(() => Promise.all(Object.values(window.__tropopauseComparisonMaps).map(map => new Promise(resolve => {
    if (map.areTilesLoaded()) return resolve()
    const done = () => { map.off('idle', done); resolve() }
    map.once('idle', done)
    setTimeout(done, 10_000)
  }))))
  await page.evaluate(() => document.fonts.ready)
}
async function capture(name) { await page.screenshot({ path: path.join(output, `${name}.png`) }) }
try {
  await page.goto('http://127.0.0.1:5173/concepts/tropopause-jet-comparison', { waitUntil: 'domcontentloaded' })
  await settle(2)
  await capture('01-side-by-side-east-asia')
  await page.getByRole('button', { name: '기존 크게', exact: true }).click()
  await page.getByRole('button', { name: '동아시아', exact: true }).click()
  await settle(2)
  await capture('02-current-east-asia')
  await page.getByRole('button', { name: '제안 크게', exact: true }).click()
  await settle(2)
  await capture('03-proposed-east-asia')
  await page.getByRole('button', { name: '나란히', exact: true }).click()
  await page.getByRole('button', { name: '짧은 축 밀집 구역', exact: true }).click()
  await settle(2)
  await capture('04-side-by-side-detail')
  const positions = await page.evaluate(() => Object.values(window.__tropopauseComparisonMaps).map(map => ({ center: map.getCenter().toArray(), zoom: map.getZoom() })))
  assert.deepEqual(positions[0], positions[1], 'maps must have the same camera')
  await page.getByRole('checkbox', { name: '숨긴 축 확인' }).check()
  await settle(2)
  await capture('05-hidden-axis-diagnostic')
  await page.getByRole('checkbox', { name: '숨긴 축 확인' }).uncheck()
  await page.getByRole('checkbox', { name: '제트 축 정리', exact: true }).uncheck()
  await settle(16)
  await page.getByRole('checkbox', { name: '제트 축 정리', exact: true }).check()
  await settle(2)
  await page.getByRole('checkbox', { name: '권계면 5,000ft' }).uncheck()
  assert.ok((await page.getByRole('region', { name: '제안 표시', exact: true }).innerText()).includes('340'))
  await page.getByRole('checkbox', { name: '권계면 5,000ft' }).check()
  await page.getByRole('button', { name: '동아시아', exact: true }).click()
  for (const item of manifest.cases) {
    await page.getByRole('combobox', { name: '비교 유효시각' }).selectOption(item.filename)
    const expected = item.hf === 12 ? 4 : 2
    await page.waitForFunction(revision => [...document.querySelectorAll('.tropopause-jet-canvas')].every(canvas => canvas.dataset.model?.includes(revision)), item.revision)
    await settle(expected)
    reports.push({ hf: item.hf, validTime: item.validTime, sha256: item.sha256,
      render: await page.locator('.tropopause-jet-canvas').evaluateAll(canvases => canvases.map(canvas => JSON.parse(canvas.dataset.stats))) })
    await capture(`time-f${String(item.hf).padStart(3, '0')}`)
  }
  assert.equal(weatherRequests.length, 0, 'comparison must read only the archived weather fields')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(directory, 'browser-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), reports, errors, weatherRequests }, null, 2))
  console.log(JSON.stringify(reports, null, 2))
} finally { await browser.close() }
