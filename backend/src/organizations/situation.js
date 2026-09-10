import * as turf from '@turf/turf'

import config from '../config.js'
import { organizationMapWeather } from './map-weather.js'
import { canonicalJson, json, nowIso, sha256 } from './common.js'

const DEFAULT_LIGHTNING_WINDOW_MINUTES = 30
const DEFAULT_LIGHTNING_RADIUS_KM = 10

function instant(value) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function activeAt(item, nowMs, fromField = 'valid_from', toField = 'valid_to') {
  const from = instant(item?.[fromField])
  const to = instant(item?.[toField])
  return from != null && to != null && from <= nowMs && nowMs < to
}

function feature(geometry) {
  try { return geometry ? turf.feature(geometry) : null } catch { return null }
}

function intersects(left, right) {
  const a = feature(left)
  const b = feature(right)
  if (!a || !b) return false
  try {
    if (a.geometry.type === 'Point') return turf.booleanPointInPolygon(a, b, { ignoreBoundary: false })
    if (b.geometry.type === 'Point') return turf.booleanPointInPolygon(b, a, { ignoreBoundary: false })
    return !turf.booleanDisjoint(a, b)
  } catch { return false }
}

function airportPoint(icao, airports) {
  const airport = airports.find((item) => item.icao === icao)
  return airport ? turf.point([airport.lon, airport.lat]) : null
}

function strikeTime(strike) {
  return instant(strike?.time ?? strike?.observed_at ?? strike?.observedAt)
}

function successfulIntervals(coverage) {
  return (coverage?.successfulWindows ?? coverage?.successful_windows ?? [])
    .map((window) => ({ from: instant(window.from), to: instant(window.to) }))
    .filter((window) => window.from != null && window.to != null && window.from < window.to)
    .sort((a, b) => a.from - b.from)
}

export function lightningCoverageStatus(coverage, fromMs, toMs, targetGeometry = null) {
  if (!coverage || coverage.status === 'unknown') return { status: 'unknown', from: null, to: null }
  const spatial = coverage.spatial
  if (targetGeometry && spatial?.kind === 'circle') {
    const circle = turf.circle(spatial.center, Number(spatial.radiusKm), { units: 'kilometers', steps: 96 })
    const target = feature(targetGeometry)
    let covered = false
    try {
      covered = target?.geometry?.type === 'Point'
        ? turf.booleanPointInPolygon(target, circle, { ignoreBoundary: false })
        : target ? turf.booleanWithin(target, circle) : false
    } catch { covered = false }
    if (!covered) return { status: 'outside_coverage', from: null, to: null }
  }
  const intervals = successfulIntervals(coverage)
  let cursor = fromMs
  for (const interval of intervals) {
    if (interval.to <= cursor || interval.from > cursor) continue
    cursor = Math.max(cursor, interval.to)
    if (cursor >= toMs) break
  }
  return {
    status: cursor >= toMs ? 'complete' : intervals.some((value) => value.to > fromMs && value.from < toMs) ? 'partial' : 'unknown',
    from: intervals.length ? new Date(Math.max(fromMs, intervals[0].from)).toISOString() : null,
    to: intervals.length ? new Date(Math.min(toMs, intervals.at(-1).to)).toISOString() : null,
  }
}

function lightningForInterest(interest, weather, nowMs, airports) {
  const windowMinutes = interest.lightningWindowMinutes ?? DEFAULT_LIGHTNING_WINDOW_MINUTES
  const radiusKm = interest.lightningRadiusKm ?? DEFAULT_LIGHTNING_RADIUS_KM
  const fromMs = nowMs - windowMinutes * 60_000
  let targetGeometry = interest.geometry
  let includes
  if (interest.kind === 'airport') {
    const point = airportPoint(interest.icao, airports)
    targetGeometry = point ? turf.circle(point, radiusKm, { units: 'kilometers', steps: 64 }).geometry : null
    includes = (strike) => point && turf.distance(point, turf.point([strike.lon, strike.lat]), { units: 'kilometers' }) <= radiusKm
  } else {
    const area = feature(interest.geometry)
    includes = (strike) => area && turf.booleanPointInPolygon(turf.point([strike.lon, strike.lat]), area, { ignoreBoundary: false })
  }
  const strikes = (weather.lightning?.nationwide?.strikes ?? []).filter((strike) => {
    const time = strikeTime(strike)
    return time != null && time >= fromMs && time <= nowMs && Number.isFinite(strike.lon) && Number.isFinite(strike.lat) && includes(strike)
  })
  const coverage = lightningCoverageStatus(weather.lightning?.nationwide?.coverage, fromMs, nowMs, targetGeometry)
  return {
    count: strikes.length,
    observedFrom: new Date(fromMs).toISOString(),
    observedTo: new Date(nowMs).toISOString(),
    radiusKm: interest.kind === 'airport' ? radiusKm : null,
    coverageStatus: coverage.status,
    coverage,
    latestTime: strikes.map(strikeTime).filter(Number.isFinite).sort((a, b) => b - a)[0]
      ? new Date(strikes.map(strikeTime).filter(Number.isFinite).sort((a, b) => b - a)[0]).toISOString()
      : null,
    strikes,
  }
}

function sourceState(payload, { maxAgeMinutes, nowMs }) {
  if (!payload) return { status: 'unavailable', fetchedAt: null }
  const fetched = instant(payload.fetched_at ?? payload.fetchedAt)
  if (fetched == null) return { status: 'unknown', fetchedAt: null }
  return { status: nowMs - fetched > maxAgeMinutes * 60_000 ? 'delayed' : 'available', fetchedAt: new Date(fetched).toISOString() }
}

function event(kind, interest, sourceId, payload, sourceComplete) {
  return {
    eventKey: `${kind}:${interest.id}:${sourceId}`,
    kind,
    interestId: interest.id,
    payload: { interest: { id: interest.id, kind: interest.kind, name: interest.name, icao: interest.icao, geometry: interest.geometry }, ...payload },
    sourceComplete,
  }
}

export function evaluateOrganizationSituation({ interests = [], weather = {}, nowMs = Date.now(), airports = config.airports } = {}) {
  const sourceStatus = {
    metar: sourceState(weather.metar, { maxAgeMinutes: 120, nowMs }),
    taf: sourceState(weather.taf, { maxAgeMinutes: 720, nowMs }),
    warning: sourceState(weather.warning, { maxAgeMinutes: 180, nowMs }),
    sigmet: sourceState(weather.sigmet, { maxAgeMinutes: 180, nowMs }),
    airmet: sourceState(weather.airmet, { maxAgeMinutes: 180, nowMs }),
    lightning: sourceState(weather.lightning, { maxAgeMinutes: 30, nowMs }),
  }
  const events = []
  const airportSummaries = []
  const regionSummaries = []

  for (const interest of interests) {
    const lightning = lightningForInterest(interest, weather, nowMs, airports)
    const lightningComplete = lightning.coverageStatus === 'complete'
    if (lightning.count > 0) events.push(event('lightning', interest, 'continuous', {
      ...lightning, title: `최근 낙뢰 ${lightning.count}건`, description: `확인된 관측 ${lightning.count}건`,
      targetName: interest.name, observedAt: lightning.latestTime, severity: 'amber',
    }, lightningComplete))

    if (interest.kind === 'airport') {
      const warnings = (weather.warning?.airports?.[interest.icao]?.warnings ?? []).filter((item) => activeAt(item, nowMs, 'valid_start', 'valid_end'))
      for (const warning of warnings) {
        const sourceId = sha256(JSON.stringify([interest.icao, warning.wrng_type_key, warning.issued, warning.valid_start])).slice(0, 24)
        events.push(event('airport_warning', interest, sourceId, {
          warning, title: warning.wrng_type_name ?? warning.wrng_type_key ?? '공항경보',
          description: warning.raw_message ?? '', targetName: interest.name, issuedAt: warning.issued,
          validFrom: warning.valid_start, validTo: warning.valid_end, severity: 'amber',
        }, sourceStatus.warning.status === 'available'))
      }
      airportSummaries.push({
        interest, metar: weather.metar?.airports?.[interest.icao] ?? null,
        taf: weather.taf?.airports?.[interest.icao] ?? null, warnings, lightning,
      })
      continue
    }

    const advisories = []
    for (const kind of ['sigmet', 'airmet']) {
      for (const item of weather[kind]?.items ?? []) {
        if (item.cancelled || !activeAt(item, nowMs) || !intersects(interest.geometry, item.geometry)) continue
        advisories.push({ kind, item })
        events.push(event(kind, interest, item.id ?? sha256(JSON.stringify(item)).slice(0, 24), {
          advisory: item, title: item.phenomenon_label ?? item.phenomenon_code ?? kind.toUpperCase(),
          description: `${kind.toUpperCase()} ${item.sequence_number ?? ''}`.trim(), targetName: interest.name,
          issuedAt: item.issue_time, validFrom: item.valid_from, validTo: item.valid_to, severity: kind === 'sigmet' ? 'red' : 'amber',
        }, sourceStatus[kind].status === 'available'))
      }
    }
    regionSummaries.push({ interest, advisories, lightning })
  }

  const sourceRevision = sha256(JSON.stringify(canonicalJson(Object.fromEntries(
    Object.entries(weather).filter(([key]) => ['metar', 'taf', 'warning', 'sigmet', 'airmet', 'lightning'].includes(key))
      .map(([key, value]) => [key, value?.content_hash ?? value?.fetched_at ?? null]),
  ))))
  const linkedInterests = interests.map((interest) => {
    const point = interest.kind === 'airport' ? airportPoint(interest.icao, airports) : null
    return {
      id: interest.id, sourceKind: 'organization_interest', title: interest.name,
      geometry: interest.geometry ?? null,
      circle: point ? { center: point.geometry.coordinates, radiusMeters: (interest.lightningRadiusKm ?? DEFAULT_LIGHTNING_RADIUS_KM) * 1000 } : null,
    }
  })
  const linkedItems = events.map((current) => {
    const interest = current.payload.interest
    const point = interest.kind === 'airport' ? airportPoint(interest.icao, airports) : null
    return {
      id: current.eventKey, sourceKind: current.kind, title: current.payload.title,
      geometry: current.payload.advisory?.geometry ?? interest.geometry ?? null,
      circle: point ? { center: point.geometry.coordinates, radiusMeters: current.payload.radiusKm
        ? current.payload.radiusKm * 1000 : DEFAULT_LIGHTNING_RADIUS_KM * 1000 } : null,
    }
  })
  return {
    generatedAt: new Date(nowMs).toISOString(), sourceRevision, sourceStatus,
    interests: linkedInterests, linkedItems, airports: airportSummaries, regions: regionSummaries, events,
  }
}

function persistSituation(db, organizationId, situation) {
  return db.transaction(() => {
    const now = situation.generatedAt
    const currentKeys = new Set()
    for (const current of situation.events) {
      currentKeys.add(current.eventKey)
      const row = db.prepare('SELECT * FROM organization_alerts WHERE organization_id=? AND event_key=?').get(organizationId, current.eventKey)
      const payload = JSON.stringify(canonicalJson(current.payload))
      if (!row) {
        db.prepare(`INSERT INTO organization_alerts
          (organization_id,event_key,kind,interest_id,payload,source_revision,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?)`).run(organizationId, current.eventKey, current.kind, current.interestId, payload, situation.sourceRevision, now, now)
      } else {
        const changed = JSON.stringify(canonicalJson(json(row.payload, {}))) !== payload
        const reactivated = !row.active
        db.prepare(`UPDATE organization_alerts SET payload=?,source_revision=?,active=1,
          version=version+?,updated_at=? WHERE id=?`).run(payload, situation.sourceRevision, changed || reactivated ? 1 : 0,
          changed || reactivated ? now : row.updated_at, row.id)
      }
    }

    const active = db.prepare('SELECT * FROM organization_alerts WHERE organization_id=? AND active=1').all(organizationId)
    for (const row of active) {
      if (currentKeys.has(row.event_key)) continue
      const interestExists = situation.airports.concat(situation.regions).some((summary) => summary.interest.id === row.interest_id)
      if (!interestExists) {
        db.prepare('UPDATE organization_alerts SET active=0,version=version+1,updated_at=? WHERE id=?').run(now, row.id)
        continue
      }
      const prefix = row.kind === 'airport_warning' ? 'warning' : row.kind
      const sourceComplete = situation.sourceStatus[prefix]?.status === 'available'
        && (row.kind !== 'lightning' || situation.airports.concat(situation.regions)
          .find((summary) => summary.interest.id === row.interest_id)?.lightning.coverageStatus === 'complete')
      if (sourceComplete) db.prepare('UPDATE organization_alerts SET active=0,version=version+1,updated_at=? WHERE id=?').run(now, row.id)
    }
    return db.prepare('SELECT * FROM organization_alerts WHERE organization_id=? AND active=1 ORDER BY updated_at DESC').all(organizationId)
  })()
}

export async function evaluateAndStoreOrganizationSituation(db, organizationId, dependencies = {}) {
  const organization = db.prepare('SELECT settings FROM organizations WHERE id=?').get(organizationId)
  const settings = json(organization?.settings, {})
  const defaultRadius = Number(settings.airportRadiusKm)
  const defaultWindow = Number(settings.lightningWindowMinutes)
  const interests = db.prepare('SELECT * FROM organization_interests WHERE organization_id=? ORDER BY id').all(organizationId)
    .map((row) => ({ id: row.id, orgId: row.organization_id, kind: row.kind, name: row.name, icao: row.icao,
      geometry: json(row.geometry, null),
      lightningRadiusKm: row.lightning_radius_km ?? (defaultRadius >= 1 && defaultRadius <= 500 ? defaultRadius : DEFAULT_LIGHTNING_RADIUS_KM),
      lightningWindowMinutes: row.lightning_window_minutes
        ?? (Number.isInteger(defaultWindow) && defaultWindow >= 5 && defaultWindow <= 240 ? defaultWindow : DEFAULT_LIGHTNING_WINDOW_MINUTES) }))
  const snapshot = typeof dependencies.readWeatherSnapshot === 'function'
    ? await dependencies.readWeatherSnapshot()
    : { weather: {}, effectiveNowMs: Date.now(), provenance: {} }
  const situation = evaluateOrganizationSituation({
    interests, weather: snapshot.weather ?? snapshot, nowMs: snapshot.effectiveNowMs ?? Date.now(),
    airports: dependencies.airports ?? config.airports,
  })
  // 시연 뷰의 사건은 화면 계산에는 쓰되 실제 기관 이력에는 절대 적재하지 않는다.
  const stored = dependencies.persist === false || snapshot.isDemo === true ? [] : persistSituation(db, organizationId, situation)
  return {
    ...situation,
    mapData: organizationMapWeather(snapshot.weather ?? snapshot),
    alerts: stored.map((row) => ({ id: row.id, eventKey: row.event_key, kind: row.kind, interestId: row.interest_id,
      payload: json(row.payload, {}), sourceRevision: row.source_revision, version: row.version, active: Boolean(row.active),
      acknowledgedBy: row.acknowledged_by, acknowledgedAt: row.acknowledged_at,
      changedSinceAcknowledgement: Boolean(row.acknowledged_version && row.version > row.acknowledged_version),
      createdAt: row.created_at, updatedAt: row.updated_at })),
    provenance: { ...(snapshot.provenance ?? {}), sourceRevision: situation.sourceRevision },
  }
}

export async function refreshAllOrganizationSituations(db, dependencies = {}) {
  const organizations = db.prepare('SELECT id FROM organizations ORDER BY id').all()
  return Promise.allSettled(organizations.map(({ id }) => evaluateAndStoreOrganizationSituation(db, id, dependencies)))
}

export default { evaluateOrganizationSituation, evaluateAndStoreOrganizationSituation, refreshAllOrganizationSituations }
