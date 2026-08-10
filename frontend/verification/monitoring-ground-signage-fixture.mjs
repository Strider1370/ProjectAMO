import { installMonitoringFixture } from './monitoring-fixture.mjs'

export const GROUND_SIGNAGE_NOW = new Date('2026-08-10T05:00:00Z')

const pad = (value) => String(value).padStart(2, '0')

function toCompact(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
}

export function buildHourlySlots({ count = 24 } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(GROUND_SIGNAGE_NOW)
    at.setUTCHours(at.getUTCHours() + index)
    return {
      date: toCompact(at),
      time: `${pad(at.getUTCHours())}00`,
      temp: 23 + ((index * 3) % 8),
      icon: ['sunny', 'partly_cloudy', 'mostly_cloudy', 'rain'][index % 4],
      rainProb: (index * 13) % 100,
    }
  })
}

export function buildSevenDays({ futureDays = 6 } = {}) {
  return Array.from({ length: futureDays + 1 }, (_, index) => {
    const at = new Date('2026-08-10T00:00:00Z')
    at.setUTCDate(at.getUTCDate() + index)
    return {
      date: `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`,
      dayOfWeek: ['일', '월', '화', '수', '목', '금', '토'][at.getUTCDay()],
      isToday: index === 0,
      am: { icon: index % 2 ? 'partly_cloudy' : 'sunny', weather: '맑음', rainProb: index * 10 },
      pm: { icon: index % 3 ? 'mostly_cloudy' : 'rain', weather: '구름많음', rainProb: index * 12 },
      tempMin: 20 + index,
      tempMax: 29 + index,
    }
  })
}

export function buildGroundSignageForecast({ hourlyCount = 24, futureDays = 6, tmFc = '202608100600' } = {}) {
  return {
    content_hash: 'ground-signage-001',
    airports: {
      RKSI: {
        hourly: buildHourlySlots({ count: hourlyCount }),
        hourly_status: { ok: true, base_date: '20260810', base_time: '1400' },
        tmFc,
        source_status: {
          short: { ok: false, announce_time: '202608101100' },
          mid_land: { ok: false, tmFc: '202608100600' },
          mid_ta: { ok: false, tmFc: '202608100600' },
        },
        forecast: buildSevenDays({ futureDays }),
      },
    },
  }
}

export function buildGroundSignageWarning({ active = true } = {}) {
  return {
    content_hash: 'ground-signage-warning-001',
    airports: {
      RKSI: {
        warnings: active ? [{
          wrng_type_key: 'STRONG_WIND',
          wrng_type_name: '강풍',
          valid_start: '2026-08-10T06:00:00Z',
          valid_end: '2026-08-10T12:00:00Z',
        }] : [],
      },
    },
  }
}

export function buildGroundSignageAmos() {
  return {
    content_hash: 'ground-signage-amos-001',
    airports: { RKSI: { daily_rainfall: { mm: 7.4 } } },
  }
}

export function buildGroundSignageEnvironment() {
  return {
    content_hash: 'ground-signage-environment-001',
    airports: {
      RKSI: {
        pm: {
          pm10: { value: 22, grade: '좋음' },
          pm25: { value: 11, grade: '보통' },
        },
        uv: { value: 5, grade: '보통' },
      },
    },
  }
}

export async function installGroundSignageFixture(page, overrides = {}) {
  await installMonitoringFixture(page)

  const forecast = overrides.forecast || buildGroundSignageForecast(overrides)
  const warning = overrides.warning || buildGroundSignageWarning(overrides)
  const amos = overrides.amos || buildGroundSignageAmos()
  const environment = overrides.environment || buildGroundSignageEnvironment()

  await page.route('**/api/ground-forecast', (route) => route.fulfill({ json: forecast }))
  await page.route('**/api/warning', (route) => route.fulfill({ json: warning }))
  await page.route('**/api/amos', (route) => route.fulfill({ json: amos }))
  await page.route('**/api/environment', (route) => route.fulfill({ json: environment }))
}
