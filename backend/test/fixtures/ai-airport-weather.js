export const WEATHER_NOW = '2026-09-22T15:30:00.000Z'
export const REAL_NOW = '2026-09-22T16:00:00.000Z'
export const WINDOW = {
  start: '2026-09-22T15:00:00Z',
  end: '2026-09-22T17:00:00Z',
}

function wind({ direction = 180, speed = 18, gust = 28, raw = '18018G28KT' } = {}) {
  return {
    raw,
    direction,
    speed,
    gust,
    unit: 'KT',
    variable: false,
    calm: false,
  }
}

function cloud({ amount = 'OVC', base = 800, raw = 'OVC008' } = {}) {
  return {
    amount,
    base,
    type: null,
    raw,
  }
}

function weather(raw = 'BR') {
  return {
    raw,
    descriptor: null,
    phenomena: [raw],
  }
}

export function metar({ source = 'KMA', raw = null } = {}) {
  return {
    type: 'METAR',
    fetched_at: REAL_NOW,
    airports: {
      RKSI: {
        header: {
          icao: 'RKSI',
          report_type: 'SPECI',
          observation_time: '2026-07-02T08:30:00Z',
          issue_time: '2026-07-02T08:30:00Z',
          source: {
            identifier: source,
            fetch_time: REAL_NOW,
          },
          raw_text: raw,
        },
        observation: {
          wind: wind(),
          visibility: {
            value: 3200,
            minimum_value: null,
            minimum_direction_degrees: null,
            cavok: false,
          },
          clouds: [cloud()],
          weather: [weather()],
          temperature: { air: 15, dewpoint: 13 },
          qnh: { value: 1009, unit: 'hPa' },
          rvr: [],
          wind_shear: null,
          display: {
            wind: '18018G28KT',
            visibility: '3200',
            minimum_visibility: null,
            weather: 'BR',
            clouds: 'OVC008',
            temperature: '15/13',
            qnh: 'Q1009',
          },
        },
        cavok_flag: false,
        nsc_flag: false,
        trend: [],
      },
    },
  }
}

export function noaaMetar() {
  const snapshot = metar({
    source: 'NOAA',
    raw: 'METAR RKSI 221500Z 27008KT 9999 BKN020 20/15 Q1013=',
  })
  const report = snapshot.airports.RKSI
  report.header.report_type = 'METAR'
  report.header.observation_time = '2026-09-22T15:00:00Z'
  report.header.issue_time = '2026-09-22T15:00:00Z'
  report.observation.wind = wind({
    direction: 270,
    speed: 8,
    gust: null,
    raw: '27008KT',
  })
  report.observation.visibility.value = 9999
  report.observation.clouds = [cloud({
    amount: 'BKN',
    base: 2000,
    raw: 'BKN020',
  })]
  report.observation.weather = []
  report.observation.temperature = { air: 20, dewpoint: 15 }
  report.observation.qnh = { value: 1013, unit: 'hPa' }
  report.observation.display = {
    wind: '27008KT',
    visibility: '9999',
    minimum_visibility: null,
    weather: '',
    clouds: 'BKN020',
    temperature: '20/15',
    qnh: 'Q1013',
  }
  return snapshot
}

function forecastState(overrides = {}) {
  return {
    wind: null,
    vis: null,
    wx: null,
    clouds: null,
    wx_touched: false,
    nsw_flag: false,
    clouds_touched: false,
    cavok_flag: false,
    nsc_flag: false,
    ...overrides,
  }
}

function timelineEntry(time, visibility, weatherItems = []) {
  return {
    time,
    wind: null,
    visibility: {
      value: visibility,
      cavok: false,
    },
    clouds: [],
    weather: weatherItems,
  }
}

export function taf() {
  return {
    type: 'TAF',
    fetched_at: REAL_NOW,
    airports: {
      RKSI: {
        header: {
          icao: 'RKSI',
          report_type: 'TAF',
          issued: '2026-09-22T14:00:00Z',
          valid_start: '2026-09-22T15:00:00Z',
          valid_end: '2026-09-22T18:00:00Z',
          source: {
            identifier: 'KMA',
            fetch_time: REAL_NOW,
          },
        },
        base: forecastState({
          vis: 9999,
          wx: [],
          clouds: [],
          wx_touched: true,
          clouds_touched: true,
        }),
        change_groups: [
          forecastState({
            type: 'BECMG',
            start: '2026-09-22T15:00:00Z',
            end: '2026-09-22T16:00:00Z',
            vis: 5000,
          }),
          forecastState({
            type: 'TEMPO',
            start: '2026-09-22T16:00:00Z',
            end: '2026-09-22T17:00:00Z',
            vis: 2000,
            wx: [weather()],
            wx_touched: true,
          }),
          forecastState({
            type: 'PROB30_TEMPO',
            start: '2026-09-22T16:00:00Z',
            end: '2026-09-22T18:00:00Z',
            vis: 1000,
          }),
        ],
        timeline: [
          timelineEntry('2026-09-22T15:00:00Z', 9999),
          timelineEntry('2026-09-22T16:00:00Z', 1000, [weather()]),
          timelineEntry('2026-09-22T17:00:00Z', 2000),
        ],
      },
    },
  }
}

export function warningSnapshot() {
  return {
    type: 'AIRPORT_WARNINGS',
    fetched_at: REAL_NOW,
    total_count: 0,
    airports: {},
  }
}

export const warnings = warningSnapshot()
