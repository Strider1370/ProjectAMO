// 항적 패널 브라우저 검증 — ADS-B를 켜고 필터를 걸어 지도 위 항공기가 실제로 줄어드는지 본다.
// 실행: node frontend/scripts/traffic-panel-capture.mjs   (playwright는 frontend/node_modules)
import fs from 'node:fs/promises'
import { chromium } from 'playwright'

const url = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const outDir = process.env.PROJECTAMO_CAPTURE_DIR || 'artifacts/traffic-panel'
await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage())

function countAircraftOnMap() {
  // 지도에 실제로 그려진 기체 수. MapView가 개발 모드에서 window.__map으로 지도를 노출한다.
  return page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['adsb-layer'] }).length)
}

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.map-shell', { timeout: 30000 })
const closeModal = page.locator('.updates-modal__close')
if (await closeModal.count()) { await closeModal.first().click() }

// 1) 사이드바 → 항적 패널
await page.getByRole('button', { name: '항적' }).first().click()
await page.waitForSelector('[aria-label="항적 필터"]', { timeout: 10000 })
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/01-panel-off.png` })

// 2) 기상 패널에 항적 그룹이 없다
await page.getByRole('button', { name: '기상정보' }).first().click()
await page.waitForSelector('[aria-label="기상 레이어 토글"]', { timeout: 10000 })
const metText = await page.locator('[aria-label="기상 레이어 토글"]').innerText()
console.log('기상 패널에 ADS-B 흔적:', /ADS-B|항적/.test(metText))

// 3) ADS-B 켜기 → 수신 대기
await page.getByRole('button', { name: '항적' }).first().click()
await page.locator('[aria-label="항적 필터"] .traffic-switch input').check()
await page.waitForFunction(() => !document.querySelector('[aria-label="항적 필터"]')?.innerText.includes('전체 0'), { timeout: 60000 })
// Wait for features to actually render on the map
await page.waitForFunction(() => window.__map.queryRenderedFeatures({ layers: ['adsb-layer'] }).length > 0, { timeout: 30000 })
const total = await countAircraftOnMap()
console.log('전체 항공기:', total)
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/02-panel-on.png` })

// 4) 소속 하나만 체크 → 줄어드는지
await page.locator('[aria-label="항적 필터"] .traffic-group input[type=checkbox]').first().check()
await page.waitForTimeout(500)
const afterOperator = await countAircraftOnMap()
const panelCount = await page.locator('.layer-drawer-status').innerText()
console.log('소속 필터 후 지도:', afterOperator, '| 패널 표기:', panelCount)

// 5) 고도 구간 좁히기
await page.locator('[aria-label="항적 필터"] input[aria-label="고도 상한"]').fill('10000')
await page.waitForTimeout(500)
console.log('고도 필터 후 지도:', await countAircraftOnMap())

// 6) 검색
await page.locator('[aria-label="항적 필터"] .traffic-search').fill('KAL')
await page.waitForTimeout(500)
console.log('검색 후 지도:', await countAircraftOnMap())
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/03-filtered.png` })

// 7) 새로고침 → 필터 유지, 표시는 꺼짐
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.map-shell', { timeout: 30000 })
await page.getByRole('button', { name: '항적' }).first().click()
await page.waitForSelector('[aria-label="항적 필터"]')
console.log('새로고침 후 표시 켜짐:', await page.locator('[aria-label="항적 필터"] .traffic-switch input').isChecked())
console.log('새로고침 후 필터 유지:', await page.locator('[aria-label="항적 필터"] .traffic-group input[type=checkbox]').first().isChecked())
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/04-after-reload.png` })

await browser.close()
