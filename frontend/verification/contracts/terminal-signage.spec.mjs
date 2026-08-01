import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'terminal signage has one fixed 1920x1080 contract')
})

const cases = [
  { name: 'board', url: '/terminal?autoplay=0', button: '1안', root: '[data-testid="option-one"]', modes: ['FLAP', 'ROLL', 'WIPE', 'FADE'] },
  { name: 'rail', url: '/terminal?view=rail&autoplay=0', button: '3안', root: '[data-testid="option-three"]', modes: ['FLAP', 'ROLL', 'WIPE', 'FADE', 'CASCADE'] },
]

async function boxMap(page, selector) {
  return page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect()
    return { text: node.textContent.trim(), x: box.x, y: box.y, width: box.width, height: box.height }
  }))
}

async function fixedLabelSnapshot(page, root, phase) {
  return page.locator(`${root} [data-fixed-label]`).evaluateAll((nodes, phase) => nodes
    .filter((node) => phase === 'static' ? !node.closest('.board-page, .rail-page') : node.closest(`.${phase}`))
    .map((node) => {
      const box = node.getBoundingClientRect()
      return { text: node.textContent.trim(), x: box.x, y: box.y, width: box.width, height: box.height }
    }), phase)
}

async function assertFixedLabels(page, root, beforeStatic, beforePage) {
  for (const delay of [0, 120, 300]) {
    if (delay) await page.waitForTimeout(delay)
    expect(await fixedLabelSnapshot(page, root, 'static')).toEqual(beforeStatic)
    expect(await fixedLabelSnapshot(page, root, 'is-leaving')).toEqual(beforePage)
    expect(await fixedLabelSnapshot(page, root, 'is-entering')).toEqual(beforePage)
  }
}

async function expectContained(page, text, regionSelector) {
  await expect(page.getByText(text, { exact: true })).toBeVisible()
  expect(await page.getByText(text, { exact: true }).evaluate((node, regionSelector) => {
    const value = node.getBoundingClientRect()
    const region = node.closest(regionSelector).getBoundingClientRect()
    return value.left >= region.left - 1 && value.right <= region.right + 1 && value.top >= region.top - 1 && value.bottom <= region.bottom + 1
  }, regionSelector)).toBe(true)
}

async function expectClockContained(page, text, regionSelector) {
  await expect(page.getByText(text, { exact: true })).toBeVisible()
  expect(await page.getByText(text, { exact: true }).evaluate((node, selector) => {
    const value = node.getBoundingClientRect()
    const region = node.closest(selector).getBoundingClientRect()
    return value.left >= region.left - 1 && value.right <= region.right + 1 && value.top >= region.top - 1 && value.bottom <= region.bottom + 1
  }, regionSelector)).toBe(true)
}

for (const target of cases) {
  test(`terminal-signage ${target.name} keeps passenger text legible`, async ({ page }) => {
    const externalFonts = []
    page.on('request', (request) => {
      if (/fonts\.googleapis|fonts\.gstatic/.test(request.url())) externalFonts.push(request.url())
    })
    await page.goto(target.url)
    await expect(page.getByRole('heading', { name: '출발 항공편 · 도착지 날씨' })).toBeVisible()
    await expect(page.getByRole('button', { name: target.button })).toHaveClass(/is-active/)

    const metrics = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      required: [...document.querySelectorAll('[data-signage-text="required"]')].map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      ordinary: [...document.querySelectorAll('[data-signage-text="ordinary"]')].map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      auxiliary: [...document.querySelectorAll('[data-signage-text="auxiliary"]')].map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      allText: [...document.querySelectorAll('.terminal-signage *')]
        .filter((node) => getComputedStyle(node).display !== 'none' && [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()))
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    }))
    expect(metrics.width).toBeLessThanOrEqual(1920)
    expect(metrics.height).toBeLessThanOrEqual(1080)
    expect(metrics.required.length).toBeGreaterThan(0)
    expect(metrics.ordinary.length).toBeGreaterThan(0)
    expect(metrics.auxiliary.length).toBeGreaterThan(0)
    expect(metrics.allText.length).toBeGreaterThan(0)
    expect(Math.min(...metrics.required)).toBeGreaterThanOrEqual(24)
    expect(Math.min(...metrics.ordinary)).toBeGreaterThanOrEqual(26)
    expect(Math.min(...metrics.auxiliary)).toBeGreaterThanOrEqual(22)
    expect(Math.min(...metrics.allText)).toBeGreaterThanOrEqual(20)
    expect(externalFonts).toEqual([])
    await expect(page).toHaveScreenshot(`terminal-${target.name}.png`, { animations: 'disabled' })
  })

  test(`terminal-signage ${target.name} preserves semantics, fixed labels, and value-only motion`, async ({ page }) => {
    await page.goto(target.url)
    const root = page.locator(target.root)
    await expect(root).toBeVisible()
    if (target.name === 'board') {
      const sections = await boxMap(page, `${target.root} [data-section]`)
      expect(sections.map(({ text }) => text).length).toBeGreaterThanOrEqual(18)
      for (const flight of [0, 1, 2]) {
        const column = sections.slice(flight * 6, flight * 6 + 6)
        const [identity, flightId, departure, arrival, forecast, currentWeather] = column
        expect(identity.y).toBeLessThan(flightId.y)
        expect(flightId.y).toBeLessThan(departure.y)
        expect(departure.y).toBeLessThan(arrival.y)
        expect(arrival.y).toBeLessThan(forecast.y)
        expect(forecast.y).toBeLessThan(currentWeather.y)
      }
    } else {
      const headerCollisionFree = await page.evaluate(() => {
        const indicator = document.querySelector('.exact-rail .terminal-page-indicator').getBoundingClientRect()
        return [...document.querySelectorAll('.exact-rail header button, .exact-rail header button *')]
          .filter((node) => node.getClientRects().length)
          .every((node) => {
            const box = node.getBoundingClientRect()
            return indicator.right <= box.left || indicator.left >= box.right || indicator.bottom <= box.top || indicator.top >= box.bottom
          })
      })
      expect(headerCollisionFree).toBe(true)
      const railRows = await page.locator(`${target.root} [data-testid="rail-flight-row"]`).evaluateAll((rows) => rows.map((row) => {
        const box = (node) => {
          const value = node.getBoundingClientRect()
          return { x: value.x, y: value.y, width: value.width, height: value.height }
        }
        const info = row.querySelector('[data-region="flight-info"]')
        const arrival = row.querySelector('[data-region="arrival-weather"]')
        const arrivalSurface = row.querySelector('.rail-arrival-forecast')
        const future = [...row.querySelectorAll('.rail-future-forecast .rail-forecast-content')]
        return { flightId: row.dataset.flightId, info: box(info), arrival: box(arrival), arrivalSurface: box(arrivalSurface), future: future.map(box) }
      }))
      expect(railRows).toHaveLength(3)
      for (const { flightId, info, arrival, arrivalSurface, future } of railRows) {
        expect(flightId).toBeTruthy()
        expect(arrival.x).toBeGreaterThan(info.x)
        expect(info.width / (info.width + arrival.width)).toBeCloseTo(.32, 2)
        expect(arrivalSurface.x).toBeLessThan(future[0].x)
      }
    }

    for (const mode of target.modes) {
      const staticLabels = await fixedLabelSnapshot(page, target.root, 'static')
      const pageLabels = await fixedLabelSnapshot(page, target.root, target.name === 'board' ? 'board-page' : 'rail-page')
      expect(staticLabels.length + pageLabels.length).toBeGreaterThan(0)
      await page.getByRole('button', { name: mode }).click()
      await page.getByRole('button', { name: '다음 3편' }).click()
      await expect(root.locator('.is-entering')).toBeVisible()
      await assertFixedLabels(page, target.root, staticLabels, pageLabels)
      const animations = await page.locator('.terminal-signage *').evaluateAll((nodes) => nodes
        .filter((node) => getComputedStyle(node).animationName !== 'none')
        .map((node) => node.hasAttribute('data-terminal-motion-value')))
      expect(animations).not.toEqual([])
      expect(animations.every(Boolean)).toBe(true)
      if (mode === 'CASCADE') {
        const leavingRows = await boxMap(page, `${target.root} .rail-page.is-leaving .rail-flight-row`)
        const enteringRows = await boxMap(page, `${target.root} .rail-page.is-entering .rail-flight-row`)
        expect(enteringRows.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(leavingRows.map(({ x, y, width, height }) => ({ x, y, width, height })))
        const cascade = await page.locator(`${target.root} .rail-page.is-entering [data-terminal-motion-value]`).evaluateAll((nodes) => nodes.map((node) => ({ order: Number(getComputedStyle(node).getPropertyValue('--terminal-motion-order')), delay: Number.parseFloat(getComputedStyle(node).animationDelay) })))
        expect(cascade.length).toBeGreaterThan(0)
        expect(cascade.every(({ order, delay }, index) => index === 0 || (order >= cascade[index - 1].order && delay >= cascade[index - 1].delay))).toBe(true)
      }
      await expect(root.locator('.is-entering')).toHaveCount(0, { timeout: 2500 })
    }
  })
}

test('terminal-signage advances committed groups, cancels a view change, and keeps long passenger content inside its regions', async ({ page }) => {
  await page.goto('/terminal?autoplay=0')
  await expect(page.getByText('다음 날 01:50', { exact: true })).toBeVisible()
  await expectClockContained(page, '다음 날 01:50', '.terminal-arrival-surface')
  await expectContained(page, '샤를 드골 국제공항', '.terminal-board-identity')
  await page.getByRole('button', { name: '다음 3편' }).click()
  await expect(page.locator('.board-page.is-entering')).toHaveCount(0, { timeout: 2500 })
  await expect(page.getByText('다음 날 01:25', { exact: true })).toBeVisible()
  await expectClockContained(page, '다음 날 01:25', '.terminal-arrival-surface')
  await expectContained(page, '레오나르도 다 빈치 국제공항', '.terminal-board-identity')
  expect(await page.locator('.terminal-board-identity').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight))).toBe(true)
  const indicator = await page.locator('.terminal-page-indicator').getAttribute('aria-label')
  await page.getByRole('button', { name: '다음 3편' }).click()
  await expect(page.locator('.board-page.is-entering')).toBeVisible()
  await page.getByRole('button', { name: '3안' }).click()
  await expect(page.getByText('다음 날 01:25', { exact: true })).toBeVisible()
  await expectClockContained(page, '다음 날 01:25', '.terminal-arrival-clocks')
  expect(await page.locator('.rail-destination').evaluateAll((nodes) => nodes.every((node) => {
    const destination = node.getBoundingClientRect()
    const region = node.closest('[data-region="flight-info"]').getBoundingClientRect()
    return destination.left >= region.left && destination.right <= region.right && destination.top >= region.top && destination.bottom <= region.bottom
  }))).toBe(true)
  expect(await page.getByText('다음 날 01:25', { exact: true }).evaluate((node) => {
    const value = node.getBoundingClientRect()
    const region = node.closest('.terminal-arrival-clocks').getBoundingClientRect()
    return value.left >= region.left && value.right <= region.right
  })).toBe(true)
  await page.waitForTimeout(2000)
  await expect(page.locator('.is-entering')).toHaveCount(0)
  await expect(page.locator('.terminal-page-indicator')).toHaveAttribute('aria-label', indicator)
  await expectContained(page, '레오나르도 다 빈치 국제공항', '.rail-flight-info')
  await page.getByRole('button', { name: '다음 3편' }).click()
  await expect(page.locator('.rail-page.is-entering')).toHaveCount(0, { timeout: 2500 })
  await expect(page.getByText('다음 날 01:50', { exact: true })).toBeVisible()
  await expectClockContained(page, '다음 날 01:50', '.terminal-arrival-clocks')
  await expectContained(page, '샤를 드골 국제공항', '.rail-flight-info')
})

for (const view of ['board', 'rail']) {
  for (const fixtureState of ['loading', 'partial', 'error']) {
    test(`terminal-signage ${view} ${fixtureState} fixture is readable`, async ({ page }) => {
      const query = view === 'rail' ? 'view=rail&' : ''
      await page.goto(`/terminal?${query}autoplay=0&fixtureState=${fixtureState}`)
      await expect(page.getByText(fixtureState === 'loading' ? '운항 정보를 불러오는 중입니다' : fixtureState === 'error' ? '운항 정보를 불러오지 못했습니다' : '일부 정보 확인 중').first()).toBeVisible()
      await expect(page.locator('.terminal-signage')).not.toContainText(/undefined|--/)
    })
  }
}
