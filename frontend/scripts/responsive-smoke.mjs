import { chromium } from 'playwright'

const APP_URL = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'

const viewports = [
  { name: 'scaled-fhd-laptop', width: 1536, height: 864 },
  { name: 'desktop-fhd', width: 1920, height: 1080 },
  { name: 'wqhd-desktop', width: 2560, height: 1440 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
]

function boxInfo(box) {
  if (!box) {
    return null
  }

  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

const browser = await chromium.launch()
const failures = []

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport })
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.map-shell', { timeout: 15000 })

    const result = await page.evaluate(() => {
      const selectors = [
        '.sidebar',
        '.map-shell',
        '.map-view-wrapper',
        '.layer-drawer',
        '.route-check-panel',
        '.airport-panel',
      ]
      const boxes = Object.fromEntries(selectors.map((selector) => {
        const element = document.querySelector(selector)
        if (!element) {
          return [selector, null]
        }

        const rect = element.getBoundingClientRect()
        return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }]
      }))

      return {
        innerWidth,
        innerHeight,
        bodyScrollWidth: document.body.scrollWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        boxes,
      }
    })

    const maxScrollWidth = Math.max(result.bodyScrollWidth, result.documentScrollWidth)
    if (maxScrollWidth > result.innerWidth + 1) {
      failures.push(`${viewport.name}: horizontal overflow ${maxScrollWidth} > ${result.innerWidth}`)
    }

    const shell = result.boxes['.map-shell']
    if (!shell || shell.width < Math.min(320, result.innerWidth)) {
      failures.push(`${viewport.name}: map shell missing or too narrow`)
    }

    console.log(JSON.stringify({
      viewport: viewport.name,
      size: `${viewport.width}x${viewport.height}`,
      overflow: maxScrollWidth - result.innerWidth,
      boxes: Object.fromEntries(
        Object.entries(result.boxes).map(([selector, box]) => [selector, boxInfo(box)])
      ),
    }))

    await page.close()
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
