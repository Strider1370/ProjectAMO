// 인터넷에서 받은 실제 GPX/KML/GeoJSON 파일로 경로 불러오기 기능을 검증.
// (합성 픽스처가 아니라 실사용자가 받을 법한 파일들 — 사장님 수동 테스트용 파일과 동일.)
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appUrl = process.env.PROJECTAMO_URL || 'http://localhost:5173'
const outDir = process.env.PROJECTAMO_CAPTURE_DIR || path.join(__dirname, '../../artifacts/route-import-real')
const fixturesDir = path.join(__dirname, '../test/fixtures/route-import/real-world')

async function openVfrPanel(page) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.map-shell', { timeout: 20000 })
  await page.waitForTimeout(2000)
  const cb = page.locator('.updates-modal__close'); if (await cb.count()) { await cb.first().click(); await page.waitForTimeout(300) }
  await page.click('button[aria-label="비행 전 브리핑"]')
  await page.waitForSelector('.route-check-panel', { timeout: 10000 })
  await page.getByRole('tab', { name: 'VFR' }).click()
  await page.waitForTimeout(200)
}

async function run() {
  await fs.mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newContext({ viewport: { width: 1600, height: 1200 } }).then((c) => c.newPage())
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()) })
  try {
    // --- 1) 실제 GeoJSON (DC 도로 LineString, 174점 → 20점으로 솎임) ---
    await openVfrPanel(page)
    await page.setInputFiles('input[type="file"]', path.join(fixturesDir, 'dc-street-linestring.geojson'))
    await page.waitForSelector('.vfr-waypoint-altitude-id', { timeout: 10000 })
    await page.waitForTimeout(300)
    const geojsonWpCount = await page.locator('.vfr-waypoint-altitude-id').count()
    const geojsonWarning = await page.locator('.route-check-panel').innerText()
    await page.screenshot({ path: path.join(outDir, '1-geojson-real.png') })

    // --- 2) 실제 GPX (4개 연도 하이킹 트랙 → 선택 UI) ---
    await openVfrPanel(page)
    await page.setInputFiles('input[type="file"]', path.join(fixturesDir, 'nfa-hiking-track.gpx'))
    await page.waitForTimeout(600)
    const gpxChooserCount = await page.locator('button', { hasText: /실제 궤적/ }).count()
    await page.screenshot({ path: path.join(outDir, '2-gpx-real-chooser.png') })
    await page.locator('button', { hasText: /실제 궤적/ }).first().click()
    await page.waitForSelector('.vfr-waypoint-altitude-id', { timeout: 10000 })
    await page.waitForTimeout(300)
    const gpxWpCount = await page.locator('.vfr-waypoint-altitude-id').count()
    await page.screenshot({ path: path.join(outDir, '3-gpx-real-selected.png') })

    // --- 3) 실제 KML (10개 LineString → 선택 UI, 라벨 중복 번호 매김 확인) ---
    await openVfrPanel(page)
    await page.setInputFiles('input[type="file"]', path.join(fixturesDir, 'bangor-marina-linestrings.kml'))
    await page.waitForTimeout(600)
    const kmlChooserLabels = await page.locator('button', { hasText: /MultiGeometry/ }).allTextContents()
    await page.screenshot({ path: path.join(outDir, '4-kml-real-chooser.png') })
    await page.locator('button', { hasText: /MultiGeometry/ }).first().click()
    await page.waitForSelector('.vfr-waypoint-altitude-id', { timeout: 10000 })
    await page.waitForTimeout(300)
    const kmlWpCount = await page.locator('.vfr-waypoint-altitude-id').count()
    await page.screenshot({ path: path.join(outDir, '5-kml-real-selected.png') })

    console.log('GeoJSON(실제, 174→20점) waypoint 수:', geojsonWpCount, '(경고 포함 여부:', geojsonWarning.includes('한국 정보구역 밖'), ')')
    console.log('GPX(실제, 4개 트랙) 선택 UI 후보 수:', gpxChooserCount, '→ 선택 후 waypoint 수:', gpxWpCount)
    console.log('KML(실제, 10개 LineString) 선택 UI 라벨:', JSON.stringify(kmlChooserLabels.slice(0, 3)), '... 총', kmlChooserLabels.length, '개 → 선택 후 waypoint 수:', kmlWpCount)
    console.log('콘솔 에러:', pageErrors.length ? JSON.stringify(pageErrors) : '(없음)')

    if (geojsonWpCount < 2 || geojsonWpCount > 20) throw new Error(`GeoJSON waypoint count out of expected range: ${geojsonWpCount}`)
    if (gpxChooserCount !== 4) throw new Error(`Expected 4 track candidates in real GPX, got ${gpxChooserCount}`)
    if (gpxWpCount < 2) throw new Error(`GPX selected track produced too few waypoints: ${gpxWpCount}`)
    if (kmlChooserLabels.length !== 10) throw new Error(`Expected 10 LineString candidates in real KML, got ${kmlChooserLabels.length}`)
    if (!kmlChooserLabels[0].includes('(1)') || !kmlChooserLabels[1].includes('(2)')) throw new Error(`KML duplicate labels not disambiguated: ${JSON.stringify(kmlChooserLabels.slice(0, 2))}`)
    if (kmlWpCount !== 2) throw new Error(`KML selected LineString should have 2 waypoints, got ${kmlWpCount}`)
    if (pageErrors.length > 0) throw new Error(`Console errors during run: ${JSON.stringify(pageErrors)}`)

    console.log('PASS')
  } finally {
    await browser.close()
  }
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
