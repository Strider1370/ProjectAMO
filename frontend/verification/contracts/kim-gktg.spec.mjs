import { test, expect } from '../fixtures.mjs'
import { CURRENT_VERSION } from '../../src/features/about/changelog.js'
const revision = 'a'.repeat(20)
const grid = { nx: 4, ny: 4, lonMin: 124, lonMax: 130, latMin: 33, latMax: 40 }
const levels = [500, 300].map(value => ({ id: `${value}hPa`, value, kind: 'pressure', unit: 'hPa' }))
const times = [{ hf: 6, validTime: '2026-09-10T12:00:00.000Z' }, { hf: 9, validTime: '2026-09-10T15:00:00.000Z' }]
test('weather raster: loading ends when the activated image is displayed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop map loading indicator')
  await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
  let releaseImage
  const imageWait = new Promise(resolve => { releaseImage = resolve })
  const webp = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/v02aAA=', 'base64')
  await page.route('**/data/radar/hsr/hsr_meta.json', route => route.fulfill({ json: { frames: [{ tm: '202611120900', timeMs: Date.now(), path: '/data/radar/hsr/test-initial.webp', bounds: [[30, 120], [40, 130]] }] } }))
  await page.route('**/data/radar/hsr/test-initial.webp', async route => { await imageWait; await route.fulfill({ contentType: 'image/webp', body: webp }) })
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '기상정보', exact: true }).click()
    const radar = page.getByRole('button', { name: '레이더', exact: true })
    await expect(radar).toHaveAttribute('aria-pressed', 'true')
    await radar.click()
    await radar.click()
    const loading = page.getByRole('progressbar', { name: '기상 자료 불러오는 중' })
    await expect(loading).toBeVisible()
    releaseImage()
    await expect.poll(() => page.evaluate(() => Boolean(window.__map?.getLayer('kma-hsr-overlay')))).toBe(true)
    await expect(loading).toHaveCount(0)
  } finally { releaseImage() }
})
test('kim-gktg: loading bar is limited to activating a weather layer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop map loading indicator')
  await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
  let release
  const responseReady = new Promise(resolve => { release = resolve })
  await page.route('**/api/kim/gktg/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/index')) return route.fulfill({ json: { type: 'kim_nwp_gktg_index', product: 'GKTG', latestRun: '2026091006', revision, grid, levels, times,
      availability: Object.fromEntries(levels.map(level => [level.id, Object.fromEntries(times.map(time => [time.hf, { variables: ['gktg'], hashes: { gktg: revision } }]))])) } })
    await responseReady
    await route.fulfill({ json: { type: 'kim_nwp_gktg', product: 'GKTG', revision, grid, level: levels.find(l => l.id === url.searchParams.get('level')), time: { tmfc: '2026091006', hf: Number(url.searchParams.get('hf')), validTime: times.find(t => t.hf === Number(url.searchParams.get('hf'))).validTime }, encoding: 'float32-json-v1', gktg: Array(16).fill(0.2) } })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '기상정보', exact: true }).click()
  await page.getByRole('button', { name: '난류', exact: true }).click()
  const loading = page.getByRole('progressbar', { name: '기상 자료 불러오는 중' })
  await expect(loading).toBeVisible()
  await page.evaluate(() => window.__map.fire('dataloading', { dataType: 'source', sourceId: 'kma-weather-airports' }))
  release()
  await expect(loading).toHaveCount(0)
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.__map.fire('dataloading', { dataType: 'source', sourceId: 'test-weather-source' }))
  await page.waitForTimeout(500)
  await expect(loading).toHaveCount(0)
})
test('kim-gktg: another layer still loading does not keep the new layer indicator open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop map loading indicator')
  await page.addInitScript(version => { localStorage.setItem('amo.tour.v1.done', 'true'); localStorage.setItem('projectamo:lastSeenVersion', version) }, CURRENT_VERSION)
  let releaseAci
  let releaseGktg
  const aciWait = new Promise(resolve => { releaseAci = resolve })
  const gktgWait = new Promise(resolve => { releaseGktg = resolve })
  await page.route('**/api/kim/aci/index?*', async route => { await aciWait; await route.fulfill({ status: 503, json: {} }) })
  await page.route('**/api/kim/gktg/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/index')) return route.fulfill({ json: { type: 'kim_nwp_gktg_index', product: 'GKTG', latestRun: '2026091006', revision, grid, levels, times,
      availability: Object.fromEntries(levels.map(level => [level.id, Object.fromEntries(times.map(time => [time.hf, { variables: ['gktg'], hashes: { gktg: revision } }]))])) } })
    await gktgWait
    await route.fulfill({ json: { type: 'kim_nwp_gktg', product: 'GKTG', revision, grid, level: levels.find(l => l.id === url.searchParams.get('level')), time: { tmfc: '2026091006', hf: Number(url.searchParams.get('hf')), validTime: times.find(t => t.hf === Number(url.searchParams.get('hf'))).validTime }, encoding: 'float32-json-v1', gktg: Array(16).fill(0.2) } })
  })
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '기상정보', exact: true }).click()
    await page.getByRole('button', { name: '대류영역', exact: true }).click()
    const loading = page.getByRole('progressbar', { name: '기상 자료 불러오는 중' })
    await expect(loading).toBeVisible()
    await page.getByRole('button', { name: '난류', exact: true }).click()
    await expect(loading).toBeVisible()
    releaseGktg()
    await expect(loading).toHaveCount(0)
  } finally {
    releaseAci()
    releaseGktg()
  }
})
test('kim-gktg: replaces turbulence, uses shared pressure rail, colours, immutable revision and restores after style reload', async ({ page }, testInfo) => {
  await page.addInitScript(version => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  const requested = []
  await page.route('**/api/kim/gktg/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/index')) return route.fulfill({ json: { type: 'kim_nwp_gktg_index', product: 'GKTG', latestRun: '2026091006', revision, grid, levels, times,
      availability: Object.fromEntries(levels.map(level => [level.id, Object.fromEntries(times.map(time => [time.hf, { variables: ['gktg'], hashes: { gktg: revision } }]))])) } })
    requested.push(Object.fromEntries(url.searchParams))
    await route.fulfill({ json: { type: 'kim_nwp_gktg', product: 'GKTG', revision, grid, level: levels.find(l => l.id === url.searchParams.get('level')), time: { tmfc: '2026091006', hf: Number(url.searchParams.get('hf')), validTime: times.find(t => t.hf === Number(url.searchParams.get('hf'))).validTime },
      encoding: 'float32-json-v1', gktg: [null, ...Array.from({ length: 15 }, (_, i) => .1 + i * .02)] } })
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const entry = page.getByRole('button', { name: testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보', exact: true })
  await entry.click()
  await expect(page.getByRole('button', { name: '난류(실험)', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '난류', exact: true }).click()
  if (testInfo.project.name === 'mobile') await page.keyboard.press('Escape')
  else await entry.click()
  await expect.poll(() => requested.length).toBeGreaterThan(0)
  expect(requested[0].revision).toBe(revision)
  const rail = page.getByRole('slider', { name: 'KIM 고도', exact: true })
  await expect(rail).toBeVisible()
  if (testInfo.project.name !== 'mobile') await expect.poll(async () => (await rail.boundingBox()).height).toBeGreaterThanOrEqual(160)
  await expect(rail).toHaveAttribute('aria-valuetext', /500/)
  await expect.poll(() => page.evaluate(() => window.__map?.getLayoutProperty('kim-gktg-image-layer', 'visibility'))).toBe('visible')
  await rail.focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => requested.at(-1)?.level).toBe('300hPa')
  await expect.poll(() => page.evaluate(() => window.__map?.getLayoutProperty('kim-gktg-image-layer', 'visibility'))).toBe('visible')
  if (testInfo.project.name !== 'mobile') {
    await page.getByRole('button', { name: /지도 선택$/ }).click()
    await page.getByRole('menuitemradio', { name: /^남색/ }).click()
    await expect.poll(() => page.evaluate(() => window.__map?.getLayoutProperty('kim-gktg-image-layer', 'visibility'))).toBe('visible')
  }
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('gktg-native-layer.png') })
})
