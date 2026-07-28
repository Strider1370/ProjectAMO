// Fixed fixture for deterministic monitoring page contract testing
import alertDefaults from '../../shared/alert-defaults.js'

const HASH_METAR = 'metar-stable-hash-001'
const HASH_METAR_OVERSEAS = 'metar-overseas-stable-hash-001'
const HASH_TAF = 'taf-stable-hash-001'
const HASH_TAF_OVERSEAS = 'taf-overseas-stable-hash-001'
const HASH_AMOS = 'amos-stable-hash-001'
const HASH_WARNING = 'warning-stable-hash-001'
const HASH_SIGMET = 'sigmet-stable-hash-001'
const HASH_SIGMET_OVERSEAS = 'sigmet-overseas-stable-hash-001'
const HASH_AIRMET = 'airmet-stable-hash-001'
const HASH_SIGWX_LOW = 'sigwx-low-stable-hash-001'
const HASH_LIGHTNING = 'lightning-stable-hash-001'
const HASH_ADSB = 'adsb-stable-hash-001'
const HASH_GROUND_FORECAST = 'ground-forecast-stable-hash-001'
const HASH_GROUND_OVERVIEW = 'ground-overview-stable-hash-001'
const HASH_ENVIRONMENT = 'environment-stable-hash-001'
const HASH_AIRPORT_INFO = 'airport-info-stable-hash-001'
const HASH_NOTAM = 'notam-stable-hash-001'
const META_ECHO_TM = '2026-07-23T11:30:00Z'
const META_SAT_TM = '2026-07-23T11:20:00Z'
const META_SIGWX_FRONT = 'hash-001'
const META_SIGWX_CLOUD = 'hash-002'

// TAF 픽스처. 계약이 상태를 바꿔 가며 재사용한다. route.fetch()는 페이지 라우트를 거치지 않고
// 실제 백엔드로 나가므로, 응답을 받아 고치는 대신 본문을 여기서 완결해 만든다.
export const TAF_HASH = HASH_TAF

export function buildTafPayload({ reportStatus = 'NORMAL', issued = null } = {}) {
  const hourMs = 3600000
  const iso = (offsetHours) => new Date(Date.now() + offsetHours * hourMs).toISOString()
  const slot = (offsetHours, over = {}) => ({
    time: iso(offsetHours),
    wind: { speed: 10, raw: '27010KT' },
    visibility: { value: 9999, cavok: false },
    weather: [],
    clouds: [{ amount: 'BKN', base: 3000 }],
    display: { wind: '27010KT', vis: '9999', clouds: 'BKN030' },
    ...over,
  })

  // 새 TAF: +2시간 칸이 저시정(1200m)으로 나빠졌다. 직전 TAF에서는 멀쩡했다.
  const badSlot = slot(2, {
    visibility: { value: 1200, cavok: false },
    display: { wind: '27010KT', vis: '1200', clouds: 'BKN030' },
  })
  const previousSlot = { ...slot(2) }
  delete previousSlot.display

  return {
    content_hash: HASH_TAF,
    // taf-processor.js 결과도 `airports`가 최상위 키다.
    airports: {
      RKSI: {
        header: {
          icao: 'RKSI',
          issued: issued ?? iso(-0.5),
          valid_start: iso(-1),
          valid_end: iso(12),
          report_status: reportStatus,
          raw_text: 'TAF RKSI 2712/2812 27010KT 9999 BKN030',
        },
        base: {},
        change_groups: [],
        timeline: [slot(1), badSlot, slot(3), slot(4), slot(5), slot(6)],
        previous: {
          header: {
            issued: iso(-6.5),
            valid_start: iso(-7),
            valid_end: iso(12),
            report_status: 'NORMAL',
          },
          timeline: [
            { ...slot(1), display: undefined },
            previousSlot,
            { ...slot(3), display: undefined },
            { ...slot(4), display: undefined },
            { ...slot(5), display: undefined },
            { ...slot(6), display: undefined },
          ],
        },
      },
    },
  }
}

export function buildSnapshotMeta(overrides = {}) {
  return {
    metar: { hash: HASH_METAR },
    metarOverseas: { hash: HASH_METAR_OVERSEAS },
    metar_overseas: { hash: HASH_METAR_OVERSEAS },
    taf: { hash: HASH_TAF },
    tafOverseas: { hash: HASH_TAF_OVERSEAS },
    taf_overseas: { hash: HASH_TAF_OVERSEAS },
    warning: { hash: HASH_WARNING },
    sigmet: { hash: HASH_SIGMET },
    sigmetOverseas: { hash: HASH_SIGMET_OVERSEAS },
    sigmet_overseas: { hash: HASH_SIGMET_OVERSEAS },
    airmet: { hash: HASH_AIRMET },
    sigwxLow: { hash: HASH_SIGWX_LOW },
    amos: { hash: HASH_AMOS },
    lightning: { hash: HASH_LIGHTNING },
    adsb: { hash: HASH_ADSB },
    groundForecast: { hash: HASH_GROUND_FORECAST },
    ground_forecast: { hash: HASH_GROUND_FORECAST },
    groundOverview: { hash: HASH_GROUND_OVERVIEW },
    ground_overview: { hash: HASH_GROUND_OVERVIEW },
    environment: { hash: HASH_ENVIRONMENT },
    airportInfo: { hash: HASH_AIRPORT_INFO },
    notam: { hash: HASH_NOTAM },
    echoMeta: { tm: META_ECHO_TM },
    rainviewerMeta: null,
    satMeta: { tm: META_SAT_TM },
    sigwxFrontMeta: {
      tmfc: 'latest',
      source_hash: META_SIGWX_FRONT,
      updated_at: '2026-07-23T11:00:00Z',
      render_version: 'v1',
    },
    sigwxCloudMeta: {
      tmfc: 'latest',
      source_hash: META_SIGWX_CLOUD,
      updated_at: '2026-07-23T11:00:00Z',
      render_version: 'v1',
    },
    ...overrides,
  }
}

// Real 항공기상청 bulletins captured 2026-07-26 06:00 UTC. RKSI is near the short end (~370 chars)
// and RKSS near the long end (~680), which is the range the slideshow's auto-fit has to cover.
const AIRPORT_INFO_BULLETINS = {
  airports: {
    RKSI: {
      icao: 'RKSI',
      tm: '2026-07-26 06:00:00.0',
      title: '인천공항 기상정보(제07-51호)',
      summary: '- 오늘 내일 가끔 구름 많음 -',
      outlook: '○ (오늘) 현재(06시) 인천공항은 구름많은 가운데 남서풍이 6kt로 불고 있으며, 시정은 5km입니다. 오늘(26일)은 북태평양고기압의 가장자리에 들겠으며 가끔 구름 많겠습니다.\n\n○ (내일) 계속해서 북태평양고기압의 가장자리에 들겠으며 가끔 구름 많겠습니다.',
      sel_val1: '(오늘) - / 30, (내일) 25 / 30',
      sel_val2: '(오늘) 32 / (내일) 33',
      sel_val3: '-',
      forecast: '○ (폭염) 오늘, 내일은 관심수준의 폭염이 예상됩니다. 최고체감온도가 32도 내외로 올라 온열질환 발생 가능성이 높겠으니, 무더위 시간대(14~17시)에는 야외작업을 중지하고 충분한 수분섭취 및 휴식 등 건강관리에 유의하시기 바랍니다.\n※ 일반/산업 폭염 위험수준: (오늘, 내일) 관심 ■□□□ (위험>경고>주의>관심)',
      warn: '○ 없음',
    },
    RKSS: {
      icao: 'RKSS',
      tm: '2026-07-26 06:00:00.0',
      title: '김포공항 기상정보(제07-51호)',
      summary: '- 내일까지 구름많음, 내일 소나기와 뇌우/급변풍 가능성 유의 -',
      outlook: '○ (오늘) 현재(06시) 김포공항은 구름많은 가운데 남서풍이 6kt로 불고, 시정은 10km입니다. 오늘(26일) 북태평양고기압의 가장자리에 들겠고, 구름많겠습니다.\n\n○ (내일) 계속해서 북태평양고기압의 가장자리에 들어 구름많겠고, 아침부터 저녁 사이 소나기 가능성이 있습니다.',
      sel_val1: '(오늘) - / 32, (내일) 25 / 33',
      sel_val2: '(오늘) 34 / (내일) 34',
      sel_val3: '(내일) 5~40',
      forecast: '○ (폭염) 오늘과 내일은 주의수준의 폭염이 예상됩니다. 최고체감온도가 34도 내외로 올라 온열질환 발생 가능성이 높겠으니, 무더위 시간대(14~17시)에는 야외작업을 중지하고 충분한 수분섭취 및 휴식 등 건강관리에 유의하시기 바랍니다.\n※ 일반/산업 폭염 위험수준: (오늘) 주의 ■■□□ (내일) 주의 ■■□□ (위험>경고>주의>관심)\n\n○ (활주로표면온도) 오늘 아침~저녁(10~18시) 동안 활주로 표면온도가 50℃ 이상 높을 것으로 예상되니, 공항시설 운영 및 야외작업 등에 유의하시기 바랍니다.\n\n○ (강수, 구름고도, 시정, 뇌우) 내일 아침부터 저녁 사이 소나기 가능성이 있으며, 강수 시 구름고도 1,000ft 내외, 순간 시정 4km 미만이 될 것으로 예상됩니다. 또한, 강수 구름 발달 시 공항 또는 주변 지역으로 뇌우와 급변풍 가능성이 있으니, 지상조업자 안전 관리와 항공기 운항에 유의하기 바랍니다.',
      warn: '○ 없음',
    },
  },
}

function fulfill(route, json) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) })
}

export async function installMonitoringFixture(page) {
  // Mock all monitoring APIs with stable responses
  await page.route('**/api/airports', (route) => {
    if (route.request().method() === 'GET') {
      fulfill(route, [
        {
          icao: 'RKSI',
          name: 'Incheon International',
          nameKo: '인천국제공항',
          lat: 37.4602,
          lon: 126.4407,
        },
        {
          icao: 'RKSS',
          name: 'Gimpo International',
          nameKo: '김포국제공항',
          lat: 37.6213,
          lon: 126.8009,
        },
      ])
    }
  })

  await page.route('**/api/metar', (route) => {
    if (route.request().method() === 'GET') {
      fulfill(route, {
        content_hash: HASH_METAR,
        // 실제 metar-processor.js 결과는 `airports`가 최상위 키다(`data`로 감싸지 않는다).
        airports: {
          RKSI: {
            raw: 'METAR RKSI 231200Z 27010KT 9999 FEW030 BKN080 18/09 A3012',
            observation: {
              wind: { raw: '27010KT', speed: 10 },
              visibility: { value: 9999 },
              clouds: [
                { amount: 'FEW', base: 3000 },
                { amount: 'BKN', base: 8000 }
              ],
              weather: [],
              temperature: { air: 18, dewpoint: 9 },
              qnh: { value: 1012 },
            },
          },
        },
      })
    }
  })

  await page.route('**/api/metar-overseas', (route) => {
    // overseas-weather-processor.js도 `airports`가 최상위 키다.
    fulfill(route, { content_hash: HASH_METAR_OVERSEAS, airports: {} })
  })

  await page.route('**/api/taf', (route) => fulfill(route, buildTafPayload()))

  await page.route('**/api/taf-overseas', (route) => {
    fulfill(route, { content_hash: HASH_TAF_OVERSEAS, airports: {} })
  })

  await page.route('**/api/amos', (route) => {
    // amos-processor.js 결과도 `airports`가 최상위 키다.
    fulfill(route, { content_hash: HASH_AMOS, airports: {} })
  })

  await page.route('**/api/warning', (route) => {
    // warning-parser.js가 내는 parsed 결과도 `airports`가 최상위 키다.
    fulfill(route, { content_hash: HASH_WARNING, airports: {} })
  })

  await page.route('**/api/notam', (route) => {
    // notam-processor.js 결과는 `items`가 최상위 키다 (airports 아님).
    fulfill(route, { content_hash: HASH_NOTAM, items: [] })
  })

  await page.route('**/api/sigmet', (route) => {
    // sigmet-processor.js 결과는 `items`가 최상위 키다 (data로 감싸지 않는다).
    fulfill(route, { content_hash: HASH_SIGMET, items: [] })
  })

  await page.route('**/api/sigmet-overseas', (route) => {
    fulfill(route, { content_hash: HASH_SIGMET_OVERSEAS, items: [] })
  })

  await page.route('**/api/airmet', (route) => {
    // airmet-processor.js 결과도 `items`가 최상위 키다.
    fulfill(route, { content_hash: HASH_AIRMET, items: [] })
  })

  await page.route('**/api/lightning', (route) => {
    // lightning-processor.js 결과는 `nationwide.strikes`다 — items가 아니다.
    fulfill(route, { content_hash: HASH_LIGHTNING, nationwide: { strikes: [] } })
  })

  await page.route('**/api/sigwx-low', (route) => {
    // sigwx-low-processor.js 결과는 data 래핑 없이 tmfc/source 등이 최상위에 있다.
    // 이 mock은 원래도 빈 값이라 넣을 필드가 없다 — 빈 래퍼만 걷어낸다.
    fulfill(route, { content_hash: HASH_SIGWX_LOW })
  })

  await page.route('**/api/sigwx-low-history', (route) => {
    // server.js:882의 readRecent()는 래핑 없는 배열을 돌려준다 — mock도 맞춰야 한다.
    fulfill(route, [])
  })

  await page.route('**/api/sigwx-low-fronts', (route) => {
    fulfill(route, { version: 'latest', frames: [] })
  })

  await page.route('**/api/sigwx-low-clouds', (route) => {
    fulfill(route, { version: 'latest', frames: [] })
  })

  await page.route('**/api/sigwx-front-meta', (route) => {
    fulfill(route, { tmfc: 'latest', source_hash: 'hash-001', updated_at: '2026-07-23T11:00:00Z', render_version: 'v1' })
  })

  await page.route('**/api/sigwx-cloud-meta', (route) => {
    fulfill(route, { tmfc: 'latest', source_hash: 'hash-002', updated_at: '2026-07-23T11:00:00Z', render_version: 'v1' })
  })

  await page.route('**/api/adsb', (route) => {
    // adsb-processor.js 결과는 `aircraft`가 최상위 키다.
    fulfill(route, { content_hash: HASH_ADSB, aircraft: [] })
  })

  await page.route('**/api/ground-forecast', (route) => {
    // ground-forecast-processor.js 결과도 `airports`가 최상위 키다.
    fulfill(route, { content_hash: HASH_GROUND_FORECAST, airports: {} })
  })

  await page.route('**/api/ground-overview', (route) => {
    // WarningList.jsx가 groundOverviewData?.airports?.[icao]로 읽는다.
    fulfill(route, { content_hash: HASH_GROUND_OVERVIEW, airports: {} })
  })

  await page.route('**/api/environment', (route) => {
    // environment-processor.js 결과도 `airports`가 최상위 키다.
    fulfill(route, { content_hash: HASH_ENVIRONMENT, airports: {} })
  })

  await page.route('**/api/airport-info', (route) => {
    // /api/airport-info serves the stored snapshot as-is, so `airports` sits at the top level
    // next to content_hash — not nested under `data`.
    fulfill(route, { content_hash: HASH_AIRPORT_INFO, ...AIRPORT_INFO_BULLETINS })
  })

  await page.route('**/api/warning-types', (route) => {
    fulfill(route, {
      types: {
        wind: { label: '강풍' },
        thunderstorm: { label: '뇌우' },
        wind_shear: { label: '윈드시어' },
      },
    })
  })

  await page.route('**/api/alert-defaults', (route) => {
    fulfill(route, alertDefaults)
  })

  await page.route('**/api/snapshot-meta', (route) => fulfill(route, buildSnapshotMeta()))

  // Mock radar/satellite metadata
  await page.route('**/data/radar/echo_meta.json', (route) => {
    fulfill(route, { tm: META_ECHO_TM, available: true })
  })

  await page.route('**/data/radar/rainviewer_meta.json', (route) => {
    fulfill(route, { tm: null, available: false })
  })

  await page.route('**/data/satellite/sat_meta.json', (route) => {
    fulfill(route, { tm: META_SAT_TM, available: true })
  })

  await page.route('**/data/navdata/airports-overseas.json', (route) => {
    fulfill(route, {})
  })

  // Abort live Mapbox network calls (tiles/styles/fonts/telemetry) so the map
  // area renders as a stable blank canvas instead of varying live imagery.
  await page.route('**/*.mapbox.com/**', (route) => route.abort())
}

export async function openMonitoringState(page, state) {
  const viewport = page.viewportSize()
  const isMobile = viewport?.width < 600

  if (state === 'ops') {
    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })
  } else if (state === 'ground') {
    await page.goto('/monitoring?mode=ground', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })
  } else if (state === 'map') {
    // Navigate to ops mode first
    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    // On mobile, click 지도 task button first
    if (isMobile) {
      const mapButton = page.getByRole('button', { name: '지도' })
      if (await mapButton.isVisible()) {
        await mapButton.click()
        await page.waitForTimeout(300)
      }
    }

    // Click 항공 button to open aviation layer panel
    const aviationButton = page.getByRole('button', { name: '항공', exact: true })
    await aviationButton.click()
    // Wait for the button to become active (has 'active' class when panel is open)
    await aviationButton.evaluate((el) => {
      return new Promise((resolve) => {
        const checkActive = () => {
          if (el.classList.contains('active')) resolve()
          else setTimeout(checkActive, 50)
        }
        checkActive()
      })
    })
  } else if (state === 'settings') {
    // Navigate to ops mode first
    await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
    await page.locator('.dashboard-root').waitFor({ state: 'attached' })

    // Open settings dialog
    if (isMobile) {
      const settingsButton = page.getByRole('button', { name: '설정' }).first()
      if (await settingsButton.isVisible()) {
        await settingsButton.click()
        await page.waitForTimeout(300)
      }
    } else {
      const settingsButton = page.getByLabel('설정')
      if (await settingsButton.isVisible()) {
        await settingsButton.click()
        await page.waitForTimeout(300)
      }
    }
  }
}
