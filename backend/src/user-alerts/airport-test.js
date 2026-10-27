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

// 시험 알림의 TAF 본문. 실제 TAF처럼 바람·시정·구름·최고/최저기온(TX/TN)·변화군을 갖춰 보여 준다.
const pad = (n) => String(n).padStart(2, '0')
const ddhh = (ms) => { const d = new Date(ms); return `${pad(d.getUTCDate())}${pad(d.getUTCHours())}` }
export function sampleTafText(icao, issuedMs, amendment = false) {
  const issued = new Date(issuedMs)
  const start = Math.ceil(issuedMs / 3_600_000) * 3_600_000
  const hour = 3_600_000
  // 한반도 기준 최고기온은 05Z, 최저기온은 21Z 무렵. 실제 TAF처럼 시각 순서대로 쓴다.
  const nextAt = (utcHour) => { let t = start; while (new Date(t).getUTCHours() !== utcHour) t += hour; return t }
  const temps = [{ at: nextAt(5), text: (t) => `TX15/${ddhh(t)}Z` }, { at: nextAt(21), text: (t) => `TN06/${ddhh(t)}Z` }]
    .sort((a, b) => a.at - b.at).map((item) => item.text(item.at)).join(' ')
  return [
    `TAF${amendment ? ' AMD' : ''} ${icao} ${pad(issued.getUTCDate())}${pad(issued.getUTCHours())}${pad(issued.getUTCMinutes())}Z`
      + ` ${ddhh(start)}/${ddhh(start + 30 * hour)} 32012KT 9999 SCT030 ${temps}`,
    `TEMPO ${ddhh(start + 2 * hour)}/${ddhh(start + 6 * hour)} 4000 -SHRA BKN015`,
    `BECMG ${ddhh(start + 12 * hour)}/${ddhh(start + 14 * hour)} 27008KT`,
  ].join('\n')
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
      raw_text: sampleTafText(icao, nowMs, scenario === 'taf_amd'),
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
      baseline.taf.airports[watch.icao].header.raw_text = sampleTafText(watch.icao, nowMs - 60 * 60_000)
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
