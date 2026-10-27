import { createHash } from 'node:crypto'
import airports from '../../../shared/airports.js'
import { evaluateOrganizationSituation } from '../organizations/situation.js'
import { METRIC_LABELS } from './rules.js'
import { queueUserAlertDeliveries } from '../user-alerts/delivery.js'

const MAX_METAR_AGE_MS = 120 * 60_000
const AIRPORTS = new Map(airports.map((airport) => [airport.icao, airport]))
const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback } catch { return fallback } }
const finite = (value) => Number.isFinite(value) ? value : null

export function metarMetricStates(metar, rules, nowMs) {
  const observedAt = metar?.header?.observation_time
  const observedMs = Date.parse(observedAt)
  if (!metar?.observation || !Number.isFinite(observedMs) || observedMs > nowMs + 15 * 60_000 || nowMs - observedMs > MAX_METAR_AGE_MS) return null
  const obs = metar.observation
  const cloudBases = (obs.clouds ?? []).filter((cloud) => ['BKN', 'OVC'].includes(cloud?.amount) && Number.isFinite(cloud?.base)).map((cloud) => cloud.base)
  const values = {
    visibility: obs.visibility?.cavok ? 9999 : finite(obs.visibility?.value),
    ceiling: Array.isArray(obs.clouds) || obs.visibility?.cavok ? (cloudBases.length ? Math.min(...cloudBases) : null) : undefined,
    wind: finite(obs.wind?.speed), gust: obs.wind ? (finite(obs.wind.gust) ?? 0) : null,
    temperature: finite(obs.temperature?.air),
    windshear: obs.wind_shear ? 1 : 0,
    fzra: (obs.weather ?? []).some((item) => /FZRA/.test(item?.raw ?? item?.code ?? '')) ? 1 : 0,
  }
  const states = {}
  const metrics = []
  for (const [key, [label, unit, defaultDirection]] of Object.entries(METRIC_LABELS)) {
    const rule = rules[key]
    if (!rule?.enabled) { states[key] = 'off'; continue }
    const value = values[key]
    if (value === undefined || (value === null && key !== 'ceiling')) { states[key] = 'unknown'; continue }
    const direction = rule.direction ?? defaultDirection
    const hit = direction === 'event' ? value === 1 : direction === 'below' ? value != null && value < rule.threshold : value != null && value >= rule.threshold
    states[key] = hit ? 'active' : 'clear'
    if (hit) metrics.push({ key, label, unit, value, threshold: direction === 'event' ? null : rule.threshold, direction })
  }
  return { observedAt, states, metrics }
}

// 기준을 벗어났다가 이 시간 안에 다시 들어오면 같은 상황으로 본다(정시 METAR 두 번).
export const METAR_REENTRY_QUIET_MS = 60 * 60_000

function insertedEvent(db, watch, kind, sourceKey, payload, nowIso) {
  const id = db.prepare(`INSERT INTO airport_alert_events (user_id,icao,kind,source_key,payload,detected_at)
    VALUES (?,?,?,?,?,?)`).run(watch.user_id, watch.icao, kind, sourceKey, JSON.stringify(payload), nowIso).lastInsertRowid
  if (!watch.suppressDelivery) queueUserAlertDeliveries(db, { source: 'airport', eventId: id, userId: watch.user_id,
    pushEnabled: payload.pushEnabled, nowIso })
  return { id, userId: watch.user_id, icao: watch.icao, kind, payload }
}

function resolveEvents(db, watch, kind, keep, nowIso) {
  const rows = db.prepare('SELECT id,source_key,payload FROM airport_alert_events WHERE user_id=? AND icao=? AND kind=? AND active=1').all(watch.user_id, watch.icao, kind)
  for (const row of rows) if (!keep(row)) {
    db.prepare('UPDATE airport_alert_events SET active=0,resolved_at=? WHERE id=?').run(nowIso, row.id)
  }
}

export function evaluateAirportWatch(db, watch, weather, nowMs = Date.now()) {
  const rules = parse(watch.rules, {})
  const previous = parse(watch.state, {})
  const next = { ...previous, metar: { ...(previous.metar ?? {}) } }
  const nowIso = new Date(nowMs).toISOString()
  const airport = AIRPORTS.get(watch.icao)
  const events = []
  for (const row of db.prepare(`SELECT id,payload FROM airport_alert_events
    WHERE user_id=? AND icao=? AND kind IN ('taf','airport_warning') AND active=1`).all(watch.user_id, watch.icao)) {
    const validToMs = Date.parse(parse(row.payload, {}).validTo)
    if (Number.isFinite(validToMs) && validToMs <= nowMs) {
      db.prepare('UPDATE airport_alert_events SET active=0,resolved_at=? WHERE id=?').run(nowIso, row.id)
    }
  }
  const observation = metarMetricStates(weather.metar?.airports?.[watch.icao], rules, nowMs)
  if (observation) {
    const entered = observation.metrics.filter((metric) => previous.metar?.[metric.key] !== 'active')
    next.metarClearedAt = { ...(previous.metarClearedAt ?? {}) }
    for (const [key, state] of Object.entries(observation.states)) if (state !== 'unknown') {
      if (state === 'clear' && previous.metar?.[key] === 'active') next.metarClearedAt[key] = nowIso
      next.metar[key] = state
    }
    resolveEvents(db, watch, 'metar', (row) => parse(row.payload, {}).metrics?.some((metric) => next.metar[metric.key] !== 'clear' && next.metar[metric.key] !== 'off'), nowIso)
    // 기준 근처를 오가는 값(예: 시정 4900m↔5100m)이 관측마다 알림을 다시 울리지 않게 한다. 벗어난 지
    // METAR_REENTRY_QUIET_MS 안에 다시 들어오면 새 알림 대신 방금 끝난 알림을 다시 진행 중으로 돌린다.
    const resumedIds = new Set()
    const fresh = entered.filter((metric) => {
      const clearedMs = Date.parse(previous.metarClearedAt?.[metric.key])
      if (!Number.isFinite(clearedMs) || nowMs - clearedMs >= METAR_REENTRY_QUIET_MS) return true
      const recent = db.prepare(`SELECT id,payload FROM airport_alert_events WHERE user_id=? AND icao=? AND kind='metar'
        ORDER BY id DESC LIMIT 5`).all(watch.user_id, watch.icao)
        .find((row) => parse(row.payload, {}).metrics?.some((item) => item.key === metric.key))
      if (!recent) return true
      resumedIds.add(recent.id)
      return false
    })
    for (const id of resumedIds) db.prepare('UPDATE airport_alert_events SET active=1,resolved_at=NULL WHERE id=?').run(id)
    if (fresh.length) events.push(insertedEvent(db, watch, 'metar', observation.observedAt, {
      title: `${airport.nameKo} 관측 임계값`, metrics: fresh, observedAt: observation.observedAt,
      popupEnabled: rules.channels?.popup !== false, pushEnabled: rules.channels?.push !== false,
    }, nowIso))
  }

  const taf = weather.taf?.airports?.[watch.icao] ?? weather.tafOverseas?.airports?.[watch.icao]
  const tafHeader = taf?.header
  const issuedAt = tafHeader?.issued
  const issuedMs = Date.parse(issuedAt)
  const tafText = tafHeader?.raw_text ?? tafHeader?.tac?.text ?? null
  const tafEndMs = Date.parse(tafHeader?.valid_end)
  const tafCurrent = Number.isFinite(issuedMs) && issuedMs <= nowMs + 15 * 60_000
    && nowMs - issuedMs < 72 * 60 * 60_000 && typeof tafText === 'string' && tafText.trim().length > 0
    && (!Number.isFinite(tafEndMs) || tafEndMs > nowMs)
  if (tafCurrent) {
    const status = tafHeader.report_status
    const reportType = status === 'AMENDMENT' ? 'AMD' : 'NEW'
    const tafKey = `${issuedAt}:${status ?? 'NORMAL'}:${createHash('sha256').update(tafText).digest('hex').slice(0, 16)}`
    if (next.tafKey !== tafKey) {
      // 최초 판정에서 이미 게시된 TAF는 기준점이다. 그 다음 발표부터 알린다.
      if (previous.tafKey && status !== 'CANCELLATION' && (reportType === 'AMD' ? rules.tafAmd?.enabled : rules.tafNew?.enabled)) {
        events.push(insertedEvent(db, watch, 'taf', tafKey, {
          title: `${airport.nameKo} ${reportType === 'AMD' ? 'TAF AMD' : '새 TAF'}`,
          reportType, issuedAt, validFrom: tafHeader?.valid_start ?? null,
          validTo: tafHeader?.valid_end ?? null, text: tafText,
          textSource: tafHeader?.source?.identifier === 'NOAA' ? 'raw' : 'reconstructed',
          popupEnabled: rules.channels?.popup !== false, pushEnabled: rules.channels?.push !== false,
        }, nowIso))
      }
      next.tafKey = tafKey
    }
    resolveEvents(db, watch, 'taf', (row) => row.source_key === tafKey
      && (!tafHeader?.valid_end || Date.parse(tafHeader.valid_end) > nowMs), nowIso)
  }

  const interests = [{ id: `${watch.user_id}:${watch.icao}`, kind: 'airport', icao: watch.icao, name: airport.nameKo,
    lightningRadiusKm: rules.lightning?.radiusKm ?? 10, lightningWindowMinutes: rules.lightning?.windowMinutes ?? 30 }]
  const situation = evaluateOrganizationSituation({ interests, weather, nowMs, airports })
  const warningEvents = rules.airportWarning?.enabled && situation.sourceStatus.warning.status === 'available'
    ? situation.events.filter((event) => event.kind === 'airport_warning') : null
  if (warningEvents) {
    const keys = new Set(warningEvents.map((event) => event.eventKey))
    resolveEvents(db, watch, 'airport_warning', (row) => keys.has(row.source_key), nowIso)
    const before = new Set(previous.warningKeys ?? [])
    for (const current of warningEvents) if (!before.has(current.eventKey)) {
      events.push(insertedEvent(db, watch, 'airport_warning', current.eventKey, {
        title: `${airport.nameKo} ${current.payload.title}`, warning: current.payload.warning,
        issuedAt: current.payload.issuedAt, validFrom: current.payload.validFrom, validTo: current.payload.validTo,
        popupEnabled: rules.channels?.popup !== false, pushEnabled: rules.channels?.push !== false,
      }, nowIso))
    }
    next.warningKeys = [...keys]
  }

  // 낙뢰 수집은 5분 창 끝 시각까지 완결된다. 평가 시각의 마지막 수십 초를
  // 미수집으로 보면 '낙뢰 없음'을 영원히 확인하지 못하므로 완결된 관측 시각에 맞춘다.
  const coverageTime = Date.parse(weather.lightning?.nationwide?.coverage?.referenceTime)
  const lightningSituation = Number.isFinite(coverageTime) && coverageTime < nowMs
    ? evaluateOrganizationSituation({ interests, weather, nowMs: coverageTime, airports }) : situation
  const lightning = lightningSituation.airports[0]?.lightning
  const lightningFresh = situation.sourceStatus.lightning.status === 'available'
    && (!Number.isFinite(coverageTime) || (coverageTime <= nowMs + 60_000 && nowMs - coverageTime <= 15 * 60_000))
  if (rules.lightning?.enabled && lightningFresh && lightning?.count >= rules.lightning.minCount) {
    next.lightning = 'active'
    if (previous.lightning !== 'active') events.push(insertedEvent(db, watch, 'lightning', lightning.latestTime, {
      title: `${airport.nameKo} 주변 낙뢰`, count: lightning.count, radiusKm: lightning.radiusKm,
      windowMinutes: rules.lightning.windowMinutes, observedAt: lightning.latestTime,
      popupEnabled: rules.channels?.popup !== false, pushEnabled: rules.channels?.push !== false,
    }, nowIso))
  } else if (rules.lightning?.enabled && lightningFresh && lightning?.coverageStatus === 'complete') {
    next.lightning = 'clear'
    resolveEvents(db, watch, 'lightning', () => false, nowIso)
  }

  next.sourceStatus = {
    metar: observation ? 'available' : 'unavailable',
    taf: tafCurrent ? 'available' : 'unavailable',
    warning: situation.sourceStatus.warning.status,
    lightning: lightningFresh ? lightning?.coverageStatus ?? 'unknown' : 'unavailable',
  }

  db.prepare('UPDATE airport_alert_watches SET state=?,last_evaluated_at=? WHERE user_id=? AND icao=?')
    .run(JSON.stringify(next), nowIso, watch.user_id, watch.icao)
  return events
}
