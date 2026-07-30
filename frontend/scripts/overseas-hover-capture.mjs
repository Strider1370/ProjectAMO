// @ts-nocheck
// 해외 공항 마커 호버창 검증 캡처. 인풋이 TAC인 해외 공항에서 현재기상·시정·운고·RVR·기온·QNH가
// 전문과 맞게 뜨는지 본다. window.__map(DEV 노출)으로 공항으로 점프 → 마커 픽셀에 실제 mousemove.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const outDir = process.env.PROJECTAMO_CAPTURE_DIR || path.join(__dirname, `../../artifacts/overseas-hover/${stamp}`)
const STATION_LAYER = 'kma-weather-airports-station-center'
const TARGETS = (process.env.PROJECTAMO_HOVER_ICAOS || 'RJTT,WBKK,RJAA,VHHH,RKSI').split(',')
// 점프용 대략 좌표. 마커는 뷰포트 안에서 icao로 다시 찾으므로 정밀할 필요는 없다.
const COORDS = {
  RJTT: [139.781, 35.553], WBKK: [116.051, 5.937], RJAA: [140.386, 35.765],
  VHHH: [113.922, 22.309], RKSI: [126.451, 37.469], RJCC: [141.692, 42.775],
  RJSS: [140.917, 38.140], RPLL: [121.020, 14.509], ZSHC: [120.434, 30.230],
}

async function hoverTooltip(page, icao, coords) {
  // jumpTo는 Map 객체를 반환한다 — 그대로 돌려주면 직렬화가 터지므로 값을 반환하지 않는다.
  await page.evaluate(({ c }) => { window.__map.jumpTo({ center: c, zoom: 7 }) }, { c: coords })
  await page.waitForTimeout(1500)
  const target = await page.evaluate(({ icao, layer }) => {
    const m = window.__map
    const f = m.queryRenderedFeatures({ layers: [layer] }).find((x) => x.properties?.icao === icao)
    if (!f) return null
    const p = m.project(f.geometry.coordinates)
    const box = m.getCanvas().getBoundingClientRect()
    return { x: Math.round(p.x + box.left), y: Math.round(p.y + box.top) }
  }, { icao, layer: STATION_LAYER })
  if (!target) return null
  await page.mouse.move(target.x - 60, target.y - 60)
  await page.mouse.move(target.x, target.y, { steps: 10 })
  await page.waitForSelector('.airport-tooltip', { timeout: 5000 })
  await page.waitForTimeout(400)
  return page.locator('.airport-tooltip').first()
}

async function run() {
  await fs.mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 }).then((c) => c.newPage())
  const report = []
  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.map-shell', { timeout: 20000 })
    const close = page.locator('.updates-modal__close')
    if (await close.count()) { await close.first().click(); await page.waitForTimeout(300) }
    await page.waitForFunction((layer) => window.__map?.isStyleLoaded() && window.__map.getLayer(layer), STATION_LAYER, { timeout: 30000 })
    await page.waitForTimeout(4000) // 기상 폴링 1회분 — 마커가 METAR로 채워질 시간

    for (const icao of TARGETS) {
      const coords = COORDS[icao]
      if (!coords) { report.push({ icao, error: 'coords not found' }); console.log(icao, 'SKIP coords'); continue }
      const tooltip = await hoverTooltip(page, icao, coords)
      if (!tooltip) { report.push({ icao, error: 'marker not rendered' }); console.log(icao, 'SKIP marker'); continue }
      const rows = await tooltip.evaluate((el) => {
        const out = { icao: el.querySelector('.airport-tooltip-icao')?.textContent, badge: el.querySelector('.airport-tooltip-badge')?.textContent || null }
        for (const row of el.querySelectorAll('.airport-tooltip-row')) {
          out[row.querySelector('.airport-tooltip-label').textContent] = row.querySelector('.airport-tooltip-value').textContent
        }
        return out
      })
      await tooltip.screenshot({ path: path.join(outDir, `${icao}-tooltip.png`) })
      await page.screenshot({ path: path.join(outDir, `${icao}-map.png`) })
      report.push(rows)
      console.log(icao, JSON.stringify(rows))
      await page.mouse.move(20, 20)
      await page.waitForTimeout(300)
    }
    await fs.writeFile(path.join(outDir, 'hover-values.json'), JSON.stringify(report, null, 2))
    console.log('outDir:', outDir)
  } finally {
    await browser.close()
  }
}
run().catch((e) => { console.error(e); process.exitCode = 1 })
