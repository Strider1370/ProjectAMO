import { createDb } from '../db/index.js'
import { evaluateAirportWatch } from '../airport-alerts/evaluate.js'
import airports from '../../../shared/airports.js'

const AIRPORTS = new Map(airports.map((airport) => [airport.icao, airport]))
const SCENARIOS = new Set(['metar', 'windshear', 'fzra', 'taf_new', 'taf_amd', 'airport_warning', 'lightning'])

export function airportTestScenarios(rules) {
  return [
    ...(Object.entries(rules).some(([key, value]) => ['visibility', 'ceiling', 'wind', 'gust', 'temperature'].includes(key) && value?.enabled) ? ['metar'] : []),
    ...(rules.windshear?.enabled ? ['windshear'] : []),
    ...(rules.fzra?.enabled ? ['fzra'] : []),
    ...(rules.tafNew?.enabled ? ['taf_new'] : []),
    ...(rules.tafAmd?.enabled ? ['taf_amd'] : []),
    ...(rules.airportWarning?.enabled ? ['airport_warning'] : []),
    ...(rules.lightning?.enabled ? ['lightning'] : []),
  ]
}

function thresholdValue(rule, key) {
  const below = key === 'visibility' || key === 'ceiling' || (key === 'temperature' && rule.direction === 'below')
  if (!below) return rule.threshold
  return rule.threshold > (key === 'temperature' ? -60 : 0) ? rule.threshold - 1 : null
}

export function airportTestWeather(icao, rules, scenario, nowMs) {
  const airport = AIRPORTS.get(icao)
  if (!airport || !SCENARIOS.has(scenario)) return null
  const now = new Date(nowMs).toISOString()
  const issued = new Date(nowMs - 5 * 60_000).toISOString()
  const observation = {
    visibility: { value: 9999 }, clouds: [], wind: { speed: 0, gust: 0 },
    temperature: { air: 15 }, wind_shear: false,
  }
  if (scenario === 'metar') {
    const active = Object.entries(rules).filter(([key, value]) =>
      ['visibility', 'ceiling', 'wind', 'gust', 'temperature'].includes(key) && value?.enabled)
    if (!active.length) return null
    for (const [key, rule] of active) {
      const value = thresholdValue(rule, key)
      if (value == null) continue
      if (key === 'visibility') observation.visibility.value = value
      if (key === 'ceiling') observation.clouds = [{ amount: 'BKN', base: value }]
      if (key === 'wind') observation.wind.speed = value
      if (key === 'gust') observation.wind.gust = value
      if (key === 'temperature') observation.temperature.air = value
    }
  }
  if (scenario === 'windshear') observation.wind_shear = true
  if (scenario === 'fzra') observation.weather = [{ raw: 'FZRA', phenomena: ['RA'], descriptor: 'FZ' }]
  const warning = scenario === 'airport_warning'
    ? [{ wrng_type_key: 'TEST_STRONG_WIND', wrng_type_name: '강풍경보', issued,
      valid_start: issued, valid_end: new Date(nowMs + 60 * 60_000).toISOString() }] : []
  const strikes = scenario === 'lightning'
    ? Array.from({ length: rules.lightning.minCount }, (_, index) => ({
      time: new Date(nowMs - (index + 1) * 1000).toISOString(), lon: airport.lon, lat: airport.lat, type: 'G',
    })) : []
  return {
    metar: { fetched_at: now, airports: { [icao]: { header: { observation_time: issued }, observation } } },
    taf: scenario.startsWith('taf_') ? { fetched_at: now, airports: { [icao]: { header: {
      issued, valid_start: issued, valid_end: new Date(nowMs + 12 * 60 * 60_000).toISOString(),
      report_status: scenario === 'taf_amd' ? 'AMENDMENT' : 'NORMAL',
      raw_text: `TAF${scenario === 'taf_amd' ? ' AMD' : ''} ${icao} TEST ${new Date(nowMs).toISOString()} 9999 BKN030`,
      source: { identifier: 'KMA' },
    } } } } : null,
    warning: { fetched_at: now, airports: { [icao]: { warnings: warning } } },
    lightning: { fetched_at: now, nationwide: { strikes, coverage: {
      status: 'complete', referenceTime: new Date(nowMs - 1000).toISOString(),
      successfulWindows: [{ from: new Date(nowMs - 121 * 60_000).toISOString(), to: new Date(nowMs + 60_000).toISOString() }],
    } } },
  }
}

// 실운영 DB와 기상 캐시는 건드리지 않는다. 동일 판정기를 임시 DB에서 돌린 결과만 반환한다.
export function evaluateAirportTest(watch, scenario, nowMs = Date.now()) {
  const rules = JSON.parse(watch.rules)
  if (!airportTestScenarios(rules).includes(scenario)) return { error: 'scenario_disabled' }
  const weather = airportTestWeather(watch.icao, rules, scenario, nowMs)
  if (!weather) return { error: 'invalid_scenario' }
  const temporary = createDb(':memory:')
  try {
    temporary.prepare('INSERT INTO users (id,username,password_hash,created_at) VALUES (?,?,?,?)')
      .run(1, 'alert-test', 'unused', new Date(nowMs).toISOString())
    temporary.prepare('INSERT INTO airport_alert_watches (user_id,icao,rules,updated_at) VALUES (?,?,?,?)')
      .run(1, watch.icao, watch.rules, new Date(nowMs).toISOString())
    if (scenario.startsWith('taf_')) {
      const baseline = structuredClone(weather)
      baseline.taf.airports[watch.icao].header.issued = new Date(nowMs - 60 * 60_000).toISOString()
      baseline.taf.airports[watch.icao].header.raw_text = `TAF ${watch.icao} TEST BASELINE 9999 BKN030`
      temporary.transaction(() => evaluateAirportWatch(temporary,
        temporary.prepare('SELECT * FROM airport_alert_watches WHERE user_id=1 AND icao=?').get(watch.icao), baseline, nowMs))()
    }
    const events = temporary.transaction(() => evaluateAirportWatch(temporary,
      temporary.prepare('SELECT * FROM airport_alert_watches WHERE user_id=1 AND icao=?').get(watch.icao), weather, nowMs))()
    const kind = ['metar', 'windshear', 'fzra'].includes(scenario) ? 'metar'
      : scenario.startsWith('taf_') ? 'taf' : scenario
    const event = events.find((item) => item.kind === kind)
    return event ? { kind: event.kind, payload: event.payload } : { error: 'condition_not_met' }
  } finally { temporary.close() }
}
