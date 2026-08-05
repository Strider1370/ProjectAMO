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
  // 예보 출처를 모두 비워야 fixture 편성이 그대로 검사된다. 하나라도 열어두면
  // 개발 서버의 실제 기상청·MET Norway 값이 fixture 예보를 덮어써서 시각이 어긋난다.
  await page.route(/\/api\/(metar|metar-overseas|amos|ground-forecast|overseas-forecast)$/, (route) => route.fulfill({ json: null }))
  await page.route('**/data/navdata/airports-overseas.json', (route) => route.fulfill({ json: {} }))
  // 실제 운항 피드를 비우면 화면은 검증된 fixture로 돈다. 아래 계약들은 그 고정 편성을 검사한다.
  // 실시간 피드 자체의 계약은 이 파일 맨 끝에서 따로 확인한다.
  await page.route('**/api/terminal-flights', (route) => route.fulfill({ json: null }))
})

/** 시험용 조작(출발 공항·화면안·전환 효과·다음 항공편)은 모서리 설정창 안에 있다.
    details는 누를 때마다 여닫히므로, 이미 열려 있으면 그대로 둔다. */
const openSettings = async (page) => {
  const settings = page.locator('.terminal-settings').first()
  if (!(await settings.evaluate((element) => element.open))) await settings.locator('summary').click()
}

const liveFlight = ({
  flight,
  destinationIata,
  destinationIcao,
  destinationKorean,
  destinationEnglish,
  scheduled,
  airlineKorean,
  airlineEnglish,
  codeshares,
}) => ({
  departureIcao: 'RKSS',
  flight,
  airlineKorean,
  airlineEnglish,
  destinationIata,
  destinationIcao,
  destinationKorean,
  destinationEnglish,
  scheduled,
  estimated: null,
  arrivalKst: '20:45',
  forecastAnchorKst: '20:45',
  gate: '17',
  previousGate: null,
  status: '운항 예정',
  delayed: false,
  international: destinationIata !== 'CJU',
  ...(codeshares ? { codeshares } : {}),
})

const routeTerminalFeed = async (page, rows) => {
  await page.unroute('**/api/terminal-flights')
  await page.route('**/api/terminal-flights', (route) => route.fulfill({
    json: { fetched_at: '2026-08-05T10:30:00.000Z', airports: { RKSS: rows } },
  }))
}

const routeZeroPrecipForecast = async (page) => {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hourly = Array.from({ length: 72 }, (_, index) => {
    const at = new Date(midnight)
    at.setHours(index)
    const pad = (value) => String(value).padStart(2, '0')
    return {
      date: `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`,
      time: `${pad(at.getHours())}00`,
      temp: 24 + (index % 7),
      icon: 'sunny',
      rainProb: 0,
    }
  })
  await page.route('**/api/ground-forecast', (route) => route.fulfill({ json: { airports: { RKPC: { hourly } } } }))
  return { now, midnight }
}

test('terminal-signage 3안은 위아래 패널의 세로 분할선을 맞춘다', async ({ page }) => {
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  await expect(page.getByTestId('option-three')).toBeVisible()

  const boundaries = await page.evaluate(() => ({
    upper: document.querySelector('.ww-middle > :first-child').getBoundingClientRect().right,
    lower: document.querySelector('.ww-bottom > :first-child').getBoundingClientRect().right,
  }))

  expect(Math.abs(boundaries.upper - boundaries.lower)).toBeLessThanOrEqual(1)
})

test('terminal-signage 3안 항공편 패널은 목적지와 노선을 먼저 보여준다', async ({ page }) => {
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const screen = page.getByTestId('option-three')

  await expect(screen.getByRole('heading', { name: '김포국제공항 → 제주국제공항' })).toBeVisible()
  await expect(screen.locator('.ww-flight-summary p')).toHaveCount(0)
  await expect(screen.locator('.tw-flight-head')).toContainText('탑승구')
  await expect(screen).not.toContainText('도착 후 바로 확인할 정보')
})

test('terminal-signage 3안은 현지 시각과 항공사명을 보조 정보로 표시한다', async ({ page }) => {
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const screen = page.getByTestId('option-three')

  await expect(screen).toContainText('현지 시각')
  await expect(screen.getByTestId('tw-flight-row').first()).toContainText('티웨이항공')
  await expect(screen.locator('.tw-pager-item.is-current')).toHaveText('제주')
})

test('terminal-signage 3안은 현재 목적지만 공항 이름까지 표시한다', async ({ page }) => {
  await routeTerminalFeed(page, [
    liveFlight({ flight: 'TW717', airlineKorean: '티웨이항공', airlineEnglish: "T'WAY AIR", destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '19:30' }),
    liveFlight({ flight: 'JL094', airlineKorean: '일본항공', airlineEnglish: 'JAPAN AIRLINES', destinationIata: 'HND', destinationIcao: 'RJTT', destinationKorean: '도쿄/하네다', destinationEnglish: 'TOKYO HANEDA', scheduled: '19:35' }),
  ])
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const screen = page.getByTestId('option-three')

  await expect(screen.locator('.tw-pager-item.is-current')).toHaveText('제주')
  await expect(screen.locator('.tw-pager-item').filter({ hasText: /^도쿄$/ })).toBeVisible()
  await page.keyboard.press('r')
  await expect(screen.locator('.tw-pager-item.is-current')).toHaveText('도쿄 하네다')
  await expect(screen.locator('.tw-current-city')).toHaveText('도쿄 하네다')
  await expect(screen.locator('.ww-flight-summary')).toHaveText('김포국제공항 → 도쿄 하네다')
})

test('terminal-signage 3안 시간별 예보는 날씨와 온도 줄 제목을 표시한다', async ({ page }) => {
  await routeZeroPrecipForecast(page)
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const hourly = page.getByTestId('option-three').locator('.ww-hourly-panel')

  await expect(hourly.getByText('날씨', { exact: true })).toBeVisible()
  await expect(hourly.getByText('온도', { exact: true })).toBeVisible()
})

test('terminal-signage 3안은 0인 강수 줄도 항상 표시한다', async ({ page }) => {
  await routeZeroPrecipForecast(page)
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const precip = page.getByTestId('option-three').locator('.ww-hourly-precip-row')

  await expect(precip.getByText('강수확률 %', { exact: true })).toBeVisible()
  await expect(precip.locator('b')).toHaveText(Array(8).fill('0%'))
})

test('terminal-signage 3안 시간축은 첫 시각과 날짜 경계에 일을 표시한다', async ({ page }) => {
  const { now, midnight } = await routeZeroPrecipForecast(page)
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const times = page.getByTestId('option-three').locator('.ww-hourly-hour-row time')
  const firstAt = new Date(midnight)
  firstAt.setHours((Math.floor(now.getHours() / 3) + 1) * 3)
  const nextMidnight = new Date(midnight)
  nextMidnight.setDate(nextMidnight.getDate() + 1)

  await expect(times.first().locator('small')).toHaveText(`${firstAt.getDate()}일`)
  await expect(times.filter({ hasText: /0시$/ }).locator('small')).toHaveText(`${nextMidnight.getDate()}일`)
})

test('terminal-signage 3안 항공편은 다섯 줄을 유지하며 공동운항편을 개별 행으로 올린다', async ({ page }) => {
  await routeTerminalFeed(page, [
    liveFlight({
      flight: 'BX8019', airlineKorean: '에어부산', airlineEnglish: 'AIR BUSAN', destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '19:30',
      codeshares: [
        { flight: 'BX8019', airlineKorean: '에어부산', airlineEnglish: 'AIR BUSAN' },
        { flight: 'OZ8019', airlineKorean: '아시아나항공', airlineEnglish: 'ASIANA AIRLINES' },
      ],
    }),
    liveFlight({ flight: 'ZE231', airlineKorean: '이스타항공', airlineEnglish: 'EASTAR JET', destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '19:35' }),
    liveFlight({ flight: '7C139', airlineKorean: '제주항공', airlineEnglish: 'JEJU AIR', destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '19:40' }),
    liveFlight({ flight: 'KE1121', airlineKorean: '대한항공', airlineEnglish: 'KOREAN AIR', destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '19:45' }),
    liveFlight({ flight: 'TW731', airlineKorean: '티웨이항공', airlineEnglish: "T'WAY AIR", destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '19:50' }),
    liveFlight({ flight: 'LJ513', airlineKorean: '진에어', airlineEnglish: 'JIN AIR', destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '19:55' }),
  ])
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const screen = page.getByTestId('option-three')
  await expect(screen.getByText('BX8019', { exact: true })).toBeVisible()

  const codeshares = screen.locator('.tw-flight-row.is-codeshare')
  await expect(codeshares).toHaveCount(2)
  await expect(codeshares.nth(0)).toContainText('BX8019')
  await expect(codeshares.nth(1)).toContainText('OZ8019')
  expect(new Set(await codeshares.evaluateAll((rows) => rows.map((row) => row.dataset.codeshareGroup))).size).toBe(1)
  expect(await codeshares.first().evaluate((row) => {
    const logo = row.querySelector('.airline-logo').getBoundingClientRect()
    const standardLogo = row.parentElement.querySelector('.tw-flight-row:not(.is-codeshare) .airline-logo').getBoundingClientRect()
    return {
      logoOffset: logo.left - standardLogo.left,
      railOffset: Number.parseFloat(getComputedStyle(row, '::before').left),
    }
  })).toEqual({ logoOffset: 0, railOffset: -8 })

  const initial = await screen.locator('.tw-flight-list-viewport').evaluate((viewport) => {
    const box = viewport.getBoundingClientRect()
    const rows = [...viewport.querySelectorAll('.tw-flight-row')]
      .map((row) => ({ flight: row.dataset.flightNumber, box: row.getBoundingClientRect() }))
      .filter((row) => row.box.top < box.bottom - 1 && row.box.bottom > box.top + 1)
    return { flights: rows.map((row) => row.flight), heights: rows.map((row) => row.box.height) }
  })
  expect(initial.flights).toHaveLength(5)
  expect(Math.max(...initial.heights) - Math.min(...initial.heights)).toBeLessThanOrEqual(1)

  await page.waitForTimeout(5000)
  await expect.poll(() => screen.locator('.tw-flight-list-viewport').evaluate((viewport) => {
    const box = viewport.getBoundingClientRect()
    return [...viewport.querySelectorAll('.tw-flight-row')]
      .find((row) => {
        const item = row.getBoundingClientRect()
        return item.top >= box.top - 1 && item.bottom <= box.bottom + 1
      })?.dataset.flightNumber
  })).toBe('OZ8019')
})

test('terminal-signage 3안 현재날씨는 아이콘부터 왼쪽 여백을 채운다', async ({ page }) => {
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  await expect(page.getByTestId('option-three').locator('.tw-current-weather-icon')).toBeVisible()

  const position = await page.evaluate(() => {
    const panel = document.querySelector('.tw-current-weather').getBoundingClientRect()
    const icon = document.querySelector('.tw-current-weather-icon').getBoundingClientRect()
    return icon.left - panel.left
  })

  expect(position).toBeLessThanOrEqual(180)
})

test('terminal-signage 3안은 주정보와 보조 문구 사이를 충분히 띄운다', async ({ page }) => {
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  await expect(page.getByTestId('option-three')).toBeVisible()
  await page.locator('.tw-current-city').evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))

  const gaps = await page.evaluate(() => {
    const vertical = (top, bottom) => bottom.getBoundingClientRect().top - top.getBoundingClientRect().bottom
    const detail = document.querySelector('.tw-flight-number-detail')
    const metric = document.querySelector('.ww-middle .tw-current-metrics > div')
    const weather = document.querySelector('.tw-current-weather-body')

    return {
      airline: vertical(detail.querySelector('strong'), detail.querySelector('small')),
      metric: vertical(metric.querySelector('dt'), metric.querySelector('dd')),
      localClock: vertical(document.querySelector('.tw-current-city'), document.querySelector('.tw-current-local-clock')),
      observation: vertical(weather.querySelector('.tw-current-weather-title'), weather.querySelector('.tw-current-weather-temp')),
    }
  })

  for (const [name, gap] of Object.entries(gaps)) {
    expect(gap, `${name} 간격`).toBeGreaterThanOrEqual(8)
  }
})

test('terminal-signage 3안 해외 목적지는 예보와 항공사 로고를 비우지 않는다', async ({ page }) => {
  await page.goto('/terminal/rkss?view=rail&autoplay=0')
  const screen = page.getByTestId('option-three')

  await expect(screen.locator('.tw-pager-item.is-current')).toHaveText('제주')
  await expect(screen.getByText('TW715', { exact: true })).toBeVisible()
  await page.keyboard.press('r')
  await expect(screen.locator('.tw-current-city')).toContainText('오사카')
  await expect(screen.getByText('TW715', { exact: true })).toHaveCount(0)

  await expect(screen.locator('.ww-hourly-hour-row time').filter({ hasText: /시$/ })).not.toHaveCount(0)
  await expect(screen.locator('.ww-weekly-empty')).toHaveText('주간 예보 확인 중')

  const logo = screen.locator('.tw-flight-row .airline-logo img')
  await expect(logo).toBeVisible()
  await expect(logo).toHaveJSProperty('complete', true)
  const placement = await page.evaluate(() => {
    const list = document.querySelector('.tw-flight-list').getBoundingClientRect()
    const image = document.querySelector('.tw-flight-row .airline-logo img').getBoundingClientRect()
    return { logoCenter: image.top + image.height / 2, firstThird: list.top + list.height / 3 }
  })
  expect(placement.logoCenter).toBeLessThan(placement.firstThird)
})

const cases = [
  { view: 'board', modeParam: 'motion', mode: 'split', duration: 2200 },
  { view: 'board', modeParam: 'motion', mode: 'roll', duration: 2200 },
  { view: 'board', modeParam: 'motion', mode: 'wipe', duration: 2200 },
  { view: 'board', modeParam: 'motion', mode: 'fade', duration: 2200 },
]

// 3안(과거 rail)이 항공편별 가로 행 전환을 하던 시절의 케이스는 이 계약에서 지웠다.
// 새 3안(WeeklyWeatherScreen)은 2안처럼 도시 단위 페이지 전환만 하고 편별 슬롯 전환이 없다.
for (const target of cases) {
  test(`terminal-signage ${target.view} ${target.mode} pre-renders mixed slot transitions`, async ({ page }) => {
    await page.goto(`/terminal/rkss?autoplay=0&${target.modeParam}=${target.mode}`)
    await expect(page.getByRole('heading', { name: '김포공항 가는 곳 날씨' })).toBeVisible()

    const activePage = page.getByTestId(`${target.view}-active-page`)
    await expect(activePage.getByText('TW715', { exact: true })).toBeVisible()
    await expect(activePage.locator('[data-destination-code="CJU"]')).toHaveCount(1)
    await expect(activePage.getByAltText('피치항공 로고')).toBeVisible()
    await expect(activePage.getByAltText('중국남방항공 로고')).toBeVisible()
    await openSettings(page)
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
      const destinationSelector = '.destination-name'
      const unchangedStatusSelector = '.operation-status strong'
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
  await openSettings(page)
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
      await openSettings(page)
      await page.getByRole('button', { name: '다음 항공편' }).click()
      await expect(page.getByTestId('board-pending-page')).toHaveCount(0, { timeout: 2500 })
    }
  }

  expect([...seenFlights].sort()).toEqual(expectedFlights.sort())
})

test('terminal-signage extends low-frequency airports to real same-day departures', async ({ page }) => {
  const cases = [
    { route: 'rkpu', flights: ['KE1595', 'LJ656', 'BX8305'], forecastFlight: 'BX8305', forecastHours: ['19시', '20시', '21시', '22시', '23시'] },
    { route: 'rkjy', flights: ['KE1635', 'OZ8199', 'LJ672'], forecastFlight: 'LJ672', forecastHours: ['18시', '19시', '20시', '21시', '22시'] },
    { route: 'rkny', flights: ['WE6703'], forecastFlight: 'WE6703', forecastHours: ['16시', '17시', '18시', '19시', '20시'] },
  ]

  for (const airport of cases) {
    await page.goto(`/terminal/${airport.route}?autoplay=0`)
    const activePage = page.getByTestId('board-active-page')
    for (const flight of airport.flights) await expect(activePage.getByText(flight, { exact: true })).toBeVisible()
    const forecastHours = await activePage.locator(`[data-flight-key*="-${airport.forecastFlight}-"] .board-forecast time`).allTextContents()
    expect(forecastHours).toEqual(airport.forecastHours)
  }

  const parataLogo = page.getByAltText('파라타항공 로고')
  await expect(parataLogo).toBeVisible()
  await expect.poll(() => parataLogo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true)
})

test('terminal-signage shows an honest empty state when the reference window has no departure', async ({ page }) => {
  await page.goto('/terminal/rkjb?autoplay=0')
  await expect(page.getByRole('status')).toContainText('금일 운항이 종료되었습니다')
  // 밤늦게 남은 외국인 승객을 위한 영문 안내와 기상이 그림도 함께 나간다.
  await expect(page.getByRole('status')).toContainText("Today’s departures have ended")
  await expect(page.getByRole('status').locator('img')).toHaveAttribute('src', '/gisang-i/clear_2.png')
  // 넘길 항공편이 없으므로 조작 요소는 아예 내린다. 남는 것은 안내 문구와 항공기상청 안내뿐이다.
  await expect(page.getByRole('button', { name: '다음 항공편' })).toBeHidden()
  await expect(page.locator('.board-header')).toBeHidden()
  await expect(page.locator('.page-indicator')).toBeHidden()
  await expect(page.locator('.screen-footer-note')).toBeHidden()
  await expect(page.locator('.header-weather-panel')).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/undefined|샤를 드골|싱가포르 창이|도쿄 하네다/)
})

test('terminal-signage renders the live KAC flight feed instead of the fixture', async ({ page }) => {
  // 2026-08-03 한국공항공사 실시간 운항정보 실제 응답을 줄인 고정 표본.
  const feed = {
    fetched_at: '2026-08-03T04:55:00.000Z', // KST 13:55
    airports: {
      RKSS: [
        { departureIcao: 'RKSS', flight: 'TW717', airlineKorean: '티웨이항공', airlineEnglish: "T'WAY AIR", destinationIata: 'CJU', destinationIcao: 'RKPC', destinationKorean: '제주', destinationEnglish: 'JEJU', scheduled: '13:55', estimated: null, arrivalKst: '15:10', gate: '15', status: '운항 예정', delayed: false, international: false },
        { departureIcao: 'RKSS', flight: 'KE1819', airlineKorean: '대한항공', airlineEnglish: 'KOREAN AIR', destinationIata: 'PUS', destinationIcao: 'RKPK', destinationKorean: '부산/김해', destinationEnglish: 'GIMHAE', scheduled: '14:00', estimated: '14:20', arrivalKst: '15:25', gate: '16', previousGate: '10', status: '탑승구 변경', delayed: true, international: false },
        { departureIcao: 'RKSS', flight: 'CA138', airlineKorean: '중국국제항공', airlineEnglish: 'AIR CHINA', destinationIata: 'PEK', destinationIcao: 'ZBAA', destinationKorean: '베이징(서우두)/서우두', destinationEnglish: 'BEIJING', scheduled: '14:25', estimated: null, arrivalKst: null, forecastAnchorKst: '16:36', gate: '37', status: '탑승중', delayed: false, international: true },
      ],
    },
  }
  // 해외 목적지 예보는 MET Norway에서 온다. 도착 시각은 모르지만 예보 칸은 채워져야 한다.
  const overseasForecast = {
    source: 'MET Norway (CC BY 4.0)',
    airports: {
      ZBAA: {
        icao: 'ZBAA',
        hourly: [
          { date: '20260803', time: '1600', temp: 31.4, icon: 'partly' },
          { date: '20260803', time: '1700', temp: 30.8, icon: 'partly' },
          { date: '20260803', time: '1800', temp: 29.6, icon: 'cloudy' },
          { date: '20260803', time: '1900', temp: 28.1, icon: 'rain' },
          { date: '20260803', time: '2000', temp: 27.5, icon: 'rain' },
        ],
      },
    },
  }
  await page.unroute('**/api/terminal-flights')
  await page.route('**/api/terminal-flights', (route) => route.fulfill({ json: feed }))
  await page.route('**/api/overseas-forecast', (route) => route.fulfill({ json: overseasForecast }))

  await page.goto('/terminal/rkss?autoplay=0')
  const activePage = page.getByTestId('board-active-page')

  // 피드에 있는 실제 편명이 그대로 보인다.
  for (const flight of ['TW717', 'KE1819', 'CA138']) {
    await expect(activePage.getByText(flight, { exact: true })).toBeVisible()
  }
  // fixture 편성이 남아 있으면 안 된다.
  await expect(activePage).not.toContainText(/7C121|MM738|CZ318/)

  // 지연·탑승구 변경 모두 지금 유효한 값 하나만 보여준다. 옛 값은 붙이지 않는다.
  const delayed = activePage.locator('[data-flight-key*="-KE1819-"]')
  await expect(delayed.locator('.departure-time strong')).toHaveText('14:20')
  await expect(delayed.locator('.departure-time')).toHaveClass(/is-delayed/)
  await expect(delayed.locator('.gate-value strong')).toHaveText('16')
  await expect(delayed.locator('.gate-value')).toHaveClass(/is-changed/)
  await expect(delayed).not.toContainText('예정')
  await expect(delayed).not.toContainText('에서 변경')

  // 안 바뀐 편에는 강조가 붙지 않는다.
  const unchanged = activePage.locator('[data-flight-key*="-TW717-"]')
  await expect(unchanged.locator('.gate-value')).not.toHaveClass(/is-changed/)
  await expect(unchanged.locator('.departure-time')).not.toHaveClass(/is-delayed/)

  // 도착 시각을 모르는 국제선은 도착 줄 자체를 내린다. 예보는 그대로 남는다.
  const international = activePage.locator('[data-flight-key*="-CA138-"]')
  // 제목은 국내·국제가 같고, 도착 시각을 모르는 편에는 시각이 붙지 않는다.
  await expect(international.locator('.arrival-forecast-label')).toHaveText('목적지 공항 예보')
  await expect(international.locator('.arrival-time-value')).toHaveCount(0)
  await expect(international.locator('.board-forecast > div')).toHaveCount(5)
  // 비행시간표로 잡은 16:36 기준이라 16시 칸부터 시작하고, 기온은 정수로 나온다.
  await expect(international.locator('.board-forecast time').first()).toHaveText('16시')
  await expect(international.locator('.board-forecast strong').first()).toHaveText('31°C')
  await expect(international.locator('.destination-name')).toHaveText('베이징 서우두')

  // 도착 시각을 아는 국내선은 그대로 보여준다.
  const domestic = activePage.locator('[data-flight-key*="-TW717-"]')
  await expect(domestic.locator('.arrival-forecast-label')).toHaveText('목적지 공항 예보')
  // 시각 앞에 붙는 라벨은 스펙 5.1이 정한 `도착`이다. 시각 자체는 그대로 나와야 한다.
  await expect(domestic.locator('.arrival-time-caption')).toHaveText('도착')
  await expect(domestic.locator('.arrival-time-value')).toContainText('15:10')

  // 기준 시각 표기는 화면에서 내렸다(상단 시계와 성격이 겹쳤다). 푸터에는 출처만 남는다.
  await expect(page.locator('.screen-footer-note')).toHaveText('한국공항공사 실시간 운항정보')
  await expect(page.locator('.screen-footer-clock')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText(/undefined|NaN|null/)
})
