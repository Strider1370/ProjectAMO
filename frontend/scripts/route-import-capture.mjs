// 경로 파일 불러오기 검증: GeoJSON/GPX 단일 경로 → 경유점 주입 + 브리핑 생성,
// GPX 다중 경로(rte+trk) → 선택 UI → 선택한 경로만 반영.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const outDir = process.env.PROJECTAMO_CAPTURE_DIR || path.join(__dirname, '../../artifacts/route-import')
const fixturesDir = path.join(__dirname, '../test/fixtures/route-import')

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
    // --- 1) GeoJSON 단일 경로 ---
    await openVfrPanel(page)
    await page.setInputFiles('input[type="file"]', path.join(fixturesDir, 'rkss-rkpk.geojson'))
    await page.waitForSelector('.vfr-waypoint-altitude-id', { timeout: 10000 })
    await page.waitForTimeout(300)
    const idsGeojson = await page.locator('.vfr-waypoint-altitude-id').allTextContents()
    // 데스크톱은 거리를 summaryStrip(Griffel 해시 클래스)로 표시 — 리터럴 클래스가 아니라
    // 패널 전체 텍스트에서 "거리 N NM" 패턴으로 찾는다.
    const panelTextGeojson = await page.locator('.route-check-panel').innerText()
    const distanceMatchGeojson = panelTextGeojson.match(/거리\s*([\d,]+(?:\.\d+)?)\s*NM/)
    await page.screenshot({ path: path.join(outDir, '1-geojson-waypoints.png') })

    // 브리핑 생성까지
    await page.getByRole('button', { name: /브리핑 생성/ }).click()
    await page.waitForTimeout(4000)
    const briefingErrorVisible = await page.locator('text=/브리핑 생성 실패|먼저 경로를 검색/').count()
    await page.screenshot({ path: path.join(outDir, '2-geojson-briefing.png') })

    // --- 2) GPX 단일 경로 ---
    await openVfrPanel(page)
    await page.setInputFiles('input[type="file"]', path.join(fixturesDir, 'rkss-rkpk.gpx'))
    await page.waitForSelector('.vfr-waypoint-altitude-id', { timeout: 10000 })
    await page.waitForTimeout(300)
    const idsGpx = await page.locator('.vfr-waypoint-altitude-id').allTextContents()
    await page.screenshot({ path: path.join(outDir, '3-gpx-waypoints.png') })

    // --- 3) GPX 다중 경로(rte+trk) → 선택 UI ---
    await openVfrPanel(page)
    await page.setInputFiles('input[type="file"]', path.join(fixturesDir, 'rkss-rkpk-multi.gpx'))
    await page.waitForTimeout(500)
    const chooserButtons = await page.locator('button', { hasText: /계획 경로|실제 궤적/ }).allTextContents()
    await page.screenshot({ path: path.join(outDir, '4-multi-chooser.png') })
    await page.locator('button', { hasText: '계획 경로' }).click()
    await page.waitForSelector('.vfr-waypoint-altitude-id', { timeout: 10000 })
    await page.waitForTimeout(300)
    const idsMultiChosen = await page.locator('.vfr-waypoint-altitude-id').allTextContents()
    await page.screenshot({ path: path.join(outDir, '5-multi-after-select.png') })

    console.log('GeoJSON waypoint ids:', JSON.stringify(idsGeojson))
    console.log('GeoJSON distance:', distanceMatchGeojson ? distanceMatchGeojson[0] : 'NOT FOUND')
    console.log('GPX waypoint ids:', JSON.stringify(idsGpx))
    console.log('Chooser buttons found:', JSON.stringify(chooserButtons))
    console.log('Multi-route chosen waypoint ids:', JSON.stringify(idsMultiChosen))
    console.log('Briefing error/prompt text count (expect 0):', briefingErrorVisible)
    console.log('Console errors during run:', pageErrors.length ? JSON.stringify(pageErrors) : '(none)')

    // 끝점 표시 텍스트는 UI가 id 뒤에 출발/도착 라벨을 같은 요소에 붙여 "RKSS출발"처럼 합쳐진다(정상).
    if (idsGeojson.length !== 5) throw new Error(`GeoJSON: expected 5 waypoints, got ${idsGeojson.length}: ${JSON.stringify(idsGeojson)}`)
    if (!idsGeojson[0].startsWith('RKSS') || !idsGeojson[4].startsWith('RKPK')) throw new Error(`GeoJSON endpoints not snapped: ${JSON.stringify(idsGeojson)}`)
    if (idsGpx.length !== 5) throw new Error(`GPX: expected 5 waypoints, got ${idsGpx.length}: ${JSON.stringify(idsGpx)}`)
    if (!idsGpx[0].startsWith('RKSS') || !idsGpx[4].startsWith('RKPK')) throw new Error(`GPX endpoints not snapped: ${JSON.stringify(idsGpx)}`)
    if (chooserButtons.length < 2) throw new Error(`Expected chooser with 2 candidates, got: ${JSON.stringify(chooserButtons)}`)
    if (idsMultiChosen.length !== 3) throw new Error(`Multi-route (계획 경로, 3pt rte): expected 3 waypoints, got ${idsMultiChosen.length}: ${JSON.stringify(idsMultiChosen)}`)
    if (briefingErrorVisible !== 0) throw new Error('Briefing generation showed an error/prompt after GeoJSON import')

    console.log('PASS')
  } finally {
    await browser.close()
  }
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
