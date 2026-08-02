import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'terminal signage has one fixed 1920x1080 contract')

  const airports = [
    ['RKSS', '김포국제공항'],
    ['RKPC', '제주국제공항'],
    ['RKPU', '울산공항'],
    ['RKNY', '양양국제공항'],
    ['RKJY', '여수공항'],
    ['RKJB', '무안국제공항'],
    ['RKPK', '김해국제공항'],
  ].map(([icao, nameKo]) => ({ icao, nameKo }))

  await page.route('**/api/airports', (route) => route.fulfill({ json: airports }))
  await page.route(/\/api\/(metar|metar-overseas|amos)$/, (route) => route.fulfill({ json: null }))
  await page.route('**/data/navdata/airports-overseas.json', (route) => route.fulfill({ json: {} }))
})

const cases = [
  { view: 'board', modeParam: 'motion', mode: 'split', duration: 2200 },
  { view: 'board', modeParam: 'motion', mode: 'roll', duration: 2200 },
  { view: 'board', modeParam: 'motion', mode: 'wipe', duration: 2200 },
  { view: 'board', modeParam: 'motion', mode: 'fade', duration: 2200 },
  { view: 'rail', modeParam: 'railMotion', mode: 'cascade', duration: 1700 },
  { view: 'rail', modeParam: 'railMotion', mode: 'flap', duration: 1700 },
  { view: 'rail', modeParam: 'railMotion', mode: 'roll', duration: 1700 },
  { view: 'rail', modeParam: 'railMotion', mode: 'wipe', duration: 1700 },
  { view: 'rail', modeParam: 'railMotion', mode: 'fade', duration: 1700 },
]

for (const target of cases) {
  test(`terminal-signage ${target.view} ${target.mode} pre-renders mixed slot transitions`, async ({ page }) => {
    const viewQuery = target.view === 'rail' ? '&view=rail' : ''
    await page.goto(`/terminal/rkss?autoplay=0&${target.modeParam}=${target.mode}${viewQuery}`)
    await expect(page.getByRole('heading', { name: '김포공항 도착지 날씨' })).toBeVisible()

    const activePage = page.getByTestId(`${target.view}-active-page`)
    await expect(activePage.getByText('TW715', { exact: true })).toBeVisible()
    await expect(page.getByText('총 8편 · 3개 목적지', { exact: true })).toBeVisible()
    await expect(activePage.locator('[data-destination-code="CJU"]')).toHaveCount(1)
    await expect(activePage.getByAltText('PEACH AVIATION 로고')).toBeVisible()
    await expect(activePage.getByAltText('CHINA SOUTHERN 로고')).toBeVisible()
    await page.getByRole('button', { name: '다음 항공편' }).click()

    const pendingPage = page.getByTestId(`${target.view}-pending-page`)
    await expect(pendingPage).toBeVisible()
    await expect(activePage.getByText('TW715', { exact: true })).toBeVisible()
    await expect(pendingPage.getByText('7C121', { exact: true })).toBeVisible()
    await expect(pendingPage.locator('[data-destination-code="CJU"]')).toHaveCount(3)

    const transition = await page.evaluate(({ view }) => {
      const findFlight = (pageState, flightNumber) => [...document.querySelectorAll(`[data-testid="${view}-${pageState}-page"] [data-flight-key]`)]
        .find((node) => node.dataset.flightKey.includes(`-${flightNumber}-`))
      const active = findFlight('active', 'TW715')
      const pending = findFlight('pending', '7C121')
      const activeReplacement = findFlight('active', 'MM738')
      const pendingReplacement = findFlight('pending', 'KE1113')
      const destinationSelector = view === 'board' ? '.destination-name' : 'h2'
      const unchangedStatusSelector = view === 'board' ? '.operation-status strong' : '.rail-flight-status > span:last-child'
      const pendingFlight = [...pending.querySelectorAll('.flight-variant-value')]
        .find((node) => node.textContent.includes('7C121'))
      const activeFlight = [...active.querySelectorAll('.flight-variant-value')]
        .find((node) => node.textContent.includes('TW715'))
      const activeDestination = active.querySelector(destinationSelector)
      const pendingDestination = pending.querySelector(destinationSelector)
      const activeUnchangedStatus = active.querySelector(unchangedStatusSelector)
      const pendingUnchangedStatus = pending.querySelector(unchangedStatusSelector)
      const activeBox = activeDestination.getBoundingClientRect()
      const pendingBox = pendingDestination.getBoundingClientRect()
      return {
        activeFlightKey: active.dataset.flightKey,
        pendingFlightKey: pending.dataset.flightKey,
        activeSlotKind: active.className,
        pendingSlotKind: pending.className,
        activeReplacementKind: activeReplacement.className,
        pendingReplacementKind: pendingReplacement.className,
        sameDestinationPosition: activeBox.x === pendingBox.x && activeBox.y === pendingBox.y,
        activeDestinationVisibility: getComputedStyle(activeDestination).visibility,
        activeDestinationAnimation: getComputedStyle(activeDestination).animationName,
        pendingDestinationVisibility: getComputedStyle(pendingDestination).visibility,
        pendingDestinationAnimation: getComputedStyle(pendingDestination).animationName,
        pendingFlightVisibility: getComputedStyle(pendingFlight).visibility,
        pendingFlightAnimation: getComputedStyle(pendingFlight).animationName,
        activeFlightAnimation: getComputedStyle(activeFlight).animationName,
        activeUnchangedStatusVisibility: getComputedStyle(activeUnchangedStatus).visibility,
        activeUnchangedStatusAnimation: getComputedStyle(activeUnchangedStatus).animationName,
        pendingUnchangedStatusVisibility: getComputedStyle(pendingUnchangedStatus).visibility,
        pendingUnchangedStatusAnimation: getComputedStyle(pendingUnchangedStatus).animationName,
      }
    }, { view: target.view })

    expect(transition.activeFlightKey).toContain('TW715')
    expect(transition.pendingFlightKey).toContain('7C121')
    expect(transition.activeSlotKind).toContain('is-slot-flight')
    expect(transition.pendingSlotKind).toContain('is-slot-flight')
    expect(transition.activeReplacementKind).toContain('is-slot-destination')
    expect(transition.pendingReplacementKind).toContain('is-slot-destination')
    expect(transition.sameDestinationPosition).toBe(true)
    expect(transition.activeDestinationVisibility).toBe('visible')
    expect(transition.activeDestinationAnimation).toBe('none')
    expect(transition.pendingDestinationVisibility).toBe('hidden')
    expect(transition.pendingDestinationAnimation).toBe('none')
    expect(transition.pendingFlightVisibility).toBe('visible')
    expect(transition.pendingFlightAnimation).not.toBe('none')
    expect(transition.activeFlightAnimation).not.toBe('none')
    expect(transition.activeUnchangedStatusVisibility).toBe('visible')
    expect(transition.activeUnchangedStatusAnimation).toBe('none')
    expect(transition.pendingUnchangedStatusVisibility).toBe('hidden')
    expect(transition.pendingUnchangedStatusAnimation).toBe('none')

    await expect(pendingPage).toHaveCount(0, { timeout: target.duration })
    await expect(page.getByTestId(`${target.view}-active-page`).getByText('7C121', { exact: true })).toBeVisible()
  })
}

test('terminal-signage FLAP removes and restores a trailing slot as one complete card', async ({ page }) => {
  await page.goto('/terminal/rkss?autoplay=0&motion=split')
  const nextButton = page.getByRole('button', { name: '다음 항공편' })

  await nextButton.click()
  await expect(page.getByTestId('board-pending-page')).toHaveCount(0, { timeout: 2200 })
  await nextButton.click()

  const leavingPage = page.getByTestId('board-active-page')
  const exitingCard = leavingPage.locator('.board-column.is-slot-exit')
  const exitingDivider = leavingPage.locator('.board-column-separator.is-slot-exit')
  await expect(exitingCard).toHaveCount(1)
  await expect(exitingDivider).toHaveCount(1)
  await page.waitForTimeout(1100)
  await expect.poll(() => exitingCard.locator('.board-band-surface').evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).opacity === '0'))).toBe(true)
  await expect(exitingDivider).toHaveCSS('opacity', '0')

  await expect(page.getByTestId('board-pending-page')).toHaveCount(0, { timeout: 1100 })
  await nextButton.click()
  const enteringPage = page.getByTestId('board-pending-page')
  const enteringCard = enteringPage.locator('.board-column.is-slot-enter')
  const enteringDivider = enteringPage.locator('.board-column-separator.is-slot-enter')
  await expect(enteringCard).toHaveCount(1)
  await expect(enteringDivider).toHaveCount(1)
  await page.waitForTimeout(1400)
  await expect.poll(() => enteringCard.locator('.board-band-surface').evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).opacity === '1'))).toBe(true)
  await expect(enteringDivider).toHaveCSS('opacity', '1')
})

test('terminal-signage exposes all 17 Jeju departures once through six compact frames', async ({ page }) => {
  const expectedFlights = [
    '7C506', 'LJ562', 'BX8182', 'BX8108',
    'ZE214', 'KE1214', 'BX8028', 'LJ508', 'TW720', '7C120', 'ZE274', 'ZE216',
    'KE1612', 'KE1614', 'OZ8144', 'KE1596', 'KE1586',
  ]
  const expectedFrames = [
    ['ZE214', '7C506', 'KE1612'],
    ['KE1214', 'LJ562', 'KE1614'],
    ['BX8028', 'BX8182', 'OZ8144'],
    ['LJ508', 'BX8108', 'KE1596'],
    ['TW720', '7C120', 'KE1586'],
    ['ZE274', 'ZE216'],
  ]
  const seenFlights = new Set()

  await page.setViewportSize({ width: 1319, height: 960 })
  await page.goto('/terminal/rkpc?autoplay=0&motion=fade')
  await expect(page.getByText('총 17편 · 5개 목적지', { exact: true })).toBeVisible()

  for (let frame = 0; frame < 6; frame += 1) {
    await expect(page.getByRole('img', { name: `${frame + 1} / 6 프레임`, exact: true })).toBeVisible()
    const keys = await page.getByTestId('board-active-page').locator('[data-flight-key]').evaluateAll((nodes) => nodes.map((node) => node.dataset.flightKey))
    const flights = keys.map((key) => key.split('-')[1])
    expect(flights).toEqual(expectedFrames[frame])
    for (const flight of flights) {
      expect(seenFlights.has(flight)).toBe(false)
      seenFlights.add(flight)
    }
    if (frame < 5) {
      await page.getByRole('button', { name: '다음 항공편' }).click()
      await expect(page.getByTestId('board-pending-page')).toHaveCount(0, { timeout: 2500 })
    }
  }

  expect([...seenFlights].sort()).toEqual(expectedFlights.sort())
})

test('terminal-signage extends low-frequency airports to real same-day departures', async ({ page }) => {
  const cases = [
    { route: 'rkpu', summary: '총 3편 · 2개 목적지', flights: ['KE1595', 'LJ656', 'BX8305'], forecastFlight: 'BX8305', forecastHours: ['19시', '20시', '21시', '22시', '23시'] },
    { route: 'rkjy', summary: '총 3편 · 2개 목적지', flights: ['KE1635', 'OZ8199', 'LJ672'], forecastFlight: 'LJ672', forecastHours: ['18시', '19시', '20시', '21시', '22시'] },
    { route: 'rkny', summary: '총 1편 · 1개 목적지', flights: ['WE6703'], forecastFlight: 'WE6703', forecastHours: ['16시', '17시', '18시', '19시', '20시'] },
  ]

  for (const airport of cases) {
    await page.goto(`/terminal/${airport.route}?autoplay=0`)
    const activePage = page.getByTestId('board-active-page')
    await expect(page.getByText(airport.summary, { exact: true })).toBeVisible()
    for (const flight of airport.flights) await expect(activePage.getByText(flight, { exact: true })).toBeVisible()
    const forecastHours = await activePage.locator(`[data-flight-key*="-${airport.forecastFlight}-"] .board-forecast time`).allTextContents()
    expect(forecastHours).toEqual(airport.forecastHours)
  }

  const parataLogo = page.getByAltText('PARATA AIR 로고')
  await expect(parataLogo).toBeVisible()
  await expect.poll(() => parataLogo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true)
})

test('terminal-signage shows an honest empty state when the reference window has no departure', async ({ page }) => {
  await page.goto('/terminal/rkjb?autoplay=0')
  await expect(page.getByRole('status')).toContainText('해당 시간대 출발편이 없습니다')
  await expect(page.getByRole('button', { name: '다음 항공편' })).toBeDisabled()
  await expect(page.locator('main')).not.toContainText(/undefined|샤를 드골|싱가포르 창이|도쿄 하네다/)
})
