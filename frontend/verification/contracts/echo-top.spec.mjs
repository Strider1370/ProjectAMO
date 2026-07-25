import { test, expect } from '../fixtures.mjs'

// 1x1 투명 WebP — 레이어가 이미지 소스를 붙일 수 있으면 충분하다.
const WEBP_STUB = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAADQAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=', 'base64')

const BOUNDS = [[30.12520229746768, 118.82639855789549], [43.56590987094148, 133.58114159940212]]

// 레이더 레이어와 같은 5분 축. LATEST가 에코탑이 있는 시각, LATEST-10분은 에코탑이 없는 시각.
// TimelineRail의 방향키 이동 단위가 10분이라, ArrowLeft 한 번으로 정확히 그리로 간다.
const TM = { t0: '202607252240', t1: '202607252245', t2: '202607252250', latest: '202607252255' }

function radarFrame(tm) {
  return { tm, path: `/data/radar/echo_korea_${tm}.png`, bounds: BOUNDS }
}

function echoTopFrame(tm, overrides = {}) {
  return {
    tm,
    path: `/data/radar/echotop/echotop_${tm}.webp`,
    observedAt: '2026-07-25T13:55:00.000Z',
    bounds: BOUNDS,
    width: 1600,
    height: 1830,
    threshold_dbz: 18,
    reference: 'MSL',
    sites: [
      { stn: 'BRI', status: 'ok', observedAt: '2026-07-25T13:55:00.000Z' },
      { stn: 'GSN', status: 'ok', observedAt: '2026-07-25T13:55:00.000Z' },
    ],
    siteCount: { ok: 10, total: 10 },
    ...overrides,
  }
}

const POINT_WITH_TIME = {
  tm: TM.latest,
  observedAt: '2026-07-25T13:55:00.000Z',
  heightM: 9327,
  ft: 30600,
  fl: 306,
  quality: 'interpolated',
  qualityCode: 0,
  threshold_dbz: 18,
  reference: 'MSL',
  site: 'GSN',
}

/**
 * @param {object} options
 * @param {'full'|'partial'|'none'} options.coverage  에코탑 프레임의 사이트 커버리지
 * @param {boolean} options.nullObservedAt            관측시각이 없는 프레임/지점값으로 응답할지
 */
async function installFixture(page, { coverage = 'full', nullObservedAt = false } = {}) {
  // 레이더는 4개 프레임을 내어 시간축을 만든다. 에코탑은 최신 시각에만 있다.
  await page.route('**/data/radar/echo_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'RADAR_ECHO',
      tm: TM.latest,
      frames: [TM.t0, TM.t1, TM.t2, TM.latest].map(radarFrame),
    }),
  }))

  const overrides = {}
  if (coverage === 'partial') {
    overrides.siteCount = { ok: 8, total: 10 }
    overrides.sites = [
      { stn: 'BRI', status: 'ok', observedAt: '2026-07-25T13:55:00.000Z' },
      { stn: 'GSN', status: 'ok', observedAt: '2026-07-25T13:55:00.000Z' },
      { stn: 'KWK', status: 'failed', observedAt: null, reason: 'timeout' },
    ]
  }
  if (nullObservedAt) overrides.observedAt = null

  const frames = coverage === 'none' ? [] : [echoTopFrame(TM.latest, overrides)]

  await page.route('**/data/radar/echotop/echotop_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'RADAR_ECHO_TOP',
      version: 1,
      render_version: 'echotop-18dbz-msl-v1',
      threshold_dbz: 18,
      reference: 'MSL',
      tm: frames.length ? TM.latest : null,
      latest: frames[0] ?? null,
      frames,
    }),
  }))

  await page.route('**/data/radar/echotop/*.webp', (route) =>
    route.fulfill({ contentType: 'image/webp', body: WEBP_STUB }))

  // 지점 조회는 클릭 좌표와 무관하게 같은 값을 준다 — 지도 중심이 어디든 카드 내용이 결정적이다.
  await page.route('**/api/radar/echo-top-point*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(nullObservedAt ? { ...POINT_WITH_TIME, observedAt: null, quality: 'beam_center_floor', qualityCode: 1 } : POINT_WITH_TIME),
  }))
}

async function openWeatherPanel(page, testInfo) {
  await page.addInitScript(() => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', '999.999.999')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const weatherEntry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  // exact — 릴리스 노트 패널에도 '기상정보'가 들어가 이름이 겹친다.
  await page.getByRole('button', { name: weatherEntry, exact: true }).click()
  return page.getByRole('button', { name: '에코탑(재산출)', exact: true })
}

// 모바일은 범례가 하단 독에 숨어 있어 '범례' 버튼을 눌러야 보인다.
async function revealLegends(page, testInfo) {
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '범례' }).click()
}

async function clickMapCentre(page) {
  const canvas = page.locator('.mapboxgl-canvas').first()
  await expect(canvas).toBeVisible()
  await canvas.click({ position: { x: 200, y: 200 } })
}

test.describe('echo-top', () => {
  test('starts OFF with no echo top layer on the map', async ({ page }, testInfo) => {
    await installFixture(page)
    const tile = await openWeatherPanel(page, testInfo)

    await expect(tile).toHaveAttribute('aria-pressed', 'false')
    await revealLegends(page, testInfo)
    await expect(page.getByText('에코탑(재산출)', { exact: false }).first()).toBeHidden({ timeout: 2000 }).catch(async () => {
      // 패널 안의 타일 라벨은 보이는 게 정상 — 범례가 없다는 것만 확인한다.
      await expect(page.getByLabel('에코탑(재산출) 범례')).toHaveCount(0)
    })
    await expect(page.getByText('재산출 · 18 dBZ · MSL — KMA 공식 ETOP 아님')).toHaveCount(0)
  })

  test('turning it on shows the legend carrying 재산출 · 18 dBZ · MSL', async ({ page }, testInfo) => {
    await installFixture(page)
    const tile = await openWeatherPanel(page, testInfo)

    await tile.click()
    await expect(tile).toHaveAttribute('aria-pressed', 'true')

    await revealLegends(page, testInfo)
    if (testInfo.project.name === 'mobile') {
      // 모바일 독은 제목만 싣는다.
      await expect(page.getByText('에코탑(재산출) · FL')).toBeVisible()
    } else {
      const note = page.getByText('재산출 · 18 dBZ · MSL — KMA 공식 ETOP 아님')
      await expect(note).toBeVisible()
      await expect(page.getByText('이 시각 에코탑 자료 없음')).toHaveCount(0)
    }
  })

  test('a selected time with no matching frame hides the layer and says so', async ({ page }, testInfo) => {
    await installFixture(page)
    const tile = await openWeatherPanel(page, testInfo)
    await tile.click()

    // 시간축을 10분 되돌린다 — 그 시각에는 에코탑 프레임이 없다.
    const slider = page.getByRole('slider', { name: /기상 자료 시각/ })
    await slider.focus()
    await slider.press('ArrowLeft')

    await revealLegends(page, testInfo)
    if (testInfo.project.name === 'mobile') {
      // 모바일은 오해를 부르는 색상표를 아예 내리는 것이 계약이다.
      await expect(page.getByText('에코탑(재산출) · FL')).toHaveCount(0)
    } else {
      await expect(page.getByText('이 시각 에코탑 자료 없음')).toBeVisible()
      await expect(page.getByText('재산출 · 18 dBZ · MSL — KMA 공식 ETOP 아님')).toHaveCount(0)
    }
  })

  test('clicking the map reports FL, ft MSL and the interpolation state', async ({ page }, testInfo) => {
    await installFixture(page)
    const tile = await openWeatherPanel(page, testInfo)
    await tile.click()

    await clickMapCentre(page)

    const card = page.getByLabel('선택 지점의 재산출 에코탑 상세')
    await expect(card).toBeVisible()
    await expect(card).toContainText('FL306')
    await expect(card).toContainText('30,600 ft MSL')
    await expect(card).toContainText('재산출 · 18 dBZ · MSL')
    await expect(card).toContainText('보간값')
    await expect(card).toContainText('관측')
  })

  test('a frame with no observation time shows no dangling 관측 label', async ({ page }, testInfo) => {
    await installFixture(page, { nullObservedAt: true })
    const tile = await openWeatherPanel(page, testInfo)
    await tile.click()

    await clickMapCentre(page)

    const card = page.getByLabel('선택 지점의 재산출 에코탑 상세')
    await expect(card).toBeVisible()
    await expect(card).toContainText('FL306')
    await expect(card).toContainText('보수적 하한(빔 중심)')
    await expect(card).not.toContainText('관측')
  })

  test('partial site coverage is identifiable in the detail', async ({ page }, testInfo) => {
    await installFixture(page, { coverage: 'partial' })
    const tile = await openWeatherPanel(page, testInfo)
    await tile.click()

    await clickMapCentre(page)

    const card = page.getByLabel('선택 지점의 재산출 에코탑 상세')
    await expect(card).toBeVisible()
    await expect(card).toContainText('일부 사이트 결측')
  })

  test('turning it off clears both the legend and the detail', async ({ page }, testInfo) => {
    await installFixture(page)
    const tile = await openWeatherPanel(page, testInfo)
    await tile.click()
    await clickMapCentre(page)
    await expect(page.getByLabel('선택 지점의 재산출 에코탑 상세')).toBeVisible()

    await tile.click()
    await expect(tile).toHaveAttribute('aria-pressed', 'false')

    await expect(page.getByLabel('선택 지점의 재산출 에코탑 상세')).toHaveCount(0)
    await revealLegends(page, testInfo)
    await expect(page.getByText('재산출 · 18 dBZ · MSL — KMA 공식 ETOP 아님')).toHaveCount(0)
    await expect(page.getByText('에코탑(재산출) · FL')).toHaveCount(0)
  })
})
