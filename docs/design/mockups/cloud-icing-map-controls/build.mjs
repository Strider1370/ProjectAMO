// Design-only: reuse the saved KIM A mockup. No servers or weather API requests.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '../../../../frontend/node_modules/playwright/index.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(dir, '../../../..')
const browser = await chromium.launch({ headless: true })
let data
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const requests = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort() })
  await page.goto(pathToFileURL(path.join(repo, 'docs/design/mockups/cloud-icing-variants.html')).href)
  await page.waitForFunction(() => !!window.__cloudIcingVariants)
  data = await page.evaluate(() => {
    const preview = window.__cloudIcingVariants, source = window.CLOUD_ICING_DESIGN_DATA
    const maps = {}
    preview.state.view = 'map'; preview.state.focusA = true; preview.state.dataset = 'real'; preview.state.detail = true
    for (const { hf } of source.times) for (const level of source.levels) {
      preview.state.hf = hf; preview.state.level = level; preview.renderCards()
      const svg = document.querySelector('#cards .figure svg')
      const paths = new Map()
      for (const f of source.maps[`${hf}:${level}`].contours.features) for (const chain of f.geometry.coordinates) {
        const d = chain.map(([lon, lat], i) => `${i ? 'L' : 'M'}${((lon - 122.5) / 11.5 * 720).toFixed(2)},${((40 - lat) / 8 * 470).toFixed(2)}`).join(' ')
        paths.set(d, f.properties.temperature)
      }
      for (const node of svg.querySelectorAll('path.contour')) {
        const temperature = paths.get(node.getAttribute('d'))
        if (temperature === undefined) throw new Error('Unidentified contour')
        node.dataset.temperature = String(temperature)
      }
      for (const node of svg.querySelectorAll('text.temperature-label')) if (/°C$/.test(node.textContent)) node.dataset.temperature = String(parseFloat(node.textContent))
      maps[`${hf}:${level}`] = { svg: svg.outerHTML, counts: source.maps[`${hf}:${level}`].counts }
    }
    return { tmfc: source.tmfc, times: source.times, levels: source.levels, maps }
  })
  if (requests.length || errors.length) throw new Error(JSON.stringify({ requests, errors }))
} finally { await browser.close() }

const [css, js, tokens] = await Promise.all([
  fs.readFile(path.join(dir, 'preview.css'), 'utf8'),
  fs.readFile(path.join(dir, 'preview.js'), 'utf8'),
  fs.readFile(path.join(repo, 'frontend/src/shared/theme/tokens.css'), 'utf8'),
])
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>지도 위 구름·착빙 조작 · 3안 비교</title><style>${tokens}\n${css}</style></head><body><main id="app"></main><script>window.CONTROL_DESIGN_DATA=${JSON.stringify(data).replaceAll('<', '\\u003c')};</script><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`
const target = path.resolve(dir, '../cloud-icing-map-controls.html')
await fs.writeFile(target, html)
console.log(target)
