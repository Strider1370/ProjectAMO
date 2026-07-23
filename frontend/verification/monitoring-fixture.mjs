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
        data: {
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
    fulfill(route, { content_hash: HASH_METAR_OVERSEAS, data: {} })
  })

  await page.route('**/api/taf', (route) => {
    fulfill(route, {
      content_hash: HASH_TAF,
      data: {
        RKSI: {
          raw: 'TAF RKSI 231130Z 2312/2424 27010KT P6000 FEW030 BKN080',
          header: { icao: 'RKSI' },
          issuedAt: '2026-07-23T11:30:00Z',
          validFrom: '2026-07-23T12:00:00Z',
          validUntil: '2026-07-25T00:00:00Z',
        },
      },
    })
  })

  await page.route('**/api/taf-overseas', (route) => {
    fulfill(route, { content_hash: HASH_TAF_OVERSEAS, data: {} })
  })

  await page.route('**/api/amos', (route) => {
    fulfill(route, { content_hash: HASH_AMOS, data: {} })
  })

  await page.route('**/api/warning', (route) => {
    fulfill(route, { content_hash: HASH_WARNING, data: {} })
  })

  await page.route('**/api/notam', (route) => {
    fulfill(route, { content_hash: HASH_NOTAM, data: {} })
  })

  await page.route('**/api/sigmet', (route) => {
    fulfill(route, { content_hash: HASH_SIGMET, data: { items: [] } })
  })

  await page.route('**/api/sigmet-overseas', (route) => {
    fulfill(route, { content_hash: HASH_SIGMET_OVERSEAS, data: { items: [] } })
  })

  await page.route('**/api/airmet', (route) => {
    fulfill(route, { content_hash: HASH_AIRMET, data: { items: [] } })
  })

  await page.route('**/api/lightning', (route) => {
    fulfill(route, { content_hash: HASH_LIGHTNING, data: { items: [] } })
  })

  await page.route('**/api/sigwx-low', (route) => {
    fulfill(route, { content_hash: HASH_SIGWX_LOW, data: {} })
  })

  await page.route('**/api/sigwx-low-history', (route) => {
    fulfill(route, { content_hash: 'sigwx-history-001', data: {} })
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
    fulfill(route, { content_hash: HASH_ADSB, data: { aircraft: [] } })
  })

  await page.route('**/api/ground-forecast', (route) => {
    fulfill(route, { content_hash: HASH_GROUND_FORECAST, data: {} })
  })

  await page.route('**/api/ground-overview', (route) => {
    fulfill(route, { content_hash: HASH_GROUND_OVERVIEW, data: {} })
  })

  await page.route('**/api/environment', (route) => {
    fulfill(route, { content_hash: HASH_ENVIRONMENT, data: {} })
  })

  await page.route('**/api/airport-info', (route) => {
    fulfill(route, { content_hash: HASH_AIRPORT_INFO, data: {} })
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

  await page.route('**/api/snapshot-meta', (route) => {
    fulfill(route, {
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
    })
  })

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
